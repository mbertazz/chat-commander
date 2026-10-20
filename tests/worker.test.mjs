import {test} from 'node:test';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

async function scenario() {
  const assert = (await import('node:assert/strict')).default;
  const oldChrome = globalThis.chrome; const oldFetch = globalThis.fetch;
  const session = {}; const local = {}; let listener; let action; let accessLevel; let allowed = true; let fetches = 0;
  const area = data => ({
    get: async key => ({[key]: data[key]}),
    set: async values => {Object.assign(data, values);},
    remove: async keys => {for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key];},
    setAccessLevel: async value => {accessLevel = value.accessLevel;},
  });
  globalThis.chrome = {
    permissions: {contains: async () => allowed},
    storage: {session: area(session), local: area(local)},
    alarms: {get: async () => undefined, create: async () => {}, onAlarm: {addListener: () => {}}},
    action: {onClicked: {addListener: value => {action = value;}}},
    tabs: {query: async () => [{id: 42, url: 'https://chatgpt.com/', status: 'complete'}]},
    scripting: {executeScript: async options => options.world === 'ISOLATED'
      ? [{frameId: 0, result: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'}]
      : [{frameId: 0, documentId: 'doc-test', result: {code: 'source_bound', userHash: 'a'.repeat(64)}}]},
    runtime: {id: 'test-extension', getURL: path => `chrome-extension://test-extension/${path}`,
      onMessage: {addListener: value => {listener = value;}}, openOptionsPage: async () => {}},
  };
  globalThis.fetch = async () => {fetches++; return new Response(null, {status: 401});};
  try {
    await import('../extension/worker.js');
    const config = {tunnelId: `tunnel_${'a'.repeat(32)}`, apiKey: 'synthetic-key'};
    assert.equal(listener({type: 'connect', config}, {id: 'foreign', url: 'https://example.com'}, () => assert.fail()), undefined);
    const reply = await new Promise(resolve => listener({type: 'connect', config}, {
      id: 'test-extension', url: 'chrome-extension://test-extension/options.html',
    }, resolve));
    assert.equal(reply.ok, true);
    for (let i = 0; i < 20 && !session.status?.stopped; i++) await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(accessLevel, 'TRUSTED_CONTEXTS');
    assert.deepEqual(local, {tunnelId: config.tunnelId});
    assert.equal(session.config, undefined);
    allowed = true;
    const sender = {id: 'test-extension', url: 'chrome-extension://test-extension/options.html'};
    action({id: 42, url: 'https://chatgpt.com/'});
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(session.liveSource, undefined); // Settings alone never pair.
    await new Promise(resolve => listener({type: 'connectSource', tabId: 42}, sender, resolve));
    for (let i = 0; i < 20 && session.liveStatus?.code !== 'live_bound'; i++) await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(session.liveSource.documentId, 'doc-test');
    assert.equal(local.trustedSourceHash, 'a'.repeat(64));
    const paired = session.liveSource;
    action({id: 99, url: 'https://chatgpt.com/c/another-tab'});
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(session.liveSource, paired); // No source replacement or review invalidation.
    assert.equal(local.liveSource, undefined);
    assert.equal(session.liveBindArmed, undefined);
    await new Promise(resolve => listener({type: 'lock'}, sender, resolve));
    assert.equal(session.liveSource, undefined);
    assert.equal(local.sourceMode, undefined);
    assert.equal(session.status.code, 'locked');
    assert.ok(!JSON.stringify({local, status: session.status}).includes(config.apiKey));
    allowed = false;
    await new Promise(resolve => listener({type: 'connect', config}, {
      id: 'test-extension', url: 'chrome-extension://test-extension/options.html',
    }, resolve));
    assert.equal(session.status.code, 'host_permission_missing');
    assert.equal(fetches, 1); // Missing host access prevents even an attempted API request.
    await new Promise(resolve => listener({type: 'disconnect'}, {
      id: 'test-extension', url: 'chrome-extension://test-extension/options.html',
    }, resolve));
    assert.equal(session.config, undefined);
  } finally {globalThis.chrome = oldChrome; globalThis.fetch = oldFetch;}
}
test('worker confines key to session, rejects foreign messages, clears key on fatal auth failure', async () => {
  await promisify(execFile)(process.execPath, ['--input-type=module', '-e', `await (${scenario.toString()})();`], {
    cwd: new URL('.', import.meta.url), timeout: 10000, maxBuffer: 100000,
  });
});
