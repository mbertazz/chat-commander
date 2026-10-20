import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {createReviewManager, validReviewArgs} from '../extension/review.mjs';
import {runLiveAction, runWorkspace} from '../extension/live-source.mjs';
import {chatgptPage} from '../extension/chatgpt-page.mjs';

const ids = ['aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'];
const projectId = `g-p-${'1'.repeat(32)}`;
const source = {tabId: 1, documentKey: ids[0], documentId: null, userHash: 'a'.repeat(64)};
function fixture({fault, partial = false} = {}) {
  let binding = source;
  let serial = 0;
  const writes = [];
  const chats = ids.map((id, i) => ({id, title: `Chat ${i}`, archived: false, project_id: null}));
  const projects = new Map();
  const manager = createReviewManager({
    currentBinding: async () => binding,
    list: async () => ({chats}),
    read: async (_, args) => ({chat: chats.find(c => c.id === args.id), messages: [], has_more: partial,
      next_cursor: partial ? 'cursor' : null, unsupported_messages: 0}),
    action: async (_, name, args) => {
      const chat = chats.find(c => c.id === args.id);
      if (name !== 'get_chat') {writes.push(name); chat.title = args.title ?? chat.title; chat.archived = args.archived ?? chat.archived;}
      return {chat: {...chat}, changed: name !== 'get_chat'};
    },
    workspace: async (_, name, args) => {
      if (name === 'workspace_chat') return {chat: {...chats.find(c => c.id === args.id)}};
      if (name === 'check_project_name') return {available: true};
      if (name === 'get_project') return {project: projects.get(args.id)};
      writes.push(name);
      if (fault === name) throw new Error('action_outcome_unknown');
      if (name === 'create_project') {
        const project = {id: projectId, name: args.name, shared: false, can_write: true, memory_scope: 'global'};
        projects.set(project.id, project);
        return {verified: true, changed: true, project};
      }
      const chat = chats.find(c => c.id === args.before.id);
      assert.deepEqual(args.before, chat);
      assert.equal(args.destination.id, projectId);
      chat.project_id = args.project_id;
      return {verified: true, changed: true, chat: {...chat}};
    },
    randomUUID: () => `${String(++serial).padStart(8, '0')}-0000-4000-8000-000000000000`,
  });
  const call = (name, args) => manager.handle(name, args, binding);
  return {manager, call, writes, chats, setBinding: next => {binding = next;}};
}
async function readAll(f) {
  const r = (await f.call('begin_review', {limit: 2})).structuredContent.review_id;
  for (const id of ids) await f.call('read_review_chat', {review_id: r, id, overview: true});
  return r;
}
async function titles(f) {
  const review_id = await readAll(f);
  return f.call('prepare_review', {review_id, changes: ids.map(id => ({id, title: `New ${id[0]}`, reason: 'Clearer'}))});
}

