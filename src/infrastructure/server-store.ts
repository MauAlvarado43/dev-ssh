import type * as vscode from 'vscode';
import { join } from 'node:path';
import { LocalState } from './backup/local-data';
import type { DevSshState, DropPosition, ServerDraft } from '../core/types';
import {
  addServer, createGroup, findServer, moveServer, normalizeState, removeGroup, removeServer,
  renameGroup, reorderGroup, reorderServer, setGroupColor, STATE_KEY, updateServer, type LocatedServer
} from '../domain/servers';

/** The only write path for persisted Dev SSH state. */
export class ServerStore {
  private constructor(private readonly data: LocalState<DevSshState>) {}

  static async create(memento: vscode.Memento, root: string): Promise<ServerStore> {
    const data = new LocalState(join(root, 'state-v1.json'), normalizeState(memento.get<unknown>(STATE_KEY)));
    await data.initialize();
    return new ServerStore(data);
  }
  onDidChangeExternal(listener: () => void): vscode.Disposable { return this.data.onDidChange(listener); }
  dispose(): void { this.data.dispose(); }

  get snapshot(): Readonly<DevSshState> { return this.data.snapshot; }
  getServer(id: string): LocatedServer | undefined { return findServer(this.data.snapshot, id); }
  hasGroup(id: string): boolean { return this.data.snapshot.groups.some((group) => group.id === id); }

  async addGroup(name: string): Promise<{ id: string; name: string }> {
    let created = { id: '', name: '' };
    await this.mutate((state) => { const group = createGroup(state, name); created = { id: group.id, name: group.name }; });
    return created;
  }

  async renameGroup(id: string, name: string): Promise<void> { await this.mutate((state) => renameGroup(state, id, name)); }
  async removeGroup(id: string): Promise<void> { await this.mutate((state) => removeGroup(state, id)); }
  async setGroupColor(id: string, color: number): Promise<void> { await this.mutate((state) => setGroupColor(state, id, color)); }
  async reorderGroup(id: string, targetId: string, position: DropPosition): Promise<void> {
    await this.mutate((state) => { reorderGroup(state, id, targetId, position); });
  }
  async reorderServer(id: string, targetId: string, position: DropPosition): Promise<void> {
    await this.mutate((state) => { reorderServer(state, id, targetId, position); });
  }
  async addServer(groupId: string | undefined, server: ServerDraft): Promise<{ id: string; name: string }> {
    let created = { id: '', name: '' };
    await this.mutate((state) => { const entry = addServer(state, groupId, server); created = { id: entry.id, name: entry.name }; });
    return created;
  }
  async updateServer(id: string, server: ServerDraft): Promise<void> { await this.mutate((state) => updateServer(state, id, server)); }
  async moveServer(id: string, groupId: string | undefined): Promise<void> { await this.mutate((state) => { moveServer(state, id, groupId); }); }
  async removeServer(id: string): Promise<void> { await this.mutate((state) => removeServer(state, id)); }

  private mutate(change: (state: DevSshState) => void): Promise<void> {
    return this.data.update(change);
  }
}
