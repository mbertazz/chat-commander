import { VERSION } from './build-info.mjs';
import { REVIEW_URI } from './review.mjs';
import { REVIEW_HTML } from './review-widget.mjs';
// Keep the previous URI readable for host metadata/cards created before tool refresh.
// Both serve the current guarded component; neither grants an approval capability.
export const REVIEW_RESOURCE_URIS = [REVIEW_URI, 'ui://chat-commander/review-v7.html'];
export const RESOURCES = REVIEW_RESOURCE_URIS.map(uri => ({
    uri, name: 'Chat Commander review confirmation', mimeType: 'text/html;profile=mcp-app'
}));
export function resourceObservation(uri, response) {
    return {
        resource: REVIEW_RESOURCE_URIS.includes(uri) ? uri : 'unknown',
        served: Boolean(response?.result?.contents?.length), version: VERSION,
        error_code: response?.error?.code ?? null
    };
}
export function readResource(uri) {
    if (!REVIEW_RESOURCE_URIS.includes(uri))
        return null;
    return { contents: [{
                uri, mimeType: 'text/html;profile=mcp-app', text: REVIEW_HTML,
                _meta: {
                    ui: {
                        prefersBorder: true, csp: {
                            connectDomains: [], resourceDomains: []
                        }
                    },
                    'openai/widgetDescription': 'Exact proposed chat changes with explicit confirmation and verified progress.',
                    'openai/widgetPrefersBorder': true, 'openai/widgetCSP': {
                        connect_domains: [], resource_domains: []
                    }
                }
            }] };
}
