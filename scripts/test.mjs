import {spawnSync} from 'node:child_process';
import {readdirSync} from 'node:fs';
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || major === 22 && minor < 22) throw new Error('Node 22.22 or newer is required');
const isolation = major >= 24 ? '--test-isolation=none' : '--experimental-test-isolation=none';
const files = readdirSync(new URL('../tests/', import.meta.url))
  .filter(name => name.endsWith('.test.mjs')).sort().map(name => `tests/${name}`);
const run = spawnSync(process.execPath, ['--test', isolation, ...files], {stdio: 'inherit'});
process.exitCode = run.status ?? 1;
