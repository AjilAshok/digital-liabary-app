// Runs `ng test` with a normalised working directory.
// On Windows, a lower-case drive letter in the cwd (e.g. "d:\" as opened by some editors) makes
// Vitest load two copies of itself and every suite fails before running. Upper-casing fixes it.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const upperDrive = (p) => p.replace(/^[a-z]:/, (d) => d.toUpperCase());
const ngBin = upperDrive(join(dirname(require.resolve('@angular/cli/package.json')), 'bin', 'ng.js'));

const result = spawnSync(process.execPath, [ngBin, 'test', ...process.argv.slice(2)], {
  cwd: upperDrive(process.cwd()),
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
