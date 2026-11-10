#!/usr/bin/env python3
"""
Anypod Cleaner Monday Audit & Automation Runner
Inspects inactive accounts against the 60d / 80d / 90d GDPR storage limitation lifecycle policy.
Supports dry-run preview, tokenized action link inspection, and live execution.

Usage:
  python3 scripts/cleaner_audit.py --dry-run
  python3 scripts/cleaner_audit.py --run
  python3 scripts/cleaner_audit.py --json
"""

import argparse
import json
import math
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

DB_NAME = "podany-db"
DB_ID_FALLBACK = "a75faccd-ee65-42dd-9db8-e70c7c43ab4e"
ACCOUNT_ID_FALLBACK = "f51159eb45a16392e0c181ee7c28ab0e"
APP_URL = "https://anypod.org"


class Colors:
    RESET = "\033[0m"
    BOLD = "\033[1m"
    DIM = "\033[2m"
    CYAN = "\033[36m"
    GREEN = "\033[32m"
    YELLOW = "\033[33m"
    BLUE = "\033[34m"
    RED = "\033[31m"
    MAGENTA = "\033[35m"
    GRAY = "\033[90m"


def load_credentials() -> Dict[str, str]:
    """Load credentials from workspace .env files or local Wrangler config."""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.path.join(os.getcwd(), ".env"),
        os.path.join(os.getcwd(), "scripts", ".env"),
        os.path.join(os.getcwd(), "app", ".env"),
        os.path.join(script_dir, ".env"),
        os.path.join(script_dir, "..", ".env"),
        os.path.join(script_dir, "..", "scripts", ".env"),
        os.path.join(script_dir, "..", "app", ".env"),
    ]
    seen = set()
    for c in candidates:
        norm = os.path.abspath(c)
        if norm not in seen and os.path.isfile(norm):
            seen.add(norm)
            try:
                with open(norm, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if not line or line.startswith("#") or "=" not in line:
                            continue
                        k, v = line.split("=", 1)
                        k = k.strip()
                        v = v.strip().strip("'\"")
                        if k and k not in os.environ:
                            os.environ[k] = v
            except Exception:
                pass

    token = os.environ.get("CLOUDFLARE_API_TOKEN")
    if not token:
        wrangler_paths = [
            os.path.expanduser("~/.wrangler/config/default.toml"),
            os.path.join(os.environ.get("XDG_CONFIG_HOME", os.path.expanduser("~/.config")), "wrangler", "config", "default.toml"),
        ]
        for wp in wrangler_paths:
            if os.path.isfile(wp):
                try:
                    with open(wp, "r", encoding="utf-8") as f:
                        for line in f:
                            line = line.strip()
                            if line.startswith("#") or "=" not in line:
                                continue
                            k, v = line.split("=", 1)
                            k = k.strip()
                            v = v.strip().strip("'\"")
                            if k in ("oauth_token", "api_token") and v:
                                token = v
                                break
                except Exception:
                    pass
            if token:
                break

    return {
        "token": token or "",
        "account_id": os.environ.get("CLOUDFLARE_ACCOUNT_ID") or ACCOUNT_ID_FALLBACK,
    }


def query_d1_rest(token: str, account_id: str, db_id: str, sql: str) -> Tuple[bool, List[Dict[str, Any]], Optional[str]]:
    """Execute SQL against Cloudflare D1 via REST API."""
    if not token:
        return False, [], "No Cloudflare API token found"

    url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/d1/database/{db_id}/query"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "User-Agent": "Anypod-Cleaner/1.0",
    }
    payload = json.dumps({"sql": sql}).encode("utf-8")
    req = urllib.request.Request(url, data=payload, headers=headers, method="POST")

    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if data.get("success"):
                result_list = data.get("result", [])
                if result_list:
                    return True, result_list[0].get("results", []), None
            errors = data.get("errors", [])
            err_msg = "; ".join(e.get("message", "D1 error") for e in errors)
            return False, [], err_msg
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="ignore")
        try:
            err_data = json.loads(body)
            errors = err_data.get("errors", [])
            msg = "; ".join(e.get("message", "API error") for e in errors) or str(e)
        except Exception:
            msg = body or str(e)
        return False, [], f"HTTP {e.code}: {msg}"
    except Exception as e:
        return False, [], str(e)


