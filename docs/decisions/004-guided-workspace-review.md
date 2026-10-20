# 004 — Revisione guidata con conferma nella conversazione

Data: 19 ottobre 2026. Stato: implementato nella 0.7.0, prova reale pendente.

## Obiettivo e flusso

«Guarda le mie ultime 10 chat e aiutami a sistemarle» avvia un flusso completo dentro ChatGPT. ChatGPT analizza il contenuto e propone titoli più chiari, archiviazioni motivate e gruppi di chat correlate. Non sono introdotti un modello esterno, un backend o una dashboard: l'analisi è svolta dalla conversazione ChatGPT che invoca i tool.

1. `begin_review(limit?)`: fotografa da 1 a 20 chat recenti (default 10) della lista generale, crea una revisione volatile senza scritture.
2. `read_review_chat(review_id, id, cursor?)`: legge una pagina limitata della chat selezionata (massimo quattro segmenti da 2.000 caratteri); usa la lettura paginata del ramo attivo già disponibile. Serve una prima lettura di ciascuna chat e approfondimento quando necessario. La revisione memorizza solo copertura, metadati e cursore; i messaggi tornano a ChatGPT e non vengono conservati dall'estensione.
3. `prepare_review(review_id, changes, groups?)`: valida gli ID rispetto alla selezione, i limiti e la copertura letta. Una chat non letta o con lettura fallita non può ricevere proposte di modifica. Un'archiviazione richiede testo interamente letto e nessun contenuto non testuale da interpretare. Titoli proposti su lettura parziale restano accompagnati dalla copertura. I gruppi sono suggerimenti, senza creazione di progetti o spostamenti.
4. ChatGPT mostra la proposta, con motivi, titoli prima/dopo e limiti. La scheda integrata ripete tutte le azioni esatte. «Applica solo i titoli, ma tieni aperta quella sul viaggio» produce un nuovo prepare_review con la selezione corretta: nuova revisione, vecchia conferma invalidata. Non significa che la proposta iniziale è già autorizzata.
5. Il pulsante «Confermo e applico queste modifiche» autorizza soltanto la versione mostrata. Il componente invoca `apply_review_step` per una modifica per chiamata, fino al termine. Prima si applica l'eventuale rinomina di una chat, poi l'archiviazione con il titolo aggiornato.
6. `get_review` restituisce il resoconto per singola azione: applicata/verificata, già nello stato richiesto, conflitto, fallita, esito incerto o non eseguita. Il componente aggiorna il resoconto ed emette un messaggio alla conversazione per chiedere la sintesi. `cancel_review` invalida l'approvazione e ferma il lavoro successivo, mantenendo quello già eseguito.

Le descrizioni dei tool e le istruzioni MCP guidano l'intero flusso; non dipende da modifiche manuali al plugin cloud oltre a Refresh tools.

## Conferma e protocollo UI

