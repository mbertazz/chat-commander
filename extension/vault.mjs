import { validConfig } from './config.mjs';
const ITERATIONS = 600000;
const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
const bytes = value => Uint8Array.from(value.match(/../g) ?? [], b => Number.parseInt(b, 16));
const passwordOK = value => typeof value === 'string' && value.length >= 12 && value.length <= 256 && value.trim().length > 0;
export function validVault(v) {
    return v && v.version === 1 && v.kdf === 'PBKDF2-SHA256' && v.iterations === ITERATIONS &&
        typeof v.tunnelId === 'string' && validConfig({
        tunnelId: v.tunnelId, apiKey: 'check'
    }) &&
        typeof v.salt === 'string' && /^[a-f0-9]{32}$/.test(v.salt) &&
        typeof v.iv === 'string' && /^[a-f0-9]{24}$/.test(v.iv) &&
        typeof v.ciphertext === 'string' && /^[a-f0-9]{34,8224}$/.test(v.ciphertext) && v.ciphertext.length % 2 === 0;
}
async function derive(password, salt, crypto) {
    const raw = new TextEncoder().encode(password);
    try {
        const material = await crypto.subtle.importKey('raw', raw, 'PBKDF2', false, ['deriveKey']);
        return await crypto.subtle.deriveKey({
            name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256'
        }, material, {
            name: 'AES-GCM', length: 256
        }, false, ['encrypt', 'decrypt']);
    }
    finally {
        raw.fill(0);
    }
}
const aad = tunnelId => new TextEncoder().encode(JSON.stringify(['chat-commander-vault', 1, tunnelId]));
export async function sealConfig(config, password, crypto = globalThis.crypto) {
    if (!validConfig(config) || config.apiKey.length > 4096 || !passwordOK(password))
        throw new Error('vault_invalid_input');
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await derive(password, salt, crypto);
    const raw = new TextEncoder().encode(config.apiKey);
    try {
        const ciphertext = await crypto.subtle.encrypt({
            name: 'AES-GCM', iv, additionalData: aad(config.tunnelId), tagLength: 128
        }, key, raw);
        return {
            version: 1, kdf: 'PBKDF2-SHA256', iterations: ITERATIONS, salt: hex(salt), iv: hex(iv),
            ciphertext: hex(new Uint8Array(ciphertext)), tunnelId: config.tunnelId
        };
    }
    finally {
        raw.fill(0);
    }
}
export async function openConfig(vault, password, crypto = globalThis.crypto) {
    try {
        if (!validVault(vault) || !passwordOK(password))
            throw new Error();
        const key = await derive(password, bytes(vault.salt), crypto);
        const raw = new Uint8Array(await crypto.subtle.decrypt({
            name: 'AES-GCM', iv: bytes(vault.iv),
            additionalData: aad(vault.tunnelId), tagLength: 128
        }, key, bytes(vault.ciphertext)));
        try {
            const config = {
                tunnelId: vault.tunnelId, apiKey: new TextDecoder('utf-8', { fatal: true }).decode(raw)
            };
            if (!validConfig(config))
                throw new Error();
            return config;
        }
        finally {
            raw.fill(0);
        }
    }
    catch {
        throw new Error('vault_unlock_failed');
    }
}