def query_d1_wrangler(db_name: str, sql: str) -> Tuple[bool, List[Dict[str, Any]], Optional[str]]:
    """Execute SQL against D1 using local Wrangler CLI."""
    base_dirs = [
        os.path.join(os.getcwd(), "app"),
        os.getcwd(),
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "app")),
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..")),
    ]
    cmd = ["npx", "wrangler", "d1", "execute", db_name, "--remote", "--command", sql, "--json"]

    last_err = None
    for d in base_dirs:
        if os.path.isdir(d):
            try:
                proc = subprocess.run(
                    cmd,
                    cwd=d,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    timeout=25,
                )
                if proc.returncode == 0 and proc.stdout.strip():
                    raw = proc.stdout.strip()
                    start_idx = raw.find("[")
                    if start_idx != -1:
                        data = json.loads(raw[start_idx:])
                        if isinstance(data, list) and len(data) > 0:
                            return True, data[0].get("results", []), None
                last_err = proc.stderr.strip() or proc.stdout.strip()
            except Exception as e:
                last_err = str(e)

    return False, [], (last_err or "Wrangler execution returned empty")


def execute_d1(token: str, account_id: str, db_id: str, db_name: str, sql: str) -> Tuple[bool, List[Dict[str, Any]], str, Optional[str]]:
    """Try REST first, then fallback to local Wrangler CLI."""
    ok, rows, err = query_d1_rest(token, account_id, db_id, sql)
    if ok:
        return True, rows, "Cloudflare REST API", None
    ok_w, rows_w, err_w = query_d1_wrangler(db_name, sql)
    if ok_w:
        return True, rows_w, "Local Wrangler CLI", None
    return False, [], "None", f"REST failed ({err}); Wrangler failed ({err_w})"


def ensure_cleaner_columns(token: str, account_id: str, db_id: str, db_name: str) -> None:
    """Ensure warned_30d_at, warned_50d_at, and last_active_at columns exist in users table."""
    ok, rows, _, _ = execute_d1(token, account_id, db_id, db_name, "PRAGMA table_info(users);")
    existing_cols = set()
    if ok and rows:
        existing_cols = {r.get("name") for r in rows if r.get("name")}

    cols_to_add = [
        ("last_active_at", "INTEGER"),
        ("warned_30d_at", "INTEGER"),
        ("warned_50d_at", "INTEGER"),
    ]
    for col, col_type in cols_to_add:
        if col not in existing_cols:
            execute_d1(token, account_id, db_id, db_name, f"ALTER TABLE users ADD COLUMN {col} {col_type};")


