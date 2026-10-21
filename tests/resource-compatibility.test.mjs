import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SERVER} from '../extension/server.mjs';
import {rpc} from '../extension/protocol.mjs';
import {liveDispatcher} from '../extension/live-source.mjs';
import {REVIEW_URI} from '../extension/review.mjs';
import {VERSION} from '../extension/build-info.mjs';
const legacy = 'ui://chat-commander/review-v7.html';
const request = uri => ({jsonrpc:'2.0',id:1,method:'resources/read',params:{uri}});

test('current and previous review URIs serve the same current guarded component using the requested URI', () => {
  for (const uri of [REVIEW_URI, legacy]) {
    assert.ok(SERVER.resources.some(r => r.uri === uri));
    const resource = rpc(request(uri), SERVER).result.contents[0];
    assert.equal(resource.uri, uri);
    assert.equal(resource.mimeType, 'text/html;profile=mcp-app');
    assert.ok(resource.text.includes('id="expiry"'));
    assert.ok(resource.text.includes(`Chat Commander component ${VERSION}`));
    assert.ok(resource.text.includes('approval_token'));
    assert.ok(resource.text.includes('hasExpired()'));
    new Function(resource.text.match(/<script>([\s\S]*)<\/script>/)[1]);
  }
  for (const uri of ['ui://chat-commander/review-v70.html', 'https://private.invalid', legacy+'?private=token']) {
    assert.equal(rpc(request(uri), SERVER).error.code, -32602);
  }
});

test('resource diagnostics record success and rejection without accessing chat sessions or retaining arbitrary URIs', async () => {
  const observations = [];
  const dispatch = liveDispatcher({storage:{session:{get:async () => assert.fail('must not read chat binding')}}},
    async (...args) => observations.push(args));
  for (const uri of [legacy, 'PRIVATE URL token']) {
    const response = await dispatch({command_type:'jsonrpc',request_id:'resource-test',shard_token:'shard',jsonrpc:request(uri)});
    const observation = observations.at(-1);
    assert.equal(observation[0], 'resources/read');
    assert.equal(observation[2].version, VERSION);
    assert.equal(observation[2].served, uri === legacy);
    assert.equal(observation[2].resource, uri === legacy ? legacy : 'unknown');
    assert.ok(!JSON.stringify(observation).includes('PRIVATE'));
    assert.equal(Boolean(response.resp_json.result), uri === legacy);
  }
});

test('failed resource observation never blocks HTML delivery', async () => {
  const dispatch = liveDispatcher({}, async () => { throw new Error('observation unavailable'); });
  const response = await dispatch({command_type:'jsonrpc',request_id:'resource-test',shard_token:'shard',jsonrpc:request(legacy)});
  assert.equal(response.resp_json.result.contents[0].uri, legacy);
});
