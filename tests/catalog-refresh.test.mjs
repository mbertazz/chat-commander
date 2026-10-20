import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {SERVER} from '../extension/server.mjs';
import {rpc} from '../extension/protocol.mjs';
import {VERSION, CATALOG_VERSION} from '../extension/build-info.mjs';
import {liveDispatcher} from '../extension/live-source.mjs';

const uuid = n => `${n.toString(16).padStart(8, '0')}-0000-4000-8000-000000000000`;
const session = {user: {id: 'test-user'}, accessToken: 'SYNTHETIC-LOCAL-TOKEN'};
const userHash = Buffer.from(await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(session.user.id))).toString('hex');
function fixture({count = 65, failList = false, observationFails = false} = {}) {
  const chats = Array.from({length: count}, (_, n) => ({id: uuid(n + 1), title: `Synthetic chat ${n + 1}`, is_archived: false,
    create_time: 100, update_time: 1000 - n}));
  const binding = {tabId: 1, documentId: null, documentKey: uuid(1000), userHash};
  const requests = []; const observations = [];
  const api = {
    permissions: {contains: async () => true},
    tabs: {get: async () => ({url: `https://chatgpt.com/c/${chats[0].id}`})},
    storage: {session: {get: async () => ({liveSource: binding})}},
    scripting: {executeScript: async options => {
      if (options.world === 'ISOLATED') return [{frameId: 0, result: binding.documentKey}];
      const context = vm.createContext({location: {origin: 'https://chatgpt.com'}, crypto: webcrypto,
        fetch: async (url, opts) => {
          assert.equal(opts.method, 'GET'); requests.push(url);
          if (url === '/api/auth/session') return Response.json(session);
          const parsed = new URL(url, 'https://chatgpt.com');
          assert.equal(parsed.pathname, '/backend-api/conversations');
          return failList ? new Response(null, {status: 429}) : Response.json({items: chats.slice(0, Number(parsed.searchParams.get('limit')))});
        }, AbortSignal, Uint8Array, TextEncoder, TextDecoder, args: options.args});
      vm.runInContext('globalThis.top = globalThis', context);
      const data = await vm.runInContext(`(${options.func.toString()})(...args)`, context);
      return [{frameId: 0, result: JSON.parse(JSON.stringify(data))}];
    }},
  };
  const dispatch = liveDispatcher(api, (method, name) => {
    observations.push({method, name}); if (observationFails) throw new Error('synthetic storage failure');
  });
  const call = async (name, args) => (await dispatch({command_type: 'jsonrpc', request_id: 'request', shard_token: 'shard',
    jsonrpc: {jsonrpc: '2.0', id: 1, method: 'tools/call', params: {name, arguments: args}}})).resp_json.result;
  return {call, chats, requests, observations};
}
test('advertised model catalog includes the project-plan tool and 50-chat schemas', () => {
  const catalog = rpc({jsonrpc: '2.0', id: 1, method: 'tools/list'}, SERVER).result.tools;
  assert.ok(catalog.find(t => t.name === 'prepare_project_plan'));
  const begin = catalog.find(t => t.name === 'begin_review');
  assert.equal(begin.inputSchema.properties.limit.maximum, 50);
  assert.equal(begin.inputSchema.properties.limit.default, 50);
  assert.equal(catalog.find(t => t.name === 'list_chats').inputSchema.properties.limit.maximum, 50);
  assert.equal(rpc({jsonrpc: '2.0', id: 1, method: 'tools/call', params: {name: 'list_chats', arguments: {limit: 51}}}, SERVER).error.code, -32602);
});
test('serialized live adapter selects 50 eligible chats after excluding the protected source', async () => {
  const f = fixture(); const result = await f.call('begin_review', {limit: 50});
  assert.equal(result.isError, false);
  const r = result.structuredContent;
  assert.equal(r.requested_count, 50); assert.equal(r.selected_count, 50); assert.equal(r.scanned_count, 51); assert.equal(r.request_fulfilled, true);
  assert.equal(r.excluded_chats[0].id, f.chats[0].id);
  assert.deepEqual(r.chats.map(c => c.id), f.chats.slice(1, 51).map(c => c.id));
  assert.ok(f.requests.some(url => url.includes('limit=51')));
  assert.equal(r.server_info.version, VERSION); assert.equal(r.server_info.catalog_version, CATALOG_VERSION);
  assert.ok(r.server_info.model_tools.includes('prepare_project_plan'));
  assert.ok(!r.server_info.model_tools.includes('apply_review_step'));
  assert.ok(!JSON.stringify(result).includes(session.accessToken));
  assert.deepEqual(f.observations, [{method: 'tools/call', name: 'begin_review'}]);
});
test('review defaults to 50 and honestly reports fewer eligible chats when the source returns fewer', async () => {
  const f = fixture({count: 20}); const r = (await f.call('begin_review', {})).structuredContent;
  assert.equal(r.requested_count, 50); assert.equal(r.selected_count, 19); assert.equal(r.scanned_count, 20); assert.equal(r.request_fulfilled, false);
  assert.equal(r.server_info.limits.review_chats, 50);
});
test('even a cached 20-chat caller receives runtime version and actionable catalog-refresh guidance', async () => {
  const f = fixture(); const result = await f.call('list_chats', {limit: 20});
  const r = result.structuredContent;
  assert.equal(r.chats.length, 20); assert.equal(r.server_info.limits.recent_chats, 50);
  assert.ok(r.server_info.model_tools.includes('prepare_project_plan'));
  assert.match(r.server_info.catalog_refresh_guidance, /Refresh.*start a new conversation/);
  assert.deepEqual(JSON.parse(result.content[0].text), r);
});
test('read failures include runtime evidence without claiming success or triggering observation', async () => {
  const f = fixture({failList: true}); const result = await f.call('list_chats', {limit: 50});
  assert.equal(result.isError, true); assert.equal(result.structuredContent.error, 'list_rate_limited');
  assert.equal(result.structuredContent.server_info.version, VERSION);
  assert.equal(f.observations.length, 0);
});
test('failure to record setup observations never changes a successfully computed tool result', async () => {
  const f = fixture({observationFails: true}); const result = await f.call('begin_review', {limit: 50});
  assert.equal(result.isError, false); assert.equal(result.structuredContent.selected_count, 50);
});
