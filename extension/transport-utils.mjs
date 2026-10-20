export function deadlineFor(value, receivedAt) {
    if (typeof value !== 'string')
        return Infinity;
    const match = /^(\d+)(ns|us|ms|s|m|h)$/.exec(value);
    if (!match)
        return Infinity;
    const factors = {
        ns: 1e-6, us: 1e-3, ms: 1, s: 1000, m: 60000, h: 3600000
    };
    const duration = Number(match[1]) * factors[match[2]];
    // Same overflow boundary as Go's signed 64-bit nanosecond duration.
    if (!Number.isFinite(duration) || duration > 9223372036854.775)
        return Infinity;
    return receivedAt + duration;
}
export function retryDelay(header, attempt, now = Date.now(), random = Math.random) {
    let floor = 0;
    if (header) {
        floor = /^\d+$/.test(header) ? Number(header) * 1000 : Date.parse(header) - now;
        if (!Number.isFinite(floor) || floor < 0)
            floor = 0;
    }
    return Math.max(Math.min(floor, 300000), Math.min(30000, 1000 * 2 ** Math.min(attempt, 5)) * (0.5 + random() / 2));
}
