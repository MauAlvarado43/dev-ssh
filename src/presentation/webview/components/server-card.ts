import type { ViewGroup, ViewServer } from '@/core/types';
import { findServer, isExpanded, session } from '@/presentation/webview/app/session';
import { icon } from '@/presentation/webview/components/icons';
import { plural, t } from '@/presentation/webview/i18n/messages';
import { classNames, escapeHtml, escapeRegExp } from '@/presentation/webview/lib/dom';

export function renderGroup(group: ViewGroup): string {
  const collapsed = !isExpanded(group.id);
  const identity = group.virtual ? 'data-ungrouped="true"' : `data-group-id="${escapeHtml(group.id)}"`;
  const target = group.virtual ? '' : escapeHtml(group.id);
  return `<article class="${classNames('group-card', collapsed && 'collapsed')}" ${identity} data-accent="${group.color}">
    <div class="group-head">
      <button class="group-toggle" data-action="toggle-group" data-id="${escapeHtml(group.id)}">
        <span class="group-badge">${icon('folder')}</span><span class="group-meta"><span class="group-name">${highlight(group.name)}</span>
        <span class="group-count">${plural(group.servers.length, 'shell.serverCountOne', 'shell.serverCount')}</span></span>${icon('chevron')}
      </button>
      <button class="ghost-action" data-action="add-server-to-group" data-target="${target}" title="${t('group.addServerHere')}">${icon('plus')}</button>
      ${group.virtual ? '' : groupActions(group.id)}
    </div>
    <div class="servers">${renderServers(group)}</div>
  </article>`;
}

function groupActions(id: string): string {
  const safe = escapeHtml(id);
  return `<button class="ghost-action drag-handle" draggable="true" data-drag-group="${safe}" title="${t('group.dragToReorder')}">${icon('grip')}</button>
    <button class="ghost-action" data-menu="group" data-id="${safe}" title="${t('group.moreActions')}">${icon('more')}</button>`;
}

function renderServers(group: ViewGroup): string {
  if (group.servers.length) return group.servers.map((server) => renderServer(server, group)).join('');
  return `<div class="empty-group">${t('group.noServers')}<br><button class="inline-link" data-action="add-server-to-group" data-target="${escapeHtml(group.id)}">${t('group.addServer')}</button></div>`;
}

export function renderServer(server: ViewServer, group: ViewGroup): string {
  const id = escapeHtml(server.id);
  return `<div class="${classNames('server-row', !server.identityExists && 'missing')}" data-server-id="${id}" data-group-id="${escapeHtml(group.id)}">
    <button class="server-main" data-action="connect" data-id="${id}" title="${escapeHtml(t('server.connect', { destination: server.destination }))}">
      <span class="server-icon">${icon(server.identityExists ? 'server' : 'warning')}</span>
      <span class="server-info"><span class="server-name">${highlight(server.name)}</span>
      <span class="server-address">${highlight(server.destination)}:${server.port}</span></span>
    </button>
    ${!server.identityExists ? `<span class="missing-indicator" title="${t('server.missingIdentity')}">${icon('key')}</span>` : ''}
    <span class="row-actions">
      <button class="connect-action" data-action="connect" data-id="${id}" title="${t('server.connectAction')}">${icon('terminal')}</button>
      <button class="ghost-action server-drag-handle" draggable="true" data-drag-server="${id}" title="${t('server.dragToReorder')}">${icon('grip')}</button>
      <button class="ghost-action" data-menu="server" data-id="${id}" title="${t('server.moreActions')}">${icon('more')}</button>
    </span>
  </div>`;
}

function highlight(value: string): string {
  const safe = escapeHtml(value);
  const needle = session.query.trim();
  return needle ? safe.replace(new RegExp(`(${escapeRegExp(escapeHtml(needle))})`, 'ig'), '<mark>$1</mark>') : safe;
}

export function currentGroupId(serverId: string): string | null { return findServer(serverId)?.group?.id ?? null; }
