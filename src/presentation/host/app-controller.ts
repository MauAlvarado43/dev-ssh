import * as fsp from 'node:fs/promises';
import * as vscode from 'vscode';
import { LocalizedError, translate, type MessageKey, type TranslationValues } from '../../core/i18n/catalog';
import type { AppLocale, ClientMessage, HostMessage, ServerDraft, ToastTone, ViewState } from '../../core/types';
import { normalizeIdentityPath, type LocatedServer } from '../../domain/servers';
import type { IdentityFileStore } from '../../infrastructure/identity-file-store';
import type { ServerStore } from '../../infrastructure/server-store';
import type { SshTerminal } from '../../integrations/ssh-terminal';
import { readSettings } from './settings';
import { buildViewState } from './view-state';

export class AppController {
  constructor(
    private readonly store: ServerStore,
    private readonly terminal: SshTerminal,
    private readonly identities: IdentityFileStore,
    private readonly emit: (message: HostMessage) => void
  ) {}

  get locale(): AppLocale { return readSettings().locale; }
  viewState(): ViewState { return buildViewState(this.store.snapshot, readSettings()); }
  publishState(): void { this.emit({ type: 'state', state: this.viewState() }); }
  translate(key: MessageKey, values?: TranslationValues): string { return translate(this.locale, key, values); }

  async handle(message: ClientMessage): Promise<void> {
    switch (message.type) {
      case 'ready': this.publishState(); return;
      case 'refresh': this.publishState(); this.toast('toast.viewRefreshed'); return;
      case 'createGroup': {
        const group = await this.store.addGroup(message.name);
        this.publishState(); this.toast('toast.groupCreated', 'success', { name: group.name }); return;
      }
      case 'renameGroup': await this.store.renameGroup(message.id, message.name); this.publishState(); this.toast('toast.groupUpdated', 'success'); return;
      case 'removeGroup': {
        const identityFiles = this.store.snapshot.groups.find((group) => group.id === message.id)?.servers.map((server) => server.identityFile) ?? [];
        await this.store.removeGroup(message.id);
        await Promise.all(identityFiles.map((identityFile) => this.removeIdentity(identityFile)));
        this.publishState(); this.toast('toast.groupRemoved'); return;
      }
      case 'setGroupColor': await this.store.setGroupColor(message.id, message.color); this.publishState(); this.toast('toast.colorUpdated', 'success'); return;
      case 'reorderGroup': await this.store.reorderGroup(message.id, message.targetId, message.position); this.publishState(); return;
      case 'reorderServer': await this.store.reorderServer(message.id, message.targetId, message.position); this.publishState(); return;
      case 'addServer': {
        if (message.groupId && !this.store.hasGroup(message.groupId)) throw new LocalizedError('host.groupMissing');
        await assertIdentityExists(message.server);
        const identity = await this.adoptIdentity(message.server.identityFile, false);
        try {
          const server = await this.store.addServer(message.groupId ?? undefined, { ...message.server, identityFile: identity.path });
          this.publishState(); this.toast('toast.serverAdded', 'success', { name: server.name }); return;
        } catch (error) {
          if (identity.imported) await this.removeIdentity(identity.path);
          throw error;
        }
      }
      case 'updateServer': {
        const current = this.requireServer(message.id).server;
        await assertIdentityExists(message.server);
        const identity = await this.adoptIdentity(
          message.server.identityFile,
          normalizeIdentityPath(message.server.identityFile) === current.identityFile
        );
        try {
          await this.store.updateServer(message.id, { ...message.server, identityFile: identity.path });
        } catch (error) {
          if (identity.imported) await this.removeIdentity(identity.path);
          throw error;
        }
        if (current.identityFile !== identity.path) await this.removeIdentity(current.identityFile);
        this.publishState(); this.toast('toast.serverUpdated', 'success'); return;
      }
      case 'moveServer': await this.store.moveServer(message.id, message.targetGroupId ?? undefined); this.publishState(); this.toast('toast.serverMoved', 'success'); return;
      case 'removeServer': {
        const identityFile = this.requireServer(message.id).server.identityFile;
        await this.store.removeServer(message.id);
        await this.removeIdentity(identityFile);
        this.publishState(); this.toast('toast.serverRemoved'); return;
      }
      case 'connect': await this.connect(message.id); return;
      case 'copyAddress': {
        const server = this.requireServer(message.id).server;
        await vscode.env.clipboard.writeText(`${server.user}@${server.host}:${server.port}`);
        this.toast('toast.addressCopied', 'success'); return;
      }
      case 'copyCommand': {
        const server = this.requireServer(message.id).server;
        await vscode.env.clipboard.writeText(this.terminal.commandLine(server, readSettings().sshPath));
        this.toast('toast.commandCopied', 'success'); return;
      }
      case 'revealIdentity': await this.revealIdentity(message.id); return;
      case 'selectIdentityFile': await this.selectIdentityFile(); return;
    }
  }

  private async connect(id: string): Promise<void> {
    const server = this.requireServer(id).server;
    if (!await isFile(server.identityFile)) {
      this.publishState(); this.toast('toast.missingIdentity', 'error'); return;
    }
    this.terminal.connect(server, readSettings().sshPath);
    this.toast('toast.connecting', 'success', { name: server.name });
  }

  private async selectIdentityFile(): Promise<void> {
    const selected = await vscode.window.showOpenDialog({
      title: this.translate('host.chooseIdentity'), canSelectFiles: true, canSelectFolders: false, canSelectMany: false,
      openLabel: this.translate('host.useIdentity'), filters: { 'Private keys': ['pem', 'key', 'ppk'], 'All files': ['*'] }
    });
    if (selected?.[0]) this.emit({ type: 'identityFileSelected', path: selected[0].fsPath });
  }

  private async revealIdentity(id: string): Promise<void> {
    const server = this.requireServer(id).server;
    if (!await isFile(server.identityFile)) throw new LocalizedError('host.revealFailed');
    await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(server.identityFile));
  }

  private requireServer(id: string): LocatedServer {
    const found = this.store.getServer(id);
    if (!found) throw new LocalizedError('host.serverMissing');
    return found;
  }

  private async adoptIdentity(sourcePath: string, reuseManaged: boolean): ReturnType<IdentityFileStore['adopt']> {
    try {
      return await this.identities.adopt(normalizeIdentityPath(sourcePath), reuseManaged);
    } catch {
      throw new LocalizedError('host.identityImportFailed');
    }
  }

  /** Cleanup never rolls back an already persisted user action. */
  private async removeIdentity(identityFile: string): Promise<void> {
    try { await this.identities.remove(identityFile); } catch { /* An orphan is safer than deleting the wrong file. */ }
  }

  private toast(key: MessageKey, tone: ToastTone = 'default', values?: TranslationValues): void {
    this.emit({ type: 'toast', message: this.translate(key, values), tone });
  }
}

async function assertIdentityExists(server: ServerDraft): Promise<void> {
  if (!await isFile(normalizeIdentityPath(server.identityFile))) throw new LocalizedError('host.identityMissing');
}

async function isFile(value: string): Promise<boolean> {
  try { return (await fsp.stat(value)).isFile(); } catch { return false; }
}
