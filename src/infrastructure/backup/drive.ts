import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FILES = 'https://www.googleapis.com/drive/v3/files';
export interface Credentials { clientId: string; clientSecret: string; }
export interface Tokens { refreshToken: string; accessToken: string; expiresAt: number; }
export interface RemoteFile { id: string; name: string; createdTime?: string; size?: string; md5Checksum?: string; }
export function credentialsFromJson(value: unknown): Credentials {
  const installed = (value as { installed?: { client_id?: unknown; client_secret?: unknown } })?.installed;
  if (!installed || typeof installed.client_id !== 'string' || !installed.client_id.endsWith('.apps.googleusercontent.com') || typeof installed.client_secret !== 'string') {
    throw new Error('Choose the OAuth JSON for a Google Desktop app, not a service account or web client.');
  }
  return { clientId: installed.client_id, clientSecret: installed.client_secret };
}
async function checked(response: Response): Promise<Response> {
  if (!response.ok) throw new Error(`Google Drive request failed (HTTP ${response.status}). Reconnect for 401/403; check quota and permissions. Your local backup is retained.`);
  return response;
}
async function exchange(credentials: Credentials, params: Record<string, string>): Promise<Tokens> {
  const response = await checked(await fetch(TOKEN_URL, {
    method: 'POST', signal: AbortSignal.timeout(30000),
    body: new URLSearchParams({ client_id: credentials.clientId, client_secret: credentials.clientSecret, ...params })
  }));
  const data = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error('Google did not return an access token.');
  return { accessToken: data.access_token, refreshToken: data.refresh_token ?? params.refresh_token ?? '', expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 };
}

export async function authorize(credentials: Credentials, openBrowser: (url: string) => PromiseLike<boolean>): Promise<Tokens> {
  const state = randomBytes(32).toString('hex');
  const verifier = randomBytes(48).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  let finish!: (code: string) => void;
  let fail!: (error: Error) => void;
  const result = new Promise<string>((resolve, reject) => { finish = resolve; fail = reject; });
  // Handle a timeout even if the browser-opening promise has not settled yet.
  void result.catch(() => undefined);
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    if (request.method !== 'GET' || url.pathname !== '/callback' || url.searchParams.get('state') !== state) {
      response.writeHead(400).end('Invalid authorization callback.'); return;
    }
    const code = url.searchParams.get('code');
    if (!code || url.searchParams.has('error')) {
      response.end('Authorization cancelled. Return to VS Code.'); fail(new Error('Google authorization was cancelled.')); return;
    }
    response.end('Authorization received. Return to VS Code.'); finish(code);
  });
  const timer = setTimeout(() => fail(new Error('Google sign-in timed out. Run Connect Google Drive again.')), 180000);
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Cannot start OAuth callback.');
    const redirect = `http://127.0.0.1:${address.port}/callback`;
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({ client_id: credentials.clientId, redirect_uri: redirect, response_type: 'code', scope: 'https://www.googleapis.com/auth/drive.file', state, code_challenge: challenge, code_challenge_method: 'S256', access_type: 'offline', prompt: 'consent' }).toString();
    if (!await openBrowser(url.toString())) throw new Error('Could not open your browser.');
    const tokens = await exchange(credentials, { code: await result, code_verifier: verifier, redirect_uri: redirect, grant_type: 'authorization_code' });
    if (!tokens.refreshToken) throw new Error('Google did not grant offline access. Reconnect with consent.');
    return tokens;
  } finally { clearTimeout(timer); server.close(); server.closeAllConnections(); }
}

const quote = (value: string): string => "'" + value.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
export class DriveClient {
  constructor(private readonly credentials: Credentials, private tokens: Tokens, private readonly saveTokens: (value: Tokens) => PromiseLike<void>) {}
  private async headers(): Promise<Record<string, string>> {
    if (this.tokens.expiresAt < Date.now() + 60000) {
      this.tokens = await exchange(this.credentials, { grant_type: 'refresh_token', refresh_token: this.tokens.refreshToken });
      await this.saveTokens(this.tokens);
    }
    return { Authorization: `Bearer ${this.tokens.accessToken}` };
  }
  async list(extension: string): Promise<RemoteFile[]> {
    const url = new URL(FILES);
    url.search = new URLSearchParams({ q: `trashed = false and appProperties has { key='devBackup' and value=${quote(extension)} }`, spaces: 'drive', fields: 'files(id,name,createdTime,size,md5Checksum)', orderBy: 'createdTime desc', pageSize: '100' }).toString();
    const result = await checked(await fetch(url, { headers: await this.headers(), signal: AbortSignal.timeout(30000) }));
    return ((await result.json()) as { files?: RemoteFile[] }).files ?? [];
  }
  async upload(extension: string, name: string, bytes: Buffer): Promise<RemoteFile> {
    // A retried upload never replaces another snapshot. Reuse an identical completed upload.
    const checksum = createHash('md5').update(bytes).digest('hex');
    const existing = (await this.list(extension)).find((file) => file.name === name && file.md5Checksum === checksum);
    if (existing) return existing;
    const headers = await this.headers();
    const start = await checked(await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,size,md5Checksum', {
      method: 'POST', signal: AbortSignal.timeout(30000), headers: { ...headers, 'Content-Type': 'application/json', 'X-Upload-Content-Type': 'application/octet-stream', 'X-Upload-Content-Length': String(bytes.length) },
      body: JSON.stringify({ name, appProperties: { devBackup: extension }, description: 'Dev extension backup. Restore using the extension; keep historical copies.' })
    }));
    const location = start.headers.get('location');
    if (!location) throw new Error('Google did not return an upload URL.');
    const target = new URL(location);
    if (target.protocol !== 'https:' || target.hostname !== 'www.googleapis.com' || !target.pathname.startsWith('/upload/drive/')) throw new Error('Unexpected Google upload URL.');
    const response = await checked(await fetch(target, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/octet-stream' }, body: new Blob([new Uint8Array(bytes)]), signal: AbortSignal.timeout(120000) }));
    const file = await response.json() as RemoteFile;
    if (!file.id || file.md5Checksum !== checksum || Number(file.size) !== bytes.length) throw new Error('Remote backup verification failed; local snapshot retained.');
    return file;
  }
  async download(id: string, maxBytes: number): Promise<Buffer> {
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('Invalid Drive file id.');
    const response = await checked(await fetch(`${FILES}/${id}?alt=media`, { headers: await this.headers(), signal: AbortSignal.timeout(120000) }));
    if (Number(response.headers.get('content-length')) > maxBytes) throw new Error('Backup is too large.');
    if (!response.body) throw new Error('Drive returned an empty response.');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > maxBytes) throw new Error('Backup is too large.'); chunks.push(value); }
    } finally { await reader.cancel().catch(() => undefined); }
    return Buffer.concat(chunks);
  }
}
