import type { ServerEntry } from '../core/types';
import { buildCommandLine, type ShellFamily } from './shell-quoting';

export function sshDestination(server: Pick<ServerEntry, 'host' | 'user'>): string {
  return `${server.user}@${server.host}`;
}

export function sshArguments(server: Pick<ServerEntry, 'host' | 'user' | 'port' | 'identityFile'>): string[] {
  return ['-i', server.identityFile, '-p', String(server.port), sshDestination(server)];
}

export function sshCommand(sshPath: string, server: Pick<ServerEntry, 'host' | 'user' | 'port' | 'identityFile'>, family: ShellFamily): string {
  return buildCommandLine([sshPath.trim() || 'ssh', ...sshArguments(server)], family);
}
