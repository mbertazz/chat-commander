import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {checkSourceContracts} from '../extension/contract-checks.mjs';
import {liveDispatcher} from '../extension/live-source.mjs';
import {CATALOG_VERSION} from '../extension/build-info.mjs';
const id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const session = {user: {id: 'synthetic-user'}, accessToken: 'SYNTHETIC-SESSION-TOKEN'};
const userHash = Buffer.from(await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(session.user.id))).toString('hex');
const source = {tabId: 1, documentKey: id, documentId: null, userHash};
function fixture({rateLimited = false} = {}) {
  const requests = [];
  const api = {
    permissions: {contains: async () => true},
    tabs: {get: async () => ({url: 'https://chatgpt.com/'})},
    storage: {session: {get: async () => ({liveSource: source})}},
    scripting: {executeScript: async options => {
      if (options.world === 'ISOLATED') return [{frameId: 0, result: id}];
      const fetcher = async (url, opts) => {
        requests.push({url, method: opts.method});
        assert.equal(opts.method, 'GET');
        if (url === '/api/auth/session') return Response.json(session);
        if (url.startsWith('/backend-api/conversations?')) return rateLimited ? new Response(null, {status: 429}) : Response.json({items: [{id, title: 'PRIVATE TITLE', is_archived: false, create_time: 100, update_time: 200}]});
        if (url.startsWith('/backend-api/gizmos/snorlax/sidebar?')) return Response.json({items: [], cursor: null});
        assert.equal(url, `/backend-api/conversation/${id}`);
        return Response.json({conversation_id: id, title: 'PRIVATE TITLE', is_archived: false, current_node: 'u', mapping: {
          u: {parent: null, message: {author: {role: 'user'}, content: {content_type: 'text', parts: ['PRIVATE CONTENT']}}},
        }});
      };
      const ctx = vm.createContext({location: {origin: 'https://chatgpt.com'}, fetch: fetcher,
        crypto: webcrypto, Uint8Array, TextEncoder, TextDecoder, AbortSignal, args: options.args});
      vm.runInContext('globalThis.top = globalThis', ctx);
      return [{frameId: 0, result: await vm.runInContext(`(${options.func.toString()})(...args)`, ctx)}];
    }},
  };
  return {api, requests};
}
test('live contract checker uses only reads and returns no sampled titles, IDs, content or credentials', async () => {
  const f = fixture(); const report = await checkSourceContracts(f.api, source);
  assert.deepEqual(report.checks.map(c => [c.name, c.ok]), [['recent_chats', true], ['conversation_text', true], ['owned_projects', true]]);
  assert.ok(!JSON.stringify(report).includes('PRIVATE'));
  assert.ok(!JSON.stringify(report).includes(id));
  assert.ok(!JSON.stringify(report).includes(session.accessToken));
  assert.ok(f.requests.every(r => r.method === 'GET'));
});
test('live contract checker stops on rate limit without reading content or projects', async () => {
  const f = fixture({rateLimited: true}); const report = await checkSourceContracts(f.api, source);
  assert.deepEqual(report.checks, [{name: 'recent_chats', ok: false, error: 'list_rate_limited'}]);
  assert.equal(f.requests.length, 2);
});
test('setup observations distinguish protocol/catalog traffic and actual successful tool calls', async () => {
  const f = fixture(); const events = [];
  const dispatch = liveDispatcher(f.api, (method, name) => {events.push({method, name, catalog: CATALOG_VERSION});});
  const command = (method, params = {}) => ({command_type: 'jsonrpc', request_id: 'test', shard_token: 'shard',
    jsonrpc: {jsonrpc: '2.0', id: 1, method, params}});
  await dispatch(command('initialize', {protocolVersion: '2025-11-25', capabilities: {}, clientInfo: {name: 'test'}}));
  await dispatch(command('tools/list'));
  await dispatch(command('tools/call', {name: 'list_chats', arguments: {limit: 1}}));
  await dispatch(command('tools/call', {name: 'list_chats', arguments: {limit: 1000}}));
  assert.deepEqual(events.map(e => [e.method, e.name]), [['initialize', undefined], ['tools/list', undefined], ['tools/call', 'list_chats']]);
  assert.ok(!JSON.stringify(events).includes('PRIVATE'));
});
