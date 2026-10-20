import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {chatgptPage} from '../extension/chatgpt-page.mjs';
import {liveDispatcher} from '../extension/live-source.mjs';
import {rpc as protocolRpc} from '../extension/protocol.mjs';
import {SERVER} from '../extension/server.mjs';
const rpc = (request, enabled = false) => protocolRpc(request, enabled ? SERVER : {});
import {Tunnel} from '../extension/tunnel.mjs';

const session = {accessToken: 'private-token', user: {id: 'user-test'}};
const userHash = Buffer.from(await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(session.user.id))).toString('hex');
const binding = {tabId: 1, documentId: null, documentKey: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', userHash};
const item = {source_type: 'conversation', source_key: 'conversation', title: 'Recipe', snippet: 'x'.repeat(800),
  update_time: 100, match_kind: 'content', payload: {kind: 'conversation', conversation_id: 'id1', is_archived: false}};
const page = (cursor = null, partial = false) => ({items: [item], cursor, partial_results: partial,
  source_statuses: [{source_type: 'conversation', source_key: 'conversation', status: 'ok', error_code: null, has_more: cursor !== null}]});
async function read(args, fetcher) {
  const context = vm.createContext({location: {origin: 'https://chatgpt.com'}, crypto: webcrypto, fetch: fetcher,
    AbortSignal, Uint8Array, TextEncoder, TextDecoder, args: ['search_chats', args, userHash]});
  vm.runInContext('globalThis.top = globalThis', context);
  return JSON.parse(JSON.stringify(await vm.runInContext(`(${chatgptPage.toString()})(...args)`, context)));
}
const command = (method = 'tools/call', params = {name: 'search_chats', arguments: {query: 'ricette', limit: 5}}) => ({
  command_type: 'jsonrpc', request_id: 'request', shard_token: 'shard', jsonrpc: {jsonrpc: '2.0', id: 1, method, params}});
function apiFor(fetcher) {
  return {storage: {local: {get: async () => ({})}, session: {get: async () => ({liveSource: binding})}},
    tabs: {get: async () => ({url: 'https://chatgpt.com/'})}, permissions: {contains: async () => true},
    scripting: {executeScript: async options => [{frameId: 0, result: options.world === 'ISOLATED'
      ? binding.documentKey : await read(options.args[1], fetcher)}]}};
}
test('live search returns bounded snippets, preserves continuation and marks partial results', async () => {
  const calls = [];
  const fetcher = async (url, options) => {
    if (url === '/api/auth/session') return Response.json(session);
    calls.push(JSON.parse(options.body));
    assert.deepEqual(calls.at(-1).source_requests, [{type: 'conversation'}]);
    return Response.json(page(calls.length === 1 ? 'opaque-cursor' : null, calls.length === 2));
  };
  const first = await read({query: 'ricette', limit: 5}, fetcher);
  assert.equal(first.code, 'live_search_ok'); assert.equal(first.chats[0].snippet.length, 500);
  assert.equal(first.chats[0].snippet_truncated, true); assert.equal(first.has_more, true);
  const second = await read({query: 'ricette', limit: 5, cursor: first.next_cursor}, fetcher);
  assert.equal(second.partial_results, true); assert.equal(second.next_cursor, null);
  assert.equal(calls[1].cursor, 'opaque-cursor'); assert.equal(calls[0].query_id, calls[1].query_id);
  assert.ok(!JSON.stringify([first, second]).includes('private-token'));
});
test('cursor mismatch, repeated cursors, schema changes and account switches fail closed', async () => {
  const cursor = JSON.stringify({query: 'other', cursor: 'opaque', queryId: webcrypto.randomUUID()});
  const fetcher = async url => Response.json(url === '/api/auth/session' ? session : page());
  assert.equal((await read({query: 'ricette', limit: 5, cursor}, fetcher)).code, 'search_cursor_invalid');
  const repeat = JSON.stringify({query: 'ricette', cursor: 'same', queryId: webcrypto.randomUUID()});
  assert.equal((await read({query: 'ricette', limit: 5, cursor: repeat}, async url => Response.json(url === '/api/auth/session' ? session : page('same')))).code, 'search_schema_unknown');
  let calls = 0;
  assert.equal((await read({query: 'ricette', limit: 5}, async () => Response.json(++calls === 1 ? session : calls === 2 ? page() : {...session, user: {id: 'other'}}))).code, 'source_identity_changed');
  assert.equal((await read({query: 'ricette', limit: 5}, async url => Response.json(url === '/api/auth/session' ? session : {...page(), items: [{...item, source_type: 'library'}]}))).code, 'search_schema_unknown');
});
test('MCP exposes search only in live mode and rejects invalid arguments before page access', async () => {
  const api = apiFor(() => assert.fail()); const dispatch = liveDispatcher(api);
  assert.deepEqual((await dispatch(command('tools/list', {}))).resp_json.result.tools.map(t => t.name), ['list_chats', 'search_chats', 'get_chat', 'rename_chat', 'set_chat_archived', 'read_chat', 'begin_review', 'read_review_chat', 'prepare_review', 'get_review', 'cancel_review', 'apply_review_step', 'list_projects', 'get_project', 'create_project', 'move_chat', 'delete_chat']);
  for (const args of [{query: '', limit: 5}, {query: 'ok', limit: 11}, {query: 'ok', limit: 5, url: 'x'}, {query: 'ok', limit: 5, cursor: null}]) {
    assert.equal((await dispatch(command('tools/call', {name: 'search_chats', arguments: args}))).resp_json.error.code, -32602);
  }
  assert.equal(rpc(command().jsonrpc).error.code, -32602);
  api.storage.session.get = async () => ({});
  assert.equal((await dispatch(command())).resp_json.result.isError, true);
});
test('poll-to-search-to-response works with page adapter and rejects replaced binding', async () => {
  const api = apiFor(async url => Response.json(url === '/api/auth/session' ? session : page()));
  let posted;
  const tunnel = new Tunnel({tunnelId: `tunnel_${'a'.repeat(32)}`, apiKey: 'runtime-key'}, {
    dispatch: liveDispatcher(api), fetcher: async (url, options) => {
      if (url.includes('/response')) {posted = JSON.parse(options.body); return new Response(null, {status: 204});}
      return Response.json({commands: [command()]});
    }});
  await tunnel.cycle();
  assert.equal(posted.resp_json.result.structuredContent.chats[0].id, 'id1');
  assert.equal(posted.resp_json.result.structuredContent.has_more, false);
  assert.ok(!JSON.stringify(posted).includes('private-token'));
  let reads = 0;
  api.storage.session.get = async () => ({liveSource: ++reads === 1 ? binding : {...binding, tabId: 2}});
  const failed = await liveDispatcher(api)(command());
  assert.equal(failed.resp_json.result.isError, true); assert.ok(!JSON.stringify(failed).includes('Recipe'));
});

test('search rate limit is explicit, bounded and never retried', async () => {
  let searches = 0;
  const result = await read({query: 'new demo', limit: 3}, async url => {
    if (url === '/api/auth/session') return Response.json(session);
    searches++; return new Response('private response', {status: 429});
  });
  assert.equal(searches, 1); assert.equal(result.code, 'search_rate_limited');
  assert.equal(result.diagnostic.http_status, 429); assert.equal(result.diagnostic.phase, 'search');
  assert.ok(!JSON.stringify(result).includes('private response'));
});
