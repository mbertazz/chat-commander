import {chatgptPage} from '../extension/chatgpt-page.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {validReadArgs, READ_TOOL} from '../extension/read-chat.mjs';
import {liveDispatcher, readLiveChat} from '../extension/live-source.mjs';
import {Tunnel} from '../extension/tunnel.mjs';

const id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const session = {accessToken: 'private-token', user: {id: 'user-test'}};
const userHash = Buffer.from(await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(session.user.id))).toString('hex');
const binding = {tabId: 1, documentId: null, documentKey: id, userHash};
const message = (role, text, extra = {}) => ({author: {role}, content: {content_type: 'text', parts: [text]}, recipient: 'all', ...extra});
function conversation() {
  return {conversation_id: id, title: 'Test', is_archived: false, current_node: 'answer', mapping: {
    root: {parent: null, message: null}, user: {parent: 'root', message: message('user', 'A question')},
    old: {parent: 'user', message: message('assistant', 'OLD BRANCH MUST NOT RETURN')},
    hidden: {parent: 'user', message: message('system', 'INTERNAL SECRET')},
    thought: {parent: 'hidden', message: message('assistant', 'PRIVATE ANALYSIS', {channel: 'analysis'})},
    answer: {parent: 'thought', message: message('assistant', 'The active answer')},
  }};
}
async function read(args, fetcher, hash = userHash, expiresAt = Date.now() + 25000) {
  const context = vm.createContext({location: {origin: 'https://chatgpt.com'}, fetch: fetcher, crypto: webcrypto,
    AbortSignal, Uint8Array, TextEncoder, TextDecoder, args: ['read_chat', args, hash, expiresAt]});
  vm.runInContext('globalThis.top = globalThis', context);
  return JSON.parse(JSON.stringify(await vm.runInContext(`(${chatgptPage.toString()})(...args)`, context)));
}
const backend = data => async (url, options) => {
  assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error');
  if (url === '/api/auth/session') return Response.json(session);
  assert.equal(url, `/backend-api/conversation/${id}`); assert.equal(options.headers.Authorization, 'Bearer private-token');
  return Response.json(data);
};
function apiFor(fetcher) {
  return {permissions: {contains: async () => true}, tabs: {get: async () => ({url: 'https://chatgpt.com/'})},
    storage: {local: {get: async () => ({})}, session: {get: async () => ({liveSource: binding})}},
    scripting: {executeScript: async options => [{frameId: 0, result: options.world === 'ISOLATED' ? id
      : await read(options.args[1], fetcher, options.args[2], options.args[3])}]}};
}
const command = args => ({command_type: 'jsonrpc', request_id: 'request', shard_token: 'shard',
  jsonrpc: {jsonrpc: '2.0', method: 'tools/call', id: 1, params: {name: 'read_chat', arguments: args}}});

