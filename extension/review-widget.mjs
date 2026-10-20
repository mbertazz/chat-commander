// Runs only inside ChatGPT's sandboxed component, never in the source chat page.
export function reviewWidget() {
  const output = document.querySelector('#output');
  const status = document.querySelector('#status');
  const apply = document.querySelector('#apply');
  const cancel = document.querySelector('#cancel');
  const submitted = new Set();
  const key = data => `${data?.review_id}:${data?.revision}`;
  const terminal = state => ['completed', 'attention', 'cancelled'].includes(state);
  const pending = new Map(); let sequence = 0; let preview; let capability; let running = false; let initialized = false;
  // Host-provided locale only; never infer language from untrusted chat text.
  const english = {
    "Operazione conclusa": "Operation completed",
    "Operazione in corso…": "Operation in progress…",
    "Conferma già inviata": "Confirmation already sent",
    "Elimina definitivamente questa chat": "Permanently delete this chat",
    "Confermo e applico queste modifiche": "Confirm and apply these changes",
    "Proposta pronta: nessuna modifica ancora applicata.": "Proposal ready: no changes applied yet.",
    "Lettura in corso.": "Reading in progress.",
    "Conferma ricevuta. Operazione e verifica in corso… Attendi senza premere di nuovo.": "Confirmation received. Applying and verifying… Please wait without clicking again.",
    "Operazioni concluse.": "Operations completed.",
    "Operazioni interrotte: controlla gli esiti.": "Operations stopped: check the results.",
    "Revisione annullata. Le modifiche già eseguite restano valide.": "Review cancelled. Changes already made remain applied.",
    "Stato non disponibile.": "Status unavailable.",
    "Archivia questa conversazione": "Archive this conversation",
    "Nessun progetto": "No project",
    "ELIMINA DEFINITIVAMENTE questa conversazione. Non potrai ripristinarla.": "PERMANENTLY DELETE this conversation. You cannot restore it.",
    "Operazione non riconosciuta: non confermare.": "Unrecognized operation: do not confirm.",
    "In attesa di conferma": "Awaiting confirmation",
    "In corso": "In progress",
    "Applicata e verificata": "Applied and verified",
    "Già nello stato richiesto": "Already in the requested state",
    "Stato cambiato: non applicata": "State changed: not applied",
    "Esito incerto: verificare la chat": "Outcome uncertain: check the chat",
    "Verifica preliminare fallita": "Precondition check failed",
    "Non eseguita": "Not executed",
    "testo letto interamente": "text fully read",
    "lettura parziale": "partially read",
    "non letta": "unread",
    "lettura fallita": "read failed",
    "Confermata, in attesa di esecuzione": "Confirmed, waiting to execute",
    "Stato da verificare": "State needs checking",
    "copertura non verificata": "read coverage not verified",
    " · allegati non interpretati": " · attachments not interpreted",
    "Connessione interrotta o revisione non disponibile. Controlla gli esiti con Chat Commander prima di riprovare.": "Connection interrupted or review unavailable. Check the results with Chat Commander before trying again.",
    "Annullamento non confermato. Una richiesta già inviata può completarsi: verifica gli esiti.": "Cancellation not confirmed. An already submitted request may complete: check the results.",
    "Conferma integrata non disponibile: nessuna modifica avviata. Chiedi a Chat Commander il resoconto.": "Integrated confirmation unavailable: no changes started. Ask Chat Commander for the report.",
    "Conferma operazioni": "Confirm changes",
    "Controlla le modifiche prima di confermare. Per cambiare o annullare la proposta, scrivilo a ChatGPT prima di confermare.": "Review the changes before confirming. To change or cancel the proposal, tell ChatGPT before confirming.",
    "Caricamento della proposta…": "Loading proposal…",
    "Chat escluse dalla proposta:": "Chats excluded from this proposal:",
    "Gruppi suggeriti (nessuno spostamento)": "Suggested groups (no chats moved)",
    "Annulla le operazioni restanti": "Cancel remaining operations",
    "Conferma revisione Chat Commander": "Chat Commander review confirmation",
    "Rinomina → {title}": "Rename → {title}",
    "Crea progetto → {title}": "Create project → {title}",
    "Sposta: {origin} → {destination}{id}": "Move: {origin} → {destination}{id}",
    "{title} — esclusa perché aperta nella scheda collegata": "{title} — excluded because it is open in the connected tab",
    "{applied} applicate, {unchanged} già corrette, {pending} in attesa, {conflicts} conflitti, {unknown} esiti incerti, {failed} fallite, {skipped} non eseguite.": "{applied} applied, {unchanged} already correct, {pending} pending, {conflicts} conflicts, {unknown} uncertain, {failed} failed, {skipped} not executed.",
    "Chat Commander: revisione {review}, stato {status}. {applied} modifiche applicate, {unchanged} già corrette, {conflicts} conflitti, {unknown} esiti incerti, {failed} fallite, {skipped} non eseguite. Usa get_review per il resoconto preciso.": "Chat Commander: review {review}, status {status}. {applied} changes applied, {unchanged} already correct, {conflicts} conflicts, {unknown} uncertain outcomes, {failed} failed, {skipped} not executed. Use get_review for the exact report."
};
  const resolveLanguage = () => {
    const locale = document.documentElement?.lang || window.openai?.locale || 'en';
    return typeof locale === 'string' && /^it(?:-|$)/i.test(locale) ? 'it' : 'en';
  };
  let language = resolveLanguage();
  const t = (source, values = {}) => (language === 'it' ? source : english[source] ?? source)
    .replace(/\{([a-z_]+)\}/g, (match, key) => Object.hasOwn(values, key) ? String(values[key]) : match);
  function localizeLabels() {
    const labels = {'#heading': 'Conferma operazioni', '#instructions': 'Controlla le modifiche prima di confermare. Per cambiare o annullare la proposta, scrivilo a ChatGPT prima di confermare.',
      '#excluded-label': 'Chat escluse dalla proposta:', '#groups-label': 'Gruppi suggeriti (nessuno spostamento)', '#cancel': 'Annulla le operazioni restanti'};
    for (const [selector, text] of Object.entries(labels)) document.querySelector(selector).textContent = t(text);
    document.title = t('Conferma revisione Chat Commander');
    if (document.body) document.body.lang = language;
    if (!preview) status.textContent = t('Caricamento della proposta…');
    controls();
  }
  function refreshLanguage() {
    const next = resolveLanguage();
    if (next === language) return;
    language = next; localizeLabels(); if (preview) render(preview);
  }
  function request(method, params) {
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {pending.delete(id); reject(new Error('timeout'));}, 45000);
      pending.set(id, {resolve: v => {clearTimeout(timer); resolve(v);}, reject: e => {clearTimeout(timer); reject(e);}});
      window.parent.postMessage({jsonrpc: '2.0', id, method, params}, '*');
    });
  }
  function controls() {
    apply.disabled = !initialized || running || submitted.has(key(preview)) || !capability?.approval_token || capability.review_id !== preview?.review_id || capability.revision !== preview?.revision || !preview?.changes?.length || preview.status !== 'proposed';
    const deleting = preview?.changes?.some(c => c.action === 'delete_chat');
    apply.textContent = preview?.status === 'completed' ? t('Operazione conclusa')
      : running ? t('Operazione in corso…') : submitted.has(key(preview)) ? t('Conferma già inviata')
      : deleting ? t('Elimina definitivamente questa chat') : t('Confermo e applico queste modifiche');
    apply.className = deleting ? 'danger' : '';
    cancel.disabled = !preview || ['cancelled', 'completed', 'attention'].includes(preview.status);
  }
  function render(data) {
    if (!data || typeof data.review_id !== 'string' || !Array.isArray(data.changes)) return;
    // Late host hydration must not restore an already approved proposal.
    if (submitted.has(key(data)) && (data.status === 'proposed' ||
        (key(data) === key(preview) && terminal(preview?.status) && !terminal(data.status)))) return;
    preview = data; output.replaceChildren();
    const states = {proposed: t('Proposta pronta: nessuna modifica ancora applicata.'), reading: t('Lettura in corso.'),
      applying: t('Conferma ricevuta. Operazione e verifica in corso… Attendi senza premere di nuovo.'), completed: t('Operazioni concluse.'), attention: t('Operazioni interrotte: controlla gli esiti.'), cancelled: t('Revisione annullata. Le modifiche già eseguite restano valide.')};
    status.textContent = states[data.status] ?? t('Stato non disponibile.');
    for (const change of data.changes) {
      const row = document.createElement('li'); const link = document.createElement('a');
      link.textContent = change.before_title; // Never insert chat-provided HTML.
      if (/^https:\/\/chatgpt\.com\/c\/[a-f0-9-]{36}$/i.test(change.url)) {link.href = change.url; link.target = '_blank'; link.rel = 'noopener noreferrer';}
      const detail = document.createElement('p');
      const descriptions = {rename_chat: t('Rinomina → {title}', {title: change.after_title}), set_chat_archived: t('Archivia questa conversazione'),
        create_project: t('Crea progetto → {title}', {title: change.before_title}), move_chat: t('Sposta: {origin} → {destination}{id}', {origin: change.origin_name ?? t('Nessun progetto'), destination: change.destination_name, id: change.destination_id ? ` (${change.destination_id})` : ''}),
        delete_chat: t('ELIMINA DEFINITIVAMENTE questa conversazione. Non potrai ripristinarla.')};
      detail.textContent = descriptions[change.action] ?? t('Operazione non riconosciuta: non confermare.');
      const reason = document.createElement('p'); reason.textContent = change.reason;
      const state = document.createElement('small');
      const names = {pending: t('In attesa di conferma'), running: t('In corso'), applied: t('Applicata e verificata'), unchanged: t('Già nello stato richiesto'),
        conflict: t('Stato cambiato: non applicata'), unknown: t('Esito incerto: verificare la chat'), failed: t('Verifica preliminare fallita'), skipped: t('Non eseguita')};
      const chat = data.chats?.find(c => c.id === change.id);
      const coverage = {complete: t('testo letto interamente'), partial: t('lettura parziale'), unread: t('non letta'), failed: t('lettura fallita')};
      state.textContent = (data.status === 'applying' && change.status === 'pending' ? t('Confermata, in attesa di esecuzione') : names[change.status] ?? t('Stato da verificare')) +
        (chat ? ` · ${coverage[chat.reading] ?? t('copertura non verificata')}${chat.non_text_content ? t(' · allegati non interpretati') : ''}` : '');
      row.append(link, detail, reason, state); output.append(row);
    }
    const excluded = document.querySelector('#excluded'); excluded.replaceChildren();
    for (const chat of data.excluded_chats ?? []) {
      const item = document.createElement('li'); item.textContent = t('{title} — esclusa perché aperta nella scheda collegata', {title: chat.title}); excluded.append(item);
    }
    const groups = document.querySelector('#groups'); groups.replaceChildren();
    for (const group of data.groups ?? []) {
      const item = document.createElement('li');
      const titles = group.ids.map(id => data.chats?.find(c => c.id === id)?.title ?? 'Chat').join('; ');
      item.textContent = `${group.label}: ${titles} — ${group.reason}`; groups.append(item);
    }
    const counts = data.counts;
    document.querySelector('#counts').textContent = counts ? t('{applied} applicate, {unchanged} già corrette, {pending} in attesa, {conflicts} conflitti, {unknown} esiti incerti, {failed} fallite, {skipped} non eseguite.', counts) : '';
    controls();
    try {window.openai?.notifyIntrinsicHeight?.(document.documentElement.scrollHeight);} catch {}
  }
  function receiveResult(result) {
    if (!result || typeof result !== 'object') return;
    if (result._meta?.reviewApproval) capability = result._meta.reviewApproval;
    if (result.structuredContent?.review_id) render(result.structuredContent);
  }
  async function call(name, args) {
    const result = await request('tools/call', {name, arguments: args});
    if (result?.isError) throw new Error('tool_error');
    receiveResult(result); return result?.structuredContent;
  }
  async function reportToChat(data) {
    if (!data?.counts) return;
    const c = data.counts;
    try {await request('ui/message', {role: 'user', content: [{type: 'text', text:
      t('Chat Commander: revisione {review}, stato {status}. {applied} modifiche applicate, {unchanged} già corrette, {conflicts} conflitti, {unknown} esiti incerti, {failed} fallite, {skipped} non eseguite. Usa get_review per il resoconto preciso.', {...c, review: data.review_id, status: data.status})}]});} catch {}
  }
  apply.addEventListener('click', async event => {
    if (!event.isTrusted || !initialized || running || submitted.has(key(preview)) || !capability?.approval_token || preview?.status !== 'proposed' ||
        capability.review_id !== preview.review_id || capability.revision !== preview.revision) return;
    // Approval is for this exact immutable revision; tokens never enter model-visible messages.
    const approved = {...capability}; submitted.add(key(preview)); running = true;
    render({...preview, status: 'applying'}); let last = preview;
    try {
      for (let i = 0; i < 40; i++) {
        last = await call('apply_review_step', approved);
        if (!last || last.review_id !== approved.review_id || last.revision !== approved.revision) throw new Error();
        if (['completed', 'attention', 'cancelled'].includes(last.status)) break;
      }
      if (!['completed', 'attention', 'cancelled'].includes(last.status)) throw new Error();
      await reportToChat(last);
    } catch {
      // Never retry a write after a lost response. Only recover the read-only report.
      try {last = await call('get_review', {review_id: approved.review_id});} catch {}
      status.textContent = t('Connessione interrotta o revisione non disponibile. Controlla gli esiti con Chat Commander prima di riprovare.');
      capability = null;
    } finally {running = false; controls();}
  });
  cancel.addEventListener('click', async event => {
    if (!event.isTrusted || !preview) return;
    cancel.disabled = true;
    try {await call('cancel_review', {review_id: preview.review_id}); capability = null;}
    catch {status.textContent = t('Annullamento non confermato. Una richiesta già inviata può completarsi: verifica gli esiti.');}
    controls();
  });
  window.addEventListener('message', event => {
    if (event.source !== window.parent || !event.data || event.data.jsonrpc !== '2.0') return;
    const m = event.data;
    if (m.id !== undefined && pending.has(m.id)) {
      const waiter = pending.get(m.id); pending.delete(m.id); m.error ? waiter.reject(m.error) : waiter.resolve(m.result); return;
    }
    if (m.method === 'ui/notifications/tool-result') receiveResult(m.params);
    if (m.method === 'ui/notifications/tool-cancelled') {capability = null; controls();}
  });
  // Compatibility with ChatGPT hosts that hydrate globals before bridge notifications.
  function hydrate() {
    refreshLanguage();
    const meta = window.openai?.toolResponseMetadata;
    receiveResult(meta?.mcp_tool_result ?? meta?.call_tool_result ?? meta);
    if (window.openai?.toolOutput?.review_id) render(window.openai.toolOutput);
  }
  window.addEventListener('openai:set_globals', hydrate);
  void request('ui/initialize', {appInfo: {name: 'Chat Commander review', version: '0.12.1'}, appCapabilities: {}, protocolVersion: '2026-01-26'})
    .then(() => {initialized = true; window.parent.postMessage({jsonrpc: '2.0', method: 'ui/notifications/initialized'}, '*'); hydrate(); controls();})
    .catch(() => {status.textContent = t('Conferma integrata non disponibile: nessuna modifica avviata. Chiedi a Chat Commander il resoconto.'); apply.disabled = true;});
  localizeLabels();
  if (typeof MutationObserver === 'function' && document.documentElement) {
    new MutationObserver(refreshLanguage).observe(document.documentElement, {attributes: true, attributeFilter: ['lang']});
  }
  hydrate();
}
export const REVIEW_HTML = `<!doctype html><html lang=""><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Chat Commander review confirmation</title>
<style>body{font:14px system-ui,sans-serif;margin:0;padding:16px;color:inherit;background:transparent}h2{font-size:18px;margin:0 0 12px}ol{padding-left:24px;max-height:360px;overflow-y:auto}li{margin:12px 0}p{margin:4px 0}small{opacity:.75}button{font:inherit;padding:10px 14px;border-radius:8px;border:1px solid #aaa;margin:6px 8px 0 0;cursor:pointer}button:disabled{opacity:.5;cursor:default}#apply{background:#183e32;color:white}#apply.danger{background:#a01818}a{color:inherit}#status,#counts{margin:12px 0}</style>
<h2 id="heading">Confirm changes</h2><p id="instructions">Review the changes before confirming. To change or cancel the proposal, tell ChatGPT before confirming.</p>
<p id="status" role="status" aria-live="polite">Loading proposal…</p><p id="excluded-label">Chats excluded from this proposal:</p><ul id="excluded"></ul><ol id="output"></ol><p id="counts" aria-live="polite"></p>
<details><summary id="groups-label">Suggested groups (no chats moved)</summary><ul id="groups"></ul></details>
<button id="apply" disabled>Confirm and apply these changes</button><button id="cancel" disabled>Cancel remaining operations</button>
<script>(${reviewWidget.toString()})();</script></html>`;
