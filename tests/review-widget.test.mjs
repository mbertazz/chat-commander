import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {reviewWidget} from '../extension/review-widget.mjs';

const review_id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const token = 'b'.repeat(72);
const plan = (status = 'proposed') => ({review_id, revision: 1, status,
  changes: [{before_title: '<img src=x onerror=attack()>', after_title: 'New', action: 'rename_chat', reason: 'Reason', status: 'pending', url: `https://chatgpt.com/c/${review_id}`}], groups: [],
  counts: {applied: status === 'completed' ? 1 : 0, unchanged: 0, pending: status === 'proposed' ? 1 : 0, conflicts: 0, unknown: 0, failed: 0, skipped: 0}});
function widget(locale = 'it', legacyLocale) {
  const requests = []; const listeners = new Map(); const elements = new Map();
  function element() {return {children: [], events: new Map(), disabled: true, textContent: '',
    replaceChildren() {this.children = [];}, append(...nodes) {this.children.push(...nodes);},
    addEventListener(type, handler) {this.events.set(type, handler);}};}
  for (const id of ['output', 'status', 'apply', 'cancel', 'groups', 'counts', 'excluded', 'heading', 'instructions', 'excluded-label', 'groups-label']) elements.set(id, element());
  const parent = {postMessage: value => requests.push(value)};
  const documentElement = {lang: locale};
  const window = {parent, openai: legacyLocale ? {locale: legacyLocale} : undefined, addEventListener: (type, handler) => listeners.set(type, handler)};
  const context = vm.createContext({window, document: {documentElement, querySelector: s => elements.get(s.slice(1)), createElement: element},
    setTimeout: () => 1, clearTimeout: () => {}});
  vm.runInContext(`(${reviewWidget.toString()})()`, context);
  const send = data => listeners.get('message')({source: parent, data});
  const respond = (req, result) => send({jsonrpc: '2.0', id: req.id, result});
  const show = (data = plan()) => send({jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: {
    structuredContent: data, _meta: {reviewApproval: {review_id, revision: 1, approval_token: token}}}});
  return {requests, elements, send, respond, show, setLocale: value => {documentElement.lang = value; listeners.get('openai:set_globals')();}, foreign: data => listeners.get('message')({source: {}, data}),
    click: (id, isTrusted = true) => elements.get(id).events.get('click')({isTrusted})};
}
const turn = () => new Promise(resolve => setImmediate(resolve));
test('widget writes only on trusted explicit approval, uses hidden capability and renders titles as text', async () => {
  const w = widget(); assert.equal(w.requests[0].method, 'ui/initialize');
  w.show(); assert.equal(w.elements.get('apply').disabled, true);
  w.respond(w.requests[0], {}); await turn(); assert.equal(w.elements.get('apply').disabled, false);
  assert.ok(w.elements.get('output').children[0].children[0].textContent.startsWith('<img'));
  assert.equal(w.requests.filter(r => r.method === 'tools/call').length, 0);
  await w.click('apply', false); assert.equal(w.requests.filter(r => r.method === 'tools/call').length, 0);
  const applied = w.click('apply'); await turn();
  const req = w.requests.find(r => r.method === 'tools/call');
  assert.equal(req.params.name, 'apply_review_step'); assert.equal(req.params.arguments.approval_token, token);
  w.respond(req, {structuredContent: plan('completed')}); await turn();
  const message = w.requests.find(r => r.method === 'ui/message'); assert.ok(message); assert.ok(!JSON.stringify(message).includes(token));
  w.respond(message, {}); await applied; assert.equal(w.elements.get('apply').disabled, true);
});
test('widget recovers lost write response with read-only status and never retries mutation', async () => {
  const w = widget(); w.respond(w.requests[0], {}); w.show(); await turn();
  const applied = w.click('apply'); await turn(); const req = w.requests.find(r => r.method === 'tools/call');
  w.send({jsonrpc: '2.0', id: req.id, error: {code: -1}}); await turn();
  const read = w.requests.filter(r => r.method === 'tools/call').at(-1); assert.equal(read.params.name, 'get_review');
  w.respond(read, {structuredContent: plan('attention')}); await applied;
  assert.equal(w.requests.filter(r => r.params?.name === 'apply_review_step').length, 1);
  assert.equal(w.elements.get('apply').disabled, true);
});
test('widget rejects cross-frame messages and fails closed when no private confirmation metadata exists', async () => {
  const w = widget(); w.respond(w.requests[0], {}); await turn();
  w.foreign({jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: {structuredContent: plan(), _meta: {reviewApproval: {review_id, revision: 1, approval_token: token}}}});
  assert.equal(w.elements.get('apply').disabled, true);
  w.send({jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: {structuredContent: plan()}});
  assert.equal(w.elements.get('apply').disabled, true); await w.click('apply');
  assert.equal(w.requests.filter(r => r.method === 'tools/call').length, 0);
});

