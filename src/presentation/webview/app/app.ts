import type { HostMessage, UiAction } from '@/core/types';
import { hasContent, session, setData, setQuery, toggleExpanded, visibleGroups } from '@/presentation/webview/app/session';
import { icon, mountIconSprite } from '@/presentation/webview/components/icons';
import { renderGroup } from '@/presentation/webview/components/server-card';
import { showToast } from '@/presentation/webview/components/toast';
import { closeMenu, onMenuCommand, openMenu, type MenuCommand } from '@/presentation/webview/features/context-menu';
import { registerDragAndDrop } from '@/presentation/webview/features/drag-drop';
import { bindModalDismiss, confirmRemove, openColorPicker, openGroupModal, openGroupPicker, openServerModal, setSelectedIdentity } from '@/presentation/webview/features/modals';
import { plural, setLocale, t } from '@/presentation/webview/i18n/messages';
import { classNames, escapeHtml, requireElement } from '@/presentation/webview/lib/dom';
import { send } from '@/presentation/webview/platform/vscode';

let app: HTMLElement;
export function start(): void {
  app = requireElement('app'); mountIconSprite(); registerClicks(); registerContextMenu(); registerDragAndDrop(app);
  onMenuCommand(runMenuCommand); bindModalDismiss(closeMenu);
  window.addEventListener('message', (event: MessageEvent<HostMessage>) => receive(event.data));
  send({ type: 'ready' });
}

function receive(message: HostMessage): void {
  switch (message.type) {
    case 'state': setLocale(message.state.locale); setData(message.state); render(); return;
    case 'toast': showToast(message.message, message.tone); return;
    case 'action': runUiAction(message.action); return;
    case 'identityFileSelected': setSelectedIdentity(message.path); return;
  }
}

function runUiAction(action: UiAction): void {
  if (action === 'createGroup') openGroupModal();
  if (action === 'addServer') openServerModal();
  if (action === 'focusSearch') searchInput()?.focus();
}

function render(): void {
  const groups = visibleGroups();
  app.innerHTML = `<div class="shell">${brand()}${topbar()}${hasContent() ? summary() : ''}${body(groups)}</div>`;
  searchInput()?.addEventListener('input', (event) => {
    setQuery((event.target as HTMLInputElement).value); render();
    requestAnimationFrame(() => { const input = searchInput(); input?.focus(); input?.setSelectionRange(session.query.length, session.query.length); });
  });
}

function brand(): string { return `<header class="brand"><div class="brand-mark">${icon('logo')}</div><div class="brand-copy"><h1 class="brand-title">Dev SSH</h1><p class="brand-subtitle">${t('shell.subtitle')}</p></div></header>`; }
function topbar(): string { return `<div class="topbar"><div class="search-wrap">${icon('search')}<input id="search" class="search" type="search" autocomplete="off" spellcheck="false" aria-label="${t('shell.searchLabel')}" placeholder="${t('shell.searchPlaceholder')}" value="${escapeHtml(session.query)}"><button class="${classNames('search-clear', session.query && 'visible')}" data-action="clear-search" title="${t('shell.clearSearch')}">${icon('close')}</button></div><button class="primary-icon-button" data-action="add-server" title="${t('shell.addServer')}">${icon('plus')}</button></div>`; }
function summary(): string { return `<div class="summary"><span>${plural(session.data.serverCount, 'shell.serverCountOne', 'shell.serverCount')}</span><span>${plural(session.data.groups.length, 'shell.groupCountOne', 'shell.groupCount')}</span></div>`; }
function body(groups: ReturnType<typeof visibleGroups>): string {
  if (!hasContent()) return `<section class="empty-state"><div class="empty-visual"><div class="empty-terminal">${icon('terminal')}</div><span class="spark one"></span><span class="spark two"></span></div><h2>${t('empty.title')}</h2><p>${t('empty.description')}</p><button class="primary" data-action="add-server">${t('empty.addServer')}</button><br><button class="inline-link" data-action="create-group">${t('empty.createGroup')}</button></section>`;
  if (!groups.length) return `<div class="no-results">${icon('search')}<div>${t('shell.noResults')} “${escapeHtml(session.query)}”</div></div>`;
  return `<section class="group-list">${groups.map(renderGroup).join('')}</section><button class="add-group" data-action="create-group">${icon('plus')}<span>${t('shell.newGroup')}</span></button>`;
}

function registerClicks(): void {
  app.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>('[data-action],[data-menu]'); if (!button) return;
    closeMenu(); const { action, menu, id, target } = button.dataset;
    if ((menu === 'server' || menu === 'group') && id) { openMenu(menu, id, button.getBoundingClientRect()); return; }
    switch (action) {
      case 'create-group': openGroupModal(); return;
      case 'add-server': openServerModal(); return;
      case 'add-server-to-group': openServerModal(target || null); return;
      case 'clear-search': setQuery(''); render(); searchInput()?.focus(); return;
      case 'toggle-group': if (id) { toggleExpanded(id); render(); } return;
      case 'connect': if (id) send({ type: 'connect', id }); return;
    }
  });
}

function registerContextMenu(): void {
  app.addEventListener('contextmenu', (event) => {
    const target = event.target as HTMLElement; const server = target.closest<HTMLElement>('[data-server-id]'); const group = target.closest<HTMLElement>('.group-card[data-group-id]');
    if (!server && !group) return; event.preventDefault(); const anchor = { right: event.clientX, bottom: event.clientY };
    if (server?.dataset.serverId) openMenu('server', server.dataset.serverId, anchor); else if (group?.dataset.groupId) openMenu('group', group.dataset.groupId, anchor);
  });
}

function runMenuCommand(command: MenuCommand, _kind: string, id: string): void {
  switch (command) {
    case 'connect': return send({ type: 'connect', id });
    case 'copy-address': return send({ type: 'copyAddress', id });
    case 'copy-command': return send({ type: 'copyCommand', id });
    case 'reveal-key': return send({ type: 'revealIdentity', id });
    case 'edit-server': return openServerModal(null, id);
    case 'move': return openGroupPicker(id);
    case 'remove-server': return confirmRemove('server', id);
    case 'add-server': return openServerModal(id);
    case 'rename-group': return openGroupModal(id);
    case 'change-color': return openColorPicker(id);
    case 'remove-group': return confirmRemove('group', id);
  }
}

function searchInput(): HTMLInputElement | null { return document.getElementById('search') as HTMLInputElement | null; }
