import * as fs from 'node:fs';
import type { DevSshState, ServerEntry, ViewServer, ViewState } from '../../core/types';
import { countServers } from '../../domain/servers';
import { sshDestination } from '../../domain/ssh-command';
import type { DevSshSettings } from './settings';

export function buildViewState(state: Readonly<DevSshState>, settings: DevSshSettings): ViewState {
  const decorate = (server: ServerEntry): ViewServer => ({
    ...server,
    identityExists: fs.existsSync(server.identityFile),
    destination: sshDestination(server)
  });
  return {
    locale: settings.locale,
    groups: state.groups.map((group) => ({ ...group, servers: group.servers.map(decorate), virtual: false })),
    servers: state.servers.map(decorate),
    serverCount: countServers(state),
    confirmBeforeRemove: settings.confirmBeforeRemove,
    defaultUser: settings.defaultUser
  };
}