La [documentazione ufficiale OpenAI sull'UI MCP](https://developers.openai.com/plugins/build/chatgpt-ui) descrive componenti integrati e risorse MCP Apps. La [reference OpenAI](https://developers.openai.com/plugins/reference) distingue risultati visibili al modello, metadati destinati al componente e tool accessibili soltanto all'app. Queste capacità sono documentate, non ancora verificate sul plugin/tunnel dell'utente per questa nuova UI.

Aggiunte `resources/list` e `resources/read`, che servono un unico HTML statico `ui://chat-commander/review-v1.html`, MIME text/html;profile=mcp-app. HTML/CSS/JS sono inclusi nel pacchetto dell'estensione e restituiti dal tunnel: nessun sito da ospitare, script CDN o dipendenza. Il bridge standard ui/* usa postMessage verso il parent; sono accettati messaggi soltanto dal parent. Compatibilità con i globali window.openai quando disponibili. CSP del componente senza domini di rete/risorse aggiuntivi. Titoli, motivazioni e gruppi sono sempre resi come testo, mai HTML eseguibile.

Una capacità casuale generata dal browser per la proposta è inviata esclusivamente nel `_meta` del risultato prepare_review, non in content/structuredContent/get_review. La reference OpenAI documenta che questi metadati sono nascosti al modello. Il tool apply_review_step è dichiarato app-only (anche con alias di compatibilità), non read-only e con destructiveHint true. Il componente avvia le chiamate solo su clic attendibile del pulsante, dopo inizializzazione e corrispondenza proposta/capacità. Nessun parametro confirmed generato dal modello viene considerato consenso.

Ogni applicazione controlla capacità, revisione, scadenza, binding e stato dei metadati. Una capacità di una vecchia proposta, di un'altra sorgente o già annullata è rifiutata. L'utente può fermare il lavoro restante. Se il componente non viene renderizzato o il bridge non funziona, non c'è fallback a una chiamata massiva del modello: la proposta resta non applicata. Le impostazioni della piattaforma potrebbero imporre ulteriori approvazioni alle chiamate UI; comportamento e supporto di risorse/metadati devono essere provati sul suo account.

È un controllo nel contesto personale e nel confine di fiducia del client ChatGPT, non una firma indipendente di identità. Un client compromesso che vede i metadati potrebbe esercitare la capacità. Non rende il tunnel multiutente o pubblico. Mentre una revisione è aperta, le scritture singole sulle sue chat sono bloccate dal dispatcher per evitare l'aggiramento accidentale della conferma; dopo annullamento/scadenza o conclusione torna valido il flusso singolo. Questo non sostituisce un controllo dell'intento umano per ogni possibile uso malevolo dei tool singoli.

## Esecuzione e affidabilità

Nessuna transazione tra più chat. Ogni passo rilegge titolo/stato e usa le scritture già provate con rilettura finale. Conflitto, errore o esito incerto interrompono il piano e marcano i passi successivi non eseguiti. Le modifiche completate restano valide; nessun rollback automatico. La UI non ritenta una scrittura dopo risposta persa: legge get_review e richiede verifica prima di una nuova decisione.

Ogni chiamata applica al massimo una modifica, così usa il budget del singolo comando del tunnel invece di tenere aperta una richiesta per l'intero gruppo. Dopo un'interruzione resta il resoconto finché vive la revisione; non promettiamo ripresa automatica. Titolo/stato attesi sono controlli preventivi, non CAS atomico contro sessioni concorrenti; restano i limiti della decisione 002. Una richiesta già inviata può completarsi anche se l'utente annulla o il browser perde la connessione.

## Memoria e ciclo di vita

Massimo cinque revisioni in memoria del worker, massimo 20 chat e 40 modifiche per revisione, scadenza a 30 minuti. Vecchi resoconti conclusi possono essere rimossi per creare nuove revisioni. Nessun contenuto chat o proposta viene scritto in storage.local/session, file o database. Restano in memoria soltanto ID, titoli, motivi sintetici, gruppi, copertura, cursori, capacità e stati di avanzamento. I risultati passati a ChatGPT seguono il normale trattamento della conversazione da parte di OpenAI.

Sospensione/riavvio del worker può perdere le revisioni; reload, cambio binding/modalità, disconnessione e nuova connessione le invalidano esplicitamente. In quel caso avviare una nuova revisione, senza annunciare un successo o ritentare modifiche alla cieca. Nessuna schedulazione, nessuna cancellazione, nessuna nuova installazione o permesso.

## Verifiche e limiti aperti

87 test locali passati. Nuove verifiche: copertura lettura, proposte senza scritture, esclusioni/modifiche della proposta, capacità nascosta, conferme vecchie, gruppo di operazioni applicato esattamente, conflitti/esiti parziali, annullamento, scadenza, cambio sorgente, concorrenza, blocco delle scritture singole, componente con clic esplicito, recupero di sola lettura dopo errore e percorso MCP/tunnel/pagina simulato completo.

Non sono test del browser autenticato o della qualità delle raccomandazioni del modello. Da verificare alla fine: rendering UI reale attraverso il plugin tunnel; ricezione metadati privati/bridge; naturalezza dell'analisi e delle eccezioni; approvazione e risultato reale; comportamento dopo interruzione. Paginazione reale di read_chat su testi lunghi e le altre limitazioni di copertura restano aperte.

## Correzione 0.7.1 dopo la prima prova reale

L'utente ha confermato di aver premuto il pulsante di approvazione. La prova 0.7.0 si è fermata senza modifiche perché la chat corrente ha cambiato titolo fra lettura e applicazione; non è stato riscontrato un avvio senza clic. Preview, lettura e preflight sono stati raggiunti sul browser, ma l'intero gruppo di modifiche non è ancora verificato.

Per impostazione predefinita begin_review esclude ora l'ID della chat aperta nella scheda sorgente, letto dal percorso chatgpt.com/.../c/{uuid} prima e dopo la lista. Non usa euristiche sul titolo e non sceglie un'altra chat da modificare al posto di una proposta già approvata. La selezione viene formata prima delle letture e della proposta. Richiede una voce aggiuntiva quando possibile (massimo backend 20), poi limita al numero richiesto. Se resta meno materiale, selected_count lo dichiara senza promettere il numero originario. Le esclusioni sono visibili al modello e nella scheda. Chat senza percorso riconoscibile non vengono identificate arbitrariamente; su altri dispositivi/schede non è garantito che questa sia la chat di comando.

Le chat escluse non possono essere lette o proposte attraverso quella revisione. Il vincolo dei titoli attesi sulle altre chat resta invariato. Risorsa UI v2, 90 test complessivi, inclusi esclusione per ID nel manager e percorso completo con URL reale simulato della scheda. Prova reale 0.7.1 pendente.
