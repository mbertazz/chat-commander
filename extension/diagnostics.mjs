import {Tunnel, TunnelError} from './tunnel.mjs';
import {validConfig} from './config.mjs';

// Fixed destinations and allowlisted output only. Never include response bodies,
// URLs containing a tunnel ID, credentials, or raw exception messages.
export async function diagnose(config, {allowed, fetcher = fetch} = {}) {
  const report = {hostPermission: allowed === true};
  if (!report.hostPermission) return report;
  try {
    const response = await fetcher('https://api.openai.com/v1/models', {
      credentials: 'omit', cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(10000),
    });
    report.openai = response.type === 'opaqueredirect' ? 'redirect' : `http_${response.status}`;
    await response.body?.cancel();
  } catch {report.openai = 'fetch_failed';}
  if (!validConfig(config)) {report.tunnel = 'configuration_missing'; return report;}
  const tunnel = new Tunnel(config, {fetcher});
  try {
    const {response} = await tunnel.request(''); // Metadata only; does not drain queued work.
    report.tunnel = `http_${response.status}`;
    await response.body?.cancel();
  } catch (error) {
    report.tunnel = error instanceof TunnelError && ['network_error', 'network_timeout'].includes(error.message)
      ? error.message : 'probe_failed';
  } finally {tunnel.stop();}
  return report;
}
