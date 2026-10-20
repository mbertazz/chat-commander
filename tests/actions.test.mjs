import {chatgptPage} from '../extension/chatgpt-page.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {validActionArgs, ACTION_TOOLS} from '../extension/actions.mjs';
import {liveDispatcher, runLiveAction} from '../extension/live-source.mjs';
import {Tunnel} from '../extension/tunnel.mjs';

const id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const session = {accessToken: 'private-token', user: {id: 'user-test'}};
const userHash = Buffer.from(await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(session.user.id))).toString('hex');
const binding = {tabId: 1, documentId: null, documentKey: id, userHash};
const rename = {id, expected_title: 'Before', title: 'After'};
async function run(name, args, fetcher, expiresAt = Date.now() + 25000) {
  const ctx = vm.createContext({location: {origin: 'https://chatgpt.com'}, crypto: webcrypto, fetch: fetcher,
    AbortSignal, Uint8Array, TextEncoder, TextDecoder, args: [name, args, userHash, expiresAt]});
  vm.runInContext('globalThis.top = globalThis', ctx);
  return JSON.parse(JSON.stringify(await vm.runInContext(`(${chatgptPage.toString()})(...args)`, ctx)));
}
function backend() {
  const state = {title: 'Before', is_archived: false}; const patches = []; const calls = [];
  return {state, patches, calls, fetch: async (url, options) => {
    calls.push({url, options}); assert.equal(options.redirect, 'error');
    if (url === '/api/auth/session') return Response.json(session);
    assert.equal(url, `/backend-api/conversation/${id}`);
    assert.equal(options.headers.Authorization, 'Bearer private-token');
    if (options.method === 'PATCH') {
      const patch = JSON.parse(options.body); patches.push(patch); Object.assign(state, patch);
      return Response.json({success: true});
    }
    return Response.json({...state, conversation_id: id, mapping: {private: 'private-messages'}});
  }};
}
function apiFor(fetcher) {
  return {permissions: {contains: async () => true}, tabs: {get: async () => ({url: 'https://chatgpt.com/'})},
    storage: {local: {get: async () => ({})}, session: {get: async () => ({liveSource: binding})}},
    scripting: {executeScript: async options => [{frameId: 0, result: options.world === 'ISOLATED' ? id
      : await run(options.args[0], options.args[1], fetcher, options.args[3])}]}};
}
const command = (name, args) => ({command_type: 'jsonrpc', request_id: 'request', shard_token: 'shard',
  jsonrpc: {jsonrpc: '2.0', method: 'tools/call', id: 1, params: {name, arguments: args}}});

