import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type * as vscode from 'vscode';
import { SharedJsonFile } from './shared-json-file';

export class LocalState<T> {
  private value: T;
  private timer?: NodeJS.Timeout;
  private chain: Promise<unknown> = Promise.resolve();
  private readonly listeners = new Set<() => void>();
  private readonly file: SharedJsonFile<T>;

  constructor(readonly filePath: string, private readonly fallback: T) {
    this.value = structuredClone(fallback);
    this.file = new SharedJsonFile<T>(filePath);
  }

  async initialize(): Promise<void> {
    this.value = (await this.file.update(this.fallback, (current) => current)).value;
    this.timer = setInterval(() => { void this.refresh().catch(() => undefined); }, 750);
    this.timer.unref();
  }

  get snapshot(): T { return structuredClone(this.value); }
  onDidChange(listener: () => void): vscode.Disposable {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }
  private enqueue<R>(action: () => Promise<R>): Promise<R> {
    const run = this.chain.then(action);
    this.chain = run.catch(() => undefined);
    return run;
  }
  async refresh(): Promise<T> {
    return this.enqueue(async () => {
      const current = await this.file.read();
      if (!current) throw new Error('Local data file is missing. Restore a backup instead of overwriting it.');
      this.accept(current.value);
      return this.snapshot;
    });
  }
  async update(change: (draft: T) => void): Promise<void> {
    await this.enqueue(async () => {
      await assertWritable(path.dirname(this.filePath));
      const next = await this.file.update(this.fallback, (current) => {
        const draft = structuredClone(current);
        change(draft);
        return draft;
      });
      this.accept(next.value);
    });
  }
  private accept(value: T): void {
    if (JSON.stringify(value) === JSON.stringify(this.value)) return;
    this.value = value;
    for (const listener of this.listeners) listener();
  }
  dispose(): void { if (this.timer) clearInterval(this.timer); this.listeners.clear(); }
}

/** Only used to migrate old Memento keys; subsequent writes are private files. */
export class PrivatePreferences implements vscode.Memento {
  private constructor(private readonly state: LocalState<Record<string, unknown>>) {}
  static async create(root: string, legacy: vscode.Memento, keys: string[]): Promise<PrivatePreferences> {
    const seed: Record<string, unknown> = {};
    for (const key of keys) { const value = legacy.get(key); if (value !== undefined) seed[key] = value; }
    const state = new LocalState(path.join(root, 'preferences.json'), seed);
    await state.initialize();
    return new PrivatePreferences(state);
  }
  keys(): readonly string[] { return Object.keys(this.state.snapshot); }
  get<T>(key: string): T | undefined;
  get<T>(key: string, defaultValue: T): T;
  get<T>(key: string, defaultValue?: T): T | undefined {
    return (this.state.snapshot[key] as T | undefined) ?? defaultValue;
  }
  update(key: string, value: unknown): Promise<void> {
    return this.state.update((draft) => { if (value === undefined) delete draft[key]; else draft[key] = value; });
  }
  dispose(): void { this.state.dispose(); }
}

export async function assertWritable(root: string): Promise<void> {
  try { await fs.access(path.join(root, '.restored-readonly')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
  throw new Error('Data was restored. Reload all VS Code windows and restart the MCP client before editing.');
}

export async function activeRoot(privateRoot: string): Promise<string> {
  const pointer = await new SharedJsonFile<{ directory: string }>(path.join(privateRoot, 'active-data.json')).read();
  if (!pointer) return privateRoot;
  if (!/^restored\/[a-f0-9-]{36}$/.test(pointer.value.directory)) throw new Error('Invalid active data directory.');
  const root = path.join(privateRoot, pointer.value.directory);
  if (!(await fs.stat(root)).isDirectory()) throw new Error('Active data directory is missing.');
  return root;
}

/** Switch generations rather than overwriting files still open in other windows. */
export async function activateRestoredRoot(privateRoot: string, expectedRoot: string, stagedRoot: string): Promise<void> {
  const pointer = new SharedJsonFile<{ directory: string }>(path.join(privateRoot, 'active-data.json'));
  const directory = path.relative(privateRoot, stagedRoot).split(path.sep).join('/');
  if (!/^restored\/[a-f0-9-]{36}$/.test(directory)) throw new Error('Invalid restore directory.');
  // The original files remain available for rollback, including edits by old editors.
  await fs.writeFile(path.join(expectedRoot, '.restored-readonly'), 'Reload VS Code and restart MCP.\n', { mode: 0o600 });
  try {
    await pointer.update({ directory: '' }, (current) => {
      const currentRoot = current.directory ? path.join(privateRoot, current.directory) : privateRoot;
      if (currentRoot !== expectedRoot) throw new Error('Another window already restored data. Reload before restoring again.');
      return { directory };
    });
  } catch (error) {
    if (await activeRoot(privateRoot) === expectedRoot) await fs.rm(path.join(expectedRoot, '.restored-readonly'), { force: true });
    throw error;
  }
}

export async function deviceId(privateRoot: string): Promise<string> {
  const file = new SharedJsonFile<{ id: string }>(path.join(privateRoot, 'backup-device.json'));
  return (await file.update({ id: randomUUID() }, (current) => current)).value.id;
}
