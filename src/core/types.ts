export type AppLocale = 'en' | 'es';
export type DropPosition = 'before' | 'after';
export type ToastTone = 'default' | 'success' | 'error';
export type UiAction = 'createGroup' | 'addServer' | 'focusSearch';

export interface ServerDraft {
  name: string;
  host: string;
  user: string;
  port: number;
  identityFile: string;
}

export interface ServerEntry extends ServerDraft {
  id: string;
  addedAt: number;
}

export interface ServerGroup {
  id: string;
  name: string;
  color: number;
  servers: ServerEntry[];
}

export interface DevSshState {
  version: 1;
  groups: ServerGroup[];
  servers: ServerEntry[];
}

export interface ViewServer extends ServerEntry {
  identityExists: boolean;
  destination: string;
}

export interface ViewGroup {
  id: string;
  name: string;
  color: number;
  servers: ViewServer[];
  virtual: boolean;
}

export interface ViewState {
  locale: AppLocale;
  groups: ViewGroup[];
  servers: ViewServer[];
  serverCount: number;
  confirmBeforeRemove: boolean;
  defaultUser: string;
}

export type ClientMessage =
  | { type: 'ready' }
  | { type: 'refresh' }
  | { type: 'createGroup'; name: string }
  | { type: 'renameGroup'; id: string; name: string }
  | { type: 'removeGroup'; id: string }
  | { type: 'setGroupColor'; id: string; color: number }
  | { type: 'reorderGroup'; id: string; targetId: string; position: DropPosition }
  | { type: 'reorderServer'; id: string; targetId: string; position: DropPosition }
  | { type: 'addServer'; groupId: string | null; server: ServerDraft }
  | { type: 'updateServer'; id: string; server: ServerDraft }
  | { type: 'moveServer'; id: string; targetGroupId: string | null }
  | { type: 'removeServer'; id: string }
  | { type: 'connect'; id: string }
  | { type: 'copyAddress'; id: string }
  | { type: 'copyCommand'; id: string }
  | { type: 'revealIdentity'; id: string }
  | { type: 'selectIdentityFile' };

export type HostMessage =
  | { type: 'state'; state: ViewState }
  | { type: 'toast'; message: string; tone: ToastTone }
  | { type: 'action'; action: UiAction }
  | { type: 'identityFileSelected'; path: string };
