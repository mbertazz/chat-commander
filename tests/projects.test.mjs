import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {chatgptPage} from '../extension/chatgpt-page.mjs';
import {liveDispatcher} from '../extension/live-source.mjs';
import {validProjectArgs, normalizeWorkspaceResult, PROJECT_TOOLS} from '../extension/projects.mjs';
import {Tunnel} from '../extension/tunnel.mjs';
import {workspaceDiagnostic} from '../extension/workspace-diagnostics.mjs';

const id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const other = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const p1 = `g-p-${'1'.repeat(32)}`; const p2 = `g-p-${'2'.repeat(32)}`;
const session = {accessToken: 'private-page-token', user: {id: 'private-user'}};
const hash = Buffer.from(await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(session.user.id))).toString('hex');
const binding = {tabId: 1, documentId: null, documentKey: id, userHash: hash};
const projection = p => ({id: p.id, name: p.name, shared: p.shared, can_write: p.can_write, memory_scope: 'global'});
function backend() {
  const state = {chat: {id, title: 'Disposable test chat', archived: false, project_id: null}, visible: true,
    projects: new Map([[p1, {id: p1, name: 'Recipes', shared: false, can_write: true}]]), calls: [], writes: [],
    failWrite: false, accountChanged: false, noGizmo: false, invisibleReadable: false, nextCursor: null};
  const rawProject = p => ({id: p.id, display: {name: p.name}, gizmo_type: 'snorlax',
    is_shared: p.shared, current_user_permission: {can_write: p.can_write}, memory_scope: 'global',
    instructions: 'PRIVATE INSTRUCTIONS', files: ['PRIVATE FILE'], owner: {email: 'PRIVATE EMAIL'}});
  state.fetch = async (url, options) => {
    state.calls.push({url, method: options.method});
    assert.equal(options.credentials, 'same-origin'); assert.equal(options.redirect, 'error');
    assert.ok(!String(url).includes('http')); // fixed same-origin relative paths only
    if (url === '/api/auth/session') return Response.json(state.accountChanged ? {...session, user: {id: 'other'}} : session);
    assert.equal(options.headers.Authorization, `Bearer ${session.accessToken}`);
    if (url.startsWith('/backend-api/gizmos/snorlax/sidebar?')) {
      assert.ok(url.includes('owned_only=true')); assert.ok(url.includes('conversations_per_gizmo=0'));
      return Response.json({items: [...state.projects.values()].map(p => ({gizmo: {gizmo: rawProject(p)}})), cursor: state.nextCursor});
    }
    if (url.startsWith('/backend-api/gizmos/')) {
      const project = state.projects.get(url.split('/').at(-1));
      return project ? Response.json({gizmo: rawProject(project)}) : new Response(null, {status: 404});
    }
    if (url === '/backend-api/projects') {
      assert.equal(options.method, 'POST'); const body = JSON.parse(options.body);
      assert.deepEqual(body, {name: body.name, instructions: ''});
      state.writes.push(body); state.projects.set(p2, {id: p2, name: body.name, shared: false, can_write: true});
      if (state.failWrite) throw new Error('PRIVATE NETWORK DETAIL');
      return Response.json({gizmo: {id: p2}});
    }
    assert.equal(url, `/backend-api/conversation/${id}`);
    if (options.method === 'PATCH') {
      const body = JSON.parse(options.body); state.writes.push(body);
      if (Object.hasOwn(body, 'gizmo_id')) state.chat.project_id = body.gizmo_id || null;
      if (body.is_visible === false) state.visible = false;
      if (state.failWrite) throw new Error('PRIVATE NETWORK DETAIL');
      return Response.json({success: true});
    }
    if (!state.visible && !state.invisibleReadable) return new Response(null, {status: 404});
    return Response.json({conversation_id: id, title: state.chat.title, is_archived: state.chat.archived,
      ...(state.noGizmo ? {} : {gizmo_id: state.chat.project_id}), is_visible: state.visible, mapping: {private: 'PRIVATE MESSAGES'}});
  };
  return state;
}
async function page(state, operation, args, {deadline = Date.now() + 25000, pathname = '/', clock = Date, signals = AbortSignal} = {}) {
  const context = vm.createContext({location: {origin: 'https://chatgpt.com', pathname}, crypto: webcrypto, fetch: state.fetch,
    Date: clock, AbortSignal: signals, Uint8Array, TextEncoder, TextDecoder, args: [operation, args, hash, deadline]});
  vm.runInContext('globalThis.top = globalThis', context);
  return JSON.parse(JSON.stringify(await vm.runInContext(`(${chatgptPage.toString()})(...args)`, context)));
}
function apiFor(state) {
  const api = {permissions: {contains: async () => true}, tabs: {get: async () => ({url: 'https://chatgpt.com/'})},
    storage: {session: {get: async () => ({liveSource: binding})}},
    scripting: {executeScript: async options => [{frameId: 0, result: options.world === 'ISOLATED' ? id
      : await page(state, ...options.args.slice(0, 2), {deadline: options.args[3]})}]}};
  return api;
}
const command = (name, args) => ({command_type: 'jsonrpc', request_id: 'request', shard_token: 'shard',
  jsonrpc: {jsonrpc: '2.0', id: 1, method: 'tools/call', params: {name, arguments: args}}});
