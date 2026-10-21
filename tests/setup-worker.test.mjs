import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec = promisify(execFile);

// Fresh process gives the worker a genuine browser lifecycle and fresh module state.
async function scenario() {
  const assert = (await import('node:assert/strict')).default;
  let messageListener; let actionListener; let removedListener;
  const local = {}; const memory = {}; const key = 'TEST-PRIVATE-RUNTIME-KEY'; const password = 'test-local-vault-password';
  const area = data => ({get: async key => ({[key]: data[key]}), set: async values => {Object.assign(data, values);},
    remove: async keys => {for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key];},
    setAccessLevel: async () => {}});
  const hash = 'a'.repeat(64); const marker = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
  globalThis.chrome = {
    permissions: {contains: async () => true, onRemoved: {addListener: fn => {removedListener = fn;}}},
    storage: {local: area(local), session: area(memory)},
    tabs: {query: async () => [{id: 1, url: 'https://chatgpt.com/', status: 'complete', title: 'ChatGPT'}], get: async () => ({id: 1, url: 'https://chatgpt.com/'})},
    scripting: {executeScript: async options => [{frameId: 0, result: options.world === 'ISOLATED' ? marker : {code: 'source_bound', userHash: hash}}]},
    alarms: {get: async () => undefined, create: async () => {}, onAlarm: {addListener: () => {}}},
    action: {onClicked: {addListener: fn => {actionListener = fn;}}},
    runtime: {id: 'test', getURL: path => `chrome-extension://test/${path}`, openOptionsPage: async () => {},
      onMessage: {addListener: fn => {messageListener = fn;}}},
  };
  globalThis.fetch = async (url, options) => new Promise((resolve, reject) => {
    if (options.signal.aborted) reject(new Error('aborted'));
    else options.signal.addEventListener('abort', () => reject(new Error('aborted')), {once: true});
  });
  await import(new URL('./extension/worker.js', `file://${process.cwd()}/`));
  const sender = {id: 'test', url: 'chrome-extension://test/options.html'};
  const send = data => new Promise(resolve => messageListener(data, sender, resolve));
  const config = {tunnelId: `tunnel_${'a'.repeat(32)}`, apiKey: key};
  assert.equal((await send({type: 'connect', config, remember: true, password, automatic: true})).ok, true);
  assert.equal(memory.config.apiKey, key); assert.ok(local.vault.ciphertext);
  assert.ok(!JSON.stringify(local).includes(key)); assert.ok(!JSON.stringify(local).includes(password));
  assert.equal((await send({type: 'connectSource', tabId: 1, automatic: true})).ok, true);
  assert.equal(local.trustedSourceHash, hash); assert.ok(memory.liveSource);
  const view = (await send({type: 'setupState'})).data;
  assert.equal(view.sourceTabId, 1); assert.equal(view.unlocked, true); assert.equal(view.vaultSaved, true); assert.equal(view.bound, true);
  assert.ok(!JSON.stringify(view).includes(key)); assert.ok(!JSON.stringify(view).includes(local.vault.ciphertext));
  assert.equal((await send({type: 'lock'})).ok, true);
  assert.equal(memory.config, undefined); assert.equal(memory.liveSource, undefined); assert.ok(local.vault);
  assert.equal((await send({type: 'unlock', password: 'wrong-but-long-password'})).ok, false); assert.equal(memory.config, undefined);
  // Simulate a full browser/worker restart: retain only on-disk extension storage.
  assert.equal(messageListener({type: 'markToolsRefreshed'}, sender, () => assert.fail()), undefined);
  for (const k of Object.keys(memory)) delete memory[k];
  await import(new URL('./extension/worker.js?restart', `file://${process.cwd()}/`));
  const restarted = (await send({type: 'setupState'})).data;
  assert.equal(restarted.vaultSaved, true); assert.equal(restarted.unlocked, false);
  assert.equal(restarted.needsToolRefresh, true); assert.equal(memory.config, undefined);
  assert.equal((await send({type: 'unlock', password})).ok, true);
  assert.equal(memory.config.apiKey, key); assert.ok(memory.liveSource); // Restored same account without another toolbar click.
  removedListener({origins: ['https://chatgpt.com/*']});
  await send({type: 'setupState'}); assert.equal(memory.liveSource, undefined); assert.equal(local.autoReconnect, false);
  assert.equal((await send({type: 'setupState'})).data.needsToolRefresh, true);
  assert.equal((await send({type: 'disconnect'})).ok, true);
  assert.equal(local.vault, undefined); assert.equal(memory.config, undefined); assert.equal(local.trustedSourceHash, undefined);
  // Exercise the actual options module: key submission and explicit tab pairing are separate steps.
  const {readFile} = await import('node:fs/promises');
  const html = await readFile('./extension/options.html', 'utf8');
  const elements = new Map();
  const element = () => ({value: '', checked: false, hidden: false, textContent: '', children: [], events: {}, dataset: {},
    addEventListener(type, fn) {this.events[type] = fn;}, append(...items) {this.children.push(...items);}, replaceChildren() {this.children = [];}});
  for (const match of html.matchAll(/id="([^"]+)"/g)) elements.set(match[1], element());
  elements.get('remember').checked = true; elements.get('automatic').checked = true;
  globalThis.chrome.i18n = {getUILanguage: () => 'en', getMessage: () => 'Localized test message'};
  globalThis.document = {documentElement: {}, querySelectorAll: () => [], getElementById: id => elements.get(id), createElement: element};
  globalThis.chrome.runtime.getManifest = () => ({version: '0.8.0'});
  globalThis.chrome.runtime.sendMessage = message => send(structuredClone(message));
  globalThis.chrome.storage.onChanged = {addListener: () => {}};
  let permissionRequests = 0;
  globalThis.chrome.permissions.request = async permissions => {
    permissionRequests++; assert.ok(permissions.origins.includes('https://api.openai.com/*'));
    if (permissionRequests === 1) assert.equal(permissions.origins.includes('https://chatgpt.com/*'), false);
    else assert.ok(permissions.origins.includes('https://chatgpt.com/*')); return true;
  };
  await import(new URL('./extension/options.js', `file://${process.cwd()}/`));
  elements.get('tunnel').value = config.tunnelId; elements.get('key').value = key;
  elements.get('vault-password').value = password; elements.get('vault-confirm').value = password;
  await elements.get('connection').events.submit({preventDefault() {}, submitter: {disabled: false}});
  assert.equal(permissionRequests, 1); assert.ok(local.vault); assert.equal(memory.liveSource, undefined);
  assert.equal(elements.get('source-step').open, true);
  assert.equal(elements.get('key-step').open, false);
  await elements.get('connect-source').events.click();
  assert.equal(permissionRequests, 2); assert.ok(memory.liveSource);
  assert.equal(elements.get('source-step').open, true);
  assert.equal(elements.get('continue-source').hidden, false);
  await elements.get('continue-source').events.click();
  assert.equal(elements.get('app-step').open, true);
  assert.equal(elements.get('source-message').textContent, ''); // No stale instruction after pairing.
  for (const id of ['key', 'vault-password', 'vault-confirm']) assert.equal(elements.get(id).value, '');
  assert.ok(!JSON.stringify(local).includes(key)); assert.equal(elements.get('settings').open, false);
  // Reopening options with multiple tabs restores the actual binding without pairing again.
  const pairedBeforeReopen = memory.liveSource;
  globalThis.chrome.tabs.query = async () => [
    {id: 1, url: 'https://chatgpt.com/', status: 'complete', title: 'Control'},
    {id: 2, url: 'https://chatgpt.com/', status: 'complete', title: 'Other'},
  ];
  elements.get('source-tab').value = '';
  await import(new URL('./extension/options.js?reopen', `file://${process.cwd()}/`));
  assert.equal(elements.get('source-tab').value, '1');
  assert.equal(memory.liveSource, pairedBeforeReopen);
  assert.equal(elements.get('source-step').open, true);
  elements.get('source-tab').value = '2';
  await elements.get('source-tab').events.change();
  assert.equal(elements.get('continue-source').hidden, true);
  await elements.get('continue-source').events.click();
  assert.equal(elements.get('app-content').hidden, true);
  assert.equal(memory.liveSource, pairedBeforeReopen); // Selecting is not reconnecting.
  elements.get('source-tab').value = '1';
  await elements.get('source-tab').events.change();
  await elements.get('continue-source').events.click();
  assert.equal(elements.get('app-content').hidden, false);
  globalThis.chrome.tabs.query = async () => [{id: 1, url: 'https://chatgpt.com/', status: 'complete', title: 'ChatGPT'}];
  await elements.get('lock').events.click(); assert.equal(memory.config, undefined); assert.ok(local.vault);
  assert.equal(elements.get('unlock').hidden, false);
  elements.get('unlock-password').value = password;
  await elements.get('unlock').events.submit({preventDefault() {}, submitter: {disabled: false}});
  assert.equal(elements.get('unlock-password').value, ''); assert.ok(memory.config); assert.ok(memory.liveSource);
  assert.equal(elements.get('source-step').open, true);
  assert.equal(elements.get('app-content').hidden, true);
  assert.equal(elements.get('source-tab').value, '1');
  await elements.get('continue-source').events.click();
  assert.equal(elements.get('app-step').open, true);
  assert.equal(elements.get('app-content').hidden, false);
  // A saved binding must not claim a source when the tab is no longer available.
  globalThis.chrome.tabs.query = async () => [];
  assert.equal((await send({type: 'setupState'})).data.bound, false);
  await send({type: 'disconnect'});
  // Saving a session-only key removes an older encrypted vault explicitly.
  local.vault = {old: true};
  assert.equal((await send({type: 'connect', config, remember: false, automatic: false})).ok, true);
  assert.equal(local.vault, undefined); assert.equal(memory.config.apiKey, key);
  await send({type: 'disconnect'});
  assert.equal(messageListener({type: 'unlock', password}, {id: 'foreign', url: sender.url}, () => assert.fail()), undefined);
}
test('worker encrypts persistence, unlocks/reconnects, handles permission revocation, locks and forgets without leaking secrets', async () => {
  const result = await exec(process.execPath, ['--input-type=module', '-e', `await (${scenario.toString()})();`], {
    cwd: new URL('..', import.meta.url), timeout: 20000, maxBuffer: 100000,
  });
  assert.equal(result.stdout, '');
});
