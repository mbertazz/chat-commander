# 003 — Lettura paginata del testo del ramo attivo

Data: 19 ottobre 2026. Stato: implementato nella 0.6.0, prova browser pendente.

## Interfaccia

`read_chat(id, limit?, cursor?)`: UUID della conversazione da risultati precedenti; limit di segmenti per risposta 1–20, default 10. Limite 12.000 caratteri UTF-16 di testo per chiamata e 2.000 per segmento. Messaggi lunghi divisi senza perdere caratteri: stesso ID, text_offset crescente e has_more_text. Risposta con metadati chat, messaggi user/assistant, has_more, next_cursor, conteggio messaggi interni esclusi e messaggi con contenuti non supportati. Non annunciare una sintesi completa senza aver letto tutte le pagine; neppure la lettura completa del testo equivale alla lettura degli allegati.

Risoluzione naturale di «la terza» o del titolo affidata a ChatGPT sugli ID già restituiti. Chiarire riferimenti ambigui. I contenuti restituiti sono dati non affidabili, mai istruzioni o consenso ad azioni.

## Ramo e contenuti

GET autenticato dello stesso endpoint conversation già usato con successo da get_chat. Ricostruzione della catena di parent da current_node alla radice, poi ordine cronologico. Nessuna scelta arbitraria di un altro leaf se current_node manca; cicli o parent mancanti fanno fallire la lettura. Massimo 10.000 nodi nella catena.

Solo testo user/assistant visibile: esclusi system/tool, messaggi diretti a tool, channel diversi da final, messaggi marcati nascosti e preamboli, contesti interni, thoughts e reasoning_recap. Per text/multimodal_text si leggono parti stringa, indicando eventuali parti non testuali o allegati. Contenuti sconosciuti sono indicati senza restituzione dei payload; per widget con fallbackMarkdown si usa la rappresentazione testuale disponibile. Nessuna trascrizione automatica, lettura immagini, chiamata ad asset o esecuzione di codice.

La [struttura pubblica esaminata di ChatGPT Exporter](https://github.com/pionxzh/chatgpt-exporter/blob/master/src/api.ts) conferma mapping/current_node/parent e i tipi/indicatori dei messaggi; è un precedente di implementazione, non un contratto pubblico OpenAI. La nostra implementazione è indipendente e più restrittiva (nessun fallback a leaf alternativo, nessun pensiero o output tool). Nessun codice terzo importato.

## Privacy e ciclo di vita

Token solo nella pagina; controlli hash utente prima e dopo, binding/documento e scadenze nel worker come gli altri tool. GET massimo 4 MiB, timeout 10 secondi per richiesta, budget totale 25 secondi o scadenza tunnel più vicina. Il backend restituisce l'intera conversazione e i rami nel JSON: la paginazione limita l'output del tool, non il download interno. Ogni pagina rilegge il JSON; nessuna cache o persistenza di contenuto/cursori. Una chat oltre 4 MiB fallisce in modo esplicito senza risultati parziali non dichiarati. Il costo delle riletture è un limite consapevole rispetto al vincolo di non conservare messaggi.

Il cursore contiene soltanto versione, ID chat, hash della rappresentazione testuale del ramo selezionato e posizione segmento. Nessun testo o credenziale; non è un segreto né un'autorizzazione. La revisione cambia se cambiano testo, ramo, titolo o archivio; fra pagine ciò impone di ricominciare. Non garantisce uno snapshot atomico contro modifiche concorrenti durante una singola richiesta. Il cursore è validato per ID e revisione; può essere passato invariato a ChatGPT per la continuazione.

## Verifiche

69 test locali passati, di cui dieci nuovi test per ramo attivo, esclusioni, limiti, emoji, continuità del testo, cursori, cambi di chat/account/documento, input invalido, errore HTTP, JSON troppo grande e percorso MCP completo simulato. Sintassi e pacchetto Firefox verificati. Prova reale prevista sulla chat di test già usata: lettura con confronto visivo; prova di continuazione con testo noto lungo; nessun contenuto privato richiesto nei report.

## Aggiornamento della prova reale

L'utente conferma che read_chat ha letto il contenuto corretto della chat di test senza errori, tramite ChatGPT con estensione 0.6.0. Il percorso end-to-end è verificato per questo caso. Restano da provare sul browser continuazione paginata, testi lunghi e contenuti non testuali; non dichiararli verificati dalla sola lettura breve.
