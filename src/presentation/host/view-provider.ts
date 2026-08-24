import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import { localizeError } from '../../core/i18n/catalog';
import type { ClientMessage, HostMessage, UiAction } from '../../core/types';
import type { IdentityFileStore } from '../../infrastructure/identity-file-store';
import type { ServerStore } from '../../infrastructure/server-store';
import type { SshTerminal } from '../../integrations/ssh-terminal';
import { AppController } from './app-controller';

export class DevSshViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private pendingAction?: UiAction;
  private readonly controller: AppController;

  constructor(private readonly extensionUri: vscode.Uri, store: ServerStore, terminal: SshTerminal, identities: IdentityFileStore) {
    this.controller = new AppController(store, terminal, identities, (message) => { void this.post(message); });
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist')] };
    view.webview.html = this.html(view.webview);
    view.webview.onDidReceiveMessage((message: ClientMessage) => { void this.route(message); });
    view.onDidDispose(() => { this.view = undefined; });
    if (this.pendingAction) { void this.post({ type: 'action', action: this.pendingAction }); this.pendingAction = undefined; }
  }

  showCreateGroup(): Promise<void> { return this.run('createGroup'); }
  showAddServer(): Promise<void> { return this.run('addServer'); }
  focusSearch(): Promise<void> { return this.run('focusSearch'); }
  refresh(): void { if (this.view) this.controller.publishState(); }

  private async run(action: UiAction): Promise<void> {
    this.pendingAction = action;
    await vscode.commands.executeCommand('devSsh.servers.focus');
    if (this.view) { await this.post({ type: 'action', action }); this.pendingAction = undefined; }
  }

  private async route(message: ClientMessage): Promise<void> {
    try { await this.controller.handle(message); }
    catch (error) { await this.post({ type: 'toast', message: localizeError(error, this.controller.locale), tone: 'error' }); }
  }

  private post(message: HostMessage): Thenable<boolean> | undefined { return this.view?.webview.postMessage(message); }

  private html(webview: vscode.Webview): string {
    const nonce = randomBytes(16).toString('base64');
    const script = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview.js'));
    const style = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview.css'));
    return `<!doctype html><html lang="${this.controller.locale}"><head>
      <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data:;">
      <link rel="stylesheet" href="${style}"><title>Dev SSH</title>
    </head><body><main id="app"></main><div id="menuRoot"></div><div id="modalRoot"></div><div id="toastRoot" aria-live="polite"></div>
      <script nonce="${nonce}" src="${script}"></script></body></html>`;
  }
}