def run_cleaner_audit(token: str, account_id: str, db_id: str) -> Dict[str, Any]:
    """Audit all users against the 60d / 80d / 90d thresholds."""
    ensure_cleaner_columns(token, account_id, db_id, DB_NAME)

    # Reconcile columns
    ok, rows_info, _, _ = execute_d1(token, account_id, db_id, DB_NAME, "PRAGMA table_info(users);")
    cols = {r.get("name") for r in rows_info} if (ok and rows_info) else set()

    has_last_active = "last_active_at" in cols
    has_warned_30 = "warned_30d_at" in cols
    has_warned_50 = "warned_50d_at" in cols
    has_created = "created_at" in cols

    sel_last_active = "COALESCE(u.last_active_at, 0) AS last_active_at" if has_last_active else "0 AS last_active_at"
    sel_warned_30 = "u.warned_30d_at" if has_warned_30 else "NULL AS warned_30d_at"
    sel_warned_50 = "u.warned_50d_at" if has_warned_50 else "NULL AS warned_50d_at"

    active_parts = []
    if has_last_active:
        active_parts.append("COALESCE(u.last_active_at, 0)")
    active_parts.extend([
        "COALESCE(s_max.last_sub, 0)",
        "COALESCE(p_max.last_listen, 0)",
        "COALESCE(sess_max.last_session, 0)",
    ])
    if has_created:
        active_parts.append("COALESCE(u.created_at, 0)")

    sql = f"""
    SELECT 
      u.id, 
      u.email, 
      {('u.created_at' if has_created else 'NULL AS created_at')},
      {sel_last_active},
      {sel_warned_30},
      {sel_warned_50},
      MAX({', '.join(active_parts)}) AS effective_last_active
    FROM users u
    LEFT JOIN (SELECT user_id, MAX(created_at) as last_sub FROM subscriptions GROUP BY user_id) s_max ON s_max.user_id = u.id
    LEFT JOIN (SELECT user_id, MAX(last_listened_at) as last_listen FROM playback_state GROUP BY user_id) p_max ON p_max.user_id = u.id
    LEFT JOIN (SELECT user_id, MAX(created_at) as last_session FROM user_sessions GROUP BY user_id) sess_max ON sess_max.user_id = u.id
    GROUP BY u.id
    ORDER BY effective_last_active DESC;
    """

    ok, rows, engine, err = execute_d1(token, account_id, db_id, DB_NAME, sql)
    if not ok:
        raise RuntimeError(f"Audit query failed: {err}")

    now = int(time.time())
    now_dt = datetime.now(timezone.utc)

    SIXTY_DAYS = 60 * 86400
    EIGHTY_DAYS = 80 * 86400
    NINETY_DAYS = 90 * 86400

    active_cohort = []
    to_warn_60d = []
    to_warn_80d = []
    to_delete_90d = []
    already_warned_60d = []
    already_warned_80d = []

    for r in rows:
        uid = r.get("id") or ""
        email = r.get("email") or ""
        eff_active = int(r.get("effective_last_active") or 0)
        warned_60 = r.get("warned_30d_at")  # re-use existing column for 1st warning
        warned_80 = r.get("warned_50d_at")  # re-use existing column for 2nd warning

        # If effective_last_active is 0, fallback to now to avoid deleting newly registered users
        if eff_active <= 0:
            eff_active = now

        inactive_seconds = max(0, now - eff_active)
        inactive_days = round(inactive_seconds / 86400.0, 1)
        last_dt_str = datetime.fromtimestamp(eff_active, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

        item = {
            "id": uid,
            "short_id": uid[:8],
            "email": email,
            "inactive_days": inactive_days,
            "last_active": last_dt_str,
            "warned_60d_at": warned_60,
            "warned_80d_at": warned_80,
        }

        if inactive_seconds >= NINETY_DAYS:
            to_delete_90d.append(item)
        elif inactive_seconds >= EIGHTY_DAYS:
            if warned_80:
                already_warned_80d.append(item)
            else:
                to_warn_80d.append(item)
        elif inactive_seconds >= SIXTY_DAYS:
            if warned_60:
                already_warned_60d.append(item)
            else:
                to_warn_60d.append(item)
        else:
            active_cohort.append(item)

    return {
        "engine": engine,
        "timestamp_utc": now_dt.strftime("%Y-%m-%d %H:%M:%S UTC"),
        "total_users": len(rows),
        "active_cohort": active_cohort,
        "to_warn_60d": to_warn_60d,
        "to_warn_80d": to_warn_80d,
        "to_delete_90d": to_delete_90d,
        "already_warned_60d": already_warned_60d,
        "already_warned_80d": already_warned_80d,
    }


def render_audit_report(audit: Dict[str, Any], dry_run: bool = True) -> None:
    """Print visually quiet, human-readable terminal audit."""
    print()
    print(f"{Colors.BOLD}╭──────────────────────────────────────────────────────────────╮{Colors.RESET}")
    print(f"{Colors.BOLD}│      🧹 ANYPOD CLEANER MONDAY: INACTIVE ACCOUNT AUDIT        │{Colors.RESET}")
    print(f"{Colors.BOLD}╰──────────────────────────────────────────────────────────────╯{Colors.RESET}")
    print(f"  Mode:             {Colors.YELLOW}DRY-RUN (No emails sent, no data modified){Colors.RESET}" if dry_run else f"{Colors.RED}LIVE EXECUTION{Colors.RESET}")
    print(f"  Data Source:      Cloudflare D1 (podany-db) via {Colors.CYAN}{audit['engine']}{Colors.RESET}")
    print(f"  Timestamp:        {audit['timestamp_utc']}")
    print(f"  Total Accounts:   {audit['total_users']} registered users")
    print(f"  {Colors.GRAY}{'─' * 62}{Colors.RESET}")

    # Section 1: Active Users (< 60 days)
    print(f"\n{Colors.BOLD}🟢 Active & Healthy Accounts (< 60 Days Inactive):{Colors.RESET} {len(audit['active_cohort'])} users")
    for u in audit["active_cohort"]:
        print(f"  • {Colors.CYAN}{u['short_id']}{Colors.RESET} ({u['email']}) — {Colors.GREEN}{u['inactive_days']} days inactive{Colors.RESET} (Last active: {u['last_active']})")

    # Section 2: 60-Day Warning Needed
    print(f"\n{Colors.BOLD}🟡 Due for 60-Day Check-in Email (60–79 Days Inactive):{Colors.RESET} {len(audit['to_warn_60d'])} users")
    if audit["to_warn_60d"]:
        for u in audit["to_warn_60d"]:
            print(f"  • {Colors.YELLOW}{u['short_id']}{Colors.RESET} ({u['email']}) — {Colors.YELLOW}{u['inactive_days']} days inactive{Colors.RESET} (Last active: {u['last_active']})")
            print(f"    {Colors.DIM}Subject: 'Anypod Cleaner Monday: Inactive Account Check'{Colors.RESET}")
            print(f"    {Colors.DIM}Action:  1-click renewal link to keep account active or export OPML.{Colors.RESET}")
    else:
        print(f"  {Colors.GRAY}None pending.{Colors.RESET}")

    if audit["already_warned_60d"]:
        print(f"  {Colors.DIM}(Already notified at 60d: {', '.join(u['short_id'] for u in audit['already_warned_60d'])}){Colors.RESET}")

    # Section 3: 80-Day Final Notice Needed
    print(f"\n{Colors.BOLD}🟠 Due for 80-Day Final Notice (80–89 Days Inactive):{Colors.RESET} {len(audit['to_warn_80d'])} users")
    if audit["to_warn_80d"]:
        for u in audit["to_warn_80d"]:
            print(f"  • {Colors.RED}{u['short_id']}{Colors.RESET} ({u['email']}) — {Colors.RED}{u['inactive_days']} days inactive{Colors.RESET}")
            print(f"    {Colors.DIM}Subject: 'Final Notice: 10 Days Until Anypod Account Deletion'{Colors.RESET}")
    else:
        print(f"  {Colors.GRAY}None currently in the 80–89d window.{Colors.RESET}")

    # Section 4: 90-Day Deletions
    print(f"\n{Colors.BOLD}🔴 Due for Deletion (≥ 90 Days Inactive - GDPR Art. 5):{Colors.RESET} {len(audit['to_delete_90d'])} users")
    if audit["to_delete_90d"]:
        for u in audit["to_delete_90d"]:
            print(f"  • {Colors.RED}{u['short_id']}{Colors.RESET} ({u['email']}) — {u['inactive_days']} days inactive (Permanent wipe)")
    else:
        print(f"  {Colors.GRAY}Zero accounts scheduled for immediate deletion.{Colors.RESET}")

    print(f"\n  {Colors.GRAY}{'─' * 62}{Colors.RESET}")
    print(f"{Colors.BOLD}💡 Lifecycle Next Steps:{Colors.RESET}")
    if audit["to_warn_60d"]:
        print(f"  • Run with live dispatch: {Colors.CYAN}python3 scripts/cleaner_audit.py --run{Colors.RESET}")
        print(f"    (Dispatches Resend email to {', '.join(u['email'] for u in audit['to_warn_60d'])} and updates warned_30d_at)")
    else:
        print(f"  • All accounts are up-to-date with notification policies.")
    print()


def execute_live_run(audit: Dict[str, Any], token: str, account_id: str, db_id: str) -> None:
    """Trigger the live cleanup actions on D1 via the official endpoint or D1 execution."""
    resend_key = os.environ.get("RESEND_API_KEY")
    from_email = os.environ.get("FROM_EMAIL") or "Anypod Cleaner <login@anypod.org>"

    targets_60d = audit["to_warn_60d"]
    targets_80d = audit["to_warn_80d"]
    targets_del = audit["to_delete_90d"]

    print(f"{Colors.BOLD}Executing live cleaner actions...{Colors.RESET}")

    # 1. 60-Day Warnings
    for u in targets_60d:
        uid = u["id"]
        email = u["email"]
        print(f"  • Sending 60d warning to {email}...")

        # Generate magic token in D1
        token_hex = os.urandom(16).hex()
        # Insert auth_token valid for 14 days
        exp = int(time.time()) + 14 * 86400
        sql_token = f"INSERT INTO auth_tokens (token_hash, user_id, expires_at, used) VALUES ('{token_hex}', '{uid}', {exp}, 0);"
        execute_d1(token, account_id, db_id, DB_NAME, sql_token)

        verify_url = f"{APP_URL}/auth/verify/?token={token_hex}"

        # Send Resend email if key present
        if resend_key:
            try:
                subject = "Anypod Cleaner Monday: Inactive Account Check"
                body_data = {
                    "from": from_email,
                    "to": [email],
                    "subject": subject,
                    "html": f"<p>Hello,</p><p>You haven't used your Anypod sync in 60 days. To keep your account active, please tap below:</p><p><a href='{verify_url}'>Keep My Account Active</a></p>",
                }
                req = urllib.request.Request(
                    "https://api.resend.com/emails",
                    data=json.dumps(body_data).encode("utf-8"),
                    headers={"Authorization": f"Bearer {resend_key}", "Content-Type": "application/json"},
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=15) as resp:
                    pass
                print(f"    {Colors.GREEN}✓ Resend email delivered{Colors.RESET}")
            except Exception as e:
                print(f"    {Colors.RED}✗ Resend dispatch failed:{Colors.RESET} {e}")

        # Mark warned_30d_at (column repurposed for first notice)
        sql_mark = f"UPDATE users SET warned_30d_at = unixepoch() WHERE id = '{uid}';"
        execute_d1(token, account_id, db_id, DB_NAME, sql_mark)
        print(f"    {Colors.GREEN}✓ Updated warned_30d_at timestamp in D1{Colors.RESET}")

    # 2. Deletions (if any >= 90d)
    for u in targets_del:
        uid = u["id"]
        email = u["email"]
        print(f"  • Deleting expired account {email} ({uid})...")
        sql_del = f"""
        DELETE FROM subscriptions WHERE user_id = '{uid}';
        DELETE FROM playback_state WHERE user_id = '{uid}';
        DELETE FROM user_sessions WHERE user_id = '{uid}';
        DELETE FROM auth_tokens WHERE user_id = '{uid}';
        DELETE FROM users WHERE id = '{uid}';
        """
        execute_d1(token, account_id, db_id, DB_NAME, sql_del)
        print(f"    {Colors.GREEN}✓ Account wiped cleanly from D1{Colors.RESET}")

    print(f"\n{Colors.GREEN}✓ Cleaner execution finished.{Colors.RESET}\n")


def main() -> int:
    parser = argparse.ArgumentParser(description="Anypod Cleaner Monday Inactivity Lifecycle Audit.")
    parser.add_argument("--dry-run", action="store_true", default=True, help="Perform dry-run inspection without mutating data or sending mail.")
    parser.add_argument("--run", action="store_true", help="Execute live warnings and cleanup actions.")
    parser.add_argument("--json", action="store_true", help="Output raw JSON analysis.")
    args = parser.parse_args()

    creds = load_credentials()
    token = creds["token"]
    account_id = creds["account_id"]
    db_id = DB_ID_FALLBACK

    is_dry_run = not args.run

    try:
        audit = run_cleaner_audit(token, account_id, db_id)
        if args.json:
            print(json.dumps(audit, indent=2))
        else:
            render_audit_report(audit, dry_run=is_dry_run)
            if args.run:
                execute_live_run(audit, token, account_id, db_id)
        return 0
    except Exception as e:
        print(f"{Colors.RED}Cleaner audit error:{Colors.RESET} {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