const call = async (dispatch, name, args) => (await dispatch(command(name, args))).resp_json;
const privateDataAbsent = value => {
  for (const secret of ['private-page-token', 'private-user', 'PRIVATE MESSAGES', 'PRIVATE FILE', 'PRIVATE INSTRUCTIONS', 'PRIVATE EMAIL', 'PRIVATE NETWORK DETAIL'])
    assert.ok(!JSON.stringify(value).includes(secret), secret);
};

test('project schemas reject bulk, paths, arbitrary fields and model-supplied consent; prepare tools are read-only', () => {
  for (const [name, args] of [['create_project', {name: ''}], ['create_project', {name: 'x', instructions: 'anything'}],
    ['move_chat', {id, project_id: '../bad'}], ['delete_chat', {id, confirmed: true}], ['delete_chat', {ids: [id]}],
    ['get_project', {id: p1, url: 'https://example.com'}], ['list_projects', {cursor: ''}]]) assert.equal(validProjectArgs(name, args), false);
  assert.equal(validProjectArgs('move_chat', {id, project_id: null}), true);
  assert.equal(validProjectArgs('create_project', {name: 'Research'}), true);
  for (const tool of PROJECT_TOOLS) assert.equal(tool.annotations.readOnlyHint, true);
});
test('project discovery returns only metadata and opaque continuation; project detail does not expose instructions/files', async () => {
  const b = backend(); const result = await page(b, 'list_projects', {});
  assert.deepEqual(normalizeWorkspaceResult('list_projects', result).projects, [projection(b.projects.get(p1))]);
  privateDataAbsent(result); privateDataAbsent(await page(b, 'get_project', {id: p1}));
  b.nextCursor = 'opaque'; const first = await page(b, 'list_projects', {});
  assert.equal(first.has_more, true); assert.ok(first.next_cursor);
  assert.equal((await page(b, 'list_projects', {cursor: first.next_cursor})).code, 'project_schema_unknown');
  assert.equal((await page(b, 'list_projects', {cursor: 'invalid'})).code, 'project_cursor_invalid');
});
test('create sends exactly one minimal POST, independently verifies metadata, rejects duplicates and never retries uncertain creation', async () => {
  const b = backend(); const created = await page(b, 'create_project', {name: 'Research'});
  assert.equal(created.code, 'workspace_ok'); assert.equal(created.project.id, p2); assert.equal(b.writes.length, 1); privateDataAbsent(created);
  assert.equal((await page(b, 'create_project', {name: ' research '})).code, 'project_exists'); assert.equal(b.writes.length, 1);
  const lost = backend(); lost.failWrite = true;
  assert.equal((await page(lost, 'create_project', {name: 'Research'})).code, 'action_outcome_unknown'); assert.equal(lost.writes.length, 1);
});
test('creation accepts the observed resource envelope but requires independent detail verification', async () => {
  for (const mismatch of [false, true]) {
    const b = backend(); const original = b.fetch;
    b.fetch = async (url, options) => {
      const response = await original(url, options);
      if (url !== '/backend-api/projects') return response;
      if (mismatch) b.projects.get(p2).name = 'Changed elsewhere';
      return Response.json({resource: {gizmo: {id: p2, display: {name: 'Research'},
        author: {email: 'PRIVATE EMAIL'}, instructions: 'PRIVATE INSTRUCTIONS'}}, error: null, sharing_targets: []});
    };
    const result = await page(b, 'create_project', {name: 'Research'});
    assert.equal(result.code, mismatch ? 'action_outcome_unknown' : 'workspace_ok');
    if (!mismatch) {assert.equal(result.verified, true); assert.equal(result.project.id, p2);}
    assert.equal(b.writes.length, 1);
    assert.ok(b.calls.some(call => call.url === `/backend-api/gizmos/${p2}`));
    privateDataAbsent(result);
  }
});
test('move and remove change only gizmo_id; title/archive/project conflicts and custom GPT metadata block writes', async () => {
  const b = backend(); const before = {...b.chat}; const destination = projection(b.projects.get(p1));
  const moved = await page(b, 'move_chat', {before, project_id: p1, origin: null, destination});
  assert.equal(moved.code, 'workspace_ok'); assert.deepEqual(b.writes, [{gizmo_id: p1}]); assert.equal(moved.chat.project_id, p1);
  const removed = await page(b, 'move_chat', {before: {...b.chat}, project_id: null, origin: destination, destination: null});
  assert.equal(removed.code, 'workspace_ok'); assert.deepEqual(b.writes.at(-1), {gizmo_id: ''});
  b.chat.title = 'Changed'; assert.equal((await page(b, 'move_chat', {before, project_id: p1, origin: null, destination})).code, 'action_conflict');
  b.noGizmo = true; assert.equal((await page(b, 'workspace_chat', {id})).code, 'project_chat_unsupported'); assert.equal(b.writes.length, 2);
});
test('shared/unverifiable projects, changed destination and incomplete ownership scan fail closed before PATCH', async () => {
  for (const shared of [true, null]) {
    const b = backend(); const destination = projection(b.projects.get(p1)); b.projects.get(p1).shared = shared;
    assert.equal((await page(b, 'move_chat', {before: {...b.chat}, project_id: p1, origin: null, destination})).code, 'project_sharing_unknown');
    assert.equal(b.writes.length, 0);
  }
  const b = backend(); const destination = projection(b.projects.get(p1)); b.projects.get(p1).name = 'Changed';
  assert.equal((await page(b, 'move_chat', {before: {...b.chat}, project_id: p1, origin: null, destination})).code, 'action_conflict');
  b.nextCursor = 'repeated'; assert.equal((await page(b, 'create_project', {name: 'New'})).code, 'project_schema_unknown'); assert.equal(b.writes.length, 0);
});
test('delete requires positive PATCH acknowledgement and verified disappearance, never offers restoration or certifies purging', async () => {
  for (const invisibleReadable of [false, true]) {
    const b = backend(); b.invisibleReadable = invisibleReadable;
    const deleted = await page(b, 'delete_chat', {before: {...b.chat}});
    assert.equal(deleted.code, 'workspace_ok'); assert.equal(deleted.verification, 'no_longer_accessible');
    assert.deepEqual(b.writes, [{is_visible: false}]); privateDataAbsent(deleted);
  }
  const lost = backend(); lost.failWrite = true;
  assert.equal((await page(lost, 'delete_chat', {before: {...lost.chat}})).code, 'action_outcome_unknown'); assert.equal(lost.writes.length, 1);
});
test('account switches, expired work and the current source-page chat do not execute writes', async () => {
  const b = backend(); b.accountChanged = true;
  assert.equal((await page(b, 'delete_chat', {before: {...b.chat}})).code, 'source_identity_changed'); assert.equal(b.writes.length, 0);
  b.accountChanged = false;
  assert.equal((await page(b, 'delete_chat', {before: {...b.chat}}, {deadline: Date.now() - 1})).code, 'source_cancelled');
  assert.equal((await page(b, 'delete_chat', {before: {...b.chat}}, {pathname: `/c/${id}`})).code, 'workspace_current_chat'); assert.equal(b.writes.length, 0);
});
test('MCP create/move/delete prepare only; exact capability confirms once, report replay does not repeat the write', async () => {
  for (const [name, args] of [['create_project', {name: 'Research'}], ['move_chat', {id, project_id: p1}], ['delete_chat', {id}]]) {
    const b = backend(); const dispatch = liveDispatcher(apiFor(b));
    const preview = (await call(dispatch, name, args)).result;
    assert.equal(preview.structuredContent.status, 'proposed'); assert.equal(b.writes.length, 0); privateDataAbsent(preview);
    const cap = preview._meta.reviewApproval;
    assert.ok(!JSON.stringify(preview.structuredContent).includes(cap.approval_token)); assert.ok(!JSON.stringify(preview.content).includes(cap.approval_token));
    const wrong = await call(dispatch, 'apply_review_step', {...cap, approval_token: 'a'.repeat(72)});
    assert.equal(wrong.result.isError, true); assert.equal(b.writes.length, 0);
    const done = (await call(dispatch, 'apply_review_step', cap)).result.structuredContent;
    assert.equal(done.status, 'completed'); assert.equal(done.counts.applied, 1); assert.equal(b.writes.length, 1); privateDataAbsent(done);
    assert.equal((await call(dispatch, 'apply_review_step', cap)).result.structuredContent.status, 'completed'); assert.equal(b.writes.length, 1);
  }
});
test('cancel, replacement, expiry, account binding changes and conflicts revoke authorization without any writes', async () => {
  const b = backend(); const api = apiFor(b); const dispatch = liveDispatcher(api);
  const prepare = async () => (await call(dispatch, 'delete_chat', {id})).result;
  const old = await prepare(); const next = await prepare();
  assert.equal((await call(dispatch, 'apply_review_step', old._meta.reviewApproval)).result.isError, true);
  await call(dispatch, 'cancel_review', {review_id: next.structuredContent.review_id});
  assert.equal((await call(dispatch, 'apply_review_step', next._meta.reviewApproval)).result.isError, true);
  const changed = await prepare(); b.chat.title = 'Different now';
  const report = (await call(dispatch, 'apply_review_step', changed._meta.reviewApproval)).result.structuredContent;
  assert.equal(report.status, 'attention'); assert.equal(report.counts.conflicts, 1); assert.equal(b.writes.length, 0);
  const bindingChanged = await prepare(); api.storage.session.get = async () => ({liveSource: {...binding, documentKey: other}});
  assert.equal((await call(dispatch, 'apply_review_step', bindingChanged._meta.reviewApproval)).result.isError, true);
  assert.equal(b.writes.length, 0);
});
test('single-action plans use existing gates: active chat protection, bulk review locks and individual mutation locks', async () => {
  const b = backend(); const api = apiFor(b); const dispatch = liveDispatcher(api);
  const proposal = (await call(dispatch, 'delete_chat', {id})).result;
  const blocked = await call(dispatch, 'rename_chat', {id, expected_title: b.chat.title, title: 'New'});
  assert.equal(JSON.parse(blocked.result.content[0].text).error, 'review_use_confirmation');
  api.tabs.get = async () => ({url: `https://chatgpt.com/c/${id}`});
  const report = (await call(dispatch, 'apply_review_step', proposal._meta.reviewApproval)).result.structuredContent;
  assert.equal(report.counts.failed, 1); assert.equal(b.writes.length, 0);
  assert.equal((await call(dispatch, 'delete_chat', {id})).result.isError, true);
});
test('lost mutation response reports uncertain once; complete tunnel delivery reuses the result without replaying deletion', async () => {
  const b = backend(); b.failWrite = true; const dispatch = liveDispatcher(apiFor(b));
  const preview = (await call(dispatch, 'delete_chat', {id})).result; let posted; let attempts = 0;
  const tunnel = new Tunnel({tunnelId: `tunnel_${'a'.repeat(32)}`, apiKey: 'runtime-key'}, {dispatch, wait: async () => {},
    fetcher: async (url, options) => {
      if (url.includes('/poll?')) return Response.json({commands: [command('apply_review_step', preview._meta.reviewApproval)]});
      posted = JSON.parse(options.body); return new Response(null, {status: attempts++ === 0 ? 503 : 204});
    }});
  await tunnel.cycle(); assert.equal(b.writes.length, 1); assert.equal(attempts, 2);
  assert.equal(posted.resp_json.result.structuredContent.counts.unknown, 1); privateDataAbsent(posted);
  await call(dispatch, 'apply_review_step', preview._meta.reviewApproval); assert.equal(b.writes.length, 1);
});

