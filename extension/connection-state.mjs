// Presentation state is derived, never persisted alongside its underlying facts.
function rawConnectionState({ vaultSaved, unlocked, bound, needsToolRefresh }, transport) {
    const errors = {
        poll_http_401: 'ui_068',
        poll_http_403: 'ui_069',
        poll_http_404: 'ui_070',
        host_permission_missing: 'ui_071',
        network_error: 'ui_072',
        network_timeout: 'ui_073',
    };
    if (errors[transport?.code])
        return {
            phase: 'attention', message: errors[transport.code]
        };
    if (transport?.stopped)
        return {
            phase: 'attention', message: 'ui_074'
        };
    if (!unlocked)
        return vaultSaved
            ? {
                phase: 'locked', message: 'ui_075'
            }
            : {
                phase: 'unconfigured', message: 'ui_076'
            };
    if (!bound)
        return {
            phase: 'source_needed', message: 'ui_077'
        };
    if (transport?.code !== 'polling')
        return {
            phase: 'connecting', message: 'ui_078'
        };
    if (needsToolRefresh)
        return {
            phase: 'app_setup', message: 'ui_079'
        };
    return {
        phase: 'ready', message: 'ui_080'
    };
}
export function connectionState(state, transport, translate = value => value) {
    const view = rawConnectionState(state, transport);
    return {
        ...view, message: translate(view.message)
    };
}
