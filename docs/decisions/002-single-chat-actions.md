# 002 — Azioni su una singola chat

Data: 19 ottobre 2026. Stato: implementato nella 0.5.0, prova reale pendente.

## Decisione

Aggiungere get_chat(id), rename_chat(id, expected_title, title) e set_chat_archived(id, expected_title, expected_archived, archived) alla sola modalità live. Nessuna cancellazione o azione massiva. Il riferimento conversazionale viene risolto da ChatGPT sugli ID delle liste/ricerche; casi ambigui richiedono chiarimento. get_chat permette anche di verificare lo stato dopo esito incerto senza cercare il titolo nell'indice.

I due tool di modifica hanno readOnlyHint false e destructiveHint true per segnalare correttamente alla piattaforma che aggiornano dati. L'utente deve richiedere la modifica specifica, oppure approvare la proposta di ChatGPT; le descrizioni dei tool lo richiedono. Nessun parametro confirmed generato dal modello viene trattato come prova di consenso. Le annotazioni sono suggerimenti alla piattaforma, non un controllo crittografico dell'approvazione e non garantiscono un prompt di conferma; questo prototipo non implementa un controllo indipendente di ogni turno utente. Per azioni distruttive e massive occorrerà un flusso di conferma esplicita separatamente verificato, prima di abilitarle.

## Flusso

Controlli account/documento/binding condivisi con letture. Nella pagina: sessione con hash utente; GET /backend-api/conversation/{uuid}; validazione ID restituito, titolo e archivio; confronto con titolo/stato attesi; nuova verifica sessione; singolo PATCH con il solo campo necessario; nuova sessione e GET di verifica; controllo sessione finale. Se lo stato desiderato è già presente, ritorna changed false senza PATCH. Ritorna solo ID, titolo, archivio, link e stato verificato.

Il GET interno può includere messaggi completi: restano temporaneamente nella pagina e sono scartati, senza restituzione o storage. Limite JSON 4 MiB, timeout 10 secondi per singola richiesta, budget complessivo massimo 25 secondi (o scadenza tunnel più vicina). Una chat troppo grande non viene modificata perché il controllo preliminare fallisce. Nessun nuovo permesso o componente installato.

## Limiti e conseguenze

Endpoint interni, contratto candidato ricavato da implementazioni pubbliche. Ripristino con is_archived false è ancora un'ipotesi da validare sul browser, non un fatto verificato. Nessun retry automatico di PATCH. Errori dopo inizio invio o perdita del controllo documento/sessione producono action_outcome_unknown; rileggere con get_chat prima di decidere ulteriori azioni.

Il confronto titolo/stato è preventivo e non atomico: non conosciamo supporto a ETag/CAS. Un'altra sessione può cambiare la chat fra GET e PATCH. Un account cambiato durante una richiesta già inviata o una disconnessione dell'estensione non annullano una scrittura in corso: i controlli successivi rilevano l'incertezza, senza garanzia di rollback. Il budget nella pagina limita il lavoro ma non è una revoca istantanea dalla UI dell'estensione. La verifica esprime lo stato osservato, non una garanzia contro future modifiche concorrenti.

Restano valide le limitazioni personali/singolo utente del tunnel: binding non equivale ad autenticazione del chiamante MCP. Nessuna adozione dell'architettura broker/database delle estensioni studiate; nessun codice di terze parti copiato.

## Validazione

59 test locali con simulazioni, inclusi percorso MCP completo, stato atteso, sola proprietà PATCH, metadati senza credenziali/messaggi, esito incerto, account/documento cambiati e richieste invalide. Prova reale prevista: chat di test scelta dall'utente, rinomina e verifica visiva, archiviazione, ripristino e verifica visiva. Rinnovo binding, chiave e Refresh tools necessari dopo reload.

## Aggiornamento dopo prova reale

L'utente ha verificato rinomina (anche visivamente nella barra laterale), archiviazione e ripristino della stessa chat di test tramite ChatGPT. Il candidato is_archived false è ora verificato nel suo contesto personale. I riferimenti precedenti alla prova pendente descrivono lo stato al momento dell'implementazione; restano invariati i limiti tecnici e il modello di consenso descritti sopra.