test('lost step response cannot authorize the next step through a replay', async () => {
  const f = fixture();
  const p = await titles(f);
  const first = {...p._meta.reviewApproval, expected_step: 1};
  const r = (await f.call('apply_review_step', first)).structuredContent;
  assert.equal(r.status, 'applying');
  await assert.rejects(f.call('apply_review_step', first), /review_stale_step/);
  assert.equal(f.writes.length, 1);
  await f.call('apply_review_step', {...first, expected_step: 2});
  await assert.rejects(f.call('apply_review_step', {...first, expected_step: 2}), /review_approval_required/);
  assert.equal(f.writes.length, 2);
});
test('reports survive reconnect with the same account but approvals and other-account access do not', async () => {
  const f = fixture(); const p = await titles(f);
  await f.call('apply_review_step', {...p._meta.reviewApproval, expected_step: 1});
  f.manager.clear(); f.setBinding({...source, tabId: 2, documentKey: ids[1]});
  const r = (await f.call('get_review', {review_id: p.structuredContent.review_id})).structuredContent;
  assert.equal(r.counts.applied, 1); assert.equal(r.counts.skipped, 1);
  await assert.rejects(f.call('apply_review_step', {...p._meta.reviewApproval, expected_step: 2}), /review_source_changed/);
  f.setBinding({...source, userHash: 'b'.repeat(64)});
  await assert.rejects(f.call('get_review', {review_id: r.review_id}), /review_source_changed/);
  f.setBinding(source); f.manager.clear(true);
  await assert.rejects(f.call('get_review', {review_id: r.review_id}), /review_expired/);
});
test('terminal successful reports retain results after lock/invalidation', async () => {
  const f = fixture(); const p = await titles(f);
  for (let expected_step = 1; expected_step <= 2; expected_step++) await f.call('apply_review_step', {...p._meta.reviewApproval, expected_step});
  f.manager.clear();
  assert.equal((await f.call('get_review', {review_id: p.structuredContent.review_id})).structuredContent.status, 'completed');
});
test('individual rename, archive and restore prepare only, with exact expected-state checks', async () => {
  for (const [name, args] of [
    ['rename_chat', {id: ids[0], expected_title: 'Chat 0', title: 'New title'}],
    ['set_chat_archived', {id: ids[0], expected_title: 'Chat 0', expected_archived: false, archived: true}],
    ['set_chat_archived', {id: ids[0], expected_title: 'Chat 0', expected_archived: true, archived: false}],
  ]) {
    const f = fixture(); f.chats[0].archived = args.expected_archived ?? false;
    const p = await f.manager.prepareAction(name, args, source);
    assert.equal(p.structuredContent.status, 'proposed'); assert.equal(f.writes.length, 0);
    await f.call('apply_review_step', {...p._meta.reviewApproval, expected_step: 1});
    assert.deepEqual(f.writes, [name]);
  }
});
test('document or permission preflight failure never reports an uncertain injected write', async () => {
  for (const fault of ['document', 'permissions', 'tab']) {
    let injections = 0;
    const api = {
      permissions: {contains: async () => fault !== 'permissions'},
      tabs: {get: async () => {if (fault === 'tab') throw new Error(); return {url: 'https://chatgpt.com/'};}},
      scripting: {executeScript: async ({world}) => {
        if (world === 'MAIN') injections++;
        return [{frameId: 0, result: ids[1]}];
      }},
    };
    await assert.rejects(runLiveAction(api, source, 'rename_chat', {id: ids[0], expected_title: 'A', title: 'B'}), error => {
      assert.equal(error.message, 'action_not_sent'); assert.equal(error.diagnostic.injected, false); return true;
    });
    await assert.rejects(runWorkspace(api, source, 'delete_chat', {before: {id: ids[0]}}), /action_not_sent/);
    assert.equal(injections, 0);
  }
});
test('one project plan creates then moves reviewed chats, with per-step evidence and no preview writes', async () => {
  const f = fixture({partial: true}); const review_id = await readAll(f);
  const p = await f.call('prepare_project_plan', {review_id, groups: [{label: 'Trip', ids, reason: 'Related trip plans; partial reading disclosed'}]});
  assert.equal(p.structuredContent.changes.length, 3); assert.equal(f.writes.length, 0);
  const cap = p._meta.reviewApproval;
  let report;
  for (let expected_step = 1; expected_step <= 3; expected_step++) report = (await f.call('apply_review_step', {...cap, expected_step})).structuredContent;
  assert.equal(report.status, 'completed'); assert.equal(report.counts.applied, 3);
  assert.deepEqual(f.writes, ['create_project', 'move_chat', 'move_chat']);
  assert.equal(report.changes[0].result.project.id, projectId);
  assert.ok(f.chats.every(c => c.project_id === projectId));
});
test('uncertain project creation stops every move and revokes the batch capability', async () => {
  const f = fixture({fault: 'create_project'}); const review_id = await readAll(f);
  const p = await f.call('prepare_project_plan', {review_id, groups: [{label: 'Trip', ids, reason: 'Related'}]});
  const cap = {...p._meta.reviewApproval, expected_step: 1};
  const report = (await f.call('apply_review_step', cap)).structuredContent;
  assert.equal(report.counts.unknown, 1); assert.equal(report.counts.skipped, 2);
  await assert.rejects(f.call('apply_review_step', cap), /review_approval_required/);
  assert.deepEqual(f.writes, ['create_project']);
});
test('batch plan rejects duplicate memberships, unread chats and invalid existing destinations before writes', async () => {
  const f = fixture(); const review_id = await readAll(f);
  await assert.rejects(f.call('prepare_project_plan', {review_id, groups: [
    {label: 'A', ids: [ids[0]], reason: 'A'}, {label: 'B', ids: [ids[0]], reason: 'B'},
  ]}), /review_unread_chat/);
  assert.equal(f.writes.length, 0);
  assert.equal(validReviewArgs('prepare_project_plan', {review_id, groups: [{label: 'A', ids, reason: 'A', project_id: 'invented'}]}), false);
});
test('account claims participate in binding and ambiguous or non-personal workspaces are refused', async () => {
  async function bind(session) {
    const context = vm.createContext({location: {origin: 'https://chatgpt.com'}, crypto: webcrypto,
      fetch: async () => Response.json(session), atob, AbortSignal, Uint8Array, TextEncoder, TextDecoder});
    vm.runInContext('globalThis.top = globalThis', context);
    return vm.runInContext(`(${chatgptPage.toString()})('bind')`, context);
  }
  const base = {user: {id: 'test-user'}, accessToken: 'test-token'};
  const a = await bind({...base, account: {id: 'personal-a', plan_type: 'plus'}});
  const b = await bind({...base, account: {id: 'personal-b', plan_type: 'plus'}});
  assert.equal(a.code, 'source_bound'); assert.notEqual(a.userHash, b.userHash);
  assert.equal((await bind({...base, accounts: [{id: 'a'}, {id: 'b'}]})).code, 'source_workspace_unsupported');
  assert.equal((await bind({...base, account: {id: 'team', plan_type: 'business'}})).code, 'source_workspace_unsupported');
});

