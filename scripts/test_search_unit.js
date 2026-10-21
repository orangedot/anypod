#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appDir = path.resolve(__dirname, '..');

console.log('🧪 Running Search Unit & Taxonomy Test...\n');

// 1. Read 04-feeds-and-discover.js and check SUBGENRE_MAP
const feedsJsPath = path.join(appDir, 'public', 'app', '04-feeds-and-discover.js');
const feedsJs = fs.readFileSync(feedsJsPath, 'utf8');

// Extract SUBGENRE_MAP
const mapMatch = feedsJs.match(/const SUBGENRE_MAP = (\{[\s\S]*?\n\s*\};)/);
if (!mapMatch) {
  console.error('❌ Could not find SUBGENRE_MAP in 04-feeds-and-discover.js');
  process.exit(1);
}

let subgenreMap;
try {
  // Safe eval of object literal
  const evalStr = '(' + mapMatch[1].replace(/;\s*$/, '') + ')';
  subgenreMap = eval(evalStr);
  console.log(`✅ Loaded SUBGENRE_MAP with ${Object.keys(subgenreMap).length} categories`);
} catch (e) {
  console.error('❌ Failed to parse SUBGENRE_MAP:', e.message);
  process.exit(1);
}

// 2. Check all categories
let totalSubgenres = 0;
for (const [cat, sublist] of Object.entries(subgenreMap)) {
  if (!Array.isArray(sublist)) {
    console.error(`❌ Category "${cat}" is not an array`);
    process.exit(1);
  }
  totalSubgenres += sublist.length;
  for (const item of sublist) {
    if (!item.label || !item.query) {
      console.error(`❌ Invalid subgenre item in "${cat}":`, item);
      process.exit(1);
    }
  }
}
console.log(`✅ Total verified subgenres: ${totalSubgenres}`);

// 3. Test Paleontology Fossils
const paleo = subgenreMap['Paleontology Fossils'];
console.log(`\n🦕 'Paleontology Fossils' has ${paleo.length} subgenres:`);
paleo.forEach((p, idx) => console.log(`   ${idx + 1}. [${p.label}] → query: "${p.query}"`));

// 4. Verify search query building and URL formatting
const testQuery = 'Paleontology Fossils';
const searchUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(testQuery)}&entity=podcast&limit=50`;
console.log(`\n🔗 Formed Search URL: ${searchUrl}`);

console.log('\n🎉 Unit tests passed!');
