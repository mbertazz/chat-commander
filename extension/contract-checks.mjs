// Read-only live schema check. Return shape/status evidence, never sampled content.
import { readLiveChats, readLiveChat, runWorkspace } from './live-source.mjs';
const safeErrors = new Set([
    'source_not_bound', 'source_identity_changed', 'source_workspace_unsupported',
    'source_document_changed', 'source_permission_missing', 'source_tab_unavailable',
    'list_schema_unknown', 'list_order_unknown', 'list_rate_limited', 'list_access_denied',
    'read_schema_unknown', 'read_branch_invalid', 'read_chat_failed', 'read_rate_limited',
    'project_schema_unknown', 'project_permission_missing', 'source_cancelled',
]);
export async function checkSourceContracts(api, source) {
    const checks = [];
    const deadline = performance.now() + 25000;
    async function check(name, operation) {
        try {
            const data = await operation();
            checks.push({
                name, ok: true
            });
            return data;
        }
        catch (error) {
            checks.push({
                name, ok: false, error: safeErrors.has(error.message) ? error.message : 'contract_check_failed'
            });
            return null;
        }
    }
    const recent = await check('recent_chats', () => readLiveChats(api, source, 1, undefined, deadline));
    // Stop on the first failure, especially HTTP 429. No retry or fallback endpoint.
    if (!recent)
        return {
            read_only: true, checks
        };
    if (recent.chats.length) {
        const sample = await check('conversation_text', () => readLiveChat(api, source, {
            id: recent.chats[0].id, limit: 1
        }, undefined, deadline));
        if (!sample)
            return {
                read_only: true, checks
            };
    }
    await check('owned_projects', () => runWorkspace(api, source, 'list_projects', {}, undefined, deadline));
    return {
        read_only: true, checks
    };
}
