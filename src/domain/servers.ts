import { randomUUID } from 'node:crypto';
import * as os from 'node:os';
import * as path from 'node:path';
import { ACCENT_COUNT, isAccent } from '../core/accents';
import { LocalizedError } from '../core/i18n/catalog';
import type { DevSshState, DropPosition, ServerDraft, ServerEntry, ServerGroup } from '../core/types';

export const STATE_KEY = 'devSsh.state.v1';
export const EMPTY_STATE: DevSshState = { version: 1, groups: [], servers: [] };

export interface LocatedServer {
  group: ServerGroup | undefined;
  server: ServerEntry;
}

export function emptyState(): DevSshState { return structuredClone(EMPTY_STATE); }

export function normalizeIdentityPath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const expanded = trimmed === '~' || trimmed.startsWith('~/') || trimmed.startsWith('~\\')
    ? path.join(os.homedir(), trimmed.slice(1))
    : trimmed;
  return path.resolve(expanded);
}

export function normalizeState(value: unknown): DevSshState {
  if (!value || typeof value !== 'object') return emptyState();
  const candidate = value as { groups?: unknown; servers?: unknown };
  if (!Array.isArray(candidate.groups)) return emptyState();

  const ids = new Set<string>();
  const names = new Set<string>();
  const connections = new Set<string>();
  const groups: ServerGroup[] = [];

  for (const raw of candidate.groups) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Partial<ServerGroup>;
    const name = cleanText(item.name);
    if (!name || names.has(name.toLocaleLowerCase())) continue;
    const id = validId(item.id, ids);
    ids.add(id);
    names.add(name.toLocaleLowerCase());
    groups.push({
      id,
      name,
      color: isAccent(item.color) ? item.color : groups.length % ACCENT_COUNT,
      servers: normalizeServers(item.servers, ids, connections)
    });
  }

  return { version: 1, groups, servers: normalizeServers(candidate.servers, ids, connections) };
}

function normalizeServers(value: unknown, ids: Set<string>, connections: Set<string>): ServerEntry[] {
  if (!Array.isArray(value)) return [];
  const servers: ServerEntry[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Partial<ServerEntry>;
    const draft = normalizedDraft(item);
    if (!draft) continue;
    const key = connectionKey(draft);
    if (connections.has(key)) continue;
    const id = validId(item.id, ids);
    ids.add(id);
    connections.add(key);
    servers.push({ ...draft, id, addedAt: typeof item.addedAt === 'number' ? item.addedAt : Date.now() });
  }
  return servers;
}

function normalizedDraft(value: Partial<ServerDraft>): ServerDraft | undefined {
  const name = cleanText(value.name);
  const host = cleanText(value.host);
  const user = cleanText(value.user);
  const port = typeof value.port === 'number' ? value.port : Number(value.port);
  const identityFile = typeof value.identityFile === 'string' ? normalizeIdentityPath(value.identityFile) : '';
  if (!name || !validHost(host) || !validUser(user) || !validPort(port) || !identityFile) return undefined;
  return { name, host, user, port, identityFile };
}

export function validateDraft(value: ServerDraft): ServerDraft {
  const name = cleanText(value.name);
  if (!name) throw new LocalizedError('host.serverNameRequired');
  const host = cleanText(value.host);
  if (!validHost(host)) throw new LocalizedError('host.hostRequired');
  const user = cleanText(value.user);
  if (!validUser(user)) throw new LocalizedError('host.userRequired');
  const port = Number(value.port);
  if (!validPort(port)) throw new LocalizedError('host.portInvalid');
  const identityFile = normalizeIdentityPath(value.identityFile);
  if (!identityFile) throw new LocalizedError('host.identityRequired');
  return { name, host, user, port, identityFile };
}

export function createGroup(state: DevSshState, value: string): ServerGroup {
  const name = cleanText(value);
  if (!name) throw new LocalizedError('host.groupNameRequired');
  if (state.groups.some((group) => equal(group.name, name))) throw new LocalizedError('host.groupNameTaken');
  const group = { id: randomUUID(), name, color: nextColor(state), servers: [] };
  state.groups.push(group);
  return group;
}

export function renameGroup(state: DevSshState, id: string, value: string): void {
  const group = state.groups.find((entry) => entry.id === id);
  const name = cleanText(value);
  if (!group || !name) throw new LocalizedError('host.groupMissing');
  if (state.groups.some((entry) => entry.id !== id && equal(entry.name, name))) throw new LocalizedError('host.groupNameTaken');
  group.name = name;
}

export function removeGroup(state: DevSshState, id: string): void {
  state.groups = state.groups.filter((group) => group.id !== id);
}

export function setGroupColor(state: DevSshState, id: string, color: number): void {
  const group = state.groups.find((entry) => entry.id === id);
  if (!group || !isAccent(color)) throw new LocalizedError('host.invalidColor');
  group.color = color;
}

