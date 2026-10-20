import { REVIEW_URI } from './review.mjs';
import { REVIEW_HTML } from './review-widget.mjs';
export const RESOURCES = [{
        uri: REVIEW_URI, name: 'Chat Commander review confirmation', mimeType: 'text/html;profile=mcp-app'
    }];
export function readResource(uri) {
    if (uri !== REVIEW_URI)
        return null;
    return { contents: [{
                uri: REVIEW_URI, mimeType: 'text/html;profile=mcp-app', text: REVIEW_HTML,
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
