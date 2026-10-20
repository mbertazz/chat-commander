import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir, writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {VERSION} from '../extension/build-info.mjs';
import {SERVER} from '../extension/server.mjs';

const root = new URL('..', import.meta.url);
async function files(directory) {
  const entries = await readdir(directory, {withFileTypes: true});
  const result = [];
  for (const entry of entries) {
    if (entry.isDirectory()) for (const child of await files(new URL(`${entry.name}/`, directory))) result.push(`${entry.name}/${child}`);
    else result.push(entry.name);
  }
  return result.sort();
}
test('Firefox package contains exactly current sources, no stale probes, and all icon sizes', async () => {
  const build = () => promisify(execFile)('python3', ['scripts/build_firefox.py'], {cwd: root});
  await build();
  const output = new URL('dist/firefox/', root); const source = new URL('extension/', root);
  await writeFile(new URL('obsolete-probe.mjs', output), 'stale');
  await build();
  assert.deepEqual(await files(output), await files(source));
  for (const name of await files(source)) {
    if (name === 'manifest.json') continue;
    assert.deepEqual(await readFile(new URL(name, output)), await readFile(new URL(name, source)), name);
  }
  const manifest = JSON.parse(await readFile(new URL('manifest.json', output)));
  assert.deepEqual(manifest.background, {scripts: ['worker.js'], type: 'module'});
  assert.equal(manifest.minimum_chrome_version, undefined);
  assert.equal(manifest.browser_specific_settings.gecko.id, 'chat-commander-poc@local.invalid');
  assert.equal(manifest.browser_specific_settings.gecko_android.strict_min_version, '142.0');
  assert.equal(manifest.default_locale, 'en');
  assert.equal(manifest.browser_specific_settings.gecko.strict_min_version, '140.0');
  assert.deepEqual(manifest.browser_specific_settings.gecko.data_collection_permissions.required,
    ['authenticationInfo', 'personalCommunications', 'websiteContent']);
  assert.ok((await files(output)).includes('privacy.html'));
  for (const [size, path] of Object.entries(manifest.icons)) {
    const png = await readFile(new URL(path, output));
    assert.equal(png.readUInt32BE(16), Number(size)); assert.equal(png.readUInt32BE(20), Number(size));
  }
});
test('manifest, MCP server, tunnel build info and package share one release version', async () => {
  const manifest = JSON.parse(await readFile(new URL('extension/manifest.json', root)));
  const pkg = JSON.parse(await readFile(new URL('package.json', root)));
  assert.equal(manifest.version, VERSION); assert.equal(pkg.version, VERSION); assert.equal(SERVER.version, VERSION);
});
