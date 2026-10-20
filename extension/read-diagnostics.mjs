// Bounded read-failure metadata only; never forward raw errors, URLs or content.
export function readDiagnostic(value) {
    if (!value || !['session', 'list', 'search', 'identity'].includes(value.phase) ||
        !(value.http_status === null || Number.isInteger(value.http_status) && value.http_status >= 100 && value.http_status <= 599) ||
        ![
            'timeout', 'aborted', 'network', 'http', 'other'
        ].includes(value.failure) ||
        !Number.isInteger(value.elapsed_ms) || value.elapsed_ms < 0 || value.elapsed_ms > 60000)
        return null;
    return {
        phase: value.phase, http_status: value.http_status, failure: value.failure, elapsed_ms: value.elapsed_ms
    };
}
