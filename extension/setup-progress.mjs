// Derive the next action from real connection facts, never from a saved wizard step.
export function setupProgress(state, transport) {
  const keyError = ['poll_http_401', 'poll_http_403', 'poll_http_404', 'host_permission_missing'].includes(transport?.code);
  const active = !state.unlocked || keyError ? 1 : !state.bound ? 2 : 3;
  return {active, keyDone: state.unlocked && !keyError, sourceDone: state.unlocked && state.bound,
    appAcknowledged: state.unlocked && state.bound && !state.needsToolRefresh,
    canPair: state.unlocked && !keyError, canAcknowledge: state.unlocked && state.bound};
}
