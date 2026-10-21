// Derive the next action from real connection facts, never from a saved wizard step.
export function setupProgress(state, transport) {
    const keyError = ['poll_http_401', 'poll_http_403', 'poll_http_404', 'host_permission_missing'].includes(transport?.code);
    const sourceDone = state.unlocked && !keyError && state.bound && state.sourceConfirmed === true;
    const active = !state.unlocked || keyError ? 1 : !sourceDone ? 2 : 3;
    return {
        active, keyDone: state.unlocked && !keyError, sourceDone,
        appAcknowledged: sourceDone && !state.needsToolRefresh,
        canPair: state.unlocked && !keyError, canAcknowledge: sourceDone
    };
}