test('prepared workspace plans share expiry, clear, concurrency and cancellation guards with guided reviews', async () => {
  const {createReviewManager} = await import('../extension/review.mjs');
  let now = 1000; let writes = 0; let release; let entered;
  const manager = createReviewManager({now: () => now, currentBinding: async () => binding,
    validateWorkspace: validProjectArgs, workspace: async (_, operation) => {
      if (operation === 'check_project_name') return {available: true};
      writes++; if (entered) entered(); if (release) await release.promise;
      return {changed: true, verified: true, project: projection({id: p2, name: 'Research', shared: false, can_write: true})};
    }});
  const expired = await manager.prepareWorkspace('create_project', {name: 'Research'}, binding);
  now += 30 * 60 * 1000;
  await assert.rejects(manager.handle('apply_review_step', expired._meta.reviewApproval, binding), /review_expired/); assert.equal(writes, 0);
  const cleared = await manager.prepareWorkspace('create_project', {name: 'Research'}, binding);
  manager.clear(); await assert.rejects(manager.handle('apply_review_step', cleared._meta.reviewApproval, binding), /review_expired/);
  const ready = await manager.prepareWorkspace('create_project', {name: 'Research'}, binding);
  const waiting = new Promise(resolve => {entered = resolve;});
  let resume; release = {promise: new Promise(resolve => {resume = resolve;})};
  const first = manager.handle('apply_review_step', ready._meta.reviewApproval, binding); await waiting;
  await assert.rejects(manager.handle('apply_review_step', ready._meta.reviewApproval, binding), /review_busy/);
  await manager.handle('cancel_review', {review_id: ready.structuredContent.review_id}, binding);
  resume(); assert.equal((await first).structuredContent.status, 'cancelled'); assert.equal(writes, 1); // Already-running operation may finish.
});
test('delete never reports success from PATCH alone, HTTP failures or an account change during verification', async () => {
  for (const failure of ['ack', 'verification', 'account']) {
    const b = backend(); const original = b.fetch;
    b.fetch = async (url, options) => {
      const response = await original(url, options);
      if (options.method === 'PATCH') {
        if (failure === 'ack') return Response.json({success: false});
        if (failure === 'account') b.accountChanged = true;
      }
      if (!b.visible && url.includes('/conversation/') && options.method === 'GET' && failure === 'verification') return new Response(null, {status: 503});
      return response;
    };
    assert.equal((await page(b, 'delete_chat', {before: {...b.chat}})).code, 'action_outcome_unknown');
    assert.equal(b.writes.length, 1);
  }
});

