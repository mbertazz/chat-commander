# Sorgente personale in sola lettura

Data: 19 ottobre 2026. Stato: implementata e corretta nella versione 0.3.1; chiamata reale MCP riuscita secondo la prova dell'utente. Restano aperte le verifiche operative indicate nello stato del PoC.

## Contesto verificato e limiti

L'utente conferma workspace personale, una sola organizzazione e un solo utente. La UI mostra un plugin custom in sviluppo, senza autenticazione applicativa; il tooltip “Created by you in the cloud” indica origine/creatore e non è una prova di controllo accessi. L'utente conferma il contesto singolo anche dopo aver aperto i dettagli del tunnel. Non è stato eseguito un test con un secondo utente. Il PoC è circoscritto a questo contesto personale: non è idoneo alla condivisione o alla pubblicazione.

Il tunnel sintetico funziona da ChatGPT, anche dopo inattività secondo la prova dell'utente. La verifica locale della pagina risponde con HTTP 200 e cinque record nella lista. Queste osservazioni autorizzano a preparare un adapter limitato, senza dichiarare ancora superata la prova MCP con dati reali.

## Decisione

Consentire un'attivazione esplicita nelle opzioni e un clic sull'icona nella scheda sorgente. Usare i soli permessi opzionali `activeTab` e `scripting`: nessun host permission permanente su ChatGPT. L'attivazione è limitata al documento della scheda scelta e all'hash SHA-256 dell'ID utente della sessione. Il token ChatGPT resta nella pagina; nessun token di sessione viene passato al worker o al tunnel. Il documento e l'hash sono soltanto configurazione volatile in `storage.session`.

Correzione 0.3.1: Firefox espone `InjectionResult.documentId` dalla versione 153, quindi non può essere obbligatorio per il browser 152 dell'utente. Generare un UUID per documento nel mondo ISOLATED dell'estensione, conservandolo su quel globale tramite un simbolo non configurabile. Il marcatore non è condiviso con il mondo MAIN, non contiene dati utente e non è una credenziale. Verificarlo prima e dopo ogni lettura della sessione/lista nel mondo MAIN; un documento diverso ha un nuovo marcatore. Verificare anche il documentId nativo quando disponibile. Il codice isolato viene eseguito solo sul frame 0 scelto esplicitamente; non confrontare `globalThis` con `window.top` perché Firefox può usare un globale sandbox distinto.

L'hash serve a rilevare cambi accidentali di account, non è autenticazione del chiamante MCP. L'autorizzazione remota si affida al perimetro personale del tunnel confermato dall'utente. Se cambiano membri, organizzazioni o workspace associati, sospendere l'uso reale e riprogettare l'autorizzazione. La sessione della pagina e le API interne restano superfici fidate della sorgente, non una prova crittografica indipendente.

Prima e dopo la lettura della lista si verifica l'identità della sessione. L'estensione controlla inoltre il documento restituito dall'iniezione e la presenza della stessa configurazione prima di restituire il risultato. Una scheda ricaricata, chiusa o con sessione diversa deve produrre un errore e richiedere nuovo collegamento. L'utente deve mantenere il solo workspace personale selezionato: la gestione di account con più workspace non è implementata e non si deve dichiararne l'isolamento.

Unico tool: `list_chats`, con limite intero 1–20. Legge solo la prima pagina della lista generale, richiede ordine per aggiornamento e conversazioni non archiviate, valida struttura e ordine restituiti. Nessuna paginazione, nessun messaggio, nessuna modifica. Errori non generano fallback sintetici nella modalità reale.

`gizmo_id` è restituito come `source_gizmo_id`, senza attribuirgli un nome progetto o trasformarlo arbitrariamente in `project_id`. Quest'ultimo resta `null`. La copertura delle conversazioni nei progetti è ancora sconosciuta ed è esplicitata nel risultato del tool.

## Conseguenze

- Navigare o ricaricare la scheda può richiedere un nuovo collegamento. Nessun tentativo di mantenerne artificialmente i privilegi.
- La selezione della modalità reale è un'impostazione locale non sensibile; dopo riavvio o ricarica dell'estensione la sorgente manca e il tool deve rifiutare la lettura fino al nuovo collegamento.
- I risultati esistono solo per elaborazione e trasporto; niente storage, cache, log o telemetria di conversazioni. I metadati restituiti entrano nella conversazione ChatGPT.
- L'iniezione già avviata può proseguire fino ai suoi timeout anche dopo disconnessione; il risultato viene scartato e non inviato al tunnel se la richiesta è annullata o scaduta. Non promettere cancellazione retroattiva di richieste già partite.
- La matrice completa lifecycle, il contratto tunnel fissato a revisione riproducibile, la chiave con privilegi minimi e Android restano verifiche aperte. Nessuna dichiarazione di idoneità alla produzione.
