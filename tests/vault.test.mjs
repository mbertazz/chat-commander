import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sealConfig, openConfig, validVault} from '../extension/vault.mjs';
const config = {tunnelId: `tunnel_${'a'.repeat(32)}`, apiKey: 'TEST-PRIVATE-API-KEY'};
const password = 'test-only long passphrase';
test('vault encrypts credentials with fresh salt/nonce and restores the exact configuration', async () => {
  const sealed = await sealConfig(config, password); const second = await sealConfig(config, password);
  assert.equal(validVault(sealed), true); assert.notEqual(sealed.salt, second.salt); assert.notEqual(sealed.iv, second.iv);
  assert.ok(!JSON.stringify(sealed).includes(config.apiKey)); assert.ok(!JSON.stringify(sealed).includes(password));
  assert.deepEqual(await openConfig(sealed, password), config);
});
test('wrong password, tampering and rebinding ciphertext to a different tunnel fail closed', async () => {
  const sealed = await sealConfig(config, password);
  await assert.rejects(openConfig(sealed, 'another test passphrase'), /^Error: vault_unlock_failed$/);
  const changed = {...sealed, ciphertext: (sealed.ciphertext[0] === '0' ? '1' : '0') + sealed.ciphertext.slice(1)};
  await assert.rejects(openConfig(changed, password), /vault_unlock_failed/);
  await assert.rejects(openConfig({...sealed, tunnelId: `tunnel_${'b'.repeat(32)}`}, password), /vault_unlock_failed/);
});
test('vault rejects weak passwords, invalid settings and attacker-controlled KDF costs', async () => {
  await assert.rejects(sealConfig(config, 'short'), /vault_invalid_input/);
  await assert.rejects(sealConfig({...config, tunnelId: '../other'}, password), /vault_invalid_input/);
  const sealed = await sealConfig(config, password);
  assert.equal(validVault({...sealed, iterations: 1}), false); assert.equal(validVault({...sealed, iterations: 999999999}), false);
  await assert.rejects(openConfig({...sealed, iterations: 1}, password), /vault_unlock_failed/);
});
