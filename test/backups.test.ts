import assert from 'node:assert/strict';
import test from 'node:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { collect, encodePlain, decodePlain, encrypt, decrypt, extract, packFile, safePath, validatePayload, type BackupPayload } from '../src/infrastructure/backup/archive';
import { activeRoot, activateRestoredRoot, assertWritable, LocalState } from '../src/infrastructure/backup/local-data';
import { credentialsFromJson, DriveClient, authorize } from '../src/infrastructure/backup/drive';
import { fileAdapter } from '../src/infrastructure/backup/files-adapter';

function payload(): BackupPayload {
  return { version: 1, extension: 'example.test', extensionVersion: '1.0.0', deviceId: 'old-device', createdAt: '2026-08-26T12:00:00Z', sourceRoot: '/old/pc', exclusions: [], settings: {}, files: [packFile('notes/a.md', Buffer.from('Recuperable en otra PC'))] };
}
async function temporary(): Promise<string> { return fs.mkdtemp(path.join(os.tmpdir(), 'dev-backup-test-')); }

test('plain backups recover without a key, credentials or the original computer', () => {
  assert.deepEqual(decodePlain(encodePlain(payload()), 'example.test'), payload());
});
test('optional encryption is portable with the passphrase; rejects wrong passwords and tampering', async () => {
  const bytes = await encrypt(payload(), 'recovery-password-stored-elsewhere');
  assert.deepEqual(await decrypt(bytes, 'recovery-password-stored-elsewhere', 'example.test'), payload());
  await assert.rejects(decrypt(bytes, 'incorrect-password', 'example.test'), /passphrase|damaged/);
  bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 1;
  await assert.rejects(decrypt(bytes, 'recovery-password-stored-elsewhere', 'example.test'), /damaged/);
});
test('rejects incompatible schemas, wrong extensions, traversal, duplicate names and damaged files', () => {
  const value = payload();
  assert.throws(() => validatePayload({ ...value, version: 999 }, value.extension));
  assert.throws(() => validatePayload(value, 'another.extension'));
  for (const name of ['../outside', '/absolute', 'C:/drive', 'a/../b', 'a\\b', 'a//b']) assert.throws(() => safePath(name));
  assert.throws(() => validatePayload({ ...value, files: [value.files[0], value.files[0]] }, value.extension));
  assert.throws(() => validatePayload({ ...value, files: [{ ...value.files[0], data: 'broken' }] }, value.extension));
});
test('collect and restore preserve hidden attachments, binary content and empty notebooks', async () => {
  const root = await temporary(), restored = await temporary();
  try {
    await fs.mkdir(path.join(root, 'notebooks/Empty'), { recursive: true });
    await fs.mkdir(path.join(root, 'notebooks/Work/.attachments/Note'), { recursive: true });
    await fs.writeFile(path.join(root, 'notebooks/Work/Note.md'), '# Note');
    await fs.writeFile(path.join(root, 'notebooks/Work/.attachments/Note/file.bin'), Buffer.from([0, 1, 255]));
    const files = await collect(root, ['notebooks']);
    await extract(restored, files);
    assert.deepEqual(await fs.readdir(path.join(restored, 'notebooks/Empty')), []);
    assert.deepEqual(await fs.readFile(path.join(restored, 'notebooks/Work/.attachments/Note/file.bin')), Buffer.from([0, 1, 255]));
  } finally { await fs.rm(root, { recursive: true, force: true }); await fs.rm(restored, { recursive: true, force: true }); }
});
test('backups do not follow symlinks into unrelated files', { skip: process.platform === 'win32' }, async () => {
  const root = await temporary();
  try { await fs.symlink(os.tmpdir(), path.join(root, 'link')); await assert.rejects(collect(root, ['link']), /symbolic/); }
  finally { await fs.rm(root, { recursive: true, force: true }); }
});
test('private stores retain changes from concurrent instances', async () => {
  const root = await temporary();
  const first = new LocalState(path.join(root, 'state.json'), { values: [] as number[] });
  const second = new LocalState(path.join(root, 'state.json'), { values: [] as number[] });
  try {
    await first.initialize(); await second.initialize();
    await Promise.all(Array.from({ length: 20 }, (_, i) => (i % 2 ? first : second).update((state) => { state.values.push(i); })));
    assert.equal((await first.refresh()).values.length, 20);
  } finally { first.dispose(); second.dispose(); await fs.rm(root, { recursive: true, force: true }); }
});
test('restoring switches generation, keeps originals and blocks old writers', async () => {
  const root = await temporary();
  try {
    await fs.writeFile(path.join(root, 'original.txt'), 'keep');
    const destination = path.join(root, 'restored', randomUUID());
    await fs.mkdir(destination, { recursive: true });
    assert.equal(await activeRoot(root), root);
    await activateRestoredRoot(root, root, destination);
    assert.equal(await activeRoot(root), destination);
    assert.equal(await fs.readFile(path.join(root, 'original.txt'), 'utf8'), 'keep');
    await assert.rejects(assertWritable(root), /Reload/);
    await assertWritable(destination);
    const other = path.join(root, 'restored', randomUUID()); await fs.mkdir(other);
    await assert.rejects(activateRestoredRoot(root, root, other), /already restored/);
    assert.equal(await activeRoot(root), destination);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
test('SSH restore rebases managed identity paths without modifying external project paths', async () => {
  const root = await temporary();
  try {
    const backup = payload();
    backup.files = [packFile('state-v1.json', Buffer.from(JSON.stringify({ version: 1, groups: [], servers: [{ identityFile: '/old/pc/identities/key.pem', path: '/external/repo' }] }))), packFile('identities/key.pem', Buffer.from('synthetic test fixture'))];
    await fileAdapter('/unused', 'ssh').restore(backup, root);
    const state = JSON.parse(await fs.readFile(path.join(root, 'state-v1.json'), 'utf8')) as { servers: { identityFile: string; path: string }[] };
    assert.equal(state.servers[0]!.identityFile, path.join(root, 'identities/key.pem'));
    assert.equal(state.servers[0]!.path, '/external/repo');
    assert.equal(await fs.readFile(path.join(root, 'identities/key.pem'), 'utf8'), 'synthetic test fixture');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
test('SSH snapshots exclude private key contents by default', async () => {
  const root = await temporary();
  try {
    await fs.mkdir(path.join(root, 'identities'));
    await fs.writeFile(path.join(root, 'identities/key.pem'), 'synthetic key');
    await fs.writeFile(path.join(root, 'state-v1.json'), '{"version":1,"groups":[],"servers":[]}');
    const snapshot = await fileAdapter(root, 'ssh').capture(false);
    assert.ok(snapshot.files.every((f) => !f.path.startsWith('identities')));
    assert.ok(snapshot.exclusions.length > 0);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
test('Drive accepts Desktop credentials only', () => {
  assert.deepEqual(credentialsFromJson({ installed: { client_id: 'sample.apps.googleusercontent.com', client_secret: 'sample' } }), { clientId: 'sample.apps.googleusercontent.com', clientSecret: 'sample' });
  assert.throws(() => credentialsFromJson({ web: { client_id: 'sample' } }));
  assert.throws(() => credentialsFromJson({ type: 'service_account' }));
});
test('OAuth validates callback state and exchanges PKCE code for portable account access', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith('http://127.0.0.1:')) return originalFetch(url, init);
    assert.equal(String(url), 'https://oauth2.googleapis.com/token');
    const body = init?.body as URLSearchParams;
    assert.equal(body.get('code'), 'synthetic-code');
    assert.ok((body.get('code_verifier') ?? '').length >= 43);
    return new Response(JSON.stringify({ access_token: 'test-access', refresh_token: 'test-refresh', expires_in: 3600 }));
  };
  try {
    const tokens = await authorize({ clientId: 'test.apps.googleusercontent.com', clientSecret: 'test' }, async (address) => {
      const url = new URL(address); assert.equal(url.searchParams.get('scope'), 'https://www.googleapis.com/auth/drive.file');
      assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
      const callback = new URL(url.searchParams.get('redirect_uri')!);
      callback.search = new URLSearchParams({ state: 'incorrect', code: 'synthetic-code' }).toString();
      assert.equal((await originalFetch(callback)).status, 400);
      callback.searchParams.set('state', url.searchParams.get('state')!);
      assert.equal((await originalFetch(callback)).status, 200);
      return true;
    });
    assert.equal(tokens.refreshToken, 'test-refresh');
  } finally { globalThis.fetch = originalFetch; }
});
test('Drive uses resumable upload and verifies the remote checksum; never overwrites a snapshot', async () => {
  const originalFetch = globalThis.fetch;
  const bytes = encodePlain(payload()); const checksum = createHash('md5').update(bytes).digest('hex');
  const requests: string[] = [];
  globalThis.fetch = async (url, init) => {
    requests.push((init?.method ?? 'GET') + ' ' + String(url));
    if ((init?.method ?? 'GET') === 'GET') return new Response('{"files":[]}');
    if (init?.method === 'POST') return new Response('', { headers: { location: 'https://www.googleapis.com/upload/drive/v3/files?upload_id=test' } });
    assert.equal(init?.method, 'PUT');
    return new Response(JSON.stringify({ id: 'new-snapshot', name: 'snapshot.devbackup', md5Checksum: checksum, size: String(bytes.length) }));
  };
  try {
    const client = new DriveClient({ clientId: 'test', clientSecret: 'test' }, { accessToken: 'test', refreshToken: 'test', expiresAt: Date.now() + 3600000 }, async () => {});
    assert.equal((await client.upload('example.test', 'snapshot.devbackup', bytes)).id, 'new-snapshot');
    assert.ok(requests.some((request) => request.includes('uploadType=resumable')));
    assert.ok(requests.every((request) => !request.startsWith('PATCH') && !request.startsWith('DELETE')));
  } finally { globalThis.fetch = originalFetch; }
});
test('Drive failures are surfaced so the caller can retain and retry its local snapshot', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('denied', { status: 403 });
  try {
    const client = new DriveClient({ clientId: 'test', clientSecret: 'test' }, { accessToken: 'test', refreshToken: 'test', expiresAt: Date.now() + 3600000 }, async () => {});
    await assert.rejects(client.upload('example.test', 'snapshot.devbackup', Buffer.from('snapshot')), /HTTP 403/);
  } finally { globalThis.fetch = originalFetch; }
});

// Exercise the real host command wiring with a minimal VS Code boundary.
import Module from 'node:module';
import type { BackupAdapter, BackupController } from '../src/infrastructure/backup/host';
import type * as VSCode from 'vscode';

function hostHarness(root: string, adapter: BackupAdapter, settings: Record<string, unknown>, restorePath?: string): { controller: BackupController; commands: Map<string, () => Promise<void>>; messages: string[]; secrets: Map<string, string> } {
  const commands = new Map<string, () => Promise<void>>(), messages: string[] = [], secrets = new Map<string, string>();
  const disposable = { dispose() {} };
  const uri = (file: string) => ({ fsPath: file, path: file, scheme: 'file' });
  const vscode = {
    env: { language: 'en' },
    window: {
      createOutputChannel: () => ({ appendLine: (s: string) => messages.push(s), show() {}, dispose() {} }),
      showWarningMessage: async (_message: string, _options: unknown, choice: string) => choice,
      showInformationMessage: async (message: string) => { messages.push(message); },
      showErrorMessage: async (message: string) => { messages.push(message); },
      showQuickPick: async (choices: string[]) => choices[0],
      showOpenDialog: async () => restorePath ? [uri(restorePath)] : undefined
    },
    workspace: {
      textDocuments: [],
      onDidChangeConfiguration: () => disposable,
      getConfiguration: () => ({ get: (key: string, fallback?: unknown) => settings[key] ?? fallback }),
      fs: { stat: (target: { fsPath: string }) => fs.stat(target.fsPath), readFile: (target: { fsPath: string }) => fs.readFile(target.fsPath) }
    },
    commands: { registerCommand: (id: string, action: () => Promise<void>) => { commands.set(id, action); return disposable; }, executeCommand: async (id: string) => { messages.push(id); } },
    Uri: { file: uri }
  };
  const loader = Module as unknown as { _load: (request: string, parent: unknown, main?: boolean) => unknown };
  const original = loader._load;
  let Constructor: typeof BackupController;
  try {
    loader._load = function(request, parent, main) { return request === 'vscode' ? vscode : original.call(this, request, parent, main); };
    delete require.cache[require.resolve('../src/infrastructure/backup/host')];
    Constructor = (require('../src/infrastructure/backup/host') as typeof import('../src/infrastructure/backup/host')).BackupController;
  } finally { loader._load = original; }
  const context = {
    globalStorageUri: uri(root),
    extension: { id: 'example.test', packageJSON: { displayName: 'Test', version: '1', contributes: { configuration: { properties: {} } } } },
    secrets: { get: async (key: string) => secrets.get(key), store: async (key: string, value: string) => { secrets.set(key, value); }, delete: async (key: string) => { secrets.delete(key); } }
  } as unknown as VSCode.ExtensionContext;
  return { controller: new Constructor!(context, 'test', uri(root) as VSCode.Uri, adapter), commands, messages, secrets };
}

test('automatic backups continue saving new local snapshots while Drive is unavailable', async () => {
  const root = await temporary(), originalFetch = globalThis.fetch;
  let counter = 0;
  const adapter: BackupAdapter = { capture: async () => ({ files: [packFile('data.json', Buffer.from(JSON.stringify({ counter })))], exclusions: [] }), restore: async () => {} };
  const harness = hostHarness(root, adapter, { 'backup.autoEnabled': true });
  harness.secrets.set('backup.google.credentials.v1', JSON.stringify({ clientId: 'test', clientSecret: 'test' }));
  harness.secrets.set('backup.google.tokens.v1', JSON.stringify({ accessToken: 'test', refreshToken: 'test', expiresAt: Date.now() + 3600000 }));
  globalThis.fetch = async () => new Response('offline', { status: 503 });
  try {
    const run = harness.controller as unknown as { backup(automatic: boolean): Promise<string | undefined> };
    await assert.rejects(run.backup(true), /HTTP 503/);
    counter += 1;
    await assert.rejects(run.backup(true), /HTTP 503/);
    const files = await fs.readdir(path.join(root, 'backups'));
    assert.equal(files.filter((f) => f.endsWith('.devbackup')).length, 2);
    assert.equal(files.filter((f) => f.endsWith('.pending')).length, 2);
    for (const file of files.filter((f) => f.endsWith('.devbackup'))) decodePlain(await fs.readFile(path.join(root, 'backups', file)), 'example.test');
  } finally { globalThis.fetch = originalFetch; harness.controller.dispose(); await fs.rm(root, { recursive: true, force: true }); }
});

test('restore command activates a plain backup on a new PC without OAuth or a password', async () => {
  const root = await temporary(), source = await temporary();
  const value = payload();
  value.files = [packFile('config-v1.json', Buffer.from('{"version":1,"spaces":[],"activeSpaceId":""}'))];
  const backupPath = path.join(source, 'portable.devbackup');
  await fs.writeFile(backupPath, encodePlain(value));
  await fs.writeFile(path.join(root, 'config-v1.json'), 'original');
  const harness = hostHarness(root, fileAdapter(root, 'commands'), {}, backupPath);
  try {
    await harness.commands.get('test.restoreBackup')!();
    const restored = await activeRoot(root);
    assert.notEqual(restored, root);
    assert.equal(await fs.readFile(path.join(root, 'config-v1.json'), 'utf8'), 'original');
    assert.equal(JSON.parse(await fs.readFile(path.join(restored, 'config-v1.json'), 'utf8')).version, 1);
    assert.ok(harness.messages.includes('workbench.action.reloadWindow'));
    assert.equal(harness.secrets.size, 0);
  } finally { harness.controller.dispose(); await fs.rm(root, { recursive: true, force: true }); await fs.rm(source, { recursive: true, force: true }); }
});
