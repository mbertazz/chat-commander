import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SERVER} from '../extension/server.mjs';
import {rpc} from '../extension/protocol.mjs';
import {liveDispatcher} from '../extension/live-source.mjs';
import {createReviewManager} from '../extension/review.mjs';
import {toolArgumentIssues} from '../extension/tools.mjs';
const uuid = n => `${n.toString(16).padStart(8, '0')}-0000-4000-8000-000000000000`;
const ids = Array.from({length: 12}, (_, i) => uuid(i + 1));
const args = () => ({review_id: uuid(100), groups: [
  {label: 'Trip planning', ids: ids.slice(0, 2), reason: 'Route choices determine equipment.', project_id: null},
  {label: 'Product release', ids: ids.slice(2, 10), reason: 'Explicit release requirements and verification.', project_id: null},
  {label: 'Home updates', ids: ids.slice(10), reason: 'Coordinated work in the same home.', project_id: null},
]});
const invoke = value => rpc({jsonrpc: '2.0', id: 1, method: 'tools/call', params: {name: 'prepare_project_plan', arguments: value}}, SERVER);

test('three new projects with twelve members accept explicit null as well as omitted project IDs', () => {
  assert.deepEqual(invoke(args()).result, {});
  const omitted = args(); for (const group of omitted.groups) delete group.project_id;
  assert.deepEqual(invoke(omitted).result, {});
  assert.deepEqual(toolArgumentIssues('prepare_project_plan', args()), []);
});
test('invalid project-plan arguments report exact bounded paths and constraints, never private values', () => {
  for (const [change, path, code] of [
    [a => {a.groups[1].reason = 'PRIVATE-REASON'.repeat(60);}, 'arguments.groups[1].reason', 'max_length'],
    [a => {a.groups[2].project_id = 'PRIVATE-PROJECT-ID';}, 'arguments.groups[2].project_id', 'pattern'],
    [a => {delete a.groups[0].reason;}, 'arguments.groups[0].reason', 'required'],
    [a => {a.groups[1].ids[0] = 'PRIVATE-CHAT-ID';}, 'arguments.groups[1].ids[0]', 'pattern'],
    [a => {a.groups[0]['PRIVATE-UNKNOWN-FIELD'] = 'PRIVATE-VALUE';}, 'arguments.groups[0]', 'unexpected_fields'],
  ]) {
    const a = args(); change(a); const error = invoke(a).error;
    assert.equal(error.code, -32602); assert.equal(error.data.execution_started, false);
    assert.ok(error.data.validation_errors.some(issue => issue.path === path && issue.code === code));
    assert.ok(error.message.includes(path));
    assert.ok(!JSON.stringify(error).includes('PRIVATE-'));
  }
});
test('duplicate memberships, blank reasons and more than fifty total members have actionable errors', () => {
  const duplicate = args(); duplicate.groups[2].ids[0] = duplicate.groups[0].ids[0];
  assert.ok(invoke(duplicate).error.data.validation_errors.some(i => i.code === 'duplicate_membership'));
  const blank = args(); blank.groups[1].reason = '   ';
  assert.ok(invoke(blank).error.data.validation_errors.some(i => i.path.endsWith('.reason') && i.code === 'blank'));
  const large = args(); large.groups = [
    {label: 'A', ids: Array.from({length: 30}, (_, i) => uuid(i + 1)), reason: 'A'},
    {label: 'B', ids: Array.from({length: 21}, (_, i) => uuid(i + 31)), reason: 'B'},
  ];
  assert.ok(invoke(large).error.data.validation_errors.some(i => i.code === 'total_members'));
});
test('schema rejection executes no adapter, storage, mutation or setup observation', async () => {
  const api = new Proxy({}, {get: () => assert.fail('no browser API may be accessed')});
  const dispatch = liveDispatcher(api, () => assert.fail('no observation on invalid arguments'));
  const a = args(); a.groups[0].reason = 'x'.repeat(501);
  const body = await dispatch({command_type: 'jsonrpc', request_id: 'test', shard_token: 'shard',
    jsonrpc: {jsonrpc: '2.0', id: 1, method: 'tools/call', params: {name: 'prepare_project_plan', arguments: a}}});
  assert.equal(body.resp_json.error.code, -32602);
  assert.equal(body.resp_json.error.data.execution_started, false);
});
test('null destination prepares a full three-project twelve-move card without any writes', async () => {
  const chats = ids.map((id, i) => ({id, title: `Synthetic ${i}`, archived: false, project_id: null}));
  const source = {tabId: 1, documentId: null, documentKey: uuid(200), userHash: 'a'.repeat(64)};
  const writes = []; let serial = 100;
  const manager = createReviewManager({currentBinding: async () => source,
    list: async () => ({chats}),
    read: async (_, a) => ({chat: chats.find(c => c.id === a.id), has_more: false, next_cursor: null, unsupported_messages: 0}),
    workspace: async (_, name, a) => {
      if (name === 'workspace_chat') return {chat: {...chats.find(c => c.id === a.id)}};
      if (name === 'check_project_name') return {available: true};
      writes.push(name); assert.fail('preparation cannot execute a mutation');
    },
    randomUUID: () => uuid(++serial),
  });
  const review_id = (await manager.handle('begin_review', {limit: 50}, source)).structuredContent.review_id;
  for (const id of ids) await manager.handle('read_review_chat', {review_id, id}, source);
  const preview = await manager.handle('prepare_project_plan', {...args(), review_id}, source);
  assert.equal(preview.structuredContent.status, 'proposed');
  assert.equal(preview.structuredContent.changes.filter(c => c.action === 'create_project').length, 3);
  assert.equal(preview.structuredContent.changes.filter(c => c.action === 'move_chat').length, 12);
  assert.equal(writes.length, 0);
  assert.ok(!JSON.stringify(preview.structuredContent).includes(preview._meta.reviewApproval.approval_token));
});
