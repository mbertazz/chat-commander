import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {chatgptPage} from '../extension/chatgpt-page.mjs';
import {bindSource, readLiveChats, liveDispatcher, identifySourceDocument} from '../extension/live-source.mjs';
import {Tunnel} from '../extension/tunnel.mjs';

const source = {tabId: 42, documentId: 'document-test', documentKey: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', userHash: 'a'.repeat(64)};
const chat = {id: 'chat-test', title: 'Titolo privato', created_at: '2026-10-18T08:00:00.000Z',
  updated_at: '2026-10-19T08:00:00.000Z', project_id: null, source_gizmo_id: null, archived: false};
const command = (method = 'tools/call', params = {name: 'list_chats', arguments: {limit: 5}}) => ({
  command_type: 'jsonrpc', request_id: 'request-test', shard_token: 'shard-test',
  jsonrpc: {jsonrpc: '2.0', id: 1, method, params},
});
function fakeApi(result = {code: 'live_list_ok', chats: [chat]}) {
  return {
    permissions: {contains: async () => true},
    tabs: {get: async () => ({id: 42, url: 'https://chatgpt.com/'})},
    scripting: {executeScript: async options => options.world === 'ISOLATED'
      ? [{frameId: 0, result: source.documentKey}] : [{frameId: 0, documentId: source.documentId, result}]},
    storage: {local: {get: async () => ({})}, session: {get: async () => ({liveSource: source})}},
  };
}
async function pageCall(mode, limit, hash, fetcher) {
  const context = vm.createContext({location: {origin: 'https://chatgpt.com'}, fetch: fetcher, AbortSignal,
    Uint8Array, TextDecoder, TextEncoder, crypto: webcrypto, args: [mode === 'live' ? 'list_chats' : mode, {limit}, hash]});
  vm.runInContext('globalThis.top = globalThis;', context);
  return JSON.parse(JSON.stringify(await vm.runInContext(`(${chatgptPage.toString()})(...args)`, context)));
}

test('binding reads only session and returns a hash, never the session token or user ID', async () => {
  let calls = 0;
  const result = await pageCall('bind', 5, null, async url => {
    calls++; assert.equal(url, '/api/auth/session');
    return Response.json({accessToken: 'private-token', user: {id: 'private-user-id'}});
  });
  assert.equal(calls, 1); assert.equal(result.code, 'source_bound');
  assert.match(result.userHash, /^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(result).includes('private-'));
});
test('live read rejects missing or changed identity before any list request', async () => {
  for (const user of [{}, {id: 'different-user'}]) {
    let calls = 0;
    const result = await pageCall('live', 5, source.userHash, async () => {
      calls++; return Response.json({accessToken: 'token', user});
    });
    assert.equal(calls, 1);
    assert.ok(['source_identity_missing', 'source_identity_changed'].includes(result.code));
  }
});
test('live page read normalizes metadata and rechecks identity without returning secrets or messages', async () => {
  const session = {accessToken: 'private-token', user: {id: 'user-test'}};
  const bound = await pageCall('bind', 5, null, async () => Response.json(session));
  const calls = [];
  const result = await pageCall('live', 5, bound.userHash, async (url, options) => {
    calls.push({url, options});
    return Response.json(url === '/api/auth/session' ? session : {items: [{id: 'id1', title: 'Chat',
      create_time: 100, update_time: 200, gizmo_id: 'opaque-gizmo', is_archived: false, mapping: {messages: 'private-content'}}]});
  });
  assert.equal(result.code, 'live_list_ok'); assert.equal(calls.length, 3);
  assert.ok(calls[1].url.endsWith('limit=5&order=updated&is_archived=false'));
  assert.equal(result.chats[0].created_at, '1970-01-01T00:01:40.000Z');
  assert.equal(result.chats[0].source_gizmo_id, 'opaque-gizmo');
  assert.equal(result.chats[0].project_id, null);
  for (const secret of ['private-token', 'private-content', 'user-test']) assert.ok(!JSON.stringify(result).includes(secret));
});
test('account change during reading discards the real result', async () => {
  const session = {accessToken: 'token', user: {id: 'user-test'}};
  const bound = await pageCall('bind', 5, null, async () => Response.json(session));
  let sessions = 0;
  const result = await pageCall('live', 5, bound.userHash, async url => Response.json(url === '/api/auth/session'
    ? (++sessions === 1 ? session : {user: {id: 'other-user'}})
    : {items: [{id: 'private-chat', title: 'Private', update_time: 200, is_archived: false}]}));
  assert.deepEqual(result, {code: 'source_identity_changed'});
});
test('unexpected archived records and wrong ordering are rejected instead of relabeled', async () => {
  const session = {accessToken: 'token', user: {id: 'user-test'}};
  const bound = await pageCall('bind', 5, null, async () => Response.json(session));
  for (const [items, expected] of [
    [[{id: 'id1', title: 'Archived', update_time: 200, is_archived: true}], 'list_schema_unknown'],
    [[{id: 'id1', title: 'Unknown archive', update_time: 200}], 'list_schema_unknown'],
    [[{id: 'id1', title: 'Old', update_time: 100, is_archived: false},
      {id: 'id2', title: 'New', update_time: 200, is_archived: false}], 'list_order_unknown'],
  ]) {
    const result = await pageCall('live', 5, bound.userHash, async url => Response.json(url === '/api/auth/session' ? session : {items}));
    assert.equal(result.code, expected); assert.equal(result.chats, undefined);
  }
});
test('binding requires the clicked ChatGPT tab and an identifiable document', async () => {
  const api = fakeApi({code: 'source_bound', userHash: source.userHash});
  assert.deepEqual(await bindSource(api, {id: 42, url: 'https://chatgpt.com/'}), source);
  await assert.rejects(bindSource(api, {id: 42, url: 'https://example.com'}), /source_tab_unavailable/);
  api.scripting.executeScript = async options => options.world === 'ISOLATED'
    ? [{frameId: 0, result: source.documentKey}]
    : [{frameId: 0, result: {code: 'source_bound', userHash: source.userHash}}];
  assert.deepEqual(await bindSource(api, {id: 42, url: 'https://chatgpt.com/'}), {...source, documentId: null});
});
test('closed, navigated, reloaded or unbound tabs fail without returning data', async () => {
  const api = fakeApi();
  await assert.rejects(readLiveChats(api, null, 5), /source_not_bound/);
  api.tabs.get = async () => {throw new Error('private exception');};
  await assert.rejects(readLiveChats(api, source, 5), /source_tab_unavailable/);
  api.tabs.get = async () => ({url: 'https://example.com'});
  await assert.rejects(readLiveChats(api, source, 5), /source_tab_unavailable/);
  api.tabs.get = async () => ({url: 'https://chatgpt.com/'});
  api.scripting.executeScript = async options => options.world === 'ISOLATED'
    ? [{frameId: 0, result: source.documentKey}]
    : [{frameId: 0, documentId: 'new-document', result: {code: 'live_list_ok', chats: [chat]}}];
  await assert.rejects(readLiveChats(api, source, 5), /source_document_changed/);
});
test('normalization strips unapproved fields and supports a genuine empty list', async () => {
  const api = fakeApi({code: 'live_list_ok', chats: [{...chat, accessToken: 'injected-secret', messages: ['private']}], accessToken: 'another-secret'});
  const result = await readLiveChats(api, source, 5);
  assert.equal(result.synthetic, false); assert.equal(result.scope, 'general_history');
  assert.deepEqual(result.chats, [chat]);
  assert.ok(!JSON.stringify(result).includes('injected-secret'));
  assert.deepEqual((await readLiveChats(fakeApi({code: 'live_list_ok', chats: []}), source, 5)).chats, []);
});
test('aborted and expired calls are rejected before injection', async () => {
  const api = fakeApi(); api.scripting.executeScript = async () => assert.fail();
  await assert.rejects(readLiveChats(api, source, 5, AbortSignal.abort()), /source_cancelled/);
  await assert.rejects(readLiveChats(api, source, 5, undefined, 0), /source_cancelled/);
});
test('live dispatcher advertises real read-only tool, validates arguments, never falls back to synthetic on error', async () => {
  const api = fakeApi(); const dispatch = liveDispatcher(api);
  const discovery = await dispatch(command('tools/list', {}));
  assert.match(discovery.resp_json.result.tools[0].description, /personally bound/);
  const result = await dispatch(command());
  assert.equal(result.resp_json.result.structuredContent.synthetic, false);
  const invalid = await dispatch(command('tools/call', {name: 'list_chats', arguments: {limit: '5'}}));
  assert.equal(invalid.resp_json.error.code, -32602);
  api.storage.session.get = async () => ({});
  const failed = await dispatch(command());
  assert.equal(failed.resp_json.result.isError, true);
  assert.match(failed.resp_json.result.content[0].text, /source_not_bound/);
  assert.ok(!JSON.stringify(failed).includes('synthetic-chat'));
});
test('binding replaced during reading discards result before tunnel response', async () => {
  const api = fakeApi(); let reads = 0;
  api.storage.session.get = async () => ({liveSource: ++reads === 1 ? source : {...source, documentId: 'other'}});
  const result = await liveDispatcher(api)(command());
  assert.equal(result.resp_json.result.isError, true);
  assert.ok(!JSON.stringify(result).includes(chat.title));
});
test('poll invokes async live handler and posts real metadata in correctly correlated response', async () => {
  const calls = [];
  const tunnel = new Tunnel({tunnelId: `tunnel_${'a'.repeat(32)}`, apiKey: 'test-key'}, {
    dispatch: liveDispatcher(fakeApi()), fetcher: async (url, options) => {
      calls.push({url, options});
      return calls.length === 1 ? Response.json({commands: [command()]}) : new Response(null, {status: 204});
    },
  });
  await tunnel.cycle();
  const response = JSON.parse(calls[1].options.body);
  assert.equal(response.request_id, 'request-test');
  assert.equal(calls[1].options.headers['X-Tunnel-Shard-Token'], 'shard-test');
  assert.equal(response.resp_json.result.structuredContent.synthetic, false);
  assert.equal(response.resp_json.result.structuredContent.chats[0].title, chat.title);
});
test('isolated document marker is stable within a document and changes after reload', () => {
  const context = () => {
    const value = vm.createContext({location: {origin: 'https://chatgpt.com'}, crypto: webcrypto});
    vm.runInContext('globalThis.top = globalThis;', value); return value;
  };
  const original = context();
  const expression = `(${identifySourceDocument.toString()})()`;
  const marker = vm.runInContext(expression, original);
  assert.equal(vm.runInContext(expression, original), marker);
  assert.notEqual(vm.runInContext(expression, context()), marker);
  assert.match(marker, /^[a-f0-9-]{36}$/);
});
test('Firefox without native documentId binds and reads using the isolated marker', async () => {
  const api = fakeApi();
  api.scripting.executeScript = async options => options.world === 'ISOLATED'
    ? [{frameId: 0, result: source.documentKey}]
    : [{frameId: 0, result: options.args[0] === 'bind'
      ? {code: 'source_bound', userHash: source.userHash} : {code: 'live_list_ok', chats: [chat]}}];
  const bound = await bindSource(api, {id: 42, url: 'https://chatgpt.com/'});
  assert.equal(bound.documentId, null);
  assert.equal((await readLiveChats(api, bound, 5)).chats.length, 1);
});
test('changed fallback marker rejects a new document before any live metadata is read', async () => {
  const api = fakeApi(); let mainCalls = 0;
  api.scripting.executeScript = async options => {
    if (options.world === 'MAIN') {mainCalls++; assert.fail('should not read the replaced page');}
    return [{frameId: 0, result: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'}];
  };
  await assert.rejects(readLiveChats(api, {...source, documentId: null}, 5), /source_document_changed/);
  assert.equal(mainCalls, 0);
});
test('document change during a read discards metadata even without native documentId', async () => {
  const api = fakeApi(); let markers = 0;
  api.scripting.executeScript = async options => options.world === 'ISOLATED'
    ? [{frameId: 0, result: ++markers === 1 ? source.documentKey : 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'}]
    : [{frameId: 0, result: {code: 'live_list_ok', chats: [chat]}}];
  await assert.rejects(readLiveChats(api, {...source, documentId: null}, 5), /source_document_changed/);
});

test('list failures preserve HTTP/rate-limit and timeout causes through RPC without retries or private data', async () => {
  const session = {accessToken: 'private-token', user: {id: 'user-test'}};
  const bound = await pageCall('bind', 3, null, async () => Response.json(session));
  for (const [status, expected, name, failure] of [
    [429, 'list_rate_limited', null, 'http'], [403, 'list_access_denied', null, 'http'],
    [503, 'list_failed', null, 'http'], [null, 'list_read_failed', 'TimeoutError', 'timeout'],
    [null, 'list_read_failed', 'TypeError', 'network'],
  ]) {
    let lists = 0;
    const result = await pageCall('live', 3, bound.userHash, async url => {
      if (url === '/api/auth/session') return Response.json(session);
      lists++;
      if (name) {const error = new Error('private-network-message'); error.name = name; throw error;}
      return new Response('private-response-body', {status});
    });
    assert.equal(lists, 1); assert.equal(result.code, expected);
    const api = fakeApi({...result, diagnostic: {...result.diagnostic, token: 'private-token'}});
    const response = await liveDispatcher(api)(command());
    const data = JSON.parse(response.resp_json.result.content[0].text);
    assert.equal(data.error, expected); assert.equal(data.diagnostic.phase, 'list');
    assert.equal(data.diagnostic.http_status, status); assert.equal(data.diagnostic.failure, failure);
    assert.ok(Number.isInteger(data.diagnostic.elapsed_ms));
    for (const secret of ['private-token', 'user-test', 'private-response-body', 'private-network-message']) assert.ok(!JSON.stringify(data).includes(secret));
  }
});
