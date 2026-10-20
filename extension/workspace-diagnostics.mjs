// Fixed vocabulary only: never forward page errors, URLs, headers or payloads.
export function workspaceDiagnostic(value) {
  const phases = ['write', 'write_response', 'acknowledgement', 'identity_after_write',
    'read_back', 'read_back_response', 'read_back_content', 'identity_after_read'];
  if (!value || !phases.includes(value.phase) ||
      !(value.http_status === null || (Number.isInteger(value.http_status) && value.http_status >= 100 && value.http_status <= 599))) return null;
  const result = {phase: value.phase, http_status: value.http_status};
  if (['write_timeout', 'request_timeout', 'request_aborted', 'fetch_type_error', 'other'].includes(value.failure)) result.failure = value.failure;
  for (const key of ['write_signal_aborted', 'deadline_expired']) {
    if (typeof value[key] === 'boolean') result[key] = value[key];
  }
  for (const [key, maximum] of [['elapsed_ms', 60000], ['write_timeout_ms', 20000]]) {
    if (Number.isInteger(value[key]) && value[key] >= 0 && value[key] <= maximum) result[key] = value[key];
  }
  return result;
}