test('read selects only active branch in chronological order and omits internal messages', async () => {
  const result = await read({id}, backend(conversation()));
  assert.equal(result.code, 'read_chat_ok'); assert.equal(result.has_more, false);
  assert.deepEqual(result.messages.map(m => m.text), ['A question', 'The active answer']);
  assert.equal(result.omitted_internal_messages, 2);
  for (const secret of ['private-token', 'INTERNAL SECRET', 'PRIVATE ANALYSIS', 'OLD BRANCH']) assert.ok(!JSON.stringify(result).includes(secret));
});
test('pagination preserves every character of long messages, bounds output and handles emoji', async () => {
  const data = conversation(); const text = 'z'.repeat(1999) + '😀' + 'y'.repeat(20000);
  data.mapping.answer.message.content.parts = [text];
  let cursor; let reconstructed = ''; let count = 0;
  do {
    const result = await read({id, limit: 20, ...(cursor ? {cursor} : {})}, backend(data));
    assert.equal(result.code, 'read_chat_ok'); assert.ok(result.messages.reduce((n, m) => n + m.text.length, 0) <= 12000);
    assert.ok(result.messages.every(m => m.text.length <= 2000));
    reconstructed += result.messages.filter(m => m.id === 'answer').map(m => m.text).join('');
    cursor = result.next_cursor; count++;
  } while (cursor && count < 10);
  assert.equal(cursor, null); assert.equal(reconstructed, text); assert.ok(count > 1);
});
test('cursor refuses changed conversation, different id and invalid offsets', async () => {
  const data = conversation(); const first = await read({id, limit: 1}, backend(data));
  const changed = structuredClone(data); changed.mapping.answer.message.content.parts = ['Changed'];
  assert.equal((await read({id, cursor: first.next_cursor}, backend(changed))).code, 'read_chat_changed');
  const cursor = JSON.parse(first.next_cursor); cursor.id = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
  assert.equal((await read({id, cursor: JSON.stringify(cursor)}, backend(data))).code, 'read_cursor_invalid');
  cursor.id = id; cursor.index = 999;
  assert.equal((await read({id, cursor: JSON.stringify(cursor)}, backend(data))).code, 'read_cursor_invalid');
});
test('cycles, missing parents and missing active leaf fail without guessing another branch', async () => {
  for (const mutate of [d => {d.mapping.user.parent = 'answer';}, d => {d.mapping.user.parent = 'missing';},
    d => {d.current_node = '';}, d => {d.current_node = 'missing';}]) {
    const data = conversation(); mutate(data); const result = await read({id}, backend(data));
    assert.ok(['read_branch_invalid', 'read_schema_unknown'].includes(result.code)); assert.equal(result.messages, undefined);
  }
});
test('unsupported attachments are indicated, not exposed; hidden and tool-directed text excluded', async () => {
  const data = conversation();
  data.mapping.user.message.content = {content_type: 'multimodal_text', parts: ['Describe', {asset_pointer: 'PRIVATE ASSET'}]};
  data.mapping.answer.message = message('assistant', 'TOOL SECRET', {recipient: 'python'});
  const result = await read({id}, backend(data));
  assert.equal(result.unsupported_messages, 1); assert.equal(result.messages[0].unsupported_content, true);
  assert.equal(result.messages.length, 1); assert.ok(!JSON.stringify(result).includes('PRIVATE ASSET'));
  assert.ok(!JSON.stringify(result).includes('TOOL SECRET'));
});
test('empty visible branch and attachment-only message return explicit bounded results', async () => {
  const data = conversation(); data.current_node = 'root';
  assert.deepEqual((await read({id}, backend(data))).messages, []);
  data.current_node = 'user'; data.mapping.user.message.content = {content_type: 'audio', asset: 'PRIVATE'};
  const result = await read({id}, backend(data));
  assert.equal(result.messages[0].text, ''); assert.equal(result.messages[0].unsupported_content, true);
});
test('account change, expired budget, oversize response and HTTP errors return no messages', async () => {
  let count = 0;
  const result = await read({id}, async (url, options) => url === '/api/auth/session' && ++count === 2
    ? Response.json({...session, user: {id: 'other'}}) : backend(conversation())(url, options));
  assert.equal(result.code, 'source_identity_changed'); assert.equal(result.messages, undefined);
  assert.equal((await read({id}, () => assert.fail(), userHash, Date.now() - 1)).code, 'read_chat_failed');
  assert.equal((await read({id}, async () => new Response(null, {status: 401}))).code, 'read_chat_failed');
  assert.equal((await read({id}, async () => new Response('x'.repeat(4194305), {headers: {'content-type': 'application/json'}}))).code, 'read_chat_failed');
});
test('MCP validates read arguments and missing binding never reads', async () => {
  assert.equal(READ_TOOL.annotations.readOnlyHint, true);
  const api = apiFor(() => assert.fail());
  for (const args of [{id: '../x'}, {id, limit: 0}, {id, limit: 21}, {id, cursor: null}, {id, url: 'x'}]) {
    assert.equal(validReadArgs(args), false);
    assert.equal((await liveDispatcher(api)(command(args))).resp_json.error.code, -32602);
  }
  api.storage.session.get = async () => ({});
  assert.equal((await liveDispatcher(api)(command({id}))).resp_json.result.isError, true);
});
test('full MCP poll-to-read-to-response with page reader preserves bounds and strips mapping/token', async () => {
  let posted;
  const api = apiFor(backend(conversation()));
  const tunnel = new Tunnel({tunnelId: `tunnel_${'a'.repeat(32)}`, apiKey: 'runtime'}, {
    dispatch: liveDispatcher(api), fetcher: async (url, options) => {
      if (url.includes('/response')) {posted = JSON.parse(options.body); return new Response(null, {status: 204});}
      return Response.json({commands: [command({id, limit: 1})]});
    }});
  await tunnel.cycle(); const result = posted.resp_json.result.structuredContent;
  assert.equal(result.scope, 'active_branch_text'); assert.equal(result.has_more, true); assert.equal(result.messages.length, 1);
  assert.ok(!JSON.stringify(posted).includes('private-token')); assert.ok(!JSON.stringify(posted).includes('mapping'));
  api.storage.session.get = async () => ({});
  assert.equal((await liveDispatcher(api)(command({id}))).resp_json.result.isError, true);
});
test('document changes discard read content, and extension boundary rejects oversize page text', async () => {
  const api = apiFor(backend(conversation())); const original = api.scripting.executeScript; let count = 0;
  api.scripting.executeScript = async options => options.world === 'ISOLATED' && ++count === 2
    ? [{frameId: 0, result: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'}] : original(options);
  await assert.rejects(readLiveChat(api, binding, {id}), /source_document_changed/);
  const valid = await read({id}, backend(conversation())); valid.messages[0].text = 'x'.repeat(2001);
  const api2 = apiFor(backend(conversation()));
  api2.scripting.executeScript = async options => [{frameId: 0, result: options.world === 'ISOLATED' ? id : valid}];
  await assert.rejects(readLiveChat(api2, binding, {id}), /read_schema_unknown/);
});
