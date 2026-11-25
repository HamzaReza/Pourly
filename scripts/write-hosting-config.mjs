/**
 * Writes `public/site-config.js` (gitignored) before a Hosting deploy, so the static pages can show
 * the support email without hard-coding it. Reads `EXPO_PUBLIC_SUPPORT_EMAIL` from the environment,
 * falling back to the project's `.env`. Without a value the pages simply hide the support line.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const KEY = 'EXPO_PUBLIC_SUPPORT_EMAIL';

const fromDotEnv = () => {
  const file = join(root, '.env');
  if (!existsSync(file)) return '';
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^\s*EXPO_PUBLIC_SUPPORT_EMAIL\s*=\s*(.*)\s*$/.exec(line);
    if (match) return match[1].replace(/^["']|["']$/g, '').trim();
  }
  return '';
};

const value = (process.env[KEY] ?? '').trim() || fromDotEnv();
const supportEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : '';
const config = { supportEmail };
writeFileSync(
  join(root, 'public', 'site-config.js'),
  `window.POURLY_SITE = ${JSON.stringify(config)};\n`,
);
console.log(`public/site-config.js written (support email ${supportEmail ? 'set' : 'not set'})`);
