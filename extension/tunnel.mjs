import {validConfig} from './config.mjs';
import {envelope} from './protocol.mjs';
import {deadlineFor, retryDelay} from './transport-utils.mjs';
import {VERSION} from './build-info.mjs';

export class TunnelError extends Error {
  constructor(code, delay = 0, fatal = false) {super(code); this.delay = delay; this.fatal = fatal;}
}
const sleep = (ms, signal) => new Promise((resolve, reject) => {
  if (signal.aborted) return reject(new TunnelError('stopped'));
  const abort = () => {clearTimeout(timer); reject(new TunnelError('stopped'));};
  const timer = setTimeout(() => {signal.removeEventListener('abort', abort); resolve();}, ms);
  signal.addEventListener('abort', abort, {once: true});
});

export class Tunnel {
  constructor(config, {fetcher = fetch, status = async () => {}, now = () => performance.now(), wait = sleep, dispatch = envelope} = {}) {
    if (!validConfig(config)) throw new TunnelError('invalid_config', 0, true);
    // Window.fetch requires its Window receiver in browser event pages.
    // An unbound function stored on Tunnel would receive this Tunnel instead.
    this.config = config; this.fetcher = fetcher.bind(globalThis); this.status = status; this.now = now; this.wait = wait;
    this.controller = new AbortController();
    this.base = `https://api.openai.com/v1/tunnels/${config.tunnelId}`;
    this.delivered = 0;
    this.dispatch = dispatch;
  }
  stop() {this.controller.abort();}
  async request(path, options = {}, deadline = Infinity) {
    const remaining = Math.min(25000, deadline - this.now());
    if (remaining <= 0) throw new TunnelError('expired');
    const timeout = AbortSignal.timeout(Math.max(1, Math.ceil(remaining)));
    const signal = AbortSignal.any([this.controller.signal, timeout]);
    try {
      const response = await this.fetcher(this.base + path, {...options, signal, credentials: 'omit',
        cache: 'no-store', redirect: 'error', headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'X-Tunnel-Client-Name': 'chat-commander-extension', 'X-Tunnel-Client-Version': VERSION,
          ...options.headers,
        }});
      return {response, receivedAt: this.now(), signal};
    } catch {
      if (this.controller.signal.aborted) throw new TunnelError('stopped');
      if (this.now() >= deadline) throw new TunnelError('expired');
      if (timeout.aborted) throw new TunnelError('network_timeout');
      throw new TunnelError('network_error');
    }
  }
  async post(command, body, deadline) {
    const serialized = JSON.stringify(body); // Preserve exact response across retries.
    for (let attempt = 0; ; attempt++) {
      if (this.controller.signal.aborted) throw new TunnelError('stopped');
      const {response} = await this.request('/response', {method: 'POST', headers: {
        'Content-Type': 'application/json', 'X-Tunnel-Shard-Token': command.shard_token,
      }, body: serialized}, deadline).catch(async error => {
        if (!['network_error', 'network_timeout'].includes(error.message)) throw error;
        return {response: {ok: false, status: 503, headers: new Headers()}};
      });
      if (response.ok || response.status === 404) {
        if (response.ok) this.delivered++;
        await response.body?.cancel();
        return;
      }
      const retry = [408, 429, 502, 503, 504].includes(response.status);
      const delay = retryDelay(response.headers.get('Retry-After'), attempt);
      await response.body?.cancel();
      if (!retry) throw new TunnelError(`response_http_${response.status}`, 0, [401, 403].includes(response.status));
      if (attempt >= 4 || this.now() + delay >= deadline) throw new TunnelError('response_delivery_failed');
      await this.wait(delay, this.controller.signal);
    }
  }
  async cycle() {
    const {response, receivedAt} = await this.request('/poll?limit=1&timeout_ms=15000');
    if (response.status === 204) {await this.status({code: 'polling', delivered: this.delivered}); return;}
    if (!response.ok) {
      const delay = retryDelay(response.headers.get('Retry-After'), 0);
      await response.body?.cancel();
      throw new TunnelError(`poll_http_${response.status}`, delay, !([408, 429].includes(response.status) || response.status >= 500));
    }
    // Read a bounded body. The request signal also bounds a stalled body stream.
    const reader = response.body.getReader();
    const chunks = []; let size = 0;
    try {
      for (;;) {
        const {done, value} = await reader.read(); if (done) break;
        size += value.byteLength; if (size > 1048576) throw new TunnelError('poll_too_large', 0, true);
        chunks.push(value);
      }
    } finally {await reader.cancel().catch(() => {});}
    let batch;
    try {
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) {bytes.set(chunk, offset); offset += chunk.length;}
      batch = JSON.parse(new TextDecoder().decode(bytes));
    } catch {throw new TunnelError('invalid_poll_json', 0, true);}
    if (!Array.isArray(batch.commands)) throw new TunnelError('invalid_poll_shape', 0, true);
    for (const command of batch.commands) {
      const deadline = deadlineFor(command?.response_timeout, receivedAt);
      if (this.now() >= deadline) {await this.status({code: 'command_expired'}); continue;}
      let body;
      try {body = await this.dispatch(command, deadline, this.controller.signal);} catch {await this.status({code: 'invalid_command'}); continue;}
      if (this.now() >= deadline || this.controller.signal.aborted) continue;
      if (!body) {await this.status({code: 'unsupported_command'}); continue;}
      try {await this.post(command, body, deadline);}
      catch (error) {
        if (error.fatal || this.controller.signal.aborted) throw error;
        await this.status({code: error instanceof TunnelError ? error.message : 'response_failed'});
      }
    }
    await this.status({code: 'polling', delivered: this.delivered});
  }
  async run() {
    let attempt = 0;
    while (!this.controller.signal.aborted) {
      try {await this.cycle(); attempt = 0;}
      catch (error) {
        if (this.controller.signal.aborted) break;
        const code = error instanceof TunnelError ? error.message : 'transport_error';
        await this.status({code});
        if (error.fatal) {await this.status({code, stopped: true}); return;}
        try {await this.wait(Math.max(error.delay ?? 0, retryDelay(null, attempt++)), this.controller.signal);}
        catch {break;}
      }
    }
  }
}
