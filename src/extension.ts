import * as path from 'node:path';
import * as vscode from 'vscode';
import { IdentityFileStore } from './infrastructure/identity-file-store';
import { ServerStore } from './infrastructure/server-store';
import { SshTerminal } from './integrations/ssh-terminal';
import { DevSshViewProvider } from './presentation/host/view-provider';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const store = new ServerStore(context.globalState);
  const identities = new IdentityFileStore(path.join(context.globalStorageUri.fsPath, 'identities'));
  await migrateExternalIdentities(store, identities);
  const provider = new DevSshViewProvider(context.extensionUri, store, new SshTerminal(), identities);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('devSsh.servers', provider, { webviewOptions: { retainContextWhenHidden: true } }),
    vscode.commands.registerCommand('devSsh.addGroup', () => provider.showCreateGroup()),
    vscode.commands.registerCommand('devSsh.addServer', () => provider.showAddServer()),
    vscode.commands.registerCommand('devSsh.searchServers', () => provider.focusSearch()),
    vscode.commands.registerCommand('devSsh.refresh', () => provider.refresh()),
    vscode.workspace.onDidChangeConfiguration((event) => { if (event.affectsConfiguration('devSsh')) provider.refresh(); })
  );
}

export function deactivate(): void {}

/** Imports profiles created by the original path-based build without deleting their source PEMs. */
async function migrateExternalIdentities(store: ServerStore, identities: IdentityFileStore): Promise<void> {
  const servers = [...store.snapshot.servers, ...store.snapshot.groups.flatMap((group) => group.servers)];
  for (const server of servers) {
    if (identities.isManaged(server.identityFile)) continue;
    let imported: string | undefined;
    try {
      const identity = await identities.adopt(server.identityFile);
      imported = identity.imported ? identity.path : undefined;
      await store.updateServer(server.id, { ...server, identityFile: identity.path });
    } catch {
      if (imported) {
        try { await identities.remove(imported); } catch { /* Leave cleanup for the OS if storage became unavailable. */ }
      }
      // Missing/unreadable legacy files stay external and appear as missing in the sidebar.
    }
  }
}
