import fs from 'node:fs';
import path from 'node:path';

const localesDir = path.resolve('src/lib/i18n/locales');
const files = ['zh-TW.ts', 'en.ts', 'ja.ts'];

function extractKeys(content) {
  const keys = new Set();
  const stack = [];
  const lines = content.split(/\r?\n/);

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('//') || line.startsWith('/*') || line.startsWith('*')) continue;

    // Match nested object start: `key: {` or `'key': {`
    const objStart = line.match(/^(?:'([^']+)'|"([^"]+)"|([a-zA-Z0-9_]+))\s*:\s*\{/);
    if (objStart) {
      const k = objStart[1] || objStart[2] || objStart[3];
      stack.push(k);
      continue;
    }

    // Match closing brace
    if (line.startsWith('}')) {
      if (stack.length > 0) stack.pop();
      continue;
    }

    // Match leaf key: `key: '...'` or `'key': '...'`
    const leaf = line.match(/^(?:'([^']+)'|"([^"]+)"|([a-zA-Z0-9_]+))\s*:/);
    if (leaf && stack.length > 0) {
      const k = leaf[1] || leaf[2] || leaf[3];
      keys.add(`${stack.join('.')}.${k}`);
    }
  }
  return keys;
}

const maps = {};
for (const file of files) {
  const fullPath = path.join(localesDir, file);
  const content = fs.readFileSync(fullPath, 'utf8');
  maps[file] = extractKeys(content);
}

const baseKeys = maps['zh-TW.ts'];
let hasError = false;

for (const file of ['en.ts', 'ja.ts']) {
  const targetKeys = maps[file];
  const missing = [...baseKeys].filter((k) => !targetKeys.has(k));
  const extra = [...targetKeys].filter((k) => !baseKeys.has(k));

  if (missing.length > 0) {
    hasError = true;
    console.error(`[i18n] Missing keys in ${file}:`, missing);
  }
  if (extra.length > 0) {
    hasError = true;
    console.error(`[i18n] Extra keys in ${file}:`, extra);
  }
}

if (hasError) {
  process.exit(1);
} else {
  console.log(`[i18n] OK: All ${baseKeys.size} keys match across zh-TW.ts, en.ts, and ja.ts.`);
}
