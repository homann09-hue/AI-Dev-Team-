import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const config = JSON.parse(await readFile(new URL('../apps/dashboard/vercel.json', import.meta.url), 'utf8'));

test('Vercel installs locked root and dashboard dependencies without lifecycle scripts', () => {
  assert.equal(
    config.installCommand,
    'cd ../.. && npm ci --ignore-scripts && cd apps/dashboard && npm ci --ignore-scripts',
  );
});
