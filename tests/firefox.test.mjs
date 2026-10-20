import {test} from 'node:test';
import assert from 'node:assert/strict';

test('Firefox uses browser promises and trusted-only session storage without Chrome API', async () => {
  const original = globalThis.browser;
  try {
    const session = {};
    globalThis.browser = {runtime: {getBrowserInfo: async () => ({name: 'Firefox'})}, storage: {session}};
    const platform = await import('../extension/platform.mjs?firefox-test');
    assert.equal(platform.api, globalThis.browser);
    let requested;
    globalThis.browser.permissions = {request: value => {requested = value; return Promise.resolve(true);}};
    const grant = platform.requestOpenAIAccess();
    assert.deepEqual(requested, {origins: ['https://api.openai.com/*']});
    assert.equal(await grant, true);
    await platform.restrictSession(); // Missing setAccessLevel is supported.
    let level;
    session.setAccessLevel = async value => {level = value;};
    await platform.restrictSession();
    assert.equal(level, 'TRUSTED_CONTEXTS');
    delete globalThis.browser.storage.session;
    await assert.rejects(platform.restrictSession(), /session_storage_required/);
  } finally {
    if (original === undefined) delete globalThis.browser;
    else globalThis.browser = original;
  }
});