test('observed sharing object recognizes invitation-only projects with no subjects; sharing targets are not access grants', async () => {
  const b = backend(); const original = b.fetch;
  b.fetch = async (url, options) => {
    const response = await original(url, options);
    if (url !== `/backend-api/gizmos/${p1}`) return response;
    const data = await response.json(); delete data.gizmo.is_shared;
    Object.assign(data.gizmo, {share_recipient: 'private', sharing: {recipient: 'private', subjects: []},
      sharing_targets: [{recipient: 'private', allowed: true}, {recipient: 'link', allowed: true}],
      author: {user_id: 'SYNTHETIC AUTHOR ID', user_email: 'SYNTHETIC AUTHOR EMAIL'}});
    return Response.json(data);
  };
  const result = await page(b, 'get_project', {id: p1});
  assert.equal(result.code, 'workspace_ok'); assert.equal(result.project.shared, false); assert.equal(result.project.can_write, true);
  assert.ok(!JSON.stringify(result).includes('SYNTHETIC AUTHOR'));
  const moved = await page(b, 'move_chat', {before: {...b.chat}, project_id: p1, origin: null, destination: projection(b.projects.get(p1))});
  assert.equal(moved.code, 'workspace_ok'); assert.deepEqual(b.writes, [{gizmo_id: p1}]);
});
test('private recipient with invitees is shared, missing subjects remain unknown and conflicting metadata fails closed', async () => {
  for (const [fields, expected, code] of [
    [{share_recipient: 'private', sharing: {recipient: 'private', subjects: [{id: 'synthetic-member'}]}}, true],
    [{share_recipient: 'private', sharing: {recipient: 'private'}}, null],
    [{share_recipient: 'private', sharing_targets: [{recipient: 'link', allowed: true}]}, null],
    [{share_recipient: 'link', sharing: {recipient: 'link', subjects: []}}, true],
    [{is_shared: false, sharing: {recipient: 'private', subjects: [{id: 'synthetic-member'}]}}, null, 'project_schema_unknown'],
    [{share_recipient: 'link', sharing: {recipient: 'private', subjects: []}}, null, 'project_schema_unknown'],
  ]) {
    const b = backend(); const original = b.fetch;
    b.fetch = async (url, options) => {
      const response = await original(url, options);
      if (url !== `/backend-api/gizmos/${p1}`) return response;
      const data = await response.json(); delete data.gizmo.is_shared; Object.assign(data.gizmo, fields); return Response.json(data);
    };
    const result = await page(b, 'get_project', {id: p1});
    assert.equal(result.code, code ?? 'workspace_ok');
    if (!code) assert.equal(result.project.shared, expected);
    const moved = await page(b, 'move_chat', {before: {...b.chat}, project_id: p1, origin: null, destination: projection(b.projects.get(p1))});
    assert.notEqual(moved.code, 'workspace_ok'); assert.equal(b.writes.length, 0);
  }
});

