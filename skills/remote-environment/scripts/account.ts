import { mkdir, open, readFile, rename, rm, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { decodeUnknownSync, OtterAccountUser } from './contract-client.ts';

export const ISSUER = 'https://accounts.otterware.app/v1/auth';
export const RELAY = 'https://relay.code.otterware.app';
const CLIENT = 'otter-code-cli';
type Stored = { version: 1; issuer: string; resource: string; accessToken: string; refreshToken: string; expiresAt: number };
export class SafeError extends Error { constructor(message: string, public outcome = 'failed') { super(message); } }
export async function request(url: string, init: RequestInit = {}) {
  const response = await fetch(url, { ...init, redirect: 'error', signal: init.signal ?? AbortSignal.timeout(20_000) });
  let body: any;
  try { body = await response.json(); } catch { throw new SafeError(`Expected JSON response (HTTP ${response.status}).`); }
  if (!response.ok) throw new SafeError(`Request rejected (HTTP ${response.status}).`);
  return body;
}
export function form(fields: Record<string, string>): RequestInit {
  return { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields) };
}

export class Account {
  readonly directory: string;
  constructor(directory = join(process.env.XDG_STATE_HOME ?? join(homedir(), '.local/state'), 'lstack/remote-environment'),
    readonly issuer = ISSUER, readonly resource = RELAY) { this.directory = directory; }
  private async locked<T>(use: () => Promise<T>): Promise<T> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const lock = join(this.directory, 'grant.lock');
    const deadline = Date.now() + 30_000;
    while (true) {
      try { await mkdir(lock, { mode: 0o700 }); break; }
      catch (error: any) {
        if (error.code !== 'EEXIST') throw error;
        if (Date.now() >= deadline) throw new SafeError('lstack credential store is locked. If its owner crashed, remove grant.lock after confirming no lstack login/command is running.');
        await sleep(50);
      }
    }
    try { return await use(); } finally { await rm(lock, { recursive: true }); }
  }
  private async read(): Promise<Stored | null> {
    const path = join(this.directory, 'grant.json');
    try {
      const info = await stat(path);
      if ((info.mode & 0o077) !== 0) throw new SafeError('lstack grant.json must have permissions 0600.');
      const saved = JSON.parse(await readFile(path, 'utf8'));
      if (saved.version !== 1 || saved.issuer !== this.issuer || saved.resource !== this.resource ||
          typeof saved.accessToken !== 'string' || typeof saved.refreshToken !== 'string' || !Number.isFinite(saved.expiresAt))
        throw new SafeError('Invalid lstack grant store; explicit login is required.');
      return saved;
    } catch (error: any) { if (error.code === 'ENOENT') return null; throw error; }
  }
  private async save(value: Stored) {
    const temporary = join(this.directory, `grant-${randomUUID()}.tmp`);
    const file = await open(temporary, 'wx', 0o600);
    try { await file.writeFile(JSON.stringify(value)); await file.sync(); }
    finally { await file.close(); }
    try { await rename(temporary, join(this.directory, 'grant.json')); }
    finally { await rm(temporary, { force: true }); }
  }
  private token(body: any, previous?: Stored): Stored {
    if (body.refresh_token !== undefined && (typeof body.refresh_token !== 'string' || !body.refresh_token)) throw new SafeError('Invalid account refresh token response.');
    if (body.token_type !== 'Bearer' || typeof body.access_token !== 'string' || !body.access_token ||
        !Number.isFinite(body.expires_in) || body.expires_in <= 0 || !(body.refresh_token ?? previous?.refreshToken))
      throw new SafeError('Invalid account token response.');
    return { version: 1, issuer: this.issuer, resource: this.resource, accessToken: body.access_token,
      refreshToken: body.refresh_token ?? previous!.refreshToken, expiresAt: Date.now() + body.expires_in * 1000 };
  }
  async getAccessToken() {
    return this.locked(async () => {
      let saved = await this.read();
      if (!saved) throw new SafeError('Sign in explicitly with remote.mjs auth login.');
      if (saved.expiresAt <= Date.now() + 60_000) {
        const body = await request(`${this.issuer}/oauth2/token`, form({ grant_type: 'refresh_token', refresh_token: saved.refreshToken, client_id: CLIENT, resource: this.resource }));
        saved = this.token(body, saved);
        // Rotation is durable before any caller can use the new access token.
        await this.save(saved);
      }
      return { accessToken: saved.accessToken, expiresAt: saved.expiresAt };
    });
  }
  async getIdentity() {
    const { accessToken } = await this.getAccessToken();
    return decodeUnknownSync(OtterAccountUser)(await request(`${this.issuer}/code/session`, { headers: { authorization: `Bearer ${accessToken}` } }));
  }
  async login(onCode: (code: { verificationUri: string; userCode: string }) => void) {
    // Login serialization prevents concurrent grants from overwriting one another.
    return this.locked(async () => {
      if (await this.read()) throw new SafeError('A lstack grant exists. Use auth status or explicitly auth logout before signing in again.');
      const device = await request(`${this.issuer}/device/code`, form({ client_id: CLIENT, resource: this.resource, scope: 'openid profile email offline_access' }));
      if (!device.device_code || !device.user_code || typeof device.verification_uri !== 'string' ||
          !Number.isFinite(device.expires_in) || device.expires_in <= 0 ||
          (device.interval !== undefined && (!Number.isFinite(device.interval) || device.interval <= 0))) throw new SafeError('Invalid device authorization response.');
      onCode({ verificationUri: device.verification_uri, userCode: device.user_code });
      const deadline = Date.now() + device.expires_in * 1000;
      let interval = (device.interval ?? 5) * 1000;
      while (Date.now() + interval < deadline) {
        await sleep(interval);
        const response = await fetch(`${this.issuer}/oauth2/token`, { ...form({ grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code: device.device_code, client_id: CLIENT }), redirect: 'error', signal: AbortSignal.timeout(Math.min(20_000, deadline - Date.now())) });
        const body: any = await response.json();
        if (Date.now() >= deadline) throw new SafeError('Device authorization expired. Run auth login again.');
        if (response.ok) { await this.save(this.token(body)); return; }
        if (body.error === 'authorization_pending') continue;
        if (body.error === 'slow_down') { interval += 5000; continue; }
        if (body.error === 'access_denied' || body.error === 'expired_token') throw new SafeError('Device authorization denied or expired.');
        throw new SafeError(`Device authorization failed (HTTP ${response.status}).`);
      }
      throw new SafeError('Device authorization expired. Run auth login again.');
    });
  }
  async revoke() {
    return this.locked(async () => {
      const saved = await this.read();
      if (!saved) return;
      const response = await fetch(`${this.issuer}/oauth2/revoke`, { ...form({ client_id: CLIENT, token: saved.refreshToken, token_type_hint: 'refresh_token' }), redirect: 'error', signal: AbortSignal.timeout(20_000) });
      if (!response.ok) throw new SafeError(`Revocation failed (HTTP ${response.status}); lstack grant retained for retry.`);
      await rm(join(this.directory, 'grant.json'));
    });
  }
}
