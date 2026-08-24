import type * as vscode from 'vscode';
import type { DevSshState, DropPosition, ServerDraft } from '../core/types';
import {
  addServer, createGroup, findServer, moveServer, normalizeState, removeGroup, removeServer,
  renameGroup, reorderGroup, reorderServer, setGroupColor, STATE_KEY, updateServer, type LocatedServer
} from '../domain/servers';

/** The only write path for persisted Dev SSH state. */
export class ServerStore {
  private state: DevSshState;
  private pendingWrite: Promise<void> = Promise.resolve();

  constructor(private readonly memento: vscode.Memento) {
    this.state = normalizeState(memento.get<unknown>(STATE_KEY));
  }

  get snapshot(): Readonly<DevSshState> { return this.state; }
  getServer(id: string): LocatedServer | undefined { return findServer(this.state, id); }
  hasGroup(id: string): boolean { return this.state.groups.some((group) => group.id === id); }

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
    const operation = this.pendingWrite.then(async () => {
      const next = structuredClone(this.state);
      change(next);
      await this.memento.update(STATE_KEY, next);
      this.state = next;
    });
    this.pendingWrite = operation.catch(() => undefined);
    return operation;
  }
}