test('workspace cards distinguish creation, exact move destination and irreversible deletion without any automatic write', async () => {
  const w = widget(); w.respond(w.requests[0], {}); await turn();
  for (const [action, text] of [['create_project', 'Crea progetto'], ['move_chat', 'Sposta:'], ['delete_chat', 'ELIMINA DEFINITIVAMENTE']]) {
    const data = plan(); data.changes[0].action = action;
    data.changes[0].destination_name = '<unsafe project name>'; data.changes[0].destination_id = `g-p-${'1'.repeat(32)}`;
    w.show(data);
    assert.ok(w.elements.get('output').children[0].children[1].textContent.includes(text));
    assert.equal(w.requests.filter(r => r.method === 'tools/call').length, 0);
  }
  assert.match(w.elements.get('apply').textContent, /Elimina definitivamente/);
  assert.equal(w.elements.get('apply').className, 'danger');
});

test('approval shows immediate progress and stale previews cannot reenable or resubmit a completed operation', async () => {
  const w = widget(); w.respond(w.requests[0], {}); w.show(); await turn();
  const applied = w.click('apply');
  assert.equal(w.elements.get('apply').disabled, true);
  assert.match(w.elements.get('apply').textContent, /in corso/);
  assert.match(w.elements.get('status').textContent, /Conferma ricevuta/);
  assert.match(w.elements.get('output').children[0].children[3].textContent, /Confermata/);
  w.show();
  assert.match(w.elements.get('status').textContent, /in corso/);
  await w.click('apply');
  const req = w.requests.find(r => r.params?.name === 'apply_review_step');
  w.respond(req, {structuredContent: plan('completed')}); await turn();
  assert.match(w.elements.get('status').textContent, /concluse/);
  w.show();
  assert.match(w.elements.get('status').textContent, /concluse/);
  assert.equal(w.elements.get('apply').disabled, true);
  const message = w.requests.find(r => r.method === 'ui/message');
  w.respond(message, {}); await applied;
  w.show(); await w.click('apply');
  assert.equal(w.elements.get('apply').disabled, true);
  assert.equal(w.requests.filter(r => r.params?.name === 'apply_review_step').length, 1);
});

test('widget localizes labels, counts and exclusions from host locale; missing/unsupported locales fall back to English', async () => {
  for (const locale of ['en-US', 'it-IT', '', 'fr-FR']) {
    const w = widget(locale); w.respond(w.requests[0], {}); await turn();
    const data = plan(); data.excluded_chats = [{title: '<b>Control</b>'}];
    data.chats = [{id: data.changes[0].id, reading: 'complete', non_text_content: true}];
    w.show(data);
    const italian = locale === 'it-IT';
    assert.equal(w.elements.get('heading').textContent, italian ? 'Conferma operazioni' : 'Confirm changes');
    assert.equal(w.elements.get('cancel').textContent, italian ? 'Annulla le operazioni restanti' : 'Cancel remaining operations');
    assert.match(w.elements.get('counts').textContent, italian ? /in attesa/ : /pending/);
    assert.match(w.elements.get('excluded').children[0].textContent, italian ? /esclusa/ : /excluded/);
    assert.ok(w.elements.get('excluded').children[0].textContent.startsWith('<b>Control</b>'));
    assert.equal(w.requests.filter(r => r.method === 'tools/call').length, 0);
  }
  const legacy = widget('', 'it-IT');
  assert.equal(legacy.elements.get('heading').textContent, 'Conferma operazioni');
});
test('English deletion warning remains explicit and locale hydration cannot resubmit an approved revision', async () => {
  const w = widget('en'); w.respond(w.requests[0], {}); await turn();
  const data = plan(); data.changes[0].action = 'delete_chat'; w.show(data);
  assert.match(w.elements.get('output').children[0].children[1].textContent, /PERMANENTLY DELETE.*cannot restore/);
  assert.equal(w.elements.get('apply').textContent, 'Permanently delete this chat');
  const applied = w.click('apply'); await turn();
  w.setLocale('it-IT');
  assert.equal(w.elements.get('apply').disabled, true);
  assert.match(w.elements.get('apply').textContent, /in corso/);
  await w.click('apply');
  const req = w.requests.find(r => r.params?.name === 'apply_review_step');
  w.respond(req, {structuredContent: plan('completed')}); await turn();
  w.setLocale('en-US'); w.show(data); await w.click('apply');
  assert.equal(w.elements.get('apply').disabled, true);
  assert.equal(w.elements.get('apply').textContent, 'Operation completed');
  assert.equal(w.requests.filter(r => r.params?.name === 'apply_review_step').length, 1);
  const message = w.requests.find(r => r.method === 'ui/message');
  assert.ok(!JSON.stringify(message).includes(token)); w.respond(message, {}); await applied;
});