test('uncertain deletion reports only its phase and HTTP status through the confirmed review, without retrying', async () => {
  for (const [failure, phase, status] of [
    ['network', 'write', null], ['http', 'write_response', 403],
    ['ack', 'acknowledgement', 200], ['read', 'read_back_response', 503],
    ['visible', 'read_back_content', 200], ['identity', 'identity_after_write', null],
  ]) {
    const b = backend(); const original = b.fetch;
    b.fetch = async (url, options) => {
      const response = await original(url, options);
      if (options.method === 'PATCH') {
        if (failure === 'network') throw new Error('PRIVATE NETWORK DETAIL');
        if (failure === 'http') return Response.json({secret: 'PRIVATE EMAIL'}, {status: 403});
        if (failure === 'ack') return Response.json({success: false, secret: 'PRIVATE EMAIL'});
        if (failure === 'identity') b.accountChanged = true;
      }
      if (!b.visible && url.includes('/conversation/') && options.method === 'GET') {
        if (failure === 'read') return new Response(null, {status: 503});
        if (failure === 'visible') return Response.json({conversation_id: id, is_visible: true});
      }
      return response;
    };
    const dispatch = liveDispatcher(apiFor(b));
    const preview = (await call(dispatch, 'delete_chat', {id})).result;
    const report = (await call(dispatch, 'apply_review_step', preview._meta.reviewApproval)).result.structuredContent;
    assert.equal(report.status, 'attention');
    assert.equal(report.changes[0].error, 'outcome_unknown');
    assert.equal(report.changes[0].diagnostic.phase, phase);
    assert.equal(report.changes[0].diagnostic.http_status, status);
    assert.equal(report.changes[0].diagnostic.write_signal_aborted, false);
    assert.ok(Number.isInteger(report.changes[0].diagnostic.elapsed_ms));
    assert.equal(b.writes.length, 1); privateDataAbsent(report);
    const replay = (await call(dispatch, 'apply_review_step', preview._meta.reviewApproval)).result.structuredContent;
    assert.deepEqual(replay.changes[0].diagnostic, report.changes[0].diagnostic);
    assert.equal(b.writes.length, 1);
  }
});
test('workspace diagnostics discard arbitrary phases, statuses and all extra page-owned fields', () => {
  for (const data of [null, {}, {phase: 'PRIVATE EMAIL', http_status: 200},
    {phase: 'write', http_status: 'PRIVATE EMAIL'}, {phase: 'write', http_status: 1000}])
    assert.equal(workspaceDiagnostic(data), null);
  assert.deepEqual(workspaceDiagnostic({phase: 'write_response', http_status: 200,
    token: 'private-page-token', body: 'PRIVATE MESSAGES', url: 'PRIVATE EMAIL'}),
    {phase: 'write_response', http_status: 200});
});

