import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {translator, localizeDocument} from '../extension/i18n.mjs';
import {connectionState} from '../extension/connection-state.mjs';
const catalogs = {};
for (const locale of ['en', 'it']) catalogs[locale] = JSON.parse(await readFile(new URL(`../extension/_locales/${locale}/messages.json`, import.meta.url)));
function native(locale) {
  return {getUILanguage: () => locale, getMessage(key, values = []) {
    const message = (catalogs[locale] ?? catalogs.en)[key]?.message ?? catalogs.en[key]?.message ?? '';
    return message.replace(/\$(\d)/g, (_, n) => (Array.isArray(values) ? values : [values])[Number(n) - 1]);
  }};
}
test('native catalogs cover both locales, state messages and substitutions with English fallback', () => {
  assert.deepEqual(Object.keys(catalogs.it).sort(), Object.keys(catalogs.en).sort());
  for (const locale of ['it', 'en', 'fr']) {
    const t = translator(native(locale));
    assert.equal(t('Versione $1', '0.11.0'), locale === 'it' ? 'Versione 0.11.0' : 'Version 0.11.0');
    const state = connectionState({unlocked: true, bound: true, needsToolRefresh: false}, {code: 'polling'}, t);
    assert.match(state.message, locale === 'it' ? /Prova/ : /Try/);
    assert.ok(!connectionState({}, {code: 'UNTRUSTED'}, t).message.includes('UNTRUSTED'));
    assert.match(t('Stato: $1. Risposte accettate dal tunnel: $2.', ['polling', '12']), /polling.*12/);
  }
});
test('document localization uses textContent, sets language and preserves input values', async () => {
  const html = await readFile(new URL('../extension/options.html', import.meta.url), 'utf8');
  const nodes = [...html.matchAll(/data-i18n="([^"]+)"/g)].map(m => ({dataset: {i18n: m[1]}, textContent: ''}));
  for (const locale of ['it', 'en', 'de']) {
    const document = {documentElement: {}, querySelectorAll: selector => {
      assert.equal(selector, '[data-i18n]'); return nodes;
    }};
    localizeDocument(document, native(locale));
    assert.equal(document.documentElement.lang, locale === 'it' ? 'it' : 'en');
    for (const node of nodes) assert.ok(node.textContent.length > 0, node.dataset.i18n);
  }
  assert.ok(!/<(?:input|select)[^>]*data-i18n/.test(html));
  assert.ok(!/<title[^>]*>\s*<span/.test(html));
});
