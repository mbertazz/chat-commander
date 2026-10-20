import {test} from 'node:test';
import assert from 'node:assert/strict';
import {diagnose} from '../extension/diagnostics.mjs';

const config = {tunnelId: `tunnel_${'a'.repeat(32)}`, apiKey: 'synthetic-diagnostic-secret'};
test('diagnosis without host permission performs no requests', async () => {
  const report = await diagnose(config, {allowed: false, fetcher: () => assert.fail('unexpected request')});
  assert.deepEqual(report, {hostPermission: false});
});
test('diagnosis separates unauthenticated reachability from authenticated metadata without draining work', async () => {
  const calls = [];
  const report = await diagnose(config, {allowed: true, fetcher: async (url, options) => {
    calls.push({url, options});
    return new Response('private upstream data', {status: calls.length === 1 ? 401 : 403});
  }});
  assert.deepEqual(report, {hostPermission: true, openai: 'http_401', tunnel: 'http_403'});
  assert.equal(calls[0].options.headers, undefined);
  assert.equal(calls[1].options.headers.Authorization, `Bearer ${config.apiKey}`);
  assert.ok(calls.every(call => !call.url.includes('/poll') && !call.url.includes('/response')));
  assert.ok(!JSON.stringify(report).includes(config.apiKey));
  assert.ok(!JSON.stringify(report).includes(config.tunnelId));
});
test('network exceptions cannot leak secrets or arbitrary messages into diagnostic output', async () => {
  const report = await diagnose(config, {allowed: true, fetcher: async () => {
    throw new Error(`sensitive ${config.apiKey}`);
  }});
  assert.deepEqual(report, {hostPermission: true, openai: 'fetch_failed', tunnel: 'network_error'});
});