// Virtual time exercises a delayed acknowledgement without a slow live request.
test('delete accepts acknowledgement after twelve seconds and independently verifies with one PATCH', async () => {
  let now = 100000; const timeouts = []; const b = backend(); const fetch = b.fetch;
  b.fetch = async (url, options) => {
    if (options.method === 'PATCH') {
      assert.equal(timeouts.at(-1), 20000);
      now += 12000;
      assert.ok(now < options.signal.deadline);
    } else assert.ok(timeouts.at(-1) <= 10000);
    return fetch(url, options);
  };
  const result = await page(b, 'delete_chat', {before: {...b.chat}}, {
    deadline: 125000, clock: {now: () => now},
    signals: {timeout: ms => {timeouts.push(ms); return {deadline: now + ms};}},
  });
  assert.equal(result.code, 'workspace_ok'); assert.equal(result.verified, true);
  assert.equal(b.writes.length, 1);
  assert.equal(b.calls.filter(c => c.method === 'GET' && c.url.endsWith(id)).length, 2);
});
test('delete preserves verification budget and refuses PATCH when only five seconds remain', async () => {
  for (const remaining of [5000, 9000]) {
    const b = backend(); const timeouts = [];
    const result = await page(b, 'delete_chat', {before: {...b.chat}}, {
      deadline: 100000 + remaining, clock: {now: () => 100000},
      signals: {timeout: ms => {timeouts.push(ms); return {}; }},
    });
    if (remaining === 5000) {
      assert.equal(result.code, 'source_cancelled'); assert.equal(b.writes.length, 0);
    } else {
      assert.equal(result.code, 'workspace_ok'); assert.equal(b.writes.length, 1);
      assert.ok(timeouts.includes(4000));
    }
  }
});

