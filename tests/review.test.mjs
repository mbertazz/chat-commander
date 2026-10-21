import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createReviewManager, validReviewArgs, REVIEW_TOOLS, REVIEW_URI} from '../extension/review.mjs';
import {rpc as protocolRpc} from '../extension/protocol.mjs';
import {SERVER} from '../extension/server.mjs';
const rpc = (request, enabled = false) => protocolRpc(request, enabled ? SERVER : {});

const id1 = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const id2 = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const outside = 'cccccccc-cccc-4ccc-cccc-cccccccccccc';
const source = {tabId: 1, documentKey: id1, documentId: null, userHash: 'a'.repeat(64)};
function fixture() {
  let clock = Date.parse('2026-10-19T12:00:00Z'); let serial = 0; let current = source;
  const state = new Map([[id1, {id: id1, title: 'First', archived: false}], [id2, {id: id2, title: 'Travel', archived: false}]]);
  const writes = []; const reads = []; const calls = [];
  const config = {now: () => clock, randomUUID: () => `${String(++serial).padStart(8, '0')}-0000-4000-8000-000000000000`,
    currentBinding: async () => current,
    list: async () => ({chats: [...state.values()].map(c => ({...c}))}),
    read: async (binding, args) => {reads.push(args); return {chat: {...state.get(args.id)}, messages: [{text: 'PRIVATE CONTENT'}], has_more: false, next_cursor: null, unsupported_messages: 0};},
    action: async (binding, name, args) => {
      calls.push(name); const chat = state.get(args.id);
      if (name !== 'get_chat') {
        writes.push({name, args}); if (name === 'rename_chat') chat.title = args.title;
        else chat.archived = args.archived;
      }
      return {chat: {...chat}, changed: name !== 'get_chat', verified: true};
    }};
  const manager = createReviewManager(config);
  const invoke = (name, args) => manager.handle(name, args, source);
  return {config, manager, invoke, state, writes, reads, calls, tick: ms => {clock += ms;}, switch: value => {current = value;}};
}
async function ready(f) {
  const start = (await f.invoke('begin_review', {limit: 2})).structuredContent;
  for (const c of start.chats) await f.invoke('read_review_chat', {review_id: start.review_id, id: c.id});
  return start.review_id;
}
const proposal = review_id => ({review_id, changes: [{id: id1, title: 'Better title', archive: true, reason: 'Completed topic'},
  {id: id2, title: 'Trip planning', reason: 'Clarify subject'}], groups: [{label: 'Related', ids: [id1, id2], reason: 'Shared topic'}]});

