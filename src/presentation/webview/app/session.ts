import { defaultLocale } from '@/core/i18n/catalog';
import type { ViewGroup, ViewServer, ViewState } from '@/core/types';
import { t } from '@/presentation/webview/i18n/messages';
import { readUi, writeUi } from '@/presentation/webview/platform/vscode';

export const UNGROUPED_ID = '__ungrouped__';
export const EMPTY_VIEW_STATE: ViewState = { locale: defaultLocale, groups: [], servers: [], serverCount: 0, confirmBeforeRemove: true, defaultUser: '' };
export const session = { data: EMPTY_VIEW_STATE, query: '', expanded: new Set<string>(readUi().expanded ?? []) };

export function setData(state: ViewState): void { session.data = state; }
export function setQuery(query: string): void { session.query = query; }
export function hasContent(): boolean { return session.data.groups.length > 0 || session.data.servers.length > 0; }
export function isExpanded(id: string): boolean { return session.expanded.has(id) || Boolean(session.query.trim()); }
export function toggleExpanded(id: string): void {
  if (session.expanded.has(id)) session.expanded.delete(id); else session.expanded.add(id);
  writeUi({ expanded: [...session.expanded] });
}

export function groups(): ViewGroup[] {
  return session.data.servers.length ? [...session.data.groups, { id: UNGROUPED_ID, name: t('shell.ungrouped'), color: 5, servers: session.data.servers, virtual: true }] : session.data.groups;
}

export function visibleGroups(): ViewGroup[] {
  const needle = session.query.trim().toLocaleLowerCase();
  if (!needle) return groups();
  return groups().map((group) => ({ ...group, servers: group.servers.filter((server) => matches(server, group, needle)) }))
    .filter((group) => group.servers.length || group.name.toLocaleLowerCase().includes(needle));
}

function matches(server: ViewServer, group: ViewGroup, needle: string): boolean {
  return [server.name, server.host, server.user, server.identityFile, group.name].some((value) => value.toLocaleLowerCase().includes(needle));
}

export function findGroup(id: string): ViewGroup | undefined { return session.data.groups.find((group) => group.id === id); }
export function findServer(id: string): { group: ViewGroup | undefined; server: ViewServer } | undefined {
  const ungrouped = session.data.servers.find((server) => server.id === id);
  if (ungrouped) return { group: undefined, server: ungrouped };
  for (const group of session.data.groups) {
    const server = group.servers.find((entry) => entry.id === id);
    if (server) return { group, server };
  }
  return undefined;
}
