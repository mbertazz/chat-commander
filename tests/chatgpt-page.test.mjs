import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {chatgptPage} from '../extension/chatgpt-page.mjs';

async function invoke(operation, args, {origin = 'https://chatgpt.com', frame = false, fetcher = () => assert.fail('unexpected fetch'), deadline = Date.now() + 25000} = {}) {
  const context = vm.createContext({location: {origin}, crypto: webcrypto, fetch: fetcher,
    AbortSignal, Uint8Array, TextEncoder, TextDecoder, args: [operation, args, 'a'.repeat(64), deadline]});
  vm.runInContext(`globalThis.top = ${frame ? '{}' : 'globalThis'}`, context);
  return JSON.parse(JSON.stringify(await vm.runInContext(`(${chatgptPage.toString()})(...args)`, context)));
}
test('every operation refuses other origins and subframes before any network access', async () => {
  for (const operation of ['bind', 'list_chats', 'search_chats', 'get_chat', 'read_chat', 'rename_chat', 'set_chat_archived']) {
    assert.equal((await invoke(operation, {}, {origin: 'https://example.com'})).code, 'wrong_page');
    assert.equal((await invoke(operation, {}, {frame: true})).code, 'wrong_page');
  }
});
test('adapter accepts no arbitrary endpoints and never loads expired list/search sessions', async () => {
  assert.equal((await invoke('/backend-api/conversation/anything', {})).code, 'invalid_source_request');
  for (const operation of ['list_chats', 'search_chats']) {
    assert.equal((await invoke(operation, {limit: 5, query: 'test'}, {deadline: Date.now() - 1})).code, 'source_cancelled');
  }
});
test('shared session reader bounds streaming responses and rejects non-JSON without exposing response bodies', async () => {
  for (const response of [new Response('secret', {headers: {'content-type': 'text/html'}}),
    new Response('x'.repeat(262145), {headers: {'content-type': 'application/json'}}), new Response(null, {status: 401})]) {
    const result = await invoke('list_chats', {limit: 5}, {fetcher: async url => {
      assert.equal(url, '/api/auth/session'); return response;
    }});
    assert.equal(result.code, 'session_read_failed'); assert.equal(result.diagnostic.phase, 'session');
    assert.ok(!JSON.stringify(result).includes('secret'));
  }
});