test('read/review/preview never writes and never stores or repeats conversation text', async () => {
  const f = fixture(); const review_id = await ready(f);
  const preview = await f.invoke('prepare_review', proposal(review_id));
  assert.equal(f.writes.length, 0); assert.equal(preview.structuredContent.changes.length, 3);
  assert.ok(!JSON.stringify(preview).includes('PRIVATE CONTENT'));
  const token = preview._meta.reviewApproval.approval_token;
  assert.equal(token.length, 72); assert.ok(!JSON.stringify(preview.structuredContent).includes(token));
  assert.ok(!preview.content[0].text.includes(token));
  const report = await f.invoke('get_review', {review_id});
  assert.ok(!JSON.stringify(report).includes(token)); assert.ok(!JSON.stringify(report).includes('PRIVATE CONTENT'));
});
test('apply requires private capability, binds revision, runs only exact approved steps and reports each', async () => {
  const f = fixture(); const review_id = await ready(f); const preview = await f.invoke('prepare_review', proposal(review_id));
  const cap = {...preview._meta.reviewApproval, expected_step: 1};
  await assert.rejects(f.invoke('apply_review_step', {...cap, approval_token: '0'.repeat(72)}), /review_approval_required/);
  assert.equal(f.writes.length, 0);
  let report;
  for (let i = 0; i < 3; i++) report = (await f.invoke('apply_review_step', {...cap, expected_step: i + 1})).structuredContent;
  assert.equal(report.status, 'completed'); assert.equal(report.counts.applied, 3);
  assert.deepEqual(f.writes.map(w => w.name), ['rename_chat', 'set_chat_archived', 'rename_chat']);
  assert.equal(f.writes[1].args.expected_title, 'Better title'); assert.equal(f.state.get(id1).archived, true);
  await assert.rejects(f.invoke('apply_review_step', cap), /review_approval_required/); assert.equal(f.writes.length, 3);
});
test('natural-language exceptions are represented by replacement proposal; old preview cannot execute', async () => {
  const f = fixture(); const review_id = await ready(f); const first = await f.invoke('prepare_review', proposal(review_id));
  const second = await f.invoke('prepare_review', {review_id, changes: [{id: id1, title: 'Better title', reason: 'Titles only'}]});
  await assert.rejects(f.invoke('apply_review_step', {...first._meta.reviewApproval, expected_step: 1}), /review_approval_required/);
  const report = (await f.invoke('apply_review_step', {...second._meta.reviewApproval, expected_step: 1})).structuredContent;
  assert.equal(report.status, 'completed'); assert.equal(f.writes.length, 1); assert.equal(f.state.get(id2).title, 'Travel'); assert.equal(f.state.get(id1).archived, false);
});
test('unread, failed, partial and unsupported content block unsupported archive proposals', async () => {
  const f = fixture(); const review_id = (await f.invoke('begin_review', {})).structuredContent.review_id;
  await assert.rejects(f.invoke('prepare_review', proposal(review_id)), /review_unread_chat/);
  // Methods are supplied by closure; use a dedicated manager for each coverage mode.
  for (const [partial, unsupported, failed] of [[true, false, false], [false, true, false], [false, false, true]]) {
    const g = fixture();
    const mgr = createReviewManager({...g.config, read: async () => {
      if (failed) throw new Error('PRIVATE ERROR');
      return {chat: {...g.state.get(id1)}, has_more: partial, next_cursor: partial ? 'cursor' : null, unsupported_messages: unsupported ? 1 : 0};
    }});
    const id = (await mgr.handle('begin_review', {}, source)).structuredContent.review_id;
    const r = await mgr.handle('read_review_chat', {review_id: id, id: id1}, source);
    assert.ok(!JSON.stringify(r).includes('PRIVATE ERROR'));
    await assert.rejects(mgr.handle('prepare_review', {review_id: id, changes: [{id: id1, archive: true, reason: 'Done'}]}, source),
      failed ? /review_unread_chat/ : /review_archive_needs_full_read/);
  }
});
test('snapshot membership, duplicate ids and reading continuation validated; no extra writes', async () => {
  const f = fixture(); const review_id = await ready(f);
  await assert.rejects(f.invoke('read_review_chat', {review_id, id: outside}), /review_unknown_chat/);
  await assert.rejects(f.invoke('read_review_chat', {review_id, id: id1, cursor: 'invented'}), /review_cursor_invalid/);
  await assert.rejects(f.invoke('prepare_review', {review_id, changes: [{id: outside, title: 'X', reason: 'X'}]}), /review_unknown_chat/);
  await assert.rejects(f.invoke('prepare_review', {review_id, changes: [{id: id1, title: 'A', reason: 'X'}, {id: id1, title: 'B', reason: 'X'}]}), /review_unknown_chat/);
  assert.equal(f.writes.length, 0);
});
test('state conflict stops remaining steps and reports partial outcomes', async () => {
  const f = fixture(); const review_id = await ready(f); const preview = await f.invoke('prepare_review', proposal(review_id));
  await f.invoke('apply_review_step', {...preview._meta.reviewApproval, expected_step: 1});
  f.state.get(id1).title = 'Changed elsewhere';
  const report = (await f.invoke('apply_review_step', {...preview._meta.reviewApproval, expected_step: 2})).structuredContent;
  assert.equal(report.status, 'attention'); assert.equal(report.counts.applied, 1); assert.equal(report.counts.conflicts, 1); assert.equal(report.counts.skipped, 1);
  assert.equal(f.writes.length, 1); assert.equal(f.state.get(id2).title, 'Travel');
});
test('lost write outcome is not retried and pending operations remain unapplied', async () => {
  const f = fixture(); let attempts = 0;
  const mgr = createReviewManager({...f.config, action: async (...args) => {
    if (args[1] !== 'get_chat') {attempts++; throw new Error('action_outcome_unknown');}
    return f.config.action(...args);
  }});
  const review_id = (await mgr.handle('begin_review', {}, source)).structuredContent.review_id;
  for (const id of [id1, id2]) await mgr.handle('read_review_chat', {review_id, id}, source);
  const preview = await mgr.handle('prepare_review', proposal(review_id), source);
  const report = (await mgr.handle('apply_review_step', {...preview._meta.reviewApproval, expected_step: 1}, source)).structuredContent;
  assert.equal(report.counts.unknown, 1); assert.equal(report.counts.skipped, 2);
  await assert.rejects(mgr.handle('apply_review_step', {...preview._meta.reviewApproval, expected_step: 1}, source), /review_approval_required/); assert.equal(attempts, 1);
});
test('cancel preserves finished work and prevents later writes; old plans cannot bypass single-action gate', async () => {
  const f = fixture(); const review_id = await ready(f);
  assert.throws(() => f.manager.assertIndividualAllowed(id1), /review_use_confirmation/);
  const preview = await f.invoke('prepare_review', proposal(review_id));
  await f.invoke('apply_review_step', {...preview._meta.reviewApproval, expected_step: 1});
  const report = (await f.invoke('cancel_review', {review_id})).structuredContent;
  assert.equal(report.status, 'cancelled'); assert.equal(report.counts.applied, 1); assert.equal(report.counts.skipped, 2);
  await assert.rejects(f.invoke('apply_review_step', {...preview._meta.reviewApproval, expected_step: 1}), /review_cancelled/);
  f.manager.assertIndividualAllowed(id1); assert.equal(f.writes.length, 1);
});
test('expiry, binding change and manager clear invalidate confirmation capabilities', async () => {
  for (const mode of ['expire', 'source', 'clear']) {
    const f = fixture(); const review_id = await ready(f); const preview = await f.invoke('prepare_review', proposal(review_id));
    if (mode === 'expire') f.tick(31 * 60 * 1000);
    if (mode === 'source') f.switch({...source, tabId: 2});
    if (mode === 'clear') f.manager.clear();
    await assert.rejects(f.invoke('apply_review_step', {...preview._meta.reviewApproval, expected_step: 1}), /review_expired|review_source_changed|review_cancelled/);
    assert.equal(f.writes.length, 0);
  }
});
test('no-op/group-only plan needs no approval and snapshot stays bounded', async () => {
  const f = fixture(); const review_id = await ready(f);
  const preview = await f.invoke('prepare_review', {review_id, changes: [{id: id1, title: 'First', reason: 'Already clear'}], groups: []});
  assert.equal(preview.structuredContent.status, 'completed'); assert.equal(preview._meta.reviewApproval.approval_token, null);
  for (let i = 0; i < 5; i++) await f.invoke('begin_review', {});
  await assert.rejects(f.invoke('begin_review', {}), /review_capacity/);
});
test('RPC resource serves self-contained confirmation component and validates review arguments', () => {
  const request = (method, params) => ({jsonrpc: '2.0', id: 1, method, params});
  const resource = rpc(request('resources/read', {uri: REVIEW_URI}), true).result.contents[0];
  assert.equal(resource.mimeType, 'text/html;profile=mcp-app'); assert.ok(resource.text.includes('Confermo e applico'));
  assert.deepEqual(resource._meta.ui.csp.connectDomains, []); assert.ok(!resource.text.includes('https://cdn'));
  assert.equal(rpc(request('resources/read', {uri: 'https://other'}), true).error.code, -32602);
  assert.equal(rpc(request('resources/read', {uri: REVIEW_URI})).error.code, -32601);
  assert.equal(validReviewArgs('prepare_review', {review_id: id1, changes: [{id: id1, archive: false, reason: 'X'}]}), false);
  assert.equal(validReviewArgs('apply_review_step', {review_id: id1, revision: 1, confirmed: true}), false);
  assert.equal(rpc(request('tools/call', {name: 'begin_review', arguments: {limit: 51}}), true).error.code, -32602);
  assert.equal(REVIEW_TOOLS.find(t => t.name === 'apply_review_step').annotations.destructiveHint, true);
  assert.deepEqual(REVIEW_TOOLS.find(t => t.name === 'apply_review_step')._meta.ui.visibility, ['app']);
});

