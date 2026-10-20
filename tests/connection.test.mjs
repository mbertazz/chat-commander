import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bindSelected, restoreSource, sourceTabs} from '../extension/connection.mjs';
const hash = 'a'.repeat(64); const marker = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
function fixture() {
  const local = {autoReconnect: true, trustedSourceHash: hash}; const session = {};
  let markerValue = marker; let userHash = hash; let allowed = true; let injects = 0;
  const area = values => ({get: async key => ({[key]: values[key]}), set: async data => {Object.assign(values, data);}, remove: async key => {delete values[key];}});
  const api = {storage: {local: area(local), session: area(session)}, permissions: {contains: async () => allowed},
    tabs: {query: async () => [{id: 1, url: 'https://chatgpt.com/c/test', status: 'complete'}]},
    scripting: {executeScript: async options => {injects++; return [{frameId: 0, result: options.world === 'ISOLATED'
      ? markerValue : {code: 'source_bound', userHash}}];}}};
  return {api, local, session, count: () => injects, account: value => {userHash = value;}, marker: value => {markerValue = value;}, allow: value => {allowed = value;}};
}
test('explicit one-click pairing persists only account fingerprint and volatile document binding', async () => {
  const f = fixture(); await bindSelected(f.api, {id: 1, url: 'https://chatgpt.com/'});
  assert.equal(f.local.trustedSourceHash, hash); assert.equal(f.session.liveSource.documentKey, marker);
  assert.equal(f.local.liveSource, undefined);
});
test('automatic reconnection binds only the trusted account after document reload', async () => {
  const f = fixture(); let invalidations = 0;
  assert.equal(await restoreSource(f.api, () => invalidations++), true);
  assert.equal(f.session.liveSource.documentKey, marker);
  const oldCount = f.count(); assert.equal(await restoreSource(f.api), true); assert.equal(f.count(), oldCount + 1);
  f.marker('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb');
  assert.equal(await restoreSource(f.api, () => invalidations++), true);
  assert.equal(f.session.liveSource.documentKey, 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'); assert.equal(invalidations, 2);
});
test('wrong account, removed permission or missing previous pairing never silently establish trust', async () => {
  const f = fixture(); f.account('b'.repeat(64));
  assert.equal(await restoreSource(f.api), false); assert.equal(f.session.liveSource, undefined); assert.equal(f.local.trustedSourceHash, hash);
  delete f.local.trustedSourceHash; assert.equal(await restoreSource(f.api), false);
  f.allow(false); assert.deepEqual(await sourceTabs(f.api), []);
  assert.equal(await restoreSource(f.api), false);
});
test('disabled reconnect, loading tabs and non-ChatGPT/private tabs never trigger automatic pairing', async () => {
  const f = fixture(); f.local.autoReconnect = false; assert.equal(await restoreSource(f.api), false); assert.equal(f.count(), 0);
  f.local.autoReconnect = true;
  f.api.tabs.query = async () => [{id: 1, url: 'https://example.com/'}, {id: 2, url: 'https://chatgpt.com/', incognito: true},
    {id: 3, url: 'https://chatgpt.com/', status: 'loading'}];
  assert.equal(await restoreSource(f.api), false); assert.equal(f.count(), 0);
});
