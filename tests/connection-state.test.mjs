import {test} from 'node:test';
import assert from 'node:assert/strict';
import {connectionState} from '../extension/connection-state.mjs';

const ready = {vaultSaved: true, unlocked: true, bound: true, needsToolRefresh: false};
test('connection phases distinguish local unlock, source pairing, tunnel and app setup', () => {
  assert.equal(connectionState({...ready, unlocked: false, vaultSaved: false}).phase, 'unconfigured');
  assert.equal(connectionState({...ready, unlocked: false}).phase, 'locked');
  assert.equal(connectionState({...ready, bound: false}).phase, 'source_needed');
  assert.equal(connectionState(ready, {code: 'connecting'}).phase, 'connecting');
  assert.equal(connectionState({...ready, needsToolRefresh: true}, {code: 'polling'}).phase, 'app_setup');
  assert.equal(connectionState(ready, {code: 'polling'}).phase, 'ready');
});
test('fatal errors remain visible after credentials are cleared; arbitrary transport text is not rendered', () => {
  const failed = connectionState({...ready, unlocked: false}, {code: 'poll_http_401', stopped: true});
  assert.equal(failed.phase, 'attention'); assert.equal(failed.message, 'ui_068');
  assert.equal(connectionState({...ready, unlocked: false}, {code: 'invalid_poll_shape', stopped: true}).phase, 'attention');
  assert.ok(!connectionState(ready, {code: 'SECRET-UNTRUSTED-ERROR'}).message.includes('SECRET'));
  assert.equal(connectionState({...ready, unlocked: false}, {code: 'locked'}).phase, 'locked');
});
