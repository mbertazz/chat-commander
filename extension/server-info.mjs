import { VERSION, CATALOG_VERSION } from './build-info.mjs';
export const MAX_RECENT_CHATS = 50;
// Private overfetch only: one spare candidate can replace the protected source chat.
export const MAX_REVIEW_CANDIDATES = MAX_RECENT_CHATS + 1;
export const CATALOG_REFRESH_GUIDANCE = [
    "If your callable tool schemas still cap reviews at 20 or do not expose prepare_project_plan, stop before reading a large batch. Refresh this app\u2019s ",
    "tools in ChatGPT, enable the needed tools, start a new conversation and select the app again. Runtime availability does not prove the client has ",
    "refreshed its callable catalog. Never claim a smaller sample covers the requested 50 chats."
].join("");
export function serverInfo(tools = []) {
    return {
        name: 'chat-commander',
        version: VERSION,
        catalog_version: CATALOG_VERSION,
        limits: {
            recent_chats: MAX_RECENT_CHATS, review_chats: MAX_RECENT_CHATS, project_groups: 5, project_moves: 50
        },
        model_tools: tools.filter(tool => !tool._meta?.ui?.visibility || tool._meta.ui.visibility.includes('model')).map(tool => tool.name),
        review_excludes_source_chat: true,
        workflow: [
            "For a 50-chat organization request, call begin_review({limit:50}), read_review_chat for its selected IDs, then prepare_project_plan. Suggested groups ",
            "alone do not create or move anything. Only the exact card\u2019s user confirmation may execute."
        ].join(""),
        catalog_refresh_guidance: CATALOG_REFRESH_GUIDANCE,
    };
}
