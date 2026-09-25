#!/usr/bin/env node

/**
 * Pre-Flight Deployment Verification Script for Anypod
 * Ensures functions directory exists, builds cleanly, and verifies target project.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appDir = path.resolve(__dirname, '..');

console.log('🔍 Running Anypod Pre-Flight Deployment Checks...');

// 1. Check functions directory & critical endpoints
const functionsDir = path.join(appDir, 'functions');
if (!fs.existsSync(functionsDir)) {
  console.error('❌ CRITICAL ERROR: app/functions directory not found! Aborting deploy.');
  process.exit(1);
}

const requiredEndpoints = [
  'api/auth/send-link.js',
  'api/auth/verify.js',
  'api/sync/feeds.js',
  'api/feed.js'
];

for (const ep of requiredEndpoints) {
  const fullPath = path.join(functionsDir, ep);
  if (!fs.existsSync(fullPath)) {
    console.error(`❌ CRITICAL ERROR: Missing required function endpoint: ${ep}! Aborting deploy.`);
    process.exit(1);
  }
}
console.log('✅ Functions directory and required API endpoints verified.');

// 2. Check wrangler.json target project name
const wranglerJsonPath = path.join(appDir, 'wrangler.json');
if (!fs.existsSync(wranglerJsonPath)) {
  console.error('❌ CRITICAL ERROR: wrangler.json not found! Aborting deploy.');
  process.exit(1);
}

try {
  const wranglerConfig = JSON.parse(fs.readFileSync(wranglerJsonPath, 'utf8'));
  if (wranglerConfig.name !== 'anypod') {
    console.error(`❌ CRITICAL ERROR: Target project is "${wranglerConfig.name}", expected "anypod"! Aborting deploy.`);
    process.exit(1);
  }
  console.log(`✅ Verified target Cloudflare Pages project: ${wranglerConfig.name} (anypod.org / podany.pages.dev)`);
} catch (err) {
  console.error('❌ Failed to parse wrangler.json:', err.message);
  process.exit(1);
}

// 3. Test compilation of Cloudflare Pages Functions
console.log('⚙️  Testing compilation of Cloudflare Pages Functions...');
const tmpOut = path.join(appDir, '.tmp-verify-bundle');
try {
  execSync(`npx wrangler pages functions build --outdir "${tmpOut}"`, {
    cwd: appDir,
    stdio: 'pipe'
  });
  console.log('✅ Functions bundle compiled successfully with zero errors.');
} catch (err) {
  console.error('❌ CRITICAL ERROR: Cloudflare Pages Functions failed to compile!');
  if (err.stderr) console.error(err.stderr.toString());
  process.exit(1);
} finally {
  if (fs.existsSync(tmpOut)) {
    fs.rmSync(tmpOut, { recursive: true, force: true });
  }
}

console.log('🎉 Pre-flight verification passed! Safe to deploy.\n');