test('adapter-confirmed preflight identity refusal is failed, not an uncertain write', async () => {
  let binding = source;
  const m = createReviewManager({currentBinding: async () => binding,
    list: async () => ({chats: [{id: ids[0], title: 'A', archived: false}]}),
    read: async () => ({chat: {id: ids[0], title: 'A', archived: false}, has_more: false, next_cursor: null, unsupported_messages: 0}),
    action: async (_, name) => {
      if (name !== 'get_chat') throw new Error('source_identity_changed');
      return {chat: {id: ids[0], title: 'A', archived: false}};
    },
  });
  const review_id = (await m.handle('begin_review', {}, source)).structuredContent.review_id;
  await m.handle('read_review_chat', {review_id, id: ids[0]}, source);
  const p = await m.handle('prepare_review', {review_id, changes: [{id: ids[0], title: 'B', reason: 'Clearer'}]}, source);
  const r = (await m.handle('apply_review_step', {...p._meta.reviewApproval, expected_step: 1}, source)).structuredContent;
  assert.equal(r.counts.failed, 1); assert.equal(r.counts.unknown, 0);
});

test('replacing an individual preview revokes its old card without applying either proposal', async () => {
  const f = fixture();
  const args = {id: ids[0], expected_title: 'Chat 0', title: 'First proposal'};
  const first = await f.manager.prepareAction('rename_chat', args, source);
  const second = await f.manager.prepareAction('rename_chat', {...args, title: 'Replacement'}, source);
  await assert.rejects(f.call('apply_review_step', {...first._meta.reviewApproval, expected_step: 1}), /review_cancelled/);
  assert.equal(f.writes.length, 0);
  await f.call('apply_review_step', {...second._meta.reviewApproval, expected_step: 1});
  assert.equal(f.chats[0].title, 'Replacement'); assert.equal(f.writes.length, 1);
});
