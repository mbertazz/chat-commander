// Bounded read-failure metadata only; never forward raw errors, URLs or content.
export function readDiagnostic(value) {
    if (!value || !['session', 'list', 'search', 'identity', 'conversation'].includes(value.phase) ||
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

// Keep internal error codes, never arbitrary exception messages.
export function readErrorCode(error) {
    return new Set(['read_rate_limited', 'read_chat_failed', 'read_schema_unknown', 'read_branch_invalid',
        'read_cursor_invalid', 'source_workspace_unsupported', 'source_identity_changed', 'source_identity_missing',
        'source_not_bound', 'source_tab_unavailable', 'source_permission_missing', 'source_document_changed',
        'source_document_unavailable', 'source_read_failed', 'source_cancelled']).has(error?.message)
        ? error.message : 'read_failed';
}
