import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { collect, extract, inventory, packFile, unpackFile, type BackupFile, type BackupPayload } from './archive';
import type { BackupAdapter } from './host';

/** Rewrite only managed file references; external project/script paths remain explicit. */
export function relocate(value: unknown, sourceRoot: string, destination: string): unknown {
  if (Array.isArray(value)) return value.map((entry) => relocate(entry, sourceRoot, destination));
  if (!value || typeof value !== 'object') return value;
  const source = sourceRoot.replace(/\\/g, '/').replace(/\/$/, '');
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => {
    if ((key === 'path' || key === 'identityFile') && typeof entry === 'string') {
      const normalized = entry.replace(/\\/g, '/');
      if (normalized.startsWith(source + '/')) return [key, path.join(destination, normalized.slice(source.length + 1))];
    }
    return [key, relocate(entry, sourceRoot, destination)];
  }));
}
export async function consistentFiles(root: string, names: string[]): Promise<BackupFile[]> {
  const first = await collect(root, names), second = await collect(root, names);
  if (inventory(first) !== inventory(second)) throw new Error('Data changed during backup. Retry after saving.');
  return second;
}
export function validateStateFile(files: BackupFile[], name: string, versionKey: string, version: number): void {
  const file = files.find((f) => f.path === name);
  if (!file) throw new Error('Backup is missing required data: ' + name);
  const data = JSON.parse(unpackFile(file).toString('utf8')) as Record<string, unknown>;
  if (!data || data[versionKey] !== version) throw new Error('Unsupported data schema: ' + name);
}
export function fileAdapter(root: string, kind: 'ssh' | 'commands' | 'folder' | 'notes'): BackupAdapter {
  const stateFile = kind === 'commands' ? 'config-v1.json' : 'state-v1.json';
  const accepted = (name: string): boolean => name === 'preferences.json' || (kind === 'notes' ? name === 'notebooks' || name.startsWith('notebooks/') : name === stateFile || (kind === 'ssh' && (name === 'identities' || /^identities\/[^/]+$/.test(name))));
  return {
    async capture(includePrivateKeys) {
      const names = ['preferences.json', kind === 'notes' ? 'notebooks' : stateFile];
      if (kind === 'ssh' && includePrivateKeys) names.push('identities');
      const files = await consistentFiles(root, names);
      if (kind !== 'notes') validateStateFile(files, stateFile, 'version', 1);
      const exclusions = kind === 'ssh' && !includePrivateKeys ? ['Llaves privadas SSH excluidas / SSH private keys excluded'] : [];
      if (kind === 'ssh') exclusions.push('Llaves externas no administradas excluidas / Unmanaged external keys excluded');
      if (kind === 'commands' || kind === 'folder') exclusions.push('Archivos de proyectos y scripts externos excluidos / External project and script files excluded');
      return { files, exclusions };
    },
    async restore(payload: BackupPayload, destination: string) {
      if (payload.files.some((f) => !accepted(f.path))) throw new Error('Backup contains files not owned by this extension.');
      if (kind !== 'notes') validateStateFile(payload.files, stateFile, 'version', 1);
      const files = payload.files.map((file) => file.path === stateFile ? packFile(file.path, Buffer.from(JSON.stringify(relocate(JSON.parse(unpackFile(file).toString('utf8')), payload.sourceRoot, destination)))) : file);
      await extract(destination, files);
      if (kind === 'notes') {
        await fs.mkdir(path.join(destination, 'notebooks'), { recursive: true, mode: 0o700 });
        await fs.writeFile(path.join(destination, 'notes-migration.json'), '{"complete":true}', { flag: 'wx', mode: 0o600 });
      }
    }
  };
}
