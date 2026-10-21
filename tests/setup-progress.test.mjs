import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setupProgress} from '../extension/setup-progress.mjs';
const ready = {unlocked: true, bound: true, sourceConfirmed: true, needsToolRefresh: false};
test('setup starts at the first incomplete step and returns to key unlock after restart', () => {
  assert.equal(setupProgress({unlocked: false, bound: false}).active, 1);
  const key = setupProgress({...ready, bound: false});
  assert.equal(key.active, 2); assert.equal(key.canPair, true); assert.equal(key.canAcknowledge, false);
  assert.equal(setupProgress({...ready, needsToolRefresh: true}).active, 3);
  assert.equal(setupProgress(ready).appAcknowledged, true);
  const restarted = setupProgress({...ready, unlocked: false, bound: false});
  assert.equal(restarted.active, 1); assert.equal(restarted.canPair, false);
});
test('revoked source and invalid tunnel credentials route back to their own step without claiming success', () => {
  assert.equal(setupProgress({...ready, bound: false}).sourceDone, false);
  for (const code of ['poll_http_401', 'poll_http_403', 'poll_http_404', 'host_permission_missing']) {
    const view = setupProgress(ready, {code});
    assert.equal(view.active, 1); assert.equal(view.keyDone, false); assert.equal(view.canPair, false);
  }
});

test('automatic reconnection stays at tab review until the user continues', () => {
  const reconnected = setupProgress({...ready, sourceConfirmed: false});
  assert.equal(reconnected.active, 2);
  assert.equal(reconnected.sourceDone, false);
  assert.equal(reconnected.canAcknowledge, false);
  assert.equal(setupProgress(ready).active, 3);
});
