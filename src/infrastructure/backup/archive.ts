import { createCipheriv, createDecipheriv, createHash, randomBytes, scrypt } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';

export const MAX_BYTES = 64 * 1024 * 1024;
const MAGIC = Buffer.from('DEVBACKUP1\n');
const PLAIN_MAGIC = Buffer.from('DEVBACKUP0\n');
export interface BackupFile { path: string; data: string; hash: string; directory?: true; }
export interface BackupPayload {
  version: 1;
  extension: string;
  extensionVersion: string;
  createdAt: string;
  deviceId: string;
  sourceRoot: string;
  exclusions: string[];
  settings: Record<string, unknown>;
  files: BackupFile[];
}
export const hash = (data: Buffer | string): string => createHash('sha256').update(data).digest('hex');
export function safePath(value: string): string {
  if (!value || value.length > 1024 || value.includes('\\') || value.includes(':') || value.includes('\0') || value.startsWith('/') || value.split('/').some((p) => !p || p === '.' || p === '..')) {
    throw new Error('Unsafe path in backup.');
  }
  return value;
}
export function packFile(filePath: string, data: Buffer): BackupFile {
  return { path: safePath(filePath), data: data.toString('base64'), hash: hash(data) };
}
export function unpackFile(file: BackupFile): Buffer {
  safePath(file.path);
  if (typeof file.data !== 'string' || typeof file.hash !== 'string') throw new Error('Invalid backup file.');
  if (file.directory !== undefined && file.directory !== true) throw new Error('Invalid directory entry.');
  if (file.directory && file.data !== '') throw new Error('Directory entry contains data.');
  const data = Buffer.from(file.data, 'base64');
  if (data.toString('base64') !== file.data || hash(data) !== file.hash) throw new Error('Backup file checksum mismatch.');
  return data;
}
export function validatePayload(value: unknown, extension: string): BackupPayload {
  const p = value as Partial<BackupPayload> | null;
  if (!p || p.version !== 1 || p.extension !== extension || !Array.isArray(p.files) || p.files.length > 10000 ||
    typeof p.sourceRoot !== 'string' || typeof p.deviceId !== 'string' || typeof p.extensionVersion !== 'string' ||
    typeof p.createdAt !== 'string' || !Number.isFinite(Date.parse(p.createdAt)) ||
    !Array.isArray(p.exclusions) || !p.exclusions.every((x) => typeof x === 'string') ||
    !p.settings || typeof p.settings !== 'object' || Array.isArray(p.settings)) throw new Error('Invalid or incompatible backup.');
  const paths = new Set<string>();
  let bytes = 0;
  for (const file of p.files) {
    if (!file || typeof file.path !== 'string') throw new Error('Invalid backup file.');
    const key = safePath(file.path).toLowerCase();
    if (paths.has(key)) throw new Error('Duplicate or case-conflicting backup path.');
    paths.add(key);
    bytes += unpackFile(file).length;
    if (bytes > MAX_BYTES) throw new Error('Backup exceeds the 64 MiB uncompressed limit.');
  }
  return p as BackupPayload;
}
async function key(password: string, salt: Buffer): Promise<Buffer> {
  if (password.length < 12) throw new Error('Use a backup passphrase of at least 12 characters.');
  return new Promise((resolve, reject) => scrypt(password, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (e, k) => e ? reject(e) : resolve(k)));
}
export async function encrypt(payload: BackupPayload, password: string): Promise<Buffer> {
  validatePayload(payload, payload.extension);
  const serialized = Buffer.from(JSON.stringify(payload));
  if (serialized.length > MAX_BYTES * 2) throw new Error('Backup manifest is too large.');
  const salt = randomBytes(16), iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', await key(password, salt), iv);
  cipher.setAAD(MAGIC);
  const encrypted = Buffer.concat([cipher.update(gzipSync(serialized)), cipher.final()]);
  return Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), encrypted]);
}
export function isEncrypted(bytes: Buffer): boolean { return bytes.subarray(0, MAGIC.length).equals(MAGIC); }
export function encodePlain(payload: BackupPayload): Buffer {
  validatePayload(payload, payload.extension);
  const serialized = Buffer.from(JSON.stringify(payload));
  if (serialized.length > MAX_BYTES * 2) throw new Error('Backup manifest is too large.');
  return Buffer.concat([PLAIN_MAGIC, gzipSync(serialized)]);
}
export function decodePlain(bytes: Buffer, extension: string): BackupPayload {
  if (bytes.length > MAX_BYTES * 2 || !bytes.subarray(0, PLAIN_MAGIC.length).equals(PLAIN_MAGIC)) throw new Error('Not a supported backup.');
  return validatePayload(JSON.parse(gunzipSync(bytes.subarray(PLAIN_MAGIC.length), { maxOutputLength: MAX_BYTES * 2 }).toString('utf8')), extension);
}
export async function decrypt(bytes: Buffer, password: string, extension: string): Promise<BackupPayload> {
  if (bytes.length > MAX_BYTES * 2 || bytes.length < MAGIC.length + 45 || !bytes.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Not a supported encrypted backup.');
  const offset = MAGIC.length;
  const decipher = createDecipheriv('aes-256-gcm', await key(password, bytes.subarray(offset, offset + 16)), bytes.subarray(offset + 16, offset + 28));
  decipher.setAAD(MAGIC);
  decipher.setAuthTag(bytes.subarray(offset + 28, offset + 44));
  let decoded: Buffer;
  try { decoded = Buffer.concat([decipher.update(bytes.subarray(offset + 44)), decipher.final()]); }
  catch { throw new Error('Wrong passphrase or damaged backup.'); }
  return validatePayload(JSON.parse(gunzipSync(decoded, { maxOutputLength: MAX_BYTES * 2 }).toString('utf8')), extension);
}

export async function collect(root: string, names: string[]): Promise<BackupFile[]> {
  const files: BackupFile[] = [];
  let total = 0;
  const visit = async (relative: string): Promise<void> => {
    safePath(relative);
    const target = path.join(root, relative);
    const before = await fs.lstat(target);
    if (before.isSymbolicLink()) throw new Error('Backup refuses symbolic links: ' + relative);
    if (before.isDirectory()) {
      if (files.length >= 10000) throw new Error('Backup exceeds the file limit.');
      files.push({ ...packFile(relative, Buffer.alloc(0)), directory: true });
      for (const name of (await fs.readdir(target)).sort()) await visit(relative + '/' + name);
      return;
    }
    if (!before.isFile()) throw new Error('Unsupported backup file: ' + relative);
    total += before.size;
    if (total > MAX_BYTES || files.length >= 10000) throw new Error('Backup exceeds the 64 MiB / 10000 file limit.');
    const data = await fs.readFile(target);
    const after = await fs.lstat(target);
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ino !== after.ino) throw new Error('Data changed while creating backup. Retry after saving.');
    files.push(packFile(relative, data));
  };
  for (const name of names) {
    try { await fs.lstat(path.join(root, safePath(name))); }
    catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') continue; throw e; }
    await visit(name);
  }
  return files;
}
export const inventory = (files: BackupFile[]): string => hash(JSON.stringify(files.map((f) => [f.path, f.hash, f.directory])));
export async function extract(root: string, files: BackupFile[]): Promise<void> {
  // Caller creates a brand-new, private staging directory. Never extract over live data.
  for (const file of files) {
    const target = path.join(root, safePath(file.path));
    if (file.directory) { await fs.mkdir(target, { recursive: true, mode: 0o700 }); continue; }
    await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    await fs.writeFile(target, unpackFile(file), { flag: 'wx', mode: 0o600 });
  }
}
