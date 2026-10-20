import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {rpc as protocolRpc, envelope} from '../extension/protocol.mjs';
import {validConfig} from '../extension/config.mjs';
import {deadlineFor, retryDelay} from '../extension/transport-utils.mjs';
import {SERVER} from '../extension/server.mjs';
const rpc = request => protocolRpc(request, SERVER);
import {Tunnel} from '../extension/tunnel.mjs';

const config = {tunnelId: `tunnel_${'a'.repeat(32)}`, apiKey: 'test-only-not-a-real-key'};
const request = (method, params = {}) => ({jsonrpc: '2.0', id: 1, method, params});
const command = (overrides = {}) => ({command_type: 'jsonrpc', request_id: 'request-test', shard_token: 'shard-test',
  channel: 'main', jsonrpc: request('tools/call', {name: 'list_chats', arguments: {limit: 5}}), ...overrides});

test('real catalog discovery has no synthetic mode and protocol is independent of tools', () => {
  const tools = rpc(request('tools/list')).result.tools;
  assert.equal(tools.length, 18); assert.equal(new Set(tools.map(t => t.name)).size, tools.length);
  assert.equal(tools[0].annotations.readOnlyHint, true);
  assert.ok(!tools.some(tool => /SYNTHETIC/.test(tool.description)));
  assert.deepEqual(protocolRpc(request('tools/list')).result.tools, []);
  const init = rpc(request('initialize', {protocolVersion: 'unknown', capabilities: {}, clientInfo: {name: 'test'}}));
  assert.equal(init.result.protocolVersion, '2025-11-25');
  assert.deepEqual(init.result.capabilities, {tools: {listChanged: false}, resources: {}});
});
test('tool calls are validated against the catalog without reading a page in protocol', () => {
  for (const limit of [1, 3, 5, 20]) {
    assert.deepEqual(rpc(request('tools/call', {name: 'list_chats', arguments: {limit}})).result, {});
  }
});
test('reject invalid limits, extra arguments, methods and malformed JSON-RPC', () => {
  for (const limit of [undefined, null, '5', 0, -1, 51, 1.5]) {
    assert.equal(rpc(request('tools/call', {name: 'list_chats', arguments: {limit}})).error.code, -32602);
  }
  assert.equal(rpc(request('tools/call', {name: 'list_chats', arguments: {limit: 5, url: 'https://example.com'}})).error.code, -32602);
  assert.equal(rpc(request('delete_chat')).error.code, -32601);
  for (const value of [null, [], {method: 'ping'}, {...request('ping'), id: {}}]) assert.equal(rpc(value).error.code, -32600);
  assert.equal(rpc({jsonrpc: '2.0', method: 'notifications/initialized'}), null);
});
test('configuration cannot inject a host, path or bearer header', () => {
  assert.ok(validConfig(config));
  assert.ok(validConfig({...config, tunnelId: `tunnel_ab12_${'b'.repeat(32)}`}));
  for (const tunnelId of ['https://example.com', '../other', 'tunnel_x/response', '']) assert.ok(!validConfig({...config, tunnelId}));
  assert.ok(!validConfig({...config, apiKey: 'x\r\nInjected: yes'}));
});
test('wire correlation, notification ack, termination and unknown discriminator', () => {
  const body = envelope(command());
  assert.equal(body.request_id, 'request-test'); assert.equal(body.channel, 'main');
  assert.ok(!('shard_token' in body)); assert.equal(body.resp_json.id, 1);
  assert.equal(envelope(command({jsonrpc: {jsonrpc: '2.0', method: 'notifications/initialized'}})).resp_type, 'notify_ack');
  assert.equal(envelope(command({command_type: 'session_termination'})).resp_type, 'session_termination_response');
  assert.equal(envelope(command({command_type: 'future'})), null);
});
test('relative deadlines and malformed/overflow duration compatibility', () => {
  assert.equal(deadlineFor('15s', 100), 15100);
  assert.equal(deadlineFor('0s', 100), 100);
  for (const value of [null, 30, ' 1s', '1.5s', '-1s', '1d', '999999999999999999999999h']) assert.equal(deadlineFor(value, 100), Infinity);
  assert.equal(retryDelay('10', 0, 0, () => 0), 10000);
});
test('full in-process poll/call/response with exact correlation and fixed host', async () => {
  const calls = [];
  const tunnel = new Tunnel(config, {fetcher: async (url, options) => {
    calls.push({url, options});
    return calls.length === 1 ? Response.json({commands: [command()]}) : new Response(null, {status: 204});
  }});
  await tunnel.cycle();
  assert.equal(calls.length, 2);
  assert.ok(calls.every(c => c.url.startsWith(`https://api.openai.com/v1/tunnels/${config.tunnelId}/`)));
  assert.equal(calls[1].options.headers['X-Tunnel-Shard-Token'], 'shard-test');
  assert.equal(calls[1].options.credentials, 'omit');
  assert.equal(calls[1].options.redirect, 'error');
  assert.equal(JSON.parse(calls[1].options.body).resp_json.error.code, -32602);
});
test('browser fetch receives the global receiver for metadata, poll and response', async () => {
  const calls = [];
  const fetcher = async function(url) {
    // Browser Web APIs can reject an arbitrary object as their receiver;
    // Node fetch and arrow-function mocks do not expose this regression.
    if (this !== globalThis) throw new TypeError('Illegal invocation');
    calls.push(url);
    if (url.includes('/poll?')) return Response.json({commands: [command()]});
    return new Response(null, {status: 204});
  };
  const tunnel = new Tunnel(config, {fetcher});
  await tunnel.request('');
  await tunnel.cycle();
  assert.equal(calls.length, 3);
  assert.ok(calls[0].endsWith(config.tunnelId));
  assert.ok(calls[1].includes('/poll?'));
  assert.ok(calls[2].endsWith('/response'));
});
test('all commands handled even when poll batch exceeds requested limit', async () => {
  let posts = 0;
  const tunnel = new Tunnel(config, {fetcher: async (url) => {
    if (url.includes('/poll?')) return Response.json({commands: [command(), command({request_id: 'two'})]});
    posts++; return new Response(null, {status: 204});
  }});
  await tunnel.cycle(); assert.equal(posts, 2);
});
test('expired work does not post, 404 does not replay, transient upload preserves body', async () => {
  let posts = []; let attempt = 0;
  const tunnel = new Tunnel(config, {now: () => 100, wait: async () => {}, fetcher: async (url, options) => {
    if (url.includes('/poll?')) return Response.json({commands: [command({response_timeout: '0s'}), command()]});
    posts.push(options.body); return new Response(null, {status: attempt++ === 0 ? 503 : 404});
  }});
  await tunnel.cycle(); assert.equal(posts.length, 2); assert.equal(posts[0], posts[1]);
});
test('authentication failure stops run rather than retrying', async () => {
  let calls = 0; const states = [];
  const tunnel = new Tunnel(config, {status: async value => states.push(value), fetcher: async () => {
    calls++; return new Response(null, {status: 403});
  }});
  await tunnel.run(); assert.equal(calls, 1); assert.equal(states.at(-1).stopped, true);
});
test('stop cancels active fetch without another poll', async () => {
  const tunnel = new Tunnel(config, {fetcher: async (_, options) => new Promise((_, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('aborted')), {once: true});
    queueMicrotask(() => tunnel.stop());
  })});
  await tunnel.run(); assert.equal(tunnel.controller.signal.aborted, true);
});
test('manifest grants no permanent ChatGPT access, cookie access or native processes', async () => {
  const manifest = JSON.parse(await readFile(new URL('../extension/manifest.json', import.meta.url)));
  assert.deepEqual(manifest.permissions, ['storage', 'alarms']);
  assert.deepEqual(manifest.host_permissions, ['https://api.openai.com/*']);
  assert.deepEqual(manifest.optional_permissions, ['activeTab', 'scripting']);
  assert.deepEqual(manifest.optional_host_permissions, ['https://chatgpt.com/*']);
  assert.equal(manifest.content_scripts, undefined); assert.equal(manifest.externally_connectable, undefined);
});
