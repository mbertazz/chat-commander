import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {liveDispatcher} from '../extension/live-source.mjs';
import {Tunnel} from '../extension/tunnel.mjs';
import {REVIEW_URI} from '../extension/review.mjs';

const ids = ['aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'];
const session = {accessToken: 'PRIVATE-TOKEN', user: {id: 'user-test'}};
const userHash = Buffer.from(await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(session.user.id))).toString('hex');
function fixture(tabUrl = 'https://chatgpt.com/') {
  const chats = ids.map((id, i) => ({conversation_id: id, title: `Chat ${i}`, is_archived: false,
    create_time: 100, update_time: 200 - i, current_node: 'a', mapping: {
      u: {parent: null, message: {author: {role: 'user'}, recipient: 'all', content: {content_type: 'text', parts: ['Review sample']}}},
      a: {parent: 'u', message: {author: {role: 'assistant'}, recipient: 'all', content: {content_type: 'text', parts: ['Completed task.']}}},
    }}));
  let source = {tabId: 1, documentId: null, documentKey: ids[0], userHash}; const writes = [];
  const fetcher = async (url, options) => {
    if (url === '/api/auth/session') return Response.json(session);
    assert.equal(options.headers.Authorization, 'Bearer PRIVATE-TOKEN');
    if (url.startsWith('/backend-api/conversations?')) return Response.json({items: chats.map(c => ({...c, id: c.conversation_id}))});
    const chat = chats.find(c => url.endsWith(c.conversation_id)); assert.ok(chat);
    if (options.method === 'PATCH') {const patch = JSON.parse(options.body); writes.push(patch); Object.assign(chat, patch); return Response.json({success: true});}
    return Response.json(chat);
  };
  const api = {storage: {local: {get: async () => ({})}, session: {get: async () => ({liveSource: source})}},
    tabs: {get: async () => ({url: tabUrl})}, permissions: {contains: async () => true},
    scripting: {executeScript: async options => {
      if (options.world === 'ISOLATED') return [{frameId: 0, result: ids[0]}];
      const context = vm.createContext({location: {origin: 'https://chatgpt.com'}, fetch: fetcher, crypto: webcrypto,
        AbortSignal, Uint8Array, TextEncoder, TextDecoder, args: options.args});
      vm.runInContext('globalThis.top = globalThis', context);
      const result = JSON.parse(JSON.stringify(await vm.runInContext(`(${options.func.toString()})(...args)`, context)));
      return [{frameId: 0, result}];
    }}};
  const dispatch = liveDispatcher(api);
  let serial = 0;
  const call = async (name, args, method = 'tools/call') => {
    let response;
    const command = {command_type: 'jsonrpc', request_id: `request-${++serial}`, shard_token: 'shard',
      jsonrpc: {jsonrpc: '2.0', id: serial, method, params: method === 'tools/call' ? {name, arguments: args} : args}};
    const tunnel = new Tunnel({tunnelId: `tunnel_${'a'.repeat(32)}`, apiKey: 'runtime'}, {dispatch,
      fetcher: async (url, options) => {
        if (url.includes('/response')) {response = JSON.parse(options.body); return new Response(null, {status: 204});}
        return Response.json({commands: [command]});
      }});
    await tunnel.cycle(); assert.equal(response.request_id, command.request_id);
    assert.ok(!JSON.stringify(response).includes('PRIVATE-TOKEN'));
    return response.resp_json.result;
  };
  return {call, writes, chats, dispatch, changeSource: () => {source = {...source, tabId: 2};}};
}
test('full review over tunnel: read, propose, reduce exception, approve exact plan and report verified state', async () => {
  const f = fixture();
  const resource = await f.call(null, {uri: REVIEW_URI}, 'resources/read'); assert.equal(resource.contents.length, 1);
  const start = await f.call('begin_review', {limit: 2}); assert.equal(start.isError, false);
  const review_id = start.structuredContent.review_id;
  for (const id of ids) assert.equal((await f.call('read_review_chat', {review_id, id})).structuredContent.reading, 'complete');
  const first = await f.call('prepare_review', {review_id, changes: [{id: ids[0], title: 'New title', archive: true, reason: 'Completed work'}]});
  assert.equal(f.writes.length, 0);
  const bypass = await f.call('rename_chat', {id: ids[0], expected_title: 'Chat 0', title: 'Bypass'});
  assert.equal(bypass.isError, true); assert.ok(bypass.content[0].text.includes('review_use_confirmation'));
  const reduced = await f.call('prepare_review', {review_id, changes: [{id: ids[0], title: 'New title', reason: 'Titles only'}]});
  assert.equal((await f.call('apply_review_step', first._meta.reviewApproval)).isError, true); assert.equal(f.writes.length, 0);
  const done = await f.call('apply_review_step', reduced._meta.reviewApproval);
  assert.equal(done.structuredContent.status, 'completed'); assert.deepEqual(f.writes, [{title: 'New title'}]);
  assert.equal(f.chats[0].is_archived, false); assert.equal(f.chats[1].title, 'Chat 1');
  const report = await f.call('get_review', {review_id}); assert.equal(report.structuredContent.counts.applied, 1);
  assert.equal(report._meta, undefined);
});
test('dispatcher lifecycle clear invalidates preview and source switch prevents writes', async () => {
  for (const mode of ['clear', 'source']) {
    const f = fixture(); const review_id = (await f.call('begin_review', {limit: 2})).structuredContent.review_id;
    await f.call('read_review_chat', {review_id, id: ids[0]});
    const preview = await f.call('prepare_review', {review_id, changes: [{id: ids[0], archive: true, reason: 'Done'}]});
    if (mode === 'clear') f.dispatch.clearReviews(); else f.changeSource();
    assert.equal((await f.call('apply_review_step', preview._meta.reviewApproval)).isError, true); assert.equal(f.writes.length, 0);
  }
});

test('actual source-tab URL prevents its conversation entering the review or proposal', async () => {
  const f = fixture(`https://chatgpt.com/c/${ids[0]}`);
  const started = (await f.call('begin_review', {limit: 1})).structuredContent;
  assert.deepEqual(started.chats.map(c => c.id), [ids[1]]);
  assert.equal(started.excluded_chats[0].id, ids[0]);
  const read = await f.call('read_review_chat', {review_id: started.review_id, id: ids[1]});
  assert.equal(read.structuredContent.reading, 'complete');
  const excluded = await f.call('prepare_review', {review_id: started.review_id, changes: [{id: ids[0], title: 'Bad', reason: 'X'}]});
  assert.equal(excluded.isError, true); assert.equal(f.writes.length, 0);
});
