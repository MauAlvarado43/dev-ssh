import { icon, type IconName } from '@/presentation/webview/components/icons';
import { t, type MessageKey } from '@/presentation/webview/i18n/messages';
import { escapeHtml, requireElement } from '@/presentation/webview/lib/dom';

export type MenuKind = 'server' | 'group';
export type MenuCommand = 'connect' | 'copy-address' | 'copy-command' | 'reveal-key' | 'edit-server' | 'move' | 'remove-server' | 'add-server' | 'rename-group' | 'change-color' | 'remove-group';
type Entry = { separator: true } | { separator?: false; glyph: IconName; label: MessageKey; command: MenuCommand; danger?: boolean };
const SERVER: Entry[] = [
  { glyph: 'terminal', label: 'menu.connect', command: 'connect' }, { separator: true },
  { glyph: 'copy', label: 'menu.copyAddress', command: 'copy-address' }, { glyph: 'copy', label: 'menu.copyCommand', command: 'copy-command' },
  { glyph: 'key', label: 'menu.revealIdentity', command: 'reveal-key' }, { separator: true },
  { glyph: 'edit', label: 'menu.editServer', command: 'edit-server' }, { glyph: 'move', label: 'menu.moveToGroup', command: 'move' },
  { separator: true }, { glyph: 'trash', label: 'menu.removeServer', command: 'remove-server', danger: true }
];
const GROUP: Entry[] = [
  { glyph: 'plus', label: 'menu.addServer', command: 'add-server' }, { glyph: 'edit', label: 'menu.renameGroup', command: 'rename-group' },
  { glyph: 'palette', label: 'menu.changeColor', command: 'change-color' }, { separator: true },
  { glyph: 'trash', label: 'menu.removeGroup', command: 'remove-group', danger: true }
];
let handler: ((command: MenuCommand, kind: MenuKind, id: string) => void) | undefined;

export function openMenu(kind: MenuKind, id: string, anchor: { right: number; bottom: number }): void {
  const entries = kind === 'server' ? SERVER : GROUP;
  const root = requireElement('menuRoot');
  root.innerHTML = `<div class="context-menu">${entries.map((entry) => renderEntry(entry, kind, id)).join('')}</div>`;
  const menu = root.firstElementChild as HTMLElement;
  menu.style.left = `${Math.max(6, Math.min(anchor.right - 215, innerWidth - 221))}px`;
  menu.style.top = `${Math.max(6, Math.min(anchor.bottom + 3, innerHeight - entries.length * 30 - 6))}px`;
}

export function closeMenu(): void { requireElement('menuRoot').innerHTML = ''; }
export function onMenuCommand(callback: typeof handler): void {
  handler = callback;
  requireElement('menuRoot').addEventListener('click', (event) => {
    const item = (event.target as HTMLElement).closest<HTMLElement>('[data-command]');
    if (!item) return;
    const { command, kind, id } = item.dataset;
    closeMenu();
    if (command && kind && id) handler?.(command as MenuCommand, kind as MenuKind, id);
  });
  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    if (!target.closest('.context-menu') && !target.closest('[data-menu]')) closeMenu();
  });
  window.addEventListener('blur', closeMenu);
}

function renderEntry(entry: Entry, kind: MenuKind, id: string): string {
  if (entry.separator) return '<div class="menu-separator"></div>';
  return `<button class="menu-item ${entry.danger ? 'danger-item' : ''}" data-command="${entry.command}" data-kind="${kind}" data-id="${escapeHtml(id)}">${icon(entry.glyph)}<span>${t(entry.label)}</span></button>`;
}
