/**
 * Copies the repository's `shared/` modules (the product table used by the app) into
 * `src/shared/`, so the Functions build compiles the exact same source. Runs before every build
 * and test; the copy is gitignored.
 */
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, '..', '..', 'shared');
const target = join(here, '..', 'src', 'shared');

mkdirSync(target, { recursive: true });
for (const file of readdirSync(source)) {
  if (file.endsWith('.ts')) copyFileSync(join(source, file), join(target, file));
}