test('metadata read returns no messages or credentials and never writes', async () => {
  const b = backend(); const result = await run('get_chat', {id}, b.fetch);
  assert.equal(result.code, 'action_ok'); assert.equal(result.chat.title, 'Before'); assert.equal(b.patches.length, 0);
  assert.ok(!JSON.stringify(result).includes('private-'));
});
test('rename checks expected title, verifies state and repeated desired change performs no PATCH', async () => {
  const b = backend();
  assert.equal((await run('rename_chat', {...rename, expected_title: 'Wrong'}, b.fetch)).code, 'action_conflict');
  assert.equal(b.patches.length, 0);
  const result = await run('rename_chat', rename, b.fetch);
  assert.equal(result.code, 'action_ok'); assert.equal(result.changed, true); assert.equal(result.chat.title, 'After');
  assert.deepEqual(b.patches, [{title: 'After'}]);
  assert.equal((await run('rename_chat', rename, b.fetch)).changed, false); assert.equal(b.patches.length, 1);
});
test('archive and restore each change only archived state, no deletion field', async () => {
  const b = backend(); const args = {id, expected_title: 'Before', expected_archived: false, archived: true};
  assert.equal((await run('set_chat_archived', args, b.fetch)).chat.archived, true);
  assert.equal((await run('set_chat_archived', {...args, expected_archived: true, archived: false}, b.fetch)).chat.archived, false);
  assert.deepEqual(b.patches, [{is_archived: true}, {is_archived: false}]);
});
test('expired requests, account change before write and unexpected metadata send no PATCH', async () => {
  const b = backend();
  assert.equal((await run('rename_chat', rename, b.fetch, Date.now() - 1)).code, 'action_read_failed');
  let sessions = 0;
  const fetcher = async (url, options) => url === '/api/auth/session' && ++sessions === 2
    ? Response.json({...session, user: {id: 'other'}}) : b.fetch(url, options);
  assert.equal((await run('rename_chat', rename, fetcher)).code, 'source_identity_changed');
  assert.equal(b.patches.length, 0);
  const invalid = await run('rename_chat', rename, async url => Response.json(url === '/api/auth/session' ? session : {title: 'Before', is_archived: false, conversation_id: 'other'}));
  assert.equal(invalid.code, 'action_read_failed');
});
test('PATCH timeout, rejected response and failed verification are uncertain and never retried', async () => {
  for (const fault of ['throw', 'http', 'success', 'readback']) {
    const b = backend(); let patches = 0;
    const result = await run('rename_chat', rename, async (url, options) => {
      if (options.method === 'PATCH') {
        patches++;
        if (fault === 'throw') throw new Error('private-error');
        if (fault === 'http') return new Response('private-error', {status: 503});
        return Response.json({success: fault !== 'success'}); // Intentionally do not apply change.
      }
      return b.fetch(url, options);
    });
    assert.equal(result.code, 'action_outcome_unknown'); assert.equal(patches, 1);
    assert.ok(!JSON.stringify(result).includes('private-'));
  }
});
test('RPC rejects invented paths, bulk, deletion and extra arguments; mutations are marked non-read-only', async () => {
  assert.equal(validActionArgs('rename_chat', {...rename, id: '../other'}), false);
  assert.equal(validActionArgs('rename_chat', {...rename, ids: [id]}), false);
  assert.equal(validActionArgs('delete_chat', {id}), false);
  for (const tool of ACTION_TOOLS.filter(t => t.name !== 'get_chat')) {
    assert.equal(tool.annotations.readOnlyHint, true); assert.equal(tool.annotations.destructiveHint, false);
  }
  const api = apiFor(() => assert.fail());
  assert.equal((await liveDispatcher(api)(command('rename_chat', {...rename, confirmed: true}))).resp_json.error.code, -32602);
  api.storage.session.get = async () => ({});
  assert.equal((await liveDispatcher(api)(command('rename_chat', rename))).resp_json.result.isError, true);
});
test('complete MCP poll-action-response verifies metadata, no credentials or full messages transmitted', async () => {
  const b = backend(); let posted;
  const tunnel = new Tunnel({tunnelId: `tunnel_${'a'.repeat(32)}`, apiKey: 'runtime'}, {
    dispatch: liveDispatcher(apiFor(b.fetch)), fetcher: async (url, options) => {
      if (url.includes('/response')) {posted = JSON.parse(options.body); return new Response(null, {status: 204});}
      return Response.json({commands: [command('rename_chat', rename)]});
    }});
  await tunnel.cycle();
  assert.equal(posted.resp_json.result.structuredContent.status, 'proposed');
  assert.equal(posted.resp_json.result.structuredContent.changes[0].after_title, 'After');
  assert.ok(!JSON.stringify(posted).includes('private-')); assert.equal(b.patches.length, 0);
});
test('document change or cancellation after injection reports uncertain mutation outcome', async () => {
  const b = backend(); const api = apiFor(b.fetch); const original = api.scripting.executeScript;
  let markers = 0;
  api.scripting.executeScript = async options => options.world === 'ISOLATED' && ++markers === 2
    ? [{frameId: 0, result: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'}] : original(options);
  await assert.rejects(runLiveAction(api, binding, 'rename_chat', rename), /action_outcome_unknown/);
  const controller = new AbortController(); const api2 = apiFor(b.fetch);
  const injected = api2.scripting.executeScript;
  api2.scripting.executeScript = async options => {
    const result = await injected(options); if (options.world === 'MAIN') controller.abort(); return result;
  };
  await assert.rejects(runLiveAction(api2, binding, 'rename_chat', rename, controller.signal), /action_outcome_unknown/);
});
