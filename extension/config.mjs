const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export function validConfig(config) {
    return object(config) && /^tunnel_(?:[a-z0-9]{4}_)?[a-z0-9]{32}$/.test(config.tunnelId) &&
        typeof config.apiKey === 'string' && config.apiKey.length > 0 && /^[\x21-\x7e]+$/.test(config.apiKey);
}
