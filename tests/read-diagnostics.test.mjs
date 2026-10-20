import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readDiagnostic} from '../extension/read-diagnostics.mjs';
test('read diagnostics drop private fields and reject arbitrary classifications and out-of-bounds values', () => {
  const safe = {phase: 'list', http_status: 429, failure: 'http', elapsed_ms: 400};
  assert.deepEqual(readDiagnostic({...safe, url: 'private', message: 'private', body: 'private'}), safe);
  for (const bad of [null, {}, {...safe, phase: 'private'}, {...safe, failure: 'private'},
    {...safe, http_status: 1000}, {...safe, elapsed_ms: Infinity}, {...safe, elapsed_ms: -1}]) assert.equal(readDiagnostic(bad), null);
});