export function addServer(state: DevSshState, groupId: string | undefined, value: ServerDraft): ServerEntry {
  const draft = validateDraft(value);
  if (findByConnection(state, draft)) throw new LocalizedError('host.duplicateServer');
  const server = { ...draft, id: randomUUID(), addedAt: Date.now() };
  (groupId ? requireGroup(state, groupId).servers : state.servers).push(server);
  return server;
}

export function updateServer(state: DevSshState, id: string, value: ServerDraft): void {
  const found = findServer(state, id);
  if (!found) throw new LocalizedError('host.serverMissing');
  const draft = validateDraft(value);
  const duplicate = findByConnection(state, draft);
  if (duplicate && duplicate.server.id !== id) throw new LocalizedError('host.duplicateServer');
  Object.assign(found.server, draft);
}

export function findServer(state: DevSshState, id: string): LocatedServer | undefined {
  const ungrouped = state.servers.find((entry) => entry.id === id);
  if (ungrouped) return { group: undefined, server: ungrouped };
  for (const group of state.groups) {
    const server = group.servers.find((entry) => entry.id === id);
    if (server) return { group, server };
  }
  return undefined;
}

export function findByConnection(state: DevSshState, draft: ServerDraft): LocatedServer | undefined {
  const key = connectionKey(draft);
  return allServers(state).find((located) => connectionKey(located.server) === key);
}

export function moveServer(state: DevSshState, id: string, groupId: string | undefined): boolean {
  const source = findServer(state, id);
  const target = groupId ? requireGroup(state, groupId) : undefined;
  if (!source || source.group?.id === target?.id) return false;
  detach(state, source);
  (target ? target.servers : state.servers).push(source.server);
  return true;
}

export function removeServer(state: DevSshState, id: string): void {
  const found = findServer(state, id);
  if (found) detach(state, found);
}

export function reorderGroup(state: DevSshState, id: string, targetId: string, position: DropPosition): boolean {
  if (id === targetId) return false;
  const index = state.groups.findIndex((group) => group.id === id);
  if (index < 0 || !state.groups.some((group) => group.id === targetId)) return false;
  const [group] = state.groups.splice(index, 1);
  const target = state.groups.findIndex((entry) => entry.id === targetId);
  state.groups.splice(position === 'before' ? target : target + 1, 0, group!);
  return true;
}

export function reorderServer(state: DevSshState, id: string, targetId: string, position: DropPosition): boolean {
  if (id === targetId) return false;
  const source = findServer(state, id);
  const target = findServer(state, targetId);
  if (!source || !target || source.group?.id !== target.group?.id) return false;
  const servers = source.group?.servers ?? state.servers;
  const index = servers.findIndex((server) => server.id === id);
  const [server] = servers.splice(index, 1);
  const targetIndex = servers.findIndex((entry) => entry.id === targetId);
  servers.splice(position === 'before' ? targetIndex : targetIndex + 1, 0, server!);
  return true;
}

export function countServers(state: DevSshState): number {
  return state.servers.length + state.groups.reduce((count, group) => count + group.servers.length, 0);
}

export function requireGroup(state: DevSshState, id: string): ServerGroup {
  const group = state.groups.find((entry) => entry.id === id);
  if (!group) throw new LocalizedError('host.groupMissing');
  return group;
}

function allServers(state: DevSshState): LocatedServer[] {
  return [
    ...state.servers.map((server) => ({ group: undefined, server })),
    ...state.groups.flatMap((group) => group.servers.map((server) => ({ group, server })))
  ];
}

function detach(state: DevSshState, located: LocatedServer): void {
  if (located.group) located.group.servers = located.group.servers.filter((server) => server.id !== located.server.id);
  else state.servers = state.servers.filter((server) => server.id !== located.server.id);
}

function connectionKey(value: Pick<ServerDraft, 'host' | 'user' | 'port'>): string {
  return `${value.user.toLocaleLowerCase()}@${value.host.toLocaleLowerCase()}:${value.port}`;
}

function validHost(value: string): boolean {
  return Boolean(value) && !value.startsWith('-') && /^[A-Za-z0-9._:[\]-]+$/.test(value);
}
function validUser(value: string): boolean { return /^[A-Za-z0-9._-]+$/.test(value) && !value.startsWith('-'); }
function validPort(value: number): boolean { return Number.isInteger(value) && value >= 1 && value <= 65_535; }
function cleanText(value: unknown): string { return typeof value === 'string' ? value.trim() : ''; }
function equal(left: string, right: string): boolean { return left.toLocaleLowerCase() === right.toLocaleLowerCase(); }
function validId(value: unknown, ids: Set<string>): string { return typeof value === 'string' && value && !ids.has(value) ? value : randomUUID(); }
function nextColor(state: DevSshState): number {
  const used = new Set(state.groups.map((group) => group.color));
  return Array.from({ length: ACCENT_COUNT }, (_, index) => index).find((color) => !used.has(color)) ?? state.groups.length % ACCENT_COUNT;
}
