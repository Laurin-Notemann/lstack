import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { Account, RELAY, SafeError, form, request } from './account.ts';
import { decodeUnknownSync, toCodecJson, RelaySchemas as R, ExecutionEnvironmentDescriptor, AuthAccessTokenResult, AuthWebSocketTicketResult, withRpc, type RemoteApi } from './contract-client.ts';

export function makeSigner() {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = publicKey.export({ format: 'jwk' });
  const hash = (text: string) => createHash('sha256').update(text).digest('base64url');
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return {
    thumbprint: hash(JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y })),
    proof(method: string, address: string, token?: string) {
      const url = new URL(address); url.search = ''; url.hash = '';
      const input = `${encode({ typ: 'dpop+jwt', alg: 'ES256', jwk })}.${encode({ htm: method, htu: url.href, jti: randomUUID(), iat: Math.floor(Date.now()/1000), ...(token ? { ath: hash(token) } : {}) })}`;
      return `${input}.${sign('sha256', Buffer.from(input), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
    },
  };
}
export function secureOrigin(value: string, websocket = false) {
  const url = new URL(value);
  if (url.protocol !== (websocket ? 'wss:' : 'https:') || url.username || url.password || url.search || url.hash)
    throw new SafeError('Destination must use HTTPS/WSS without embedded credentials or query parameters.');
  return url;
}
export class Remote {
  constructor(readonly account = new Account(), readonly relay = RELAY) { secureOrigin(relay); }
  async list() {
    const { accessToken } = await this.account.getAccessToken();
    return decodeUnknownSync(R.RelayListEnvironmentsResponse)(await request(`${this.relay}/v1/environments`, { headers: { authorization: `Bearer ${accessToken}` } })).environments;
  }
  async target(environmentId: string) {
    const found = (await this.list()).find(value => value.environmentId === environmentId);
    if (!found) throw new SafeError('Selected environment is not in this account. List destinations and select an explicit environment ID.');
    secureOrigin(found.endpoint.httpBaseUrl); secureOrigin(found.endpoint.wsBaseUrl, true);
    return found;
  }
  private async relaySession() {
    const signer = makeSigner();
    const { accessToken } = await this.account.getAccessToken();
    const url = `${this.relay}/v1/client/dpop-token`;
    const init = form({ grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange', subject_token: accessToken,
      subject_token_type: 'urn:ietf:params:oauth:token-type:jwt', requested_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      resource: this.relay, scope: 'environment:connect environment:status', client_id: 't3-web' });
    const token = decodeUnknownSync(R.RelayDpopAccessTokenResponse)(await request(url, { ...init, headers: { ...init.headers, dpop: signer.proof('POST', url) } }));
    return { signer, headers: (method: string, url: string) => ({ authorization: `DPoP ${token.access_token}`, dpop: signer.proof(method, url, token.access_token) }) };
  }
  async check(environmentId: string) {
    await this.target(environmentId);
    const session = await this.relaySession();
    const url = `${this.relay}/v1/environments/${encodeURIComponent(environmentId)}/status`;
    const status = decodeUnknownSync(R.RelayEnvironmentStatusResponse)(await request(url, { method: 'POST', headers: session.headers('POST', url) }));
    if (status.environmentId !== environmentId || (status.descriptor && status.descriptor.environmentId !== environmentId)) throw new SafeError('Destination identity mismatch.');
    return status;
  }
  async connected<T>(environmentId: string, scopes: string[], use: (api: RemoteApi, os: string) => Promise<T>) {
    const target = await this.target(environmentId);
    const session = await this.relaySession();
    const connectUrl = `${this.relay}/v1/environments/${encodeURIComponent(environmentId)}/connect`;
    const bootstrap = decodeUnknownSync(R.RelayEnvironmentConnectResponse)(await request(connectUrl, { method: 'POST', headers: { ...session.headers('POST', connectUrl), 'content-type': 'application/json' }, body: JSON.stringify({ clientProofKeyThumbprint: session.signer.thumbprint }) }));
    const http = secureOrigin(bootstrap.endpoint.httpBaseUrl);
    const ws = secureOrigin(bootstrap.endpoint.wsBaseUrl, true);
    if (bootstrap.environmentId !== environmentId || http.origin !== new URL(target.endpoint.httpBaseUrl).origin || ws.host !== http.host)
      throw new SafeError('Destination identity or endpoint mismatch.');
    const descriptor = decodeUnknownSync(ExecutionEnvironmentDescriptor)(await request(new URL('/.well-known/t3/environment', http).href));
    if (descriptor.environmentId !== environmentId || (descriptor.orchestrationProtocolVersion !== undefined && descriptor.orchestrationProtocolVersion !== 2))
      throw new SafeError('Destination identity or protocol mismatch.');
    const tokenUrl = new URL('/oauth/token', http).href;
    const init = form({ grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange', subject_token: bootstrap.credential,
      subject_token_type: 'urn:t3:params:oauth:token-type:environment-bootstrap', requested_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      client_label: 'lstack remote-environment', client_device_type: 'bot', client_os: process.platform === 'darwin' ? 'macOS' : 'Linux', scope: scopes.join(' ') });
    const token = decodeUnknownSync(AuthAccessTokenResult)(await request(tokenUrl, { ...init, headers: { ...init.headers, dpop: session.signer.proof('POST', tokenUrl) } }));
    if (token.token_type !== 'DPoP' || scopes.some(scope => !token.scope.split(' ').includes(scope))) throw new SafeError('Destination did not grant the required DPoP scopes.');
    const ticketUrl = new URL('/api/auth/websocket-ticket', http).href;
    const ticket = decodeUnknownSync(toCodecJson(AuthWebSocketTicketResult))(await request(ticketUrl, { method: 'POST', headers: { authorization: `DPoP ${token.access_token}`, dpop: session.signer.proof('POST', ticketUrl, token.access_token) } }));
    ws.searchParams.set('wsTicket', ticket.ticket); ws.searchParams.set('orchestrationProtocol', '2');
    return withRpc(ws.href, api => use(api, descriptor.platform.os));
  }
}
export function validateWritePath(relativePath: string) {
  if (!relativePath || relativePath.startsWith('/') || /^[A-Za-z]:|[\\\0]/.test(relativePath) || relativePath.split('/').some(part => part === '..' || part === '.' || part === ''))
    throw new SafeError('Write path must be a workspace-relative path without traversal.');
}
export async function verifiedWrite(api: RemoteApi, input: { cwd: string; relativePath: string; contents: string }) {
  validateWritePath(input.relativePath);
  await api.write(input);
  const result = await api.read({ cwd: input.cwd, relativePath: input.relativePath });
  if (result.truncated || result.contents !== input.contents) throw new SafeError('Write completed but readback could not verify the full contents.', 'unverified');
  return { path: input.relativePath, verified: true, byteLength: Buffer.byteLength(input.contents) };
}
export const quoteShell = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
export async function execute(api: RemoteApi, os: string, input: { cwd: string; command: string; timeoutMs: number; maxOutputBytes: number }) {
  if (os !== 'linux' && os !== 'darwin') throw new SafeError('Command execution currently supports Linux and macOS destinations.');
  if (/[\x00-\x08\x0b-\x1f\x7f]/.test(input.command)) throw new SafeError('Command contains terminal control characters.');
  const identity = { threadId: `lstack-${randomUUID()}`, terminalId: `lstack-${randomUUID()}` };
  const marker = `\x1e${randomUUID()}\x1f`;
  // The marker uses escaped control bytes in terminal input, so the echoed command
  // cannot be confused with the actual marker emitted after shell startup.
  const line = `stty -echo; printf '\\036${marker.slice(1,-1)}\\037'; /bin/sh -c ${quoteShell(input.command)}; exit $?\n`;
  if (Buffer.byteLength(line) > 60_000) throw new SafeError('Command exceeds the terminal input limit.');
  let output = '', before = '', started = false, opened = false;
  let resolve!: (value: any) => void, reject!: (error: unknown) => void;
  const completion = new Promise<any>((yes,no) => { resolve = yes; reject = no; });
  void completion.catch(() => {});
  let observation: ReturnType<RemoteApi['observe']> | undefined;
  const timer = setTimeout(() => reject(new SafeError('Command timed out; execution may have occurred. Its dedicated terminal will be closed. Detached child processes may survive.', 'unknown')), input.timeoutMs);
  try {
    // Track cleanup before open: an uncertain response can still have created it.
    opened = true;
    await api.open({ ...identity, cwd: input.cwd, cols: 120, rows: 40 });
    const ready = Promise.withResolvers<void>();
    observation = api.observe(identity, event => {
      if (event.type === 'snapshot') ready.resolve();
      if (event.type === 'output') {
        let data = event.data;
        if (!started) {
          before += data;
          const index = before.indexOf(marker);
          if (index < 0) { before = before.slice(-Math.max(marker.length, 8192)); return; }
          data = before.slice(index + marker.length); before = ''; started = true;
        }
        output += data;
        if (Buffer.byteLength(output) > input.maxOutputBytes) reject(new SafeError('Command output exceeded the configured limit; execution may have occurred.', 'unknown'));
      }
      if (event.type === 'exited') started ? resolve({ exitCode: event.exitCode, exitSignal: event.exitSignal, output }) : reject(new SafeError('Shell exited before command startup.', 'unknown'));
      if (event.type === 'closed' || event.type === 'error') reject(new SafeError('Command terminal closed or failed.', 'unknown'));
    });
    void observation.done.then(() => reject(new SafeError('Terminal observation ended before completion.', 'unknown')), reject);
    await Promise.race([ready.promise, completion]);
    await Promise.race([api.send({ ...identity, data: line }), completion]);
    return await completion;
  } catch (error) {
    if (error instanceof SafeError) throw error;
    throw new SafeError('Command connection failed; execution outcome is unknown. Do not replay automatically.', 'unknown');
  } finally {
    clearTimeout(timer); observation?.cancel();
    if (opened) {
      try { await api.close({ ...identity, deleteHistory: true }); }
      catch { throw new SafeError(`Could not confirm cleanup of terminal ${identity.terminalId} in ${identity.threadId}; command outcome may be unknown.`, 'unknown'); }
    }
  }
}
