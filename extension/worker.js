import { serverInfo } from './server-info.mjs';
import { checkSourceContracts } from './contract-checks.mjs';
import { sealConfig, openConfig, validVault } from './vault.mjs';
import { sourceTabs, bindSelected, restoreSource } from './connection.mjs';
import { api, restrictSession, OPENAI_ORIGIN, CHATGPT_ACCESS } from './platform.mjs';
import { Tunnel } from './tunnel.mjs';
import { validConfig } from './config.mjs';
import { diagnose } from './diagnostics.mjs';
import { liveDispatcher } from './live-source.mjs';
import { CATALOG_VERSION } from './build-info.mjs';
const dispatch = liveDispatcher(api, async (method, name) => {
    if (!['initialize', 'tools/list', 'tools/call'].includes(method))
        return;
    const { appObservation = {} } = await api.storage.session.get('appObservation');
    const at = new Date().toISOString();
    if (method === 'initialize')
        appObservation.initializedAt = at;
    if (method === 'tools/list')
        Object.assign(appObservation, {
            catalog: CATALOG_VERSION, catalogAt: at
        });
    if (method === 'tools/call')
        Object.assign(appObservation, {
            tool: name, toolAt: at
        });
    await api.storage.session.set({ appObservation });
});
let active;
let operations = Promise.resolve();
const serialize = operation => {
    const task = operations.then(operation);
    operations = task.catch(() => { });
    return task;
};
async function status(value) {
    if (value.stopped)
        await api.storage.session.remove('config');
    await api.storage.session.set({ status: {
            ...value, at: new Date().toISOString()
        } });
}
async function stop() {
    if (active) {
        active.tunnel.stop();
        await active.done;
        active = undefined;
    }
}
async function start() {
    if (active)
        return;
    const { config } = await api.storage.session.get('config');
    if (!validConfig(config))
        return;
    if (!(await api.permissions.contains(OPENAI_ORIGIN))) {
        await status({ code: 'host_permission_missing' });
        return;
    }
    const tunnel = new Tunnel(config, {
        status, dispatch
    });
    const record = { tunnel };
    active = record;
    record.done = tunnel.run().catch(() => status({
        code: 'transport_error', stopped: true
    })).finally(() => {
        if (active === record)
            active = undefined;
    });
}
async function resume() {
    const { config } = await api.storage.session.get('config');
    if (!validConfig(config))
        return;
    try {
        await restoreSource(api, () => dispatch.clearReviews());
    }
    catch {
        await api.storage.session.set({ liveStatus: { code: 'source_reconnect_needed' } });
    }
    await start();
}
async function connectSource(tab) {
    await stop();
    dispatch.clearReviews();
    await api.storage.session.remove(['liveSource', 'appObservation']);
    try {
        await bindSelected(api, tab);
    }
    catch (error) {
        const code = [
            'source_tab_unavailable', 'source_identity_missing', 'source_identity_changed',
            'source_permission_missing', 'source_workspace_unsupported', 'source_read_failed', 'source_document_changed', 'source_document_unavailable'
        ].includes(error.message)
            ? error.message : 'source_read_failed';
        await api.storage.session.set({ liveStatus: { code } });
    }
    await start();
}
async function setupState() {
    const { vault } = await api.storage.local.get('vault');
    const { config } = await api.storage.session.get('config');
    const { liveSource } = await api.storage.session.get('liveSource');
    const { autoReconnect } = await api.storage.local.get('autoReconnect');
    const { appObservation = {} } = await api.storage.session.get('appObservation');
    let tabs = [];
    try {
        tabs = (await sourceTabs(api)).map(t => ({
            id: t.id, title: typeof t.title === 'string' ? t.title.slice(0, 150) : 'ChatGPT'
        }));
    }
    catch { }
    return {
        vaultSaved: validVault(vault), unlocked: validConfig(config), bound: validConfig(config) && tabs.some(tab => tab.id === liveSource?.tabId), sourceTabId: Number.isInteger(liveSource?.tabId) ? liveSource.tabId : null,
        autoReconnect: autoReconnect !== false, needsToolRefresh: appObservation.catalog !== CATALOG_VERSION || !appObservation.toolAt, appObservation, serverInfo: serverInfo(), tabs
    };
}
async function setup() {
    await restrictSession();
    await api.storage.local.remove(['sourceMode', 'toolsVersion']);
    await api.storage.session.remove([
        'sourceProbeArmed', 'searchProbeArmed', 'liveBindArmed', 'sourceProbe', 'searchProbe'
    ]);
    if (!(await api.alarms.get('reconnect')))
        await api.alarms.create('reconnect', { periodInMinutes: 0.5 });
    await resume();
}
// Opening settings must not rebind the source or invalidate pending reviews.
api.action.onClicked.addListener(() => {
    void api.runtime.openOptionsPage().catch(() => { });
});
api.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === 'reconnect')
        void serialize(resume).catch(() => { });
});
api.tabs?.onUpdated?.addListener((tabId, change) => {
    if (change.status !== 'complete')
        return;
    void serialize(async () => {
        const { liveSource } = await api.storage.session.get('liveSource');
        if (liveSource?.tabId === tabId || !liveSource)
            await resume();
    }).catch(() => { });
});
api.tabs?.onRemoved?.addListener(tabId => {
    void serialize(async () => {
        const { liveSource } = await api.storage.session.get('liveSource');
        if (liveSource?.tabId === tabId) {
            dispatch.clearReviews();
            await api.storage.session.remove('liveSource');
            await api.storage.session.set({ liveStatus: { code: 'source_tab_missing' } });
            await resume();
        }
    }).catch(() => { });
});
api.permissions.onRemoved?.addListener(removed => {
    if (!(removed.origins ?? []).includes('https://chatgpt.com/*') && !(removed.permissions ?? []).some(p => ['activeTab', 'scripting'].includes(p)))
        return;
    void serialize(async () => {
        dispatch.clearReviews();
        await api.storage.session.remove('liveSource');
        await api.storage.local.set({ autoReconnect: false });
        await api.storage.session.set({ liveStatus: { code: 'source_permission_missing' } });
    }).catch(() => { });
});
api.runtime.onMessage.addListener((message, sender, reply) => {
    if (sender.id !== api.runtime.id || sender.url !== api.runtime.getURL('options.html'))
        return;
    if (message?.type === 'setAutomatic') {
        serialize(async () => {
            if (typeof message.enabled !== 'boolean')
                return { ok: false };
            await api.storage.local.set({ autoReconnect: message.enabled });
            if (message.enabled)
                await resume();
            return { ok: true };
        }).then(reply, () => reply({ ok: false }));
        return true;
    }
    if (message?.type === 'setupState') {
        serialize(setupState).then(data => reply({
            ok: true, data
        }), () => reply({ ok: false }));
        return true;
    }
    if (message?.type === 'connectSource') {
        serialize(async () => {
            if (!(await api.permissions.contains(CHATGPT_ACCESS)))
                return {
                    ok: false, code: 'source_permission_missing'
                };
            const tabs = await sourceTabs(api);
            const tab = Number.isInteger(message.tabId) ? tabs.find(t => t.id === message.tabId) : tabs.length === 1 ? tabs[0] : null;
            if (!tab)
                return {
                    ok: false, code: tabs.length ? 'source_choose_tab' : 'source_tab_missing'
                };
            await api.storage.local.set({ autoReconnect: message.automatic === true });
            await connectSource(tab);
            return { ok: Boolean((await api.storage.session.get('liveSource')).liveSource) };
        }).then(reply, () => reply({ ok: false }));
        return true;
    }
    if (message?.type === 'unlock') {
        serialize(async () => {
            const { vault } = await api.storage.local.get('vault');
            const config = await openConfig(vault, message.password);
            await stop();
            dispatch.clearReviews();
            await api.storage.session.set({ config });
            await status({ code: 'connecting' });
            await resume();
            return { ok: true };
        }).then(reply, () => reply({
            ok: false, code: 'vault_unlock_failed'
        }));
        return true;
    }
    if (message?.type === 'lock') {
        serialize(async () => {
            await stop();
            dispatch.clearReviews();
            await api.storage.session.remove(['config', 'liveSource', 'appObservation']);
            await api.storage.session.set({ liveStatus: { code: 'live_rebind_required' } });
            await status({ code: 'locked' });
        }).then(() => reply({ ok: true }), () => reply({ ok: false }));
        return true;
    }
    if (message?.type === 'checkContracts') {
        serialize(async () => {
            const { liveSource } = await api.storage.session.get('liveSource');
            return checkSourceContracts(api, liveSource);
        }).then(report => reply({
            ok: true, report
        }), () => reply({ ok: false }));
        return true;
    }
    if (message?.type === 'diagnose') {
        (async () => {
            const allowed = await api.permissions.contains(OPENAI_ORIGIN);
            const { config } = await api.storage.session.get('config');
            return diagnose(config, { allowed });
        })().then(report => reply({
            ok: true, report
        }), () => reply({ ok: false }));
        return true;
    }
    if (!['connect', 'disconnect'].includes(message?.type))
        return;
    serialize(async () => {
        let vault;
        if (message.type === 'connect') {
            if (!validConfig(message.config))
                throw new Error('invalid_config');
            if (message.remember === true)
                vault = await sealConfig(message.config, message.password);
        }
        await stop();
        dispatch.clearReviews();
        await api.storage.session.remove('config');
        if (message.type === 'disconnect') {
            dispatch.clearReviews(true);
            await api.storage.local.remove(['vault', 'trustedSourceHash', 'autoReconnect']);
            await api.storage.session.remove(['liveSource', 'appObservation']);
            await api.storage.session.set({ liveStatus: { code: 'live_rebind_required' } });
            await status({ code: 'disconnected' });
            return;
        }
        if (message.remember === true)
            await api.storage.local.set({ vault });
        else if (message.remember === false)
            await api.storage.local.remove('vault');
        if (typeof message.remember === 'boolean')
            await api.storage.local.set({ autoReconnect: message.automatic === true });
        await api.storage.session.set({ config: message.config });
        await api.storage.local.set({ tunnelId: message.config.tunnelId });
        await status({ code: 'connecting' });
        await resume();
    }).then(() => reply({ ok: true }), () => reply({ ok: false }));
    return true;
});
void serialize(setup);
