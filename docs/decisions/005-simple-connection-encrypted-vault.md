# 005 — Configurazione semplificata e chiave cifrata

Data: 20 ottobre 2026. Stato: implementata nella 0.8.0, prova reale pendente.

L'utente ha autorizzato il salvataggio su disco se compatibile con la sicurezza e richiesto la configurazione più semplice possibile. Questo aggiorna la precedente scelta di conservare esclusivamente in sessione la chiave runtime; non autorizza la persistenza dei contenuti delle conversazioni.

## Decisione e compromesso

Lo [storage WebExtensions non è cifrato](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage). Non viene salvata una chiave API in chiaro né una chiave di decifratura accanto al cifrato. Il salvataggio facoltativo usa Web Crypto: AES-GCM 256 bit, salt casuale 16 byte, nonce casuale 12 byte, tag 128 bit; chiave derivata dalla password con PBKDF2-HMAC-SHA256, 600.000 iterazioni. Il parametro segue il riferimento [OWASP per PBKDF2](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html); non costituisce certificazione o audit crittografico del prodotto. Web Crypto è documentato da [MDN](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey).

Password locale di almeno 12 caratteri (massimo 256), mai salvata dall'estensione. Tunnel ID autenticato come additionalData, così il cifrato non può essere riassegnato silenziosamente a un altro tunnel. Formato e costo KDF sono fissi e validati prima della derivazione. Salt e nonce nuovi a ogni salvataggio. Errori generici, senza chiavi o password nei log/report.

La protezione riguarda la copia del file a riposo, con robustezza dipendente dalla password scelta. Non protegge da browser, estensione, sessione sbloccata o computer compromessi. Non è un portachiavi OS né garantisce cancellazione forense. Una password dimenticata richiede nuova chiave/configurazione. Memorizzare la password insieme al cifrato per avere avvio automatico senza sblocco vanificherebbe questa protezione.

## Esperienza

Prima configurazione: Tunnel ID, chiave API e password locale ripetuta; Salva e collega chiede i permessi e cifra la chiave. Con un'unica scheda ChatGPT disponibile la collega direttamente. Con più schede richiede selezione esplicita. La casella Ricorda può essere disattivata per il solo uso in sessione. La creazione iniziale del tunnel e dell'app rimane un prerequisito manuale: nessuna nuova risorsa OpenAI viene creata dall'estensione.

Dopo riavvio o reload: Sblocca e ricollega usa la password locale. Durante la stessa sessione la chiave in chiaro resta esclusivamente in storage.session; la sospensione del worker non richiede reinserimento. Blocca arresta il tunnel e rimuove configurazione in chiaro/binding, mantenendo il vault. Dimentica rimuove anche vault e impronta dell'account. La conferma App e tool aggiornati è un promemoria locale, non una verifica remota dell'installazione; non viene richiesta a ogni connessione.

## Permessi e ripristino

Aggiunto soltanto l'host opzionale https://chatgpt.com/*, richiesto da un gesto utente insieme ai permessi scripting/activeTab. Nessuna aggiunta agli host obbligatori, nessun permesso cookies/tabs globale, nessun servizio nativo o accesso a un keychain. Con il permesso opzionale il pulsante Collega ChatGPT evita il vecchio passaggio arma-poi-clicca; anche il clic diretto sull'icona dalla scheda funziona senza armarlo.

Un'associazione manuale salva solo l'hash dell'ID utente come impronta locale dell'account autorizzato. Il ripristino automatico richiede modalità live, preferenza attiva e permesso host; può associare soltanto lo stesso hash. Non stabilisce fiducia in un account nuovo e non esamina più di cinque sessioni candidate per tentativo. La selezione manuale è necessaria in casi ambigui. Non promette isolamento workspace o supporto multiutente oltre ai limiti personali già documentati.

Gli eventi di caricamento/chiusura scheda e l'allarme periodico riprovano il collegamento. Se il documento cambia, i piani di revisione pendenti vengono invalidati prima del nuovo binding. I controlli account/documento restano attivi su ogni tool. La revoca del permesso rimuove il binding e disattiva il ripristino. Nessuna scrittura ChatGPT è eseguita dalla configurazione o dalla riconnessione.

## Dati persistenti e limitazioni

storage.local: solo vault cifrato, Tunnel ID, preferenze, impronta hash dell'account e promemoria versione tool. Mai storage.sync, password, token della sessione ChatGPT, testo delle chat o piani di revisione. Dove disponibile, setAccessLevel restringe session e local ai contesti attendibili dell'estensione; non sono dichiarati content script permanenti o messaggi esterni.

L'[installazione temporanea Firefox](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/) non sopravvive al riavvio del browser: questo miglioramento non la trasforma in installazione stabile. Serve successivamente un pacchetto firmato. I dati locali delle installazioni temporanee possono sopravvivere alla rimozione: usare Dimentica prima di rimuovere una configurazione di prova; non fare affidamento sulla disinstallazione temporanea per cancellarla.

## Verifiche

98 test locali passati: cifratura e sblocco, nonce/salt differenti, password errata, alterazioni, tunnel differente, limiti KDF, account diverso, documenti ricaricati, revoca dei permessi, scelta manuale, stato senza segreti, blocco, dimenticanza, riavvio simulato con solo storage su disco mantenuto e flusso reale dei moduli options/worker con DOM/browser simulati. Nessuna chiave reale usata nei test.

La prova su Firefox autenticato resta da eseguire, inclusi dialoghi dei nuovi permessi, sblocco dopo reload, riconnessione della scheda e installazione firmata prima di promettere l'esperienza definitiva dopo riavvio.