test('delete diagnostics distinguish own timeout, external abort and fetch failure without retry or raw errors', async () => {
  for (const [name, aborted, reason, failure] of [
    ['TimeoutError', true, 'TimeoutError', 'write_timeout'],
    ['TimeoutError', false, undefined, 'request_timeout'],
    ['AbortError', false, undefined, 'request_aborted'],
    ['TypeError', false, undefined, 'fetch_type_error'],
    ['PRIVATE EMAIL', false, undefined, 'other'],
  ]) {
    let now = 100000; const b = backend(); const fetch = b.fetch;
    b.fetch = async (url, options) => {
      if (options.method === 'PATCH') {
        await fetch(url, options); now += 12000;
        options.signal.aborted = aborted; options.signal.reason = {name: reason};
        const error = new Error('PRIVATE NETWORK DETAIL'); error.name = name; throw error;
      }
      return fetch(url, options);
    };
    const result = await page(b, 'delete_chat', {before: {...b.chat}}, {
      deadline: 125000, clock: {now: () => now}, signals: {timeout: () => ({aborted: false})},
    });
    assert.equal(result.code, 'action_outcome_unknown');
    assert.deepEqual(workspaceDiagnostic(result.diagnostic), {phase: 'write', http_status: null,
      failure, write_signal_aborted: aborted, deadline_expired: false, elapsed_ms: 12000, write_timeout_ms: 20000});
    assert.equal(b.writes.length, 1); privateDataAbsent(result);
  }
});
test('extended diagnostics reject arbitrary error names, timing and signal fields', () => {
  assert.deepEqual(workspaceDiagnostic({phase: 'write', http_status: null, failure: 'PRIVATE EMAIL',
    elapsed_ms: Infinity, write_timeout_ms: 20001, deadline_expired: 'PRIVATE EMAIL',
    write_signal_aborted: {}, message: 'PRIVATE NETWORK DETAIL'}), {phase: 'write', http_status: null});
});
