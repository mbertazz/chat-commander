export const api = globalThis.browser ?? globalThis.chrome;
export const OPENAI_ORIGIN = { origins: ['https://api.openai.com/*'] };
export const CHATGPT_ACCESS = {
    origins: ['https://chatgpt.com/*'], permissions: ['activeTab', 'scripting']
};
// Call directly from the submit gesture, before unrelated asynchronous work.
export function requestOpenAIAccess() {
    return api.permissions.request(OPENAI_ORIGIN);
}
export async function restrictSession() {
    // Firefox session storage is trusted-only by default. Older releases do not
    // expose setAccessLevel. Plaintext credentials remain session-only; the optional
    // persistent vault contains authenticated ciphertext, never a decryption key.
    if (!api.storage.session)
        throw new Error('session_storage_required');
    if (typeof api.storage.session.setAccessLevel === 'function') {
        const firefox = typeof api.runtime.getBrowserInfo === 'function';
        await api.storage.session.setAccessLevel(firefox ? 'TRUSTED_CONTEXTS' : { accessLevel: 'TRUSTED_CONTEXTS' });
    }
    if (typeof api.storage.local?.setAccessLevel === 'function') {
        const firefox = typeof api.runtime.getBrowserInfo === 'function';
        await api.storage.local.setAccessLevel(firefox ? 'TRUSTED_CONTEXTS' : { accessLevel: 'TRUSTED_CONTEXTS' });
    }
}
