import * as vscode from 'vscode';
import type { ServerEntry } from '../core/types';
import { shellFamily } from '../domain/shell-quoting';
import { sshCommand } from '../domain/ssh-command';

export class SshTerminal {
  commandLine(server: ServerEntry, sshPath: string): string {
    return sshCommand(sshPath, server, shellFamily(vscode.env.shell));
  }

  connect(server: ServerEntry, sshPath: string): void {
    const terminal = vscode.window.createTerminal({
      name: `SSH · ${server.name}`,
      iconPath: new vscode.ThemeIcon('remote'),
      message: `${server.user}@${server.host}:${server.port}`
    });
    terminal.show(false);
    terminal.sendText(this.commandLine(server, sshPath), true);
  }
}