test('concurrent apply requests cannot duplicate a write, and cancellation during preflight sends no mutation', async () => {
  const f = fixture(); let release; let entered;
  const waiting = new Promise(resolve => {entered = resolve;});
  const blocker = new Promise(resolve => {release = resolve;});
  const manager = createReviewManager({...f.config, action: async (...args) => {
    if (args[1] === 'get_chat') {entered(); await blocker;}
    return f.config.action(...args);
  }});
  const review_id = (await manager.handle('begin_review', {}, source)).structuredContent.review_id;
  await manager.handle('read_review_chat', {review_id, id: id1}, source);
  const preview = await manager.handle('prepare_review', {review_id, changes: [{id: id1, title: 'New', reason: 'Clearer'}]}, source);
  const first = manager.handle('apply_review_step', {...preview._meta.reviewApproval, expected_step: 1}, source);
  await waiting;
  await assert.rejects(manager.handle('apply_review_step', {...preview._meta.reviewApproval, expected_step: 1}, source), /review_busy/);
  await manager.handle('cancel_review', {review_id}, source); release();
  const report = (await first).structuredContent;
  assert.equal(report.status, 'cancelled'); assert.equal(f.writes.length, 0);
});
test('rereading invalidates a preview; failed replacement cannot leave an old approval active', async () => {
  const f = fixture(); const review_id = await ready(f);
  const first = await f.invoke('prepare_review', proposal(review_id));
  await f.invoke('read_review_chat', {review_id, id: id1});
  await assert.rejects(f.invoke('apply_review_step', {...first._meta.reviewApproval, expected_step: 1}), /review_approval_required/);
  const second = await f.invoke('prepare_review', proposal(review_id));
  await assert.rejects(f.invoke('prepare_review', {review_id, changes: [{id: outside, title: 'Bad', reason: 'X'}]}), /review_unknown_chat/);
  await assert.rejects(f.invoke('apply_review_step', {...second._meta.reviewApproval, expected_step: 1}), /review_approval_required/);
  assert.equal(f.writes.length, 0);
});

