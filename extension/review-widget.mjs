// Runs only inside ChatGPT's sandboxed component, never in the source chat page.
export function reviewWidget() {
    const output = document.querySelector('#output');
    const status = document.querySelector('#status');
    const apply = document.querySelector('#apply');
    const cancel = document.querySelector('#cancel');
    const submitted = new Set();
    const key = data => `${data?.review_id}:${data?.revision}`;
    const terminal = state => ['completed', 'attention', 'cancelled'].includes(state);
    const pending = new Map();
    let sequence = 0;
    let preview;
    let capability;
    let running = false;
    let initialized = false;
    let synchronized = false;
    let refreshing = false;
    let renderedLive = false;
    let unavailable = null;
    let expiryTimer;
    // Host-provided locale only; never infer language from untrusted chat text.
    const messages = {
        review_expiry: { en: 'Expires {time} · {minutes} min remaining. Reloading the extension can lose this review earlier.', it: 'Scade il {time} · {minutes} min rimanenti. Ricaricare l’estensione può far perdere prima questa revisione.' },
        review_expired: { en: 'This review has expired. Check applied steps before preparing a replacement.', it: 'Questa revisione è scaduta. Controlla i passi applicati prima di preparare una nuova proposta.' },
        review_lost: { en: 'The extension no longer holds this review, for example after a restart. Expiry is not confirmed. Check actual state before preparing a replacement.', it: 'L’estensione non conserva più questa revisione, ad esempio dopo un riavvio. La scadenza non è confermata. Controlla lo stato effettivo prima di preparare una nuova proposta.' },
        review_connection: { en: 'Unable to check this review. It may be a connection problem; expiry is not confirmed. Do not repeat changes.', it: 'Impossibile verificare la revisione. Potrebbe essere un problema di connessione; la scadenza non è confermata. Non ripetere le modifiche.' },
        review_049: {
            en: 'Resume remaining operations', it: 'Riprendi le operazioni restanti'
        },
        review_050: {
            en: 'Restore this conversation', it: 'Ripristina questa conversazione'
        },
        review_051: {
            en: 'Proposal superseded: use the latest card.', it: 'Proposta sostituita: usa la scheda più recente.'
        },
        review_052: {
            en: 'Review unavailable: request a new report.', it: 'Revisione non disponibile: chiedi un nuovo resoconto.'
        },
        review_053: {
            en: 'Revision {revision} · live state checked', it: 'Revisione {revision} · stato attuale verificato'
        },
        review_054: {
            en: 'Partial plan: inspect the applied steps and explicitly resume remaining operations.', it: 'Piano parziale: controlla i passi applicati e riprendi esplicitamente le operazioni restanti.'
        },
        "review_001": {
            "en": "Operation completed",
            "it": "Operazione conclusa"
        },
        "review_002": {
            "en": "Operation in progress…",
            "it": "Operazione in corso…"
        },
        "review_003": {
            "en": "Confirmation already sent",
            "it": "Conferma già inviata"
        },
        "review_004": {
            "en": "Permanently delete this chat",
            "it": "Elimina definitivamente questa chat"
        },
        "review_005": {
            "en": "Confirm and apply these changes",
            "it": "Confermo e applico queste modifiche"
        },
        "review_006": {
            "en": "Proposal ready: no changes applied yet.",
            "it": "Proposta pronta: nessuna modifica ancora applicata."
        },
        "review_007": {
            "en": "Reading in progress.",
            "it": "Lettura in corso."
        },
        "review_008": {
            "en": "Confirmation received. Applying and verifying… Please wait without clicking again.",
            "it": "Conferma ricevuta. Operazione e verifica in corso… Attendi senza premere di nuovo."
        },
        "review_009": {
            "en": "Operations completed.",
            "it": "Operazioni concluse."
        },
        "review_010": {
            "en": "Operations stopped: check the results.",
            "it": "Operazioni interrotte: controlla gli esiti."
        },
        "review_011": {
            "en": "Review cancelled. Changes already made remain applied.",
            "it": "Revisione annullata. Le modifiche già eseguite restano valide."
        },
        "review_012": {
            "en": "Status unavailable.",
            "it": "Stato non disponibile."
        },
        "review_013": {
            "en": "Archive this conversation",
            "it": "Archivia questa conversazione"
        },
        "review_014": {
            "en": "No project",
            "it": "Nessun progetto"
        },
        "review_015": {
            "en": "PERMANENTLY DELETE this conversation. You cannot restore it.",
            "it": "ELIMINA DEFINITIVAMENTE questa conversazione. Non potrai ripristinarla."
        },
        "review_016": {
            "en": "Unrecognized operation: do not confirm.",
            "it": "Operazione non riconosciuta: non confermare."
        },
        "review_017": {
            "en": "Awaiting confirmation",
            "it": "In attesa di conferma"
        },
        "review_018": {
            "en": "In progress",
            "it": "In corso"
        },
        "review_019": {
            "en": "Applied and verified",
            "it": "Applicata e verificata"
        },
        "review_020": {
            "en": "Already in the requested state",
            "it": "Già nello stato richiesto"
        },
        "review_021": {
            "en": "State changed: not applied",
            "it": "Stato cambiato: non applicata"
        },
        "review_022": {
            "en": "Outcome uncertain: check the chat",
            "it": "Esito incerto: verificare la chat"
        },
        "review_023": {
            "en": "Precondition check failed",
            "it": "Verifica preliminare fallita"
        },
        "review_024": {
            "en": "Not executed",
            "it": "Non eseguita"
        },
        "review_025": {
            "en": "text fully read",
            "it": "testo letto interamente"
        },
        "review_026": {
            "en": "partially read",
            "it": "lettura parziale"
        },
        "review_027": {
            "en": "unread",
            "it": "non letta"
        },
        "review_028": {
            "en": "read failed",
            "it": "lettura fallita"
        },
        "review_029": {
            "en": "Confirmed, waiting to execute",
            "it": "Confermata, in attesa di esecuzione"
        },
        "review_030": {
            "en": "State needs checking",
            "it": "Stato da verificare"
        },
        "review_031": {
            "en": "read coverage not verified",
            "it": "copertura non verificata"
        },
        "review_032": {
            "en": " · attachments not interpreted",
            "it": " · allegati non interpretati"
        },
        "review_033": {
            "en": "Connection interrupted or review unavailable. Check the results with Chat Commander before trying again.",
            "it": "Connessione interrotta o revisione non disponibile. Controlla gli esiti con Chat Commander prima di riprovare."
        },
        "review_034": {
            "en": "Cancellation not confirmed. An already submitted request may complete: check the results.",
            "it": "Annullamento non confermato. Una richiesta già inviata può completarsi: verifica gli esiti."
        },
        "review_035": {
            "en": "Integrated confirmation unavailable: no changes started. Ask Chat Commander for the report.",
            "it": "Conferma integrata non disponibile: nessuna modifica avviata. Chiedi a Chat Commander il resoconto."
        },
        "review_036": {
            "en": "Confirm changes",
            "it": "Conferma operazioni"
        },
        "review_037": {
            "en": "Review the changes before confirming. To change or cancel the proposal, tell ChatGPT before confirming.",
            "it": "Controlla le modifiche prima di confermare. Per cambiare o annullare la proposta, scrivilo a ChatGPT prima di confermare."
        },
        "review_038": {
            "en": "Loading proposal…",
            "it": "Caricamento della proposta…"
        },
        "review_039": {
            "en": "Chats excluded from this proposal:",
            "it": "Chat escluse dalla proposta:"
        },
        "review_040": {
            "en": "Suggested groups (no chats moved)",
            "it": "Gruppi suggeriti (nessuno spostamento)"
        },
        "review_041": {
            "en": "Cancel remaining operations",
            "it": "Annulla le operazioni restanti"
        },
        "review_042": {
            "en": "Chat Commander review confirmation",
            "it": "Conferma revisione Chat Commander"
        },
        "review_043": {
            "en": "Rename → {title}",
            "it": "Rinomina → {title}"
        },
        "review_044": {
            "en": "Create project → {title}",
            "it": "Crea progetto → {title}"
        },
        "review_045": {
            "en": "Move: {origin} → {destination}{id}",
            "it": "Sposta: {origin} → {destination}{id}"
        },
        "review_046": {
            "en": "{title} — excluded because it is open in the connected tab",
            "it": "{title} — esclusa perché aperta nella scheda collegata"
        },
        "review_047": {
            "en": "{applied} applied, {unchanged} already correct, {pending} pending, {conflicts} conflicts, {unknown} uncertain, {failed} failed, {skipped} not executed.",
            "it": "{applied} applicate, {unchanged} già corrette, {pending} in attesa, {conflicts} conflitti, {unknown} esiti incerti, {failed} fallite, {skipped} non eseguite."
        },
        "review_048": {
            "en": [
                "Chat Commander: review {review}, status {status}. {applied} changes applied, {unchanged} already correct, {conflicts} conflicts, {unknown} uncertain ",
                "outcomes, {failed} failed, {skipped} not executed. Use get_review for the exact report."
            ].join(""),
            "it": [
                "Chat Commander: revisione {review}, stato {status}. {applied} modifiche applicate, {unchanged} gi\u00E0 corrette, {conflicts} conflitti, {unknown} esiti ",
                "incerti, {failed} fallite, {skipped} non eseguite. Usa get_review per il resoconto preciso."
            ].join("")
        }
    };
    const resolveLanguage = () => {
        const locale = document.documentElement?.lang || window.openai?.locale || 'en';
        return typeof locale === 'string' && /^it(?:-|$)/i.test(locale) ? 'it' : 'en';
    };
    let language = resolveLanguage();
    const t = (source, values = {}) => (messages[source]?.[language] ?? source)
        .replace(/\{([a-z_]+)\}/g, (match, key) => Object.hasOwn(values, key) ? String(values[key]) : match);
    function localizeLabels() {
        const labels = {
            '#heading': 'review_036', '#instructions': 'review_037',
            '#excluded-label': 'review_039', '#groups-label': 'review_040', '#cancel': 'review_041'
        };
        for (const [selector, text] of Object.entries(labels))
            document.querySelector(selector).textContent = t(text);
        document.title = t('review_042');
        if (document.body)
            document.body.lang = language;
        if (!preview)
            status.textContent = t('review_038');
        controls();
    }
    function refreshLanguage() {
        const next = resolveLanguage();
        if (next === language)
            return;
        language = next;
        localizeLabels();
        if (preview)
            render(preview);
    }
    function request(method, params) {
        const id = ++sequence;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => { pending.delete(id); reject(new Error('timeout')); }, 45000);
            pending.set(id, {
                resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); }
            });
            window.parent.postMessage({
                jsonrpc: '2.0', id, method, params
            }, '*');
        });
    }
    function hasExpired() {
        return Number.isFinite(Date.parse(preview?.expires_at)) && Date.now() >= Date.parse(preview.expires_at);
    }
    function updateExpiry() {
        clearTimeout(expiryTimer);
        const element = document.querySelector('#expiry');
        const expires = Date.parse(preview?.expires_at);
        if (element) element.textContent = Number.isFinite(expires)
            ? hasExpired() ? t('review_expired') : t('review_expiry', {
                time: new Date(expires).toLocaleString(language), minutes: Math.ceil((expires - Date.now()) / 60000)
            }) : '';
        controls();
        if (Number.isFinite(expires) && !hasExpired()) expiryTimer = setTimeout(updateExpiry, 1000);
    }
    function controls() {
        apply.disabled = hasExpired() || Boolean(unavailable) || !initialized || !synchronized || running || submitted.has(key(preview)) || !capability?.approval_token || capability.review_id !== preview?.review_id || capability.revision !== preview?.revision || !preview?.changes?.length || !['proposed', 'applying'].includes(preview.status) || preview.changes.some(c => c.status === 'running');
        const deleting = preview?.changes?.some(c => c.action === 'delete_chat');
        apply.textContent = preview?.status === 'completed' ? t('review_001')
            : running ? t('review_002') : submitted.has(key(preview)) ? t('review_003')
                : preview?.status === 'applying' ? t('review_049') : deleting ? t('review_004') : t('review_005');
        apply.className = deleting ? 'danger' : '';
        cancel.disabled = hasExpired() || Boolean(unavailable) || !preview || ['cancelled', 'completed', 'attention'].includes(preview.status);
    }
    function render(data) {
        if (!data || typeof data.review_id !== 'string' || !Array.isArray(data.changes))
            return;
        // Late host hydration must not restore an already approved proposal.
        if (submitted.has(key(data)) && (data.status === 'proposed' ||
            (key(data) === key(preview) && terminal(preview?.status) && !terminal(data.status))))
            return;
        preview = data;
        output.replaceChildren();
        const states = {
            proposed: t('review_006'), reading: t('review_007'),
            applying: t('review_008'), completed: t('review_009'), attention: t('review_010'), cancelled: t('review_011')
        };
        status.textContent = unavailable ? t(unavailable) : data.status === 'applying' && !running && !data.changes.some(c => c.status === 'running') ? t('review_054') : states[data.status] ?? t('review_012');
        const revision = document.querySelector('#revision');
        if (revision)
            revision.textContent = synchronized ? t('review_053', { revision: data.revision }) : '';
        // Group project operations for display only. Execution retains the original step order.
        const projectGroups = new Map();
        const grouped = data.changes.filter(c => c.action === 'move_chat').length > 1;
        for (const change of data.changes) {
            const row = document.createElement('li');
            const link = document.createElement('a');
            link.textContent = change.before_title; // Never insert chat-provided HTML.
            if (/^https:\/\/chatgpt\.com\/c\/[a-f0-9-]{36}$/i.test(change.url)) {
                link.href = change.url;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
            }
            const detail = document.createElement('p');
            const descriptions = {
                rename_chat: t('review_043', { title: change.after_title }), set_chat_archived: change.after_archived ? t('review_013') : t('review_050'),
                create_project: t('review_044', { title: change.before_title }), move_chat: t('review_045', {
                    origin: change.origin_name ?? t('review_014'), destination: change.destination_name, id: change.destination_id ? ` (${change.destination_id})` : ''
                }),
                delete_chat: t('review_015')
            };
            detail.textContent = descriptions[change.action] ?? t('review_016');
            const reason = document.createElement('p');
            reason.textContent = change.reason;
            const state = document.createElement('small');
            const names = {
                pending: t('review_017'), running: t('review_018'), applied: t('review_019'), unchanged: t('review_020'),
                conflict: t('review_021'), unknown: t('review_022'), failed: t('review_023'), skipped: t('review_024')
            };
            const chat = data.chats?.find(c => c.id === change.id);
            const coverage = {
                complete: t('review_025'), partial: t('review_026'), unread: t('review_027'), failed: t('review_028')
            };
            state.textContent = (data.status === 'applying' && change.status === 'pending' ? t('review_029') : names[change.status] ?? t('review_030')) +
                (chat ? ` · ${coverage[chat.reading] ?? t('review_031')}${chat.non_text_content ? t('review_032') : ''}` : '');
            const destination = change.action === 'create_project' ? change.before_title
                : change.action === 'move_chat' ? change.destination_name : null;
            if (grouped && destination) {
                let group = projectGroups.get(destination);
                if (!group) {
                    const container = document.createElement('li');
                    const heading = document.createElement('strong');
                    heading.textContent = destination;
                    const explanation = document.createElement('p');
                    explanation.textContent = change.reason;
                    const members = document.createElement('ul');
                    container.append(heading, explanation, members);
                    output.append(container);
                    group = { members, reason: change.reason };
                    projectGroups.set(destination, group);
                }
                // Keep each origin, operation state and evidence visible; repeat only distinct reasons.
                row.append(link, detail);
                if (change.reason !== group.reason) row.append(reason);
                row.append(state);
                group.members.append(row);
            }
            else {
                row.append(link, detail, reason, state);
                output.append(row);
            }
        }
        const excluded = document.querySelector('#excluded');
        excluded.replaceChildren();
        for (const chat of data.excluded_chats ?? []) {
            const item = document.createElement('li');
            item.textContent = t('review_046', { title: chat.title });
            excluded.append(item);
        }
        const groups = document.querySelector('#groups');
        groups.replaceChildren();
        for (const group of data.groups ?? []) {
            const item = document.createElement('li');
            const titles = group.ids.map(id => data.chats?.find(c => c.id === id)?.title ?? 'Chat').join('; ');
            item.textContent = `${group.label}: ${titles} — ${group.reason}`;
            groups.append(item);
        }
        const counts = data.counts;
        document.querySelector('#counts').textContent = counts ? t('review_047', counts) : '';
        updateExpiry();
        try {
            window.openai?.notifyIntrinsicHeight?.(document.documentElement.scrollHeight);
        }
        catch { }
    }
    function receiveResult(result, authoritative = false) {
        if (!result || typeof result !== 'object')
            return;
        if (result._meta?.reviewApproval)
            capability = result._meta.reviewApproval;
        if (authoritative && result.structuredContent?.review_id) {
            unavailable = null;
            synchronized = true;
            renderedLive = true;
            render(result.structuredContent);
            if (capability?.revision !== preview.revision) {
                capability = null;
                status.textContent = t('review_051');
            }
            controls();
        }
        else if (!renderedLive && result.structuredContent?.review_id)
            render(result.structuredContent);
    }
    async function call(name, args) {
        const result = await request('tools/call', {
            name, arguments: args
        });
        if (result?.isError) {
            let code = result.structuredContent?.error;
            if (!code) {
                try { code = JSON.parse(result.content?.find(c => c.type === 'text')?.text ?? '{}').error; } catch { }
            }
            throw new Error(['review_expired', 'review_unavailable'].includes(code) ? code : 'tool_error');
        }
        receiveResult(result, true);
        return result?.structuredContent;
    }
    async function reportToChat(data) {
        if (!data?.counts)
            return;
        const c = data.counts;
        try {
            await request('ui/message', {
                role: 'user', content: [{
                        type: 'text', text: t('review_048', {
                            ...c, review: data.review_id, status: data.status
                        })
                    }]
            });
        }
        catch { }
    }
    apply.addEventListener('click', async (event) => {
        if (hasExpired() || unavailable || !event.isTrusted || !initialized || !synchronized || running || submitted.has(key(preview)) || !capability?.approval_token || !['proposed', 'applying'].includes(preview?.status) ||
            capability.review_id !== preview.review_id || capability.revision !== preview.revision)
            return;
        // Approval is for this exact immutable revision; tokens never enter model-visible messages.
        const approved = { ...capability };
        submitted.add(key(preview));
        running = true;
        render({
            ...preview, status: 'applying'
        });
        let last = preview;
        try {
            for (let i = 0; i < 100; i++) {
                const next = last.changes.find(c => c.status === 'pending');
                if (!next)
                    throw new Error('no_pending_step');
                last = await call('apply_review_step', {
                    ...approved, expected_step: next.number ?? last.changes.indexOf(next) + 1
                });
                if (!last || last.review_id !== approved.review_id || last.revision !== approved.revision)
                    throw new Error();
                if (['completed', 'attention', 'cancelled'].includes(last.status))
                    break;
            }
            if (!['completed', 'attention', 'cancelled'].includes(last.status))
                throw new Error();
            await reportToChat(last);
        }
        catch {
            // Never retry a write after a lost response. Only recover the read-only report.
            try {
                last = await call('get_review', { review_id: approved.review_id });
            }
            catch { }
            status.textContent = t('review_033');
            capability = null;
        }
        finally {
            running = false;
            controls();
        }
    });
    cancel.addEventListener('click', async (event) => {
        if (!event.isTrusted || !preview)
            return;
        cancel.disabled = true;
        try {
            await call('cancel_review', { review_id: preview.review_id });
            capability = null;
        }
        catch {
            status.textContent = t('review_034');
        }
        controls();
    });
    window.addEventListener('message', event => {
        if (event.source !== window.parent || !event.data || event.data.jsonrpc !== '2.0')
            return;
        const m = event.data;
        if (m.id !== undefined && pending.has(m.id)) {
            const waiter = pending.get(m.id);
            pending.delete(m.id);
            m.error ? waiter.reject(m.error) : waiter.resolve(m.result);
            return;
        }
        if (m.method === 'ui/notifications/tool-result') {
            if (!running) {
                synchronized = false;
                renderedLive = false;
            }
            receiveResult(m.params);
            if (!running)
                void synchronize();
        }
        if (m.method === 'ui/notifications/tool-cancelled') {
            capability = null;
            controls();
        }
    });
    // Compatibility with ChatGPT hosts that hydrate globals before bridge notifications.
    function hydrate() {
        refreshLanguage();
        const meta = window.openai?.toolResponseMetadata;
        receiveResult(meta?.mcp_tool_result ?? meta?.call_tool_result ?? meta);
        if (!renderedLive && window.openai?.toolOutput?.review_id)
            render(window.openai.toolOutput);
        void synchronize();
    }
    async function synchronize() {
        if (!initialized || running || refreshing || !preview?.review_id)
            return;
        refreshing = true;
        synchronized = false;
        controls();
        const id = preview.review_id;
        try {
            const current = await call('get_review', { review_id: id });
            if (current?.review_id !== id)
                throw new Error('wrong_review');
        }
        catch (error) {
            synchronized = false;
            capability = null;
            unavailable = error.message === 'review_expired' ? 'review_expired' : error.message === 'review_unavailable' ? 'review_lost' : 'review_connection';
            status.textContent = t(unavailable);
        }
        finally {
            refreshing = false;
            controls();
        }
    }
    window.addEventListener('openai:set_globals', hydrate);
    void request('ui/initialize', {
        appInfo: {
            name: 'Chat Commander review', version: '0.13.0'
        }, appCapabilities: {}, protocolVersion: '2026-01-26'
    })
        .then(() => {
        initialized = true;
        window.parent.postMessage({
            jsonrpc: '2.0', method: 'ui/notifications/initialized'
        }, '*');
        hydrate();
        controls();
    })
        .catch(() => { status.textContent = t('review_035'); apply.disabled = true; });
    localizeLabels();
    if (typeof MutationObserver === 'function' && document.documentElement) {
        new MutationObserver(refreshLanguage).observe(document.documentElement, {
            attributes: true, attributeFilter: ['lang']
        });
    }
    hydrate();
}
export const REVIEW_HTML = `<!doctype html><html lang=""><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Chat Commander review confirmation</title>
<style>body{font:14px system-ui,sans-serif;margin:0;padding:16px;color:inherit;background:transparent}h2{font-size:18px;margin:0 0 12px}#output{padding-left:24px;max-height:480px;overflow-y:auto}#output ul{padding-left:20px}#output>li{margin:18px 0}#output strong{font-size:15px}li{margin:12px 0}p{margin:4px 0}small{opacity:.75}button{font:inherit;padding:10px 14px;border-radius:8px;border:1px solid #aaa;margin:6px 8px 0 0;cursor:pointer}button:disabled{opacity:.5;cursor:default}#apply{background:#183e32;color:white}#apply.danger{background:#a01818}a{color:inherit}#status,#counts{margin:12px 0}</style>
<h2 id="heading">Confirm changes</h2><p id="instructions">Review the changes before confirming. To change or cancel the proposal, tell ChatGPT before confirming.</p>
<p id="revision"></p><p id="expiry" role="timer" aria-live="off"></p><p id="status" role="status" aria-live="polite">Loading proposal…</p><p id="excluded-label">Chats excluded from this proposal:</p><ul id="excluded"></ul><ol id="output"></ol><p id="counts" aria-live="polite"></p>
<details><summary id="groups-label">Suggested groups (no chats moved)</summary><ul id="groups"></ul></details>
<button id="apply" disabled>Confirm and apply these changes</button><button id="cancel" disabled>Cancel remaining operations</button>
<script>(${reviewWidget.toString()})();</script></html>`;
