// Runs Vitest with a normalised working directory.
// On Windows, a lower-case drive letter in the cwd (e.g. "d:\" as opened by some editors) makes
// Vitest load two copies of itself, failing every suite with
// "Cannot read properties of undefined (reading 'config')". Upper-casing the drive letter avoids it.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const cwd = process.cwd().replace(/^[a-z]:/, (d) => d.toUpperCase());
const upperDrive = (p) => p.replace(/^[a-z]:/, (d) => d.toUpperCase());
const vitestBin = upperDrive(join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs'));

const result = spawnSync(process.execPath, [vitestBin, ...process.argv.slice(2)], {
  cwd,
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
