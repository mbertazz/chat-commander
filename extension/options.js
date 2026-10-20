import { setupProgress } from './setup-progress.mjs';
import { translator, localizeDocument } from './i18n.mjs';
import { connectionState } from './connection-state.mjs';
import { api, OPENAI_ORIGIN, CHATGPT_ACCESS } from './platform.mjs';
const t = translator(api.i18n);
localizeDocument(document, api.i18n);
const $ = id => document.getElementById(id);
const send = message => api.runtime.sendMessage(message);
let state;
let transport;
let firstRender = true;
let activeStep;
let pairing = false;
$('version').textContent = t('ui_084', api.runtime.getManifest().version);
$('tunnel').value = (await api.storage.local.get('tunnelId')).tunnelId ?? '';
const access = () => api.permissions.request({
    origins: [...OPENAI_ORIGIN.origins, ...CHATGPT_ACCESS.origins], permissions: CHATGPT_ACCESS.permissions
});
function renderOverview() {
    if (!state)
        return;
    $('step-key').textContent = state.unlocked ? t('ui_033') : state.vaultSaved ? t('ui_034') : t('ui_035');
    $('step-source').textContent = state.bound ? t('ui_036') : t('ui_023');
    $('step-tools').textContent = !state.bound || state.needsToolRefresh ? t('ui_037') : t('ui_038');
    const view = connectionState(state, transport, t);
    const progress = setupProgress(state, transport);
    const targets = ['key-step', 'source-step', 'app-step'];
    if (activeStep !== progress.active) {
        targets.forEach((id, index) => { $(id).open = index + 1 === progress.active; });
        activeStep = progress.active;
    }
    targets.forEach((id, index) => { $(id).dataset.current = String(index + 1 === progress.active); });
    $('connect-source').disabled = !progress.canPair || pairing;
    $('source-tab').disabled = !progress.canPair || pairing;
    $('source-prerequisite').hidden = progress.canPair;
    $('app-prerequisite').hidden = progress.canAcknowledge;
    $('key-feedback').textContent = progress.keyDone ? state.bound ? t('ui_033') : t('setup_008') : '';
    const observed = state.appObservation;
    $('app-capabilities').textContent = state.serverInfo ? t('setup_capabilities', [state.serverInfo.version, String(state.serverInfo.limits.review_chats)]) : '';
    $('app-feedback').textContent = observed?.toolAt ? t('setup_tool_observed', [observed.tool, observed.toolAt])
        : observed?.catalogAt ? t('setup_catalog_observed', observed.catalogAt) : t('setup_waiting');
    $('app-status').textContent = progress.canAcknowledge && transport?.code !== 'polling' ? view.message : '';
    const next = progress.active === 1 ? t('setup_002') : progress.active === 2 ? t('setup_009') : t('setup_018');
    $('ready').textContent = t('setup_031', next);
    $('key-feedback').dataset.phase = view.phase;
    if (view.phase === 'attention')
        $(progress.active === 3 ? 'app-status' : 'key-feedback').textContent = view.message;
    $('ready').dataset.phase = view.phase;
}
async function refreshState() {
    const response = await send({ type: 'setupState' });
    if (!response?.ok)
        return;
    state = response.data;
    $('unlock').hidden = !state.vaultSaved || state.unlocked;
    $('saved-key').textContent = state.vaultSaved ? t('ui_039') : t('ui_040');
    $('tools-reminder').hidden = false;
    if (state.bound)
        $('source-message').textContent = '';
    if (!state.unlocked) {
        $('save-status').textContent = '';
        $('app-feedback').textContent = '';
    }
    const previous = $('source-tab').value;
    $('source-tab').replaceChildren();
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = t('ui_041');
    $('source-tab').append(placeholder);
    for (const tab of state.tabs) {
        const option = document.createElement('option');
        option.value = String(tab.id);
        option.textContent = tab.title;
        $('source-tab').append(option);
    }
    const selection = state.tabs.some(t => String(t.id) === previous) ? previous : String(state.sourceTabId ?? '');
    if (state.tabs.some(t => String(t.id) === selection))
        $('source-tab').value = selection;
    $('source-tab').hidden = state.tabs.length <= 1;
    $('source-tab-label').hidden = state.tabs.length <= 1;
    if (firstRender) {
        $('settings').open = !state.vaultSaved && !state.unlocked;
        $('automatic').checked = state.autoReconnect;
        firstRender = false;
    }
    renderOverview();
}
function renderTransport(value) {
    transport = value;
    $('status').textContent = value ? t('ui_085', [value.code, String(value.delivered ?? 0)]) : t('ui_042');
    renderOverview();
}
async function renderSourceState() {
    const { liveStatus } = await api.storage.session.get('liveStatus');
    const messages = {
        live_bound: t('ui_043'),
        source_identity_changed: t('ui_044'),
        source_workspace_unsupported: t('setup_personal_only'),
        source_reconnect_needed: t('ui_045'),
        source_tab_missing: t('ui_046'),
        source_permission_missing: t('ui_047'),
        source_identity_missing: t('ui_048'),
        source_document_changed: t('ui_049'),
        source_read_failed: t('ui_050'),
    };
    const selected = state?.tabs.find(tab => tab.id === state.sourceTabId);
    $('live-status').textContent = !state?.unlocked ? t('setup_012')
        : state.bound ? t('setup_014', selected?.title ?? 'ChatGPT')
            : !state.tabs.length ? t('setup_013')
                : messages[liveStatus?.code] ?? t('ui_051');
}
function vaultFields() {
    const remember = $('remember').checked;
    $('vault-fields').hidden = !remember;
    for (const id of ['vault-password', 'vault-confirm']) {
        $(id).required = remember;
        $(id).disabled = !remember;
    }
}
$('remember').addEventListener('change', vaultFields);
vaultFields();
async function pairSource() {
    await refreshState();
    const selected = $('source-tab').value;
    if (state.tabs.length > 1 && !selected) {
        $('source-message').textContent = t('ui_052');
        return;
    }
    if (!state.tabs.length) {
        $('source-message').textContent = t('ui_053');
        return;
    }
    const response = await send({
        type: 'connectSource', tabId: selected ? Number(selected) : state.tabs[0].id, automatic: $('automatic').checked
    });
    $('source-message').textContent = response?.ok ? t('ui_054') : t('ui_055');
    await refreshState();
    await renderSourceState();
}
$('connection').addEventListener('submit', async (event) => {
    event.preventDefault();
    const remember = $('remember').checked;
    if (remember && $('vault-password').value !== $('vault-confirm').value) {
        $('save-status').textContent = t('ui_056');
        return;
    }
    // Request permissions immediately from the user gesture, before any awaited work.
    const granted = api.permissions.request(OPENAI_ORIGIN);
    const message = {
        type: 'connect', config: {
            tunnelId: $('tunnel').value.trim(), apiKey: $('key').value.trim()
        },
        remember, password: remember ? $('vault-password').value : '', automatic: $('automatic').checked
    };
    $('save-status').textContent = t('setup_028');
    $('key').value = '';
    $('vault-password').value = '';
    $('vault-confirm').value = '';
    const button = event.submitter;
    if (button)
        button.disabled = true;
    try {
        if (!(await granted)) {
            $('save-status').textContent = t('ui_057');
            return;
        }
        const response = await send(message);
        if (!response?.ok) {
            $('save-status').textContent = t('ui_058');
            return;
        }
        $('save-status').textContent = remember ? t('ui_059') : t('ui_060');
        $('settings').open = false;
        await refreshState();
        await renderSourceState();
    }
    catch {
        $('save-status').textContent = t('ui_061');
    }
    finally {
        message.config.apiKey = '';
        message.password = '';
        if (button)
            button.disabled = false;
    }
});
$('unlock').addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = $('unlock-password').value;
    $('unlock-password').value = '';
    const button = event.submitter;
    if (button)
        button.disabled = true;
    $('unlock-status').textContent = t('setup_029');
    try {
        const response = await send({
            type: 'unlock', password
        });
        $('unlock-status').textContent = response?.ok ? '' : t('ui_062');
        await refreshState();
        await renderSourceState();
    }
    catch {
        $('unlock-status').textContent = t('ui_063');
    }
    finally {
        if (button)
            button.disabled = false;
    }
});
$('connect-source').addEventListener('click', async () => {
    if (pairing || !state?.unlocked)
        return;
    pairing = true;
    renderOverview();
    $('source-message').textContent = t('setup_016');
    try {
        if (!(await access())) {
            $('source-message').textContent = t('setup_015');
            return;
        }
        await pairSource();
    }
    catch {
        $('source-message').textContent = t('ui_064');
    }
    finally {
        pairing = false;
        renderOverview();
    }
});
$('open-chatgpt').addEventListener('click', () => { void api.tabs.create({ url: 'https://chatgpt.com/' }); });
$('automatic').addEventListener('change', async () => {
    try {
        const response = await send({
            type: 'setAutomatic', enabled: $('automatic').checked
        });
        if (!response?.ok)
            throw new Error();
        await refreshState();
    }
    catch {
        $('source-message').textContent = t('ui_065');
    }
});
for (const [id, type] of [['lock', 'lock'], ['disconnect', 'disconnect']]) {
    $(id).addEventListener('click', async () => {
        try {
            if (type === 'lock' || type === 'disconnect')
                for (const field of ['key', 'vault-password', 'vault-confirm', 'unlock-password'])
                    $(field).value = '';
            const response = await send({ type });
            if (!response?.ok)
                throw new Error();
            await refreshState();
            await renderSourceState();
            if (!state.unlocked && !state.vaultSaved)
                $('settings').open = true;
        }
        catch {
            $('manage-status').textContent = t('ui_066');
        }
    });
}
$('diagnose').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
        const response = await send({ type: 'diagnose' });
        $('diagnostic').textContent = response?.ok ? JSON.stringify(response.report, null, 2) : t('ui_067');
    }
    catch {
        $('diagnostic').textContent = t('ui_067');
    }
    finally {
        button.disabled = false;
    }
});
renderTransport((await api.storage.session.get('status')).status);
await refreshState();
await renderSourceState();
api.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && changes.status)
        renderTransport(changes.status.newValue);
    if ((area === 'session' && (changes.config || changes.liveSource || changes.liveStatus || changes.appObservation)) ||
        (area === 'local' && (changes.vault || changes.autoReconnect || changes.toolsVersion))) {
        void refreshState().then(renderSourceState).catch(() => { });
    }
});
// A newly opened ChatGPT tab may become available without a storage event.
globalThis.addEventListener?.('focus', () => { void refreshState().then(renderSourceState).catch(() => { }); });
$('check-contracts').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
        const response = await send({ type: 'checkContracts' });
        $('contract-report').textContent = response?.ok ? JSON.stringify(response.report, null, 2) : t('ui_067');
    }
    catch {
        $('contract-report').textContent = t('ui_067');
    }
    finally {
        button.disabled = false;
    }
});
