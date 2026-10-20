import { bindSource, identifySourceDocument } from './live-source.mjs';
import { CHATGPT_ACCESS } from './platform.mjs';
const hashOK = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const chatTab = tab => {
    try {
        return Number.isInteger(tab?.id) && tab.id >= 0 && !tab.incognito && new URL(tab.url).origin === 'https://chatgpt.com';
    }
    catch {
        return false;
    }
};
export async function sourceTabs(api) {
    if (!(await api.permissions.contains(CHATGPT_ACCESS)))
        return [];
    return (await api.tabs.query({ url: ['https://chatgpt.com/*'] })).filter(chatTab).slice(0, 20);
}
export async function bindSelected(api, tab, { automatic = false } = {}) {
    if (!chatTab(tab))
        throw new Error('source_tab_unavailable');
    const { trustedSourceHash } = await api.storage.local.get('trustedSourceHash');
    if (automatic && !hashOK(trustedSourceHash))
        throw new Error('source_manual_pairing_required');
    const source = await bindSource(api, tab);
    if (automatic && source.userHash !== trustedSourceHash)
        throw new Error('source_identity_changed');
    // Only an explicit user selection may establish or replace the trusted account.
    if (!automatic)
        await api.storage.local.set({ trustedSourceHash: source.userHash });
    await api.storage.session.set({
        liveSource: source, liveStatus: { code: 'live_bound' }
    });
    return source;
}
export async function restoreSource(api, invalidate = () => { }) {
    const { autoReconnect } = await api.storage.local.get('autoReconnect');
    if (autoReconnect !== true || !(await api.permissions.contains(CHATGPT_ACCESS)))
        return false;
    const { trustedSourceHash } = await api.storage.local.get('trustedSourceHash');
    if (!hashOK(trustedSourceHash))
        return false;
    const { liveSource } = await api.storage.session.get('liveSource');
    const tabs = await sourceTabs(api);
    const ordered = [...tabs].sort((a, b) => Number(b.id === liveSource?.tabId) - Number(a.id === liveSource?.tabId));
    if (liveSource && liveSource.userHash === trustedSourceHash) {
        const tab = tabs.find(t => t.id === liveSource.tabId);
        if (tab) {
            try {
                const frames = await api.scripting.executeScript({
                    target: {
                        tabId: tab.id, frameIds: [0]
                    }, world: 'ISOLATED', func: identifySourceDocument
                });
                if (frames?.length === 1 && frames[0].frameId === 0 && !frames[0].error && frames[0].result === liveSource.documentKey)
                    return true;
            }
            catch { }
        }
    }
    invalidate();
    await api.storage.session.remove('liveSource');
    // At most five candidate sessions per attempt; no silent switch to another account.
    for (const tab of ordered.slice(0, 5)) {
        if (tab.status && tab.status !== 'complete')
            continue;
        try {
            await bindSelected(api, tab, { automatic: true });
            return true;
        }
        catch { }
    }
    await api.storage.session.set({ liveStatus: { code: tabs.length ? 'source_reconnect_needed' : 'source_tab_missing' } });
    return false;
}
