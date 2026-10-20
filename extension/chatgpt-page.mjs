// The only function serialized into the selected ChatGPT page's MAIN world.
// No imports, storage, logging, arbitrary URLs or automatic mutation retries.
export async function chatgptPage(operation, args = {}, expectedUserHash = null, expiresAt = Date.now() + 25000) {
    if (globalThis.location.origin !== 'https://chatgpt.com' || globalThis.top !== globalThis)
        return { code: 'wrong_page' };
    if (![
        'bind', 'list_chats', 'search_chats', 'get_chat', 'rename_chat', 'set_chat_archived', 'read_chat', 'list_projects', 'get_project', 'workspace_chat', 'check_project_name', 'create_project', 'move_chat', 'delete_chat'
    ].includes(operation) ||
        !Number.isFinite(expiresAt))
        return { code: 'invalid_source_request' };
    if (operation !== 'bind' && (typeof expectedUserHash !== 'string' || !/^[a-f0-9]{64}$/.test(expectedUserHash)))
        return { code: 'source_not_bound' };
    const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
    const expired = () => Date.now() >= expiresAt;
    let lastSignal;
    let lastHttpStatus = null;
    const options = (timeout = 10000) => {
        lastHttpStatus = null;
        lastSignal = AbortSignal.timeout(Math.max(1, Math.min(timeout, expiresAt - Date.now())));
        return {
            method: 'GET', credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: lastSignal
        };
    };
    let token;
    let userHash;
    let patchStarted = false;
    async function json(response, maximum = 4194304) {
        lastHttpStatus = response.status;
        if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
            await response.body?.cancel();
            throw new Error('invalid_response');
        }
        const reader = response.body.getReader();
        const chunks = [];
        let size = 0;
        try {
            for (;;) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                size += value.byteLength;
                if (size > maximum)
                    throw new Error('response_too_large');
                chunks.push(value);
            }
        }
        finally {
            await reader.cancel().catch(() => { });
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.length;
        }
        return JSON.parse(new TextDecoder().decode(bytes));
    }
    async function hash(value) {
        const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
        return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
    }
    async function session() {
        if (expired())
            throw new Error('source_cancelled');
        const data = await json(await globalThis.fetch('/api/auth/session', options()), 262144);
        if (typeof data?.user?.id !== 'string' || !data.user.id)
            throw new Error('source_identity_missing');
        let accountId = null;
        let plan = null;
        if (Array.isArray(data.accounts) && data.accounts.length > 1 ||
            object(data.accounts) && !Array.isArray(data.accounts) && Object.keys(data.accounts).length > 1)
            throw new Error('source_workspace_unsupported');
        if (object(data.account)) {
            if (typeof data.account.id === 'string')
                accountId = data.account.id;
            plan = data.account.plan_type ?? data.account.planType ?? null;
        }
        // Only inspect the account claims in the already-local session token. Never return it.
        const payload = typeof data.accessToken === 'string' ? data.accessToken.split('.')[1] : null;
        if (payload && typeof globalThis.atob === 'function') {
            try {
                const claims = JSON.parse(globalThis.atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
                const auth = claims?.['https://api.openai.com/auth'];
                if (typeof auth?.chatgpt_account_id === 'string') {
                    if (accountId && accountId !== auth.chatgpt_account_id)
                        throw new Error('source_workspace_unsupported');
                    accountId = auth.chatgpt_account_id;
                }
                plan = auth?.chatgpt_plan_type ?? plan;
            }
            catch (error) {
                if (error.message === 'source_workspace_unsupported')
                    throw error;
            }
        }
        if (plan && !['free', 'plus', 'pro'].includes(plan))
            throw new Error('source_workspace_unsupported');
        const nextHash = await hash(accountId ? JSON.stringify([data.user.id, accountId]) : data.user.id);
        if ((expectedUserHash !== null && nextHash !== expectedUserHash) || (userHash && userHash !== nextHash))
            return false;
        if (typeof data.accessToken !== 'string' || !/^[\x21-\x7e]+$/.test(data.accessToken))
            throw new Error('session_token_missing');
        userHash = nextHash;
        token = data.accessToken;
        return true;
    }
    async function listOrSearch() {
        const mode = operation === 'search_chats' ? 'search' : 'live';
        const limit = args?.limit;
        const searchArgs = args;
        if (!Number.isInteger(limit) || limit < 1 || limit > 50)
            return { code: 'invalid_source_request' };
        let stage = 'session';
        const startedAt = Date.now();
        const readFailure = (code, error) => ({
            code, diagnostic: {
                phase: stage, http_status: lastHttpStatus,
                failure: lastSignal?.aborted && lastSignal.reason?.name === 'TimeoutError' || error?.name === 'TimeoutError' ? 'timeout'
                    : error?.name === 'AbortError' ? 'aborted' : error?.name === 'TypeError' ? 'network'
                        : lastHttpStatus !== null && lastHttpStatus >= 400 ? 'http' : 'other',
                elapsed_ms: Math.max(0, Math.min(60000, Date.now() - startedAt))
            }
        });
        const httpFailure = (prefix, status) => status === 429 ? `${prefix}_rate_limited`
            : status === 401 || status === 403 ? `${prefix}_access_denied` : `${prefix}_failed`;
        try {
            if (!(await session()))
                return { code: 'source_identity_changed' };
            if (mode === 'search') {
                if (!object(searchArgs) || typeof searchArgs.query !== 'string' || !searchArgs.query.trim() || searchArgs.query.length > 200 || limit > 10)
                    return { code: 'search_schema_unknown' };
                stage = 'search';
                let cursor = null;
                let queryId = globalThis.crypto.randomUUID();
                if (searchArgs.cursor !== undefined) {
                    if (typeof searchArgs.cursor !== 'string' || searchArgs.cursor.length > 40000)
                        return { code: 'search_cursor_invalid' };
                    let continuation;
                    try {
                        continuation = JSON.parse(searchArgs.cursor);
                    }
                    catch {
                        return { code: 'search_cursor_invalid' };
                    }
                    if (!object(continuation) || continuation.query !== searchArgs.query ||
                        typeof continuation.cursor !== 'string' || !continuation.cursor || continuation.cursor.length > 32768 ||
                        typeof continuation.queryId !== 'string' || !/^[a-f0-9-]{36}$/.test(continuation.queryId))
                        return { code: 'search_cursor_invalid' };
                    cursor = continuation.cursor;
                    queryId = continuation.queryId;
                }
                const response = await globalThis.fetch('/backend-api/global/search', {
                    ...options(), method: 'POST',
                    headers: {
                        Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        entrypoint: 'global_search', query: searchArgs.query, limit,
                        source_requests: [{ type: 'conversation' }], cursor, query_id: queryId
                    })
                });
                lastHttpStatus = response.status;
                if (!response.ok) {
                    await response.body?.cancel();
                    return readFailure(httpFailure('search', response.status));
                }
                const data = await json(response, 1048576);
                if (!object(data) || !Array.isArray(data.items) || data.items.length > limit ||
                    typeof data.partial_results !== 'boolean' || !Array.isArray(data.source_statuses) || data.source_statuses.length !== 1 ||
                    !(data.cursor === null || (typeof data.cursor === 'string' && data.cursor.length > 0 && data.cursor.length <= 32768)))
                    return { code: 'search_schema_unknown' };
                const source = data.source_statuses[0];
                if (!object(source) || source.source_type !== 'conversation' || source.source_key !== 'conversation' ||
                    typeof source.has_more !== 'boolean' || typeof source.status !== 'string' ||
                    source.has_more !== (data.cursor !== null) || (cursor !== null && data.cursor === cursor))
                    return { code: 'search_schema_unknown' };
                const partial = data.partial_results || source.status !== 'ok' || source.error_code !== null;
                const chats = [];
                const seen = new Set();
                for (const item of data.items) {
                    if (!object(item) || item.source_type !== 'conversation' || item.source_key !== 'conversation' ||
                        item.payload?.kind !== 'conversation' || typeof item.payload.conversation_id !== 'string' ||
                        !item.payload.conversation_id || item.payload.conversation_id.length > 256 ||
                        typeof item.title !== 'string' || item.title.length > 4096 ||
                        !(item.snippet === null || typeof item.snippet === 'string') ||
                        typeof item.payload.is_archived !== 'boolean' ||
                        !['title', 'content'].includes(item.match_kind) || typeof item.update_time !== 'number' ||
                        !Number.isFinite(item.update_time) || Math.abs(item.update_time * 1000) > 8640000000000000)
                        return { code: 'search_schema_unknown' };
                    const id = item.payload.conversation_id;
                    if (seen.has(id))
                        continue;
                    seen.add(id);
                    chats.push({
                        id, title: item.title, snippet: item.snippet === null ? null : item.snippet.slice(0, 500),
                        snippet_truncated: typeof item.snippet === 'string' && item.snippet.length > 500,
                        updated_at: new Date(item.update_time * 1000).toISOString(), archived: item.payload.is_archived,
                        match_kind: item.match_kind, project_id: null
                    });
                }
                stage = 'identity';
                if (!(await session()))
                    return { code: 'source_identity_changed' };
                return {
                    code: 'live_search_ok', chats, has_more: source.has_more, partial_results: partial,
                    next_cursor: data.cursor === null ? null : JSON.stringify({
                        query: searchArgs.query, cursor: data.cursor, queryId
                    })
                };
            }
            stage = 'list';
            // Internal endpoint: validate shape and ordering before returning metadata.
            const path = `/backend-api/conversations?offset=0&limit=${limit}&order=updated&is_archived=false`;
            const listResponse = await globalThis.fetch(path, {
                ...options(), headers: { Authorization: `Bearer ${token}` },
            });
            lastHttpStatus = listResponse.status;
            if (!listResponse.ok) {
                await listResponse.body?.cancel();
                return readFailure(httpFailure('list', listResponse.status));
            }
            const list = await json(listResponse, 262144);
            if (!object(list) || !Array.isArray(list.items))
                return { code: 'list_schema_unknown' };
            if (list.items.length > limit)
                return { code: 'list_limit_ignored' };
            if (!list.items.every(object))
                return { code: 'list_schema_unknown' };
            const date = value => {
                if (value == null)
                    return null;
                const ms = typeof value === 'number' ? value * 1000 : typeof value === 'string' ? Date.parse(value) : NaN;
                return Number.isFinite(ms) && Math.abs(ms) <= 8640000000000000 ? new Date(ms).toISOString() : null;
            };
            if (list.items.some(item => typeof item.id !== 'string' || !item.id || item.id.length > 256 ||
                typeof item.title !== 'string' || item.title.length > 4096 || item.is_archived !== false)) {
                return { code: 'list_schema_unknown' };
            }
            const chats = list.items.map(item => ({
                id: item.id, title: item.title,
                created_at: date(item.create_time), updated_at: date(item.update_time),
                project_id: null, source_gizmo_id: typeof item.gizmo_id === 'string' && item.gizmo_id.length <= 256 ? item.gizmo_id : null,
                archived: false
            }));
            // Never claim an ordering that contradicts the actual response.
            if (chats.some(chat => chat.updated_at === null) ||
                chats.some((chat, i) => i > 0 && chat.updated_at > chats[i - 1].updated_at))
                return { code: 'list_order_unknown' };
            // Recheck the session to reject an account change while the list was read.
            stage = 'identity';
            if (!(await session()))
                return { code: 'source_identity_changed' };
            return {
                code: 'live_list_ok', chats
            };
        }
        catch (error) {
            const code = ['source_identity_missing', 'source_workspace_unsupported', 'session_token_missing', 'source_cancelled'].includes(error.message)
                ? error.message : stage === 'session' || stage === 'identity' ? 'session_read_failed' : stage === 'search' ? 'search_read_failed' : 'list_read_failed';
            return readFailure(code, error);
        }
    }
    async function action(name) {
        const id = args?.id;
        if (!['get_chat', 'rename_chat', 'set_chat_archived'].includes(name) ||
            typeof id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id) ||
            typeof expectedUserHash !== 'string' || !/^[a-f0-9]{64}$/.test(expectedUserHash) ||
            !Number.isFinite(expiresAt))
            return { code: 'action_invalid' };
        const write = name !== 'get_chat';
        if (write && (typeof args.expected_title !== 'string' || !args.expected_title || args.expected_title.length > 4096))
            return { code: 'action_invalid' };
        if ((name === 'rename_chat' && (typeof args.title !== 'string' || !args.title.trim() || args.title.length > 200)) ||
            (name === 'set_chat_archived' && (typeof args.archived !== 'boolean' || typeof args.expected_archived !== 'boolean')))
            return { code: 'action_invalid' };
        async function metadata() {
            if (expired())
                throw new Error();
            const data = await json(await globalThis.fetch(`/backend-api/conversation/${id}`, {
                ...options(), method: 'GET',
                headers: { Authorization: `Bearer ${token}` }
            }));
            // Full messages can arrive in this internal endpoint; only metadata leaves.
            if (data?.conversation_id?.toLowerCase() !== id.toLowerCase() || typeof data.title !== 'string' ||
                !data.title || data.title.length > 4096 || typeof data.is_archived !== 'boolean')
                throw new Error();
            return {
                id, title: data.title, archived: data.is_archived, url: `https://chatgpt.com/c/${id}`
            };
        }
        try {
            if (!(await session()))
                return { code: 'source_identity_changed' };
            const before = await metadata();
            if (!write) {
                if (!(await session()))
                    return { code: 'source_identity_changed' };
                return {
                    code: 'action_ok', action: name, changed: false, chat: before
                };
            }
            const desired = name === 'rename_chat' ? before.title === args.title : before.archived === args.archived;
            if (before.title !== args.expected_title && !(name === 'rename_chat' && desired))
                return { code: 'action_conflict' };
            if (name === 'set_chat_archived' && before.archived !== args.expected_archived && !desired)
                return { code: 'action_conflict' };
            if (!(await session()))
                return { code: 'source_identity_changed' };
            if (expired())
                return { code: 'source_cancelled' };
            if (desired)
                return {
                    code: 'action_ok', action: name, changed: false, chat: before
                };
            if (globalThis.location.pathname?.toLowerCase().endsWith(`/c/${id.toLowerCase()}`))
                return { code: 'workspace_current_chat' };
            const patch = name === 'rename_chat' ? { title: args.title } : { is_archived: args.archived };
            patchStarted = true;
            const response = await globalThis.fetch(`/backend-api/conversation/${id}`, {
                ...options(), method: 'PATCH',
                headers: {
                    Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'
                }, body: JSON.stringify(patch)
            });
            const result = await json(response);
            if (result?.success !== true)
                return { code: 'action_outcome_unknown' };
            if (!(await session()))
                return { code: 'action_outcome_unknown' };
            const after = await metadata();
            if ((name === 'rename_chat' && (after.title !== args.title || after.archived !== before.archived)) ||
                (name === 'set_chat_archived' && (after.archived !== args.archived || after.title !== before.title)))
                return { code: 'action_outcome_unknown' };
            if (!(await session()))
                return { code: 'action_outcome_unknown' };
            return {
                code: 'action_ok', action: name, changed: true, chat: after
            };
        }
        catch {
            return { code: patchStarted ? 'action_outcome_unknown' : 'action_read_failed' };
        }
    }
    async function read() {
        const id = args?.id;
        const limit = args?.limit ?? 10;
        if (typeof id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id) ||
            !Number.isInteger(limit) || limit < 1 || limit > 20 || typeof expectedUserHash !== 'string' ||
            !/^[a-f0-9]{64}$/.test(expectedUserHash) || !Number.isFinite(expiresAt))
            return { code: 'read_schema_unknown' };
        let continuation = null;
        if (args.cursor !== undefined) {
            try {
                if (typeof args.cursor !== 'string' || args.cursor.length > 1024)
                    throw new Error();
                continuation = JSON.parse(args.cursor);
                if (!object(continuation) || continuation.version !== 1 || continuation.id !== id ||
                    typeof continuation.revision !== 'string' || !/^[a-f0-9]{64}$/.test(continuation.revision) ||
                    !Number.isInteger(continuation.index) || continuation.index < 0 ||
                    !Number.isInteger(continuation.offset) || continuation.offset < 0)
                    throw new Error();
            }
            catch {
                return { code: 'read_cursor_invalid' };
            }
        }
        try {
            if (!(await session()))
                return { code: 'source_identity_changed' };
            if (expired())
                return { code: 'source_cancelled' };
            const data = await json(await globalThis.fetch(`/backend-api/conversation/${id}`, {
                ...options(), headers: { Authorization: `Bearer ${token}` }
            }));
            if (data?.conversation_id?.toLowerCase() !== id.toLowerCase() || typeof data.title !== 'string' || data.title.length > 4096 ||
                typeof data.is_archived !== 'boolean' || !object(data.mapping) || typeof data.current_node !== 'string' || !data.current_node)
                return { code: 'read_schema_unknown' };
            const chain = [];
            const seen = new Set();
            let key = data.current_node;
            while (key !== null && key !== undefined) {
                if (typeof key !== 'string' || !key || key.length > 256 || seen.has(key) || seen.size >= 10000 ||
                    !Object.hasOwn(data.mapping, key) || !object(data.mapping[key]))
                    return { code: 'read_branch_invalid' };
                seen.add(key);
                const node = data.mapping[key];
                chain.push({
                    key, message: node.message
                });
                key = node.parent;
            }
            chain.reverse();
            const visible = [];
            let omitted = 0;
            let unsupported = 0;
            for (const node of chain) {
                const m = node.message;
                if (m == null)
                    continue;
                if (!object(m))
                    return { code: 'read_schema_unknown' };
                if (!['user', 'assistant'].includes(m.author?.role) ||
                    (m.recipient !== undefined && m.recipient !== 'all') ||
                    (m.channel != null && m.channel !== 'final') ||
                    m.metadata?.is_visually_hidden_from_conversation || m.metadata?.is_thinking_preamble_message ||
                    ['model_editable_context', 'user_editable_context', 'thoughts', 'reasoning_recap'].includes(m.content?.content_type)) {
                    omitted++;
                    continue;
                }
                const type = m.content?.content_type;
                let text = '';
                let unsupportedContent = false;
                if (['text', 'multimodal_text'].includes(type)) {
                    if (!Array.isArray(m.content.parts))
                        return { code: 'read_schema_unknown' };
                    text = m.content.parts.filter(part => typeof part === 'string').join('\n');
                    unsupportedContent = m.content.parts.some(part => typeof part !== 'string') || Boolean(m.metadata?.attachments?.length);
                    // Interactive widgets can contain code instead of visible text.
                    if (typeof m.metadata?.model_dil_v2?.fallbackMarkdown === 'string')
                        text = m.metadata.model_dil_v2.fallbackMarkdown;
                }
                else {
                    unsupportedContent = true;
                }
                if (!text && !unsupportedContent)
                    continue;
                if (unsupportedContent)
                    unsupported++;
                visible.push({
                    id: node.key, role: m.author.role, text, unsupported_content: unsupportedContent
                });
            }
            const revision = await hash(JSON.stringify({
                id: id.toLowerCase(), title: data.title, archived: data.is_archived,
                leaf: data.current_node, messages: visible, omitted
            }));
            if (continuation && continuation.revision !== revision)
                return { code: 'read_chat_changed' };
            let index = continuation?.index ?? 0;
            let offset = continuation?.offset ?? 0;
            if (index > visible.length || (index === visible.length && offset !== 0) ||
                (index < visible.length && (offset > visible[index].text.length || (offset === visible[index].text.length && offset !== 0))))
                return { code: 'read_cursor_invalid' };
            const messages = [];
            let budget = 12000;
            while (index < visible.length && messages.length < limit && budget > 0) {
                const message = visible[index];
                let end = Math.min(message.text.length, offset + Math.min(2000, budget));
                // Avoid splitting a UTF-16 surrogate pair between segments.
                if (end < message.text.length && end > offset && /[\uD800-\uDBFF]/.test(message.text[end - 1]) && /[\uDC00-\uDFFF]/.test(message.text[end]))
                    end--;
                if (end === offset && message.text.length > offset)
                    break;
                const text = message.text.slice(offset, end);
                const moreText = end < message.text.length;
                messages.push({
                    id: message.id, role: message.role, text, text_offset: offset,
                    has_more_text: moreText, unsupported_content: message.unsupported_content
                });
                budget -= text.length;
                if (moreText) {
                    offset = end;
                }
                else {
                    index++;
                    offset = 0;
                }
            }
            if (!(await session()))
                return { code: 'source_identity_changed' };
            if (expired())
                return { code: 'source_cancelled' };
            const hasMore = index < visible.length;
            return {
                code: 'read_chat_ok', chat: {
                    id, title: data.title, archived: data.is_archived
                }, messages,
                has_more: hasMore, next_cursor: hasMore ? JSON.stringify({
                    version: 1, id, revision, index, offset
                }) : null,
                omitted_internal_messages: omitted, unsupported_messages: unsupported
            };
        }
        catch (error) {
            return { code: lastHttpStatus === 429 ? 'read_rate_limited' : error.message === 'source_workspace_unsupported' ? error.message : 'read_chat_failed' };
        }
    }
    // Project operations are candidate internal API contracts, never URL parameters.
    async function workspace() {
        let phase = 'write';
        let httpStatus = null;
        let writeSignal;
        let writeStartedAt;
        let writeTimeout;
        const stage = (name, status = null) => { phase = name; httpStatus = status; };
        const projectId = value => typeof value === 'string' && /^g-p-[a-f0-9]{32}$/.test(value);
        const chatId = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
        const fail = code => { throw new Error(code); };
        const check = async () => {
            if (!(await session()))
                fail('source_identity_changed');
        };
        const get = async (path) => {
            if (expired())
                fail('source_cancelled');
            return json(await globalThis.fetch(path, {
                ...options(), headers: { Authorization: `Bearer ${token}` }
            }));
        };
        function normalizeProject(g) {
            if (!object(g) || !projectId(g.id) || typeof g.display?.name !== 'string' || !g.display.name || g.display.name.length > 100 ||
                (g.gizmo_type !== undefined && g.gizmo_type !== 'snorlax'))
                fail('project_schema_unknown');
            const evidence = [];
            const nonPrivate = [
                'link', 'workspace', 'public', 'organization', 'team'
            ];
            if (typeof g.is_shared === 'boolean')
                evidence.push(g.is_shared);
            if (Array.isArray(g.sharing) && g.sharing.length > 0 && g.sharing.every(s => typeof s?.type === 'string'))
                evidence.push(!g.sharing.every(s => s.type === 'private'));
            if (object(g.sharing)) {
                const { recipient, subjects } = g.sharing;
                // Observed detail schema: private means invitation-only. Explicit subjects
                // still make it shared; only an explicitly empty list proves no invitees.
                if (Array.isArray(subjects) && subjects.length > 0)
                    evidence.push(true);
                if (recipient === 'private' && Array.isArray(subjects) && subjects.length === 0)
                    evidence.push(false);
                if (nonPrivate.includes(recipient))
                    evidence.push(true);
                if ((recipient === 'private' || nonPrivate.includes(recipient)) &&
                    (g.share_recipient === 'private' || nonPrivate.includes(g.share_recipient)) &&
                    recipient !== g.share_recipient)
                    fail('project_schema_unknown');
            }
            if (nonPrivate.includes(g.share_recipient))
                evidence.push(true);
            // sharing_targets describes allowed sharing options, not current access.
            if (evidence.includes(true) && evidence.includes(false))
                fail('project_schema_unknown');
            const shared = evidence.length ? evidence[0] : null;
            return {
                id: g.id, name: g.display.name, shared,
                can_write: typeof g.current_user_permission?.can_write === 'boolean' ? g.current_user_permission.can_write : null,
                memory_scope: ['global', 'project_v2'].includes(g.memory_scope) ? g.memory_scope : null
            };
        }
        async function project(id) {
            if (!projectId(id))
                fail('project_invalid');
            const data = await get(`/backend-api/gizmos/${id}`);
            const value = normalizeProject(data?.gizmo?.gizmo ?? data?.gizmo);
            if (value.id !== id)
                fail('project_schema_unknown');
            return value;
        }
        async function page(cursor = undefined) {
            let rawCursor;
            if (cursor !== undefined) {
                if (typeof cursor !== 'string' || !cursor || cursor.length > 12000)
                    fail('project_cursor_invalid');
                try {
                    const c = JSON.parse(cursor);
                    if (!object(c) || c.version !== 1 || !(typeof c.cursor === 'string' && c.cursor.length > 0 && c.cursor.length <= 8192 ||
                        Number.isSafeInteger(c.cursor) && c.cursor >= 0))
                        fail('project_cursor_invalid');
                    rawCursor = c.cursor;
                }
                catch {
                    fail('project_cursor_invalid');
                }
            }
            const data = await get('/backend-api/gizmos/snorlax/sidebar?owned_only=true&conversations_per_gizmo=0&limit=20' +
                (rawCursor !== undefined ? `&cursor=${encodeURIComponent(rawCursor)}` : ''));
            if (!object(data) || !Array.isArray(data.items) || data.items.length > 20 ||
                !(data.cursor === null || typeof data.cursor === 'string' && data.cursor.length > 0 && data.cursor.length <= 8192 ||
                    Number.isSafeInteger(data.cursor) && data.cursor >= 0) ||
                rawCursor !== undefined && data.cursor === rawCursor)
                fail('project_schema_unknown');
            const projects = data.items.map(item => normalizeProject(item?.gizmo?.gizmo));
            if (new Set(projects.map(p => p.id)).size !== projects.length)
                fail('project_schema_unknown');
            return {
                projects, has_more: data.cursor !== null, next_cursor: data.cursor === null ? null : JSON.stringify({
                    version: 1, cursor: data.cursor
                })
            };
        }
        async function ownedProjects() {
            const all = [];
            const seen = new Set();
            let cursor;
            for (let i = 0; i < 5; i++) {
                const data = await page(cursor);
                if (data.projects.some(p => all.some(previous => previous.id === p.id)))
                    fail('project_schema_unknown');
                all.push(...data.projects);
                if (!data.has_more)
                    return all;
                cursor = data.next_cursor;
                if (seen.has(cursor))
                    fail('project_cursor_invalid');
                seen.add(cursor);
            }
            fail('project_scan_limit'); // Never infer absence/ownership from an incomplete scan.
        }
        async function available(name) {
            if (typeof name !== 'string' || !name.trim() || name.length > 100)
                fail('project_invalid');
            if ((await ownedProjects()).some(p => p.name.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase()))
                fail('project_exists');
        }
        async function metadata(id) {
            if (!chatId(id))
                fail('project_invalid');
            const data = await get(`/backend-api/conversation/${id}`);
            if (data?.conversation_id?.toLowerCase() !== id.toLowerCase() || typeof data.title !== 'string' || !data.title || data.title.length > 4096 ||
                typeof data.is_archived !== 'boolean' || !Object.hasOwn(data, 'gizmo_id') ||
                !(data.gizmo_id === null || data.gizmo_id === '' || projectId(data.gizmo_id)))
                fail('project_chat_unsupported');
            if (data.is_visible === false)
                fail('project_chat_unsupported');
            return {
                id, title: data.title, archived: data.is_archived, project_id: data.gizmo_id || null
            };
        }
        async function safeProject(id) {
            const value = await project(id);
            if (value.shared !== false)
                fail('project_sharing_unknown');
            if (value.can_write !== true)
                fail('project_permission_missing');
            if (!(await ownedProjects()).some(p => p.id === id))
                fail('project_not_owned');
            return value;
        }
        async function write(path, method, body) {
            await check();
            if (expired())
                fail('source_cancelled');
            if (['move_chat', 'delete_chat'].includes(operation) && globalThis.location.pathname?.toLowerCase().endsWith(`/c/${args.before.id.toLowerCase()}`))
                fail('workspace_current_chat');
            // Reserve five seconds for identity and independent read-back checks.
            const timeout = operation === 'delete_chat' ? Math.min(20000, expiresAt - Date.now() - 5000) : 10000;
            if (timeout <= 0)
                fail('source_cancelled');
            const requestOptions = options(timeout);
            writeSignal = requestOptions.signal;
            writeTimeout = timeout;
            writeStartedAt = Date.now();
            patchStarted = true;
            stage('write');
            const response = await globalThis.fetch(path, {
                ...requestOptions, method,
                headers: {
                    Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'
                }, body: JSON.stringify(body)
            });
            stage('write_response', response.status);
            return json(response);
        }
        try {
            await check();
            if (operation === 'list_projects') {
                const data = await page(args.cursor);
                await check();
                return {
                    code: 'workspace_ok', ...data
                };
            }
            if (operation === 'get_project') {
                const value = await project(args.id);
                await check();
                return {
                    code: 'workspace_ok', project: value
                };
            }
            if (operation === 'workspace_chat') {
                const chat = await metadata(args.id);
                await check();
                return {
                    code: 'workspace_ok', chat
                };
            }
            if (operation === 'check_project_name') {
                await available(args.name);
                await check();
                return {
                    code: 'workspace_ok', available: true
                };
            }
            if (operation === 'create_project') {
                await available(args.name);
                const data = await write('/backend-api/projects', 'POST', {
                    name: args.name, instructions: ''
                });
                const id = data?.resource?.gizmo?.id ?? data?.gizmo?.gizmo?.id ?? data?.gizmo?.id ?? data?.id;
                if (!projectId(id))
                    fail('action_outcome_unknown');
                await check();
                const value = await project(id);
                await check();
                if (value.name !== args.name || value.shared !== false)
                    fail('action_outcome_unknown');
                return {
                    code: 'workspace_ok', verified: true, changed: true, project: value
                };
            }
            if (!['move_chat', 'delete_chat'].includes(operation) || !object(args.before) || !chatId(args.before.id))
                fail('project_invalid');
            const before = await metadata(args.before.id);
            if (JSON.stringify(before) !== JSON.stringify(args.before))
                fail('action_conflict');
            if (operation === 'move_chat') {
                if (!(args.project_id === null || projectId(args.project_id)))
                    fail('project_invalid');
                const origin = before.project_id ? await safeProject(before.project_id) : null;
                const destination = args.project_id ? await safeProject(args.project_id) : null;
                if (JSON.stringify(origin) !== JSON.stringify(args.origin) || JSON.stringify(destination) !== JSON.stringify(args.destination))
                    fail('action_conflict');
                if (before.project_id === args.project_id) {
                    await check();
                    return {
                        code: 'workspace_ok', verified: true, changed: false, chat: before
                    };
                }
                const ack = await write(`/backend-api/conversation/${before.id}`, 'PATCH', { gizmo_id: args.project_id ?? '' });
                if (ack?.success !== true)
                    fail('action_outcome_unknown');
                await check();
                const after = await metadata(before.id);
                await check();
                if (after.title !== before.title || after.archived !== before.archived || after.project_id !== args.project_id)
                    fail('action_outcome_unknown');
                return {
                    code: 'workspace_ok', verified: true, changed: true, chat: after
                };
            }
            if (before.project_id && JSON.stringify(await safeProject(before.project_id)) !== JSON.stringify(args.origin))
                fail('action_conflict');
            const ack = await write(`/backend-api/conversation/${before.id}`, 'PATCH', { is_visible: false });
            stage('acknowledgement', httpStatus);
            if (ack?.success !== true)
                fail('action_outcome_unknown');
            stage('identity_after_write');
            await check();
            stage('read_back');
            const response = await globalThis.fetch(`/backend-api/conversation/${before.id}`, {
                ...options(), headers: { Authorization: `Bearer ${token}` }
            });
            stage('read_back_response', response.status);
            let gone = response.status === 404;
            if (gone)
                await response.body?.cancel();
            else {
                const data = await json(response);
                gone = data?.conversation_id?.toLowerCase() === before.id.toLowerCase() && data.is_visible === false;
            }
            stage('identity_after_read');
            await check();
            stage('read_back_content', response.status);
            if (!gone)
                fail('action_outcome_unknown');
            return {
                code: 'workspace_ok', verified: true, changed: true, id: before.id, verification: 'no_longer_accessible'
            };
        }
        catch (error) {
            const known = [
                'project_invalid', 'project_schema_unknown', 'project_cursor_invalid', 'project_scan_limit', 'project_exists',
                'project_chat_unsupported', 'project_sharing_unknown', 'project_permission_missing', 'project_not_owned', 'action_conflict',
                'source_identity_changed', 'source_identity_missing', 'source_workspace_unsupported', 'source_cancelled', 'workspace_current_chat'
            ];
            return {
                code: patchStarted ? 'action_outcome_unknown' : known.includes(error.message) ? error.message : 'action_read_failed',
                ...(patchStarted && operation === 'delete_chat' ? { diagnostic: {
                        phase, http_status: httpStatus,
                        failure: writeSignal?.aborted && writeSignal.reason?.name === 'TimeoutError' ? 'write_timeout'
                            : error?.name === 'TimeoutError' ? 'request_timeout'
                                : error?.name === 'AbortError' ? 'request_aborted'
                                    : error?.name === 'TypeError' ? 'fetch_type_error' : 'other',
                        write_signal_aborted: writeSignal?.aborted === true,
                        elapsed_ms: Math.max(0, Math.min(60000, Date.now() - writeStartedAt)),
                        write_timeout_ms: writeTimeout, deadline_expired: expired()
                    } } : {})
            };
        }
    }
    try {
        if (operation === 'bind') {
            if (!(await session()))
                return { code: 'source_identity_changed' };
            return {
                code: 'source_bound', userHash
            };
        }
        if (['list_chats', 'search_chats'].includes(operation))
            return await listOrSearch();
        if (operation === 'read_chat')
            return await read();
        if ([
            'list_projects', 'get_project', 'workspace_chat', 'check_project_name', 'create_project', 'move_chat', 'delete_chat'
        ].includes(operation))
            return await workspace();
        return await action(operation);
    }
    catch (error) {
        return { code: ['source_identity_missing', 'source_workspace_unsupported', 'session_token_missing', 'source_cancelled'].includes(error.message)
                ? error.message : 'session_read_failed' };
    }
    finally {
        token = undefined;
    }
}
