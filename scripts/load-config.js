import fs from 'node:fs';
import path from 'node:path';

/**
 * Simple parser for key: value YAML files without external dependencies.
 */
function parseSimpleYaml(text) {
  const result = {};
  const lines = text.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let val = line.slice(colonIdx + 1).trim();
    // Strip quotes if wrapped in ' or "
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (val === 'true') val = true;
    else if (val === 'false') val = false;
    else if (/^\d+$/.test(val)) val = Number(val);
    result[key] = val;
  }
  return result;
}

function loadConfigFile() {
  const searchPaths = [
    '/data/config.json',
    '/data/config.yaml',
    '/data/config.yml',
    path.resolve(process.cwd(), 'config.json'),
    path.resolve(process.cwd(), 'config.yaml'),
    path.resolve(process.cwd(), 'config.yml'),
  ];

  for (const filePath of searchPaths) {
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        let config = {};
        if (filePath.endsWith('.json')) {
          config = JSON.parse(content);
        } else {
          config = parseSimpleYaml(content);
        }
        console.log(`📄 Loaded configuration from ${filePath}`);
        return config;
      } catch (err) {
        console.warn(`⚠️ Failed to parse config file at ${filePath}:`, err.message);
      }
    }
  }
  return {};
}

export function syncConfigToEnv() {
  const fileConfig = loadConfigFile();

  // Mapping of allowed config variables
  const configKeys = ['PORT', 'APP_URL', 'FROM_EMAIL', 'RESEND_API_KEY', 'CRON_SECRET'];

  const envOut = {};

  // 1. File config takes baseline priority
  for (const [key, value] of Object.entries(fileConfig)) {
    const upperKey = key.toUpperCase();
    if (value !== undefined && value !== null && value !== '') {
      envOut[upperKey] = String(value);
    }
  }

  // 2. process.env takes override priority
  for (const key of configKeys) {
    if (process.env[key]) {
      envOut[key] = String(process.env[key]);
    }
  }

  // Defaults
  if (!envOut.PORT) envOut.PORT = '8788';
  if (!envOut.APP_URL) envOut.APP_URL = `http://localhost:${envOut.PORT}`;
  if (!envOut.FROM_EMAIL) envOut.FROM_EMAIL = 'Anypod <anypod@localhost>';

  // Write to .env for wrangler pages dev
  const envLines = [];
  for (const [k, v] of Object.entries(envOut)) {
    // Also set into current process.env
    process.env[k] = v;
    envLines.push(`${k}=${v}`);
  }

  const envPath = path.resolve(process.cwd(), '.env');
  fs.writeFileSync(envPath, envLines.join('\n') + '\n', 'utf-8');

  // Friendly console banner
  console.log('⚡ Anypod Environment Configuration:');
  console.log(`   - PORT:           ${envOut.PORT}`);
  console.log(`   - APP_URL:        ${envOut.APP_URL}`);
  console.log(`   - FROM_EMAIL:     ${envOut.FROM_EMAIL}`);
  console.log(`   - RESEND_API_KEY: ${envOut.RESEND_API_KEY ? '••••••••' + envOut.RESEND_API_KEY.slice(-4) : '(not set, offline magic-link mode enabled)'}`);
  console.log(`   - CRON_SECRET:    ${envOut.CRON_SECRET ? '••••••••' : '(not set)'}`);
  console.log(`📁 Wrote ${envLines.length} variables to ${envPath}`);

  return envOut;
}

// When executed directly via node scripts/load-config.js
if (process.argv[1] && process.argv[1].endsWith('load-config.js')) {
  syncConfigToEnv();
}
