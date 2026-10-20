import {setupProgress} from './setup-progress.mjs';
import {translator, localizeDocument} from './i18n.mjs';
import {connectionState} from './connection-state.mjs';
import {api, OPENAI_ORIGIN, CHATGPT_ACCESS} from './platform.mjs';
const t = translator(api.i18n);
localizeDocument(document, api.i18n);
const $ = id => document.getElementById(id);
const send = message => api.runtime.sendMessage(message);
let state; let transport; let firstRender = true; let activeStep; let pairing = false;
$('version').textContent = t('Versione $1', api.runtime.getManifest().version);
$('tunnel').value = (await api.storage.local.get('tunnelId')).tunnelId ?? '';
const access = () => api.permissions.request({origins: [...OPENAI_ORIGIN.origins, ...CHATGPT_ACCESS.origins], permissions: CHATGPT_ACCESS.permissions});
function renderOverview() {
  if (!state) return;
  $('step-key').textContent = state.unlocked ? t('✓ Chiave disponibile') : state.vaultSaved ? t('Sblocca la chiave salvata') : t('Configura la chiave');
  $('step-source').textContent = state.bound ? t('✓ Account ChatGPT collegato') : t('Collega ChatGPT');
  $('step-tools').textContent = !state.bound || state.needsToolRefresh ? t('Verifica l’app in ChatGPT') : t('✓ App e tool configurati');
  const view = connectionState(state, transport, t);
  const progress = setupProgress(state, transport);
  const targets = ['key-step', 'source-step', 'app-step'];
  if (activeStep !== progress.active) {
    targets.forEach((id, index) => {$(id).open = index + 1 === progress.active;});
    activeStep = progress.active;
  }
  targets.forEach((id, index) => {$(id).dataset.current = String(index + 1 === progress.active);});
  $('connect-source').disabled = !progress.canPair || pairing;
  $('source-tab').disabled = !progress.canPair || pairing;
  $('tools-refreshed').disabled = !progress.canAcknowledge;
  $('source-prerequisite').hidden = progress.canPair;
  $('app-prerequisite').hidden = progress.canAcknowledge;
  $('tools-refreshed').hidden = !state.needsToolRefresh;
  $('key-feedback').textContent = progress.keyDone ? state.bound ? t('✓ Chiave disponibile') : t('Chiave pronta. Continua al passaggio 2: collega la scheda ChatGPT.') : '';
  $('app-status').textContent = progress.canAcknowledge && transport?.code !== 'polling' ? view.message : '';
  const next = progress.active === 1 ? t('Prepara la chiave di collegamento') : progress.active === 2 ? t('Collega la tua scheda ChatGPT') : t('Usa Chat Commander in ChatGPT');
  $('ready').textContent = t('Prossimo passo: $1', next);
  $('key-feedback').dataset.phase = view.phase;
  if (view.phase === 'attention') $(progress.active === 3 ? 'app-status' : 'key-feedback').textContent = view.message;
  $('ready').dataset.phase = view.phase;
}
async function refreshState() {
  const response = await send({type: 'setupState'});
  if (!response?.ok) return;
  state = response.data;
  $('unlock').hidden = !state.vaultSaved || state.unlocked;
  $('saved-key').textContent = state.vaultSaved ? t('Chiave salvata cifrata solo su questo dispositivo. Password non conservata.') : t('Nessuna chiave salvata su disco.');
  $('tools-reminder').hidden = false;
  if (state.bound) $('source-message').textContent = '';
  if (!state.unlocked) {$('save-status').textContent = ''; $('app-feedback').textContent = '';}
  const previous = $('source-tab').value;
  $('source-tab').replaceChildren();
  const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = t('Scegli una scheda…'); $('source-tab').append(placeholder);
  for (const tab of state.tabs) {
    const option = document.createElement('option'); option.value = String(tab.id); option.textContent = tab.title; $('source-tab').append(option);
  }
  const selection = state.tabs.some(t => String(t.id) === previous) ? previous : String(state.sourceTabId ?? '');
  if (state.tabs.some(t => String(t.id) === selection)) $('source-tab').value = selection;
  $('source-tab').hidden = state.tabs.length <= 1; $('source-tab-label').hidden = state.tabs.length <= 1;
  if (firstRender) {
    $('settings').open = !state.vaultSaved && !state.unlocked;
    $('automatic').checked = state.autoReconnect;
    firstRender = false;
  }
  renderOverview();
}
function renderTransport(value) {
  transport = value;
  $('status').textContent = value ? t('Stato: $1. Risposte accettate dal tunnel: $2.', [value.code, String(value.delivered ?? 0)]) : t('Disconnesso.');
  renderOverview();
}
async function renderSourceState() {
  const {liveStatus} = await api.storage.session.get('liveStatus');
  const messages = {
    live_bound: t('Account collegato. Puoi usare le operazioni dalla conversazione ChatGPT.'),
    source_identity_changed: t('Account diverso da quello associato. Se vuoi cambiarlo, collega esplicitamente la scheda corretta.'),
    source_reconnect_needed: t('Non riesco a ripristinare l’account associato. Controlla il login o collega la scheda desiderata.'),
    source_tab_missing: t('Apri una scheda ChatGPT e accedi al tuo account.'),
    source_permission_missing: t('Premi Collega ChatGPT e consenti l’accesso richiesto dal browser.'),
    source_identity_missing: t('Sessione ChatGPT non identificabile. Controlla il login.'),
    source_document_changed: t('La scheda è cambiata. Ricollegala.'),
    source_read_failed: t('Collegamento non riuscito. Controlla il login e riprova.'),
  };
  const selected = state?.tabs.find(tab => tab.id === state.sourceTabId);
  $('live-status').textContent = !state?.unlocked ? t('Prima completa il passaggio 1. Poi potrai scegliere e collegare una scheda.')
    : state.bound ? t('Scheda collegata: $1. Continua al passaggio 3.', selected?.title ?? 'ChatGPT')
    : !state.tabs.length ? t('Nessuna scheda disponibile. Apri ChatGPT qui sotto, accedi e torna a questa pagina.')
    : messages[liveStatus?.code] ?? t('Scegli la scheda del tuo ChatGPT personale.');
}
function vaultFields() {
  const remember = $('remember').checked;
  $('vault-fields').hidden = !remember;
  for (const id of ['vault-password', 'vault-confirm']) {$(id).required = remember; $(id).disabled = !remember;}
}
$('remember').addEventListener('change', vaultFields); vaultFields();
async function pairSource() {
  await refreshState();
  const selected = $('source-tab').value;
  if (state.tabs.length > 1 && !selected) {$('source-message').textContent = t('Scegli la scheda da collegare e premi Collega ChatGPT.'); return;}
  if (!state.tabs.length) {$('source-message').textContent = t('Apri ChatGPT, accedi e premi Collega ChatGPT.'); return;}
  const response = await send({type: 'connectSource', tabId: selected ? Number(selected) : state.tabs[0].id, automatic: $('automatic').checked});
  $('source-message').textContent = response?.ok ? t('Collegamento completato.') : t('Collegamento non riuscito: controlla la scheda e il login.');
  await refreshState(); await renderSourceState();
}
$('connection').addEventListener('submit', async event => {
  event.preventDefault();
  const remember = $('remember').checked;
  if (remember && $('vault-password').value !== $('vault-confirm').value) {$('save-status').textContent = t('Le password non coincidono.'); return;}
  // Request permissions immediately from the user gesture, before any awaited work.
  const granted = api.permissions.request(OPENAI_ORIGIN);
  const message = {type: 'connect', config: {tunnelId: $('tunnel').value.trim(), apiKey: $('key').value.trim()},
    remember, password: remember ? $('vault-password').value : '', automatic: $('automatic').checked};
  $('save-status').textContent = t('Salvataggio in corso… Il risultato apparirà qui.');
  $('key').value = ''; $('vault-password').value = ''; $('vault-confirm').value = '';
  const button = event.submitter; if (button) button.disabled = true;
  try {
    if (!(await granted)) {$('save-status').textContent = t('Permesso negato. Nessun collegamento configurato.'); return;}
    const response = await send(message);
    if (!response?.ok) {$('save-status').textContent = t('Configurazione non valida o salvataggio non riuscito. Controlla i campi.'); return;}
    $('save-status').textContent = remember ? t('Chiave cifrata e salvata.') : t('Collegamento attivo per questa sessione.');
    $('settings').open = false;
    await refreshState(); await renderSourceState();
  } catch {$('save-status').textContent = t('Estensione non disponibile. Riapri questa pagina.');}
  finally {message.config.apiKey = ''; message.password = ''; if (button) button.disabled = false;}
});
$('unlock').addEventListener('submit', async event => {
  event.preventDefault(); const password = $('unlock-password').value; $('unlock-password').value = '';
  const button = event.submitter; if (button) button.disabled = true;
  $('unlock-status').textContent = t('Sblocco in corso… Il risultato apparirà qui.');
  try {
    const response = await send({type: 'unlock', password});
    $('unlock-status').textContent = response?.ok ? '' : t('Password errata o chiave salvata non leggibile. Puoi sostituire la configurazione.');
    await refreshState(); await renderSourceState();
  } catch {$('unlock-status').textContent = t('Sblocco non disponibile. Riapri questa pagina.');}
  finally {if (button) button.disabled = false;}
});
$('connect-source').addEventListener('click', async () => {
  if (pairing || !state?.unlocked) return;
  pairing = true; renderOverview();
  $('source-message').textContent = t('Collegamento della scheda in corso… Il risultato apparirà qui.');
  try {
    if (!(await access())) {$('source-message').textContent = t('Permesso negato. Per collegare la scheda, premi di nuovo il pulsante e consenti l’accesso a chatgpt.com.'); return;}
    await pairSource();
  } catch {$('source-message').textContent = t('Collegamento non disponibile. Riprova.');}
  finally {pairing = false; renderOverview();}
});
$('open-chatgpt').addEventListener('click', () => {void api.tabs.create({url: 'https://chatgpt.com/'});});
$('automatic').addEventListener('change', async () => {
  try {const response = await send({type: 'setAutomatic', enabled: $('automatic').checked}); if (!response?.ok) throw new Error(); await refreshState();}
  catch {$('source-message').textContent = t('Preferenza non salvata. Riprova.');}
});
$('tools-refreshed').addEventListener('click', async () => {
  try {
    const response = await send({type: 'markToolsRefreshed'});
    if (!response?.ok) throw new Error();
    $('app-feedback').textContent = t('App segnata come configurata. Ora prova il messaggio in ChatGPT: questa conferma non è un test degli strumenti.');
    await refreshState();
  } catch {$('app-feedback').textContent = t('Operazione non confermata. Riapri le impostazioni.');}
});
for (const [id, type] of [['lock', 'lock'], ['disconnect', 'disconnect']]) {
  $(id).addEventListener('click', async () => {
    try {
      if (type === 'lock' || type === 'disconnect') for (const field of ['key', 'vault-password', 'vault-confirm', 'unlock-password']) $(field).value = '';
      const response = await send({type}); if (!response?.ok) throw new Error();
      await refreshState(); await renderSourceState();
      if (!state.unlocked && !state.vaultSaved) $('settings').open = true;
    }
    catch {$('manage-status').textContent = t('Operazione non confermata. Riapri le impostazioni.');}
  });
}
$('diagnose').addEventListener('click', async event => {
  const button = event.currentTarget; button.disabled = true;
  try {const response = await send({type: 'diagnose'}); $('diagnostic').textContent = response?.ok ? JSON.stringify(response.report, null, 2) : t('Verifica non disponibile.');}
  catch {$('diagnostic').textContent = t('Verifica non disponibile.');}
  finally {button.disabled = false;}
});
renderTransport((await api.storage.session.get('status')).status);
await refreshState(); await renderSourceState();
api.storage.onChanged.addListener((changes, area) => {
  if (area === 'session' && changes.status) renderTransport(changes.status.newValue);
  if ((area === 'session' && (changes.config || changes.liveSource || changes.liveStatus)) ||
      (area === 'local' && (changes.vault || changes.autoReconnect || changes.toolsVersion))) {
    void refreshState().then(renderSourceState).catch(() => {});
  }
});

// A newly opened ChatGPT tab may become available without a storage event.
globalThis.addEventListener?.('focus', () => {void refreshState().then(renderSourceState).catch(() => {});});
