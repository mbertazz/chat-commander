// Presentation state is derived, never persisted alongside its underlying facts.
function rawConnectionState({vaultSaved, unlocked, bound, needsToolRefresh}, transport) {
  const errors = {
    poll_http_401: 'Chiave rifiutata da OpenAI: sostituiscila nella configurazione.',
    poll_http_403: 'Accesso al tunnel negato: controlla permessi e associazione del tunnel.',
    poll_http_404: 'Tunnel non disponibile: controlla Tunnel ID e associazione.',
    host_permission_missing: 'Consenti l’accesso a OpenAI per collegarti.',
    network_error: 'Connessione di rete non disponibile. Riprovo automaticamente.',
    network_timeout: 'OpenAI non risponde. Riprovo automaticamente.',
  };
  if (errors[transport?.code]) return {phase: 'attention', message: errors[transport.code]};
  if (transport?.stopped) return {phase: 'attention', message: 'Collegamento interrotto. Controlla la diagnostica e ricollegati.'};
  if (!unlocked) return vaultSaved
    ? {phase: 'locked', message: 'Inserisci la password locale per ricollegarti.'}
    : {phase: 'unconfigured', message: 'Configura il collegamento per iniziare.'};
  if (!bound) return {phase: 'source_needed', message: 'Chiave pronta. Collega una scheda ChatGPT personale.'};
  if (transport?.code !== 'polling') return {phase: 'connecting', message: 'Collegamento al tunnel in corso…'};
  if (needsToolRefresh) return {phase: 'app_setup', message: 'Tunnel e account collegati. Verifica l’app in ChatGPT per iniziare.'};
  return {phase: 'ready', message: 'Tunnel e account collegati. Prova Chat Commander in ChatGPT.'};
}

export function connectionState(state, transport, translate = value => value) {
  const view = rawConnectionState(state, transport);
  return {...view, message: translate(view.message)};
}