test('review excludes source-tab chat by ID and selects a replacement without title heuristics', async () => {
  const f = fixture(); let requested;
  const manager = createReviewManager({...f.config, activeChatId: async () => id1,
    list: async (source, limit) => {requested = limit; return {chats: [...f.state.values()]};}});
  const data = (await manager.handle('begin_review', {limit: 1}, source)).structuredContent;
  assert.equal(requested, 2); assert.equal(data.requested_count, 1); assert.equal(data.selected_count, 1);
  assert.deepEqual(data.chats.map(c => c.id), [id2]);
  assert.deepEqual(data.excluded_chats.map(c => c.id), [id1]);
  await assert.rejects(manager.handle('read_review_chat', {review_id: data.review_id, id: id1}, source), /review_unknown_chat/);
  assert.equal(f.writes.length, 0);
});
test('selection remains bounded at 50 and reports a reduced actual count after exclusion', async () => {
  const f = fixture(); let requested;
  const manager = createReviewManager({...f.config, activeChatId: async () => id1,
    list: async (source, limit) => {requested = limit; return {chats: [...f.state.values()]};}});
  const data = (await manager.handle('begin_review', {limit: 50}, source)).structuredContent;
  assert.equal(requested, 51); assert.equal(data.selected_count, 1); assert.equal(data.requested_count, 50);
  assert.equal(data.chats[0].title, 'Travel');
});

test('failed review reads are tool errors with retained safe diagnostics and stop instructions', async () => {
  for (const code of ['read_rate_limited', 'read_schema_unknown', 'PRIVATE ERROR']) {
    const f = fixture();
    f.config.read = async () => { throw Object.assign(new Error(code), {diagnostic: {
      phase: 'conversation', http_status: 429, failure: 'http', elapsed_ms: 25,
      url: 'PRIVATE URL', body: 'PRIVATE CONTENT', token: 'PRIVATE TOKEN'
    }}); };
    const manager = createReviewManager(f.config);
    const start = (await manager.handle('begin_review', {limit: 2}, source)).structuredContent;
    const failed = await manager.handle('read_review_chat', {review_id: start.review_id, id: id1}, source);
    assert.equal(failed.isError, true);
    assert.equal(failed.structuredContent.reading, 'failed');
    assert.equal(failed.structuredContent.error, code === 'PRIVATE ERROR' ? 'read_failed' : code);
    assert.match(failed.structuredContent.next, /Stop this review/);
    const report = await manager.handle('get_review', {review_id: start.review_id}, source);
    assert.equal(report.structuredContent.chats[0].read_error, failed.structuredContent.error);
    assert.equal(report.structuredContent.chats[0].diagnostic.http_status, 429);
    assert.ok(!JSON.stringify([failed, report]).includes('PRIVATE'));
    assert.equal(f.writes.length, 0);
  }
});

test('new proposals provide a full confirmation window and distinguish known expiry from missing memory', async () => {
  const f = fixture(); const review_id = await ready(f);
  f.tick(20 * 60 * 1000);
  const p = await f.invoke('prepare_review', proposal(review_id));
  f.tick(15 * 60 * 1000); // Initial reading lifetime elapsed; fresh proposal still valid.
  assert.equal((await f.invoke('get_review', {review_id})).structuredContent.status, 'proposed');
  f.tick(16 * 60 * 1000);
  await assert.rejects(f.invoke('get_review', {review_id}), /review_expired$/);
  // Cleanup on a different request must not erase the known-expiry classification.
  await f.invoke('begin_review', {});
  await assert.rejects(f.invoke('get_review', {review_id}), /review_expired$/);
  const freshManager = createReviewManager(f.config);
  await assert.rejects(freshManager.handle('get_review', {review_id}, source), /review_unavailable$/);
  f.manager.clear(true);
  await assert.rejects(f.invoke('get_review', {review_id}), /review_unavailable$/);
  assert.equal(f.writes.length, 0);
});
