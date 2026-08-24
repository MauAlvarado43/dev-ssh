import { ACCENT_COUNT } from '@/core/accents';
import type { ServerDraft } from '@/core/types';
import { findGroup, findServer, session } from '@/presentation/webview/app/session';
import { icon } from '@/presentation/webview/components/icons';
import { showToast } from '@/presentation/webview/components/toast';
import { t, type MessageKey } from '@/presentation/webview/i18n/messages';
import { escapeHtml, requireElement } from '@/presentation/webview/lib/dom';
import { send } from '@/presentation/webview/platform/vscode';

const COLOR_NAMES: MessageKey[] = ['colors.violet', 'colors.mint', 'colors.amber', 'colors.pink', 'colors.blue', 'colors.lavender', 'colors.lime', 'colors.coral'];
let root: HTMLElement | undefined;
function modalRoot(): HTMLElement { root ??= requireElement('modalRoot'); return root; }
export function closeModal(): void { modalRoot().innerHTML = ''; }

export function bindModalDismiss(onEscape: () => void): void {
  modalRoot().addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    if (target.classList.contains('modal-backdrop') || target.closest('[data-close-modal]')) closeModal();
  });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { closeModal(); onEscape(); } });
}

export function setSelectedIdentity(path: string): void {
  const input = document.getElementById('identityField') as HTMLInputElement | null;
  if (input) { input.value = path; input.focus(); input.setSelectionRange(path.length, path.length); }
}

export function openGroupModal(id?: string): void {
  const current = id ? findGroup(id) : undefined;
  modalRoot().innerHTML = `<div class="modal-backdrop"><form class="modal" id="groupForm">
    ${head(current ? t('modal.editGroup') : t('modal.createGroup'), t('modal.groupDescription'))}
    <div class="modal-body"><label class="field-label" for="nameField">${t('modal.name')}</label>
      <input id="nameField" class="text-field" maxlength="80" autocomplete="off" placeholder="${t('modal.groupPlaceholder')}" value="${escapeHtml(current?.name ?? '')}">
      <div id="fieldError" class="field-error"></div></div>
    ${actions(`<button type="submit" class="primary">${current ? t('modal.save') : t('modal.create')}</button>`)}
  </form></div>`;
  const input = requireElement<HTMLInputElement>('nameField');
  setTimeout(() => { input.focus(); input.select(); }, 20);
  requireElement<HTMLFormElement>('groupForm').addEventListener('submit', (event) => {
    event.preventDefault(); const name = input.value.trim();
    const duplicate = session.data.groups.some((group) => group.id !== id && group.name.toLocaleLowerCase() === name.toLocaleLowerCase());
    if (!name || duplicate) { requireElement('fieldError').textContent = name ? t('modal.groupTaken') : t('modal.nameRequired'); input.focus(); return; }
    send(current ? { type: 'renameGroup', id: current.id, name } : { type: 'createGroup', name }); closeModal();
  });
}

export function openServerModal(groupId: string | null = null, serverId?: string): void {
  const located = serverId ? findServer(serverId) : undefined;
  const server = located?.server;
  const selectedGroup = located ? located.group?.id ?? '' : groupId ?? '';
  const groupOptions = [`<option value="">${t('modal.noGroup')}</option>`, ...session.data.groups.map((group) =>
    `<option value="${escapeHtml(group.id)}" ${group.id === selectedGroup ? 'selected' : ''}>${escapeHtml(group.name)}</option>`)].join('');
  modalRoot().innerHTML = `<div class="modal-backdrop"><form class="modal server-modal" id="serverForm">
    ${head(server ? t('modal.editServer') : t('modal.addServer'), t('modal.serverDescription'))}
    <div class="modal-body form-grid">
      ${field('serverNameField', 'modal.serverName', 'modal.serverNamePlaceholder', server?.name ?? '')}
      ${field('hostField', 'modal.host', 'modal.hostPlaceholder', server?.host ?? '')}
      <div class="split-fields">${field('userField', 'modal.user', 'modal.userPlaceholder', server?.user ?? session.data.defaultUser)}${field('portField', 'modal.port', '', String(server?.port ?? 22), 'number')}</div>
      <div><label class="field-label" for="identityField">${t('modal.identityFile')}</label><div class="file-row">
        <input id="identityField" class="text-field" autocomplete="off" spellcheck="false" placeholder="${t('modal.identityPlaceholder')}" value="${escapeHtml(server?.identityFile ?? '')}">
        <button type="button" class="secondary browse-button" id="browseIdentity">${t('modal.browse')}</button></div></div>
      ${server ? '' : `<div><label class="field-label" for="groupField">${t('modal.addTo')}</label><select id="groupField" class="text-field">${groupOptions}</select></div>`}
      <div id="serverError" class="field-error"></div>
    </div>${actions(`<button type="submit" class="primary">${server ? t('modal.save') : t('modal.addServer')}</button>`)}
  </form></div>`;
  requireElement('browseIdentity').addEventListener('click', () => send({ type: 'selectIdentityFile' }));
  requireElement<HTMLInputElement>('serverNameField').focus();
  requireElement<HTMLFormElement>('serverForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const draft: ServerDraft = {
      name: value('serverNameField'), host: value('hostField'), user: value('userField'),
      port: Number(value('portField')), identityFile: value('identityField')
    };
    if (!draft.name || !draft.host || !draft.user || !draft.identityFile) { error(t('modal.requiredFields')); return; }
    if (!Number.isInteger(draft.port) || draft.port < 1 || draft.port > 65535) { error(t('modal.invalidPort')); return; }
    if (server) send({ type: 'updateServer', id: server.id, server: draft });
    else send({ type: 'addServer', groupId: (document.getElementById('groupField') as HTMLSelectElement | null)?.value || null, server: draft });
    closeModal();
  });
}

export function openGroupPicker(serverId: string): void {
  const current = findServer(serverId)?.group?.id ?? '';
  const options = [{ id: '', name: t('shell.ungrouped'), count: session.data.servers.length }, ...session.data.groups.map((group) => ({ id: group.id, name: group.name, count: group.servers.length }))]
    .filter((group) => group.id !== current);
  if (!options.length) { showToast(t('toast.noDestination'), 'error'); return; }
  modalRoot().innerHTML = `<div class="modal-backdrop"><div class="modal">${head(t('modal.moveServer'), t('modal.moveDescription'))}
    <div class="modal-body"><div class="group-options">${options.map((group) => `<button class="group-option" data-select-group="${escapeHtml(group.id)}">
      <span class="group-badge">${icon('folder')}</span><span><strong>${escapeHtml(group.name)}</strong><small>${t('modal.groupServers', { count: group.count })}</small></span></button>`).join('')}</div></div>${actions()}
  </div></div>`;
  modalRoot().querySelectorAll<HTMLElement>('[data-select-group]').forEach((button) => button.addEventListener('click', () => {
    send({ type: 'moveServer', id: serverId, targetGroupId: button.dataset.selectGroup || null }); closeModal();
  }));
}

export function openColorPicker(groupId: string): void {
  const group = findGroup(groupId); if (!group) return;
  const swatches = Array.from({ length: ACCENT_COUNT }, (_, color) => `<button class="color-choice ${group.color === color ? 'selected' : ''}" data-color="${color}" title="${t(COLOR_NAMES[color]!)}">
    <span class="color-swatch" data-color="${color}">${group.color === color ? icon('check') : ''}</span></button>`).join('');
  modalRoot().innerHTML = `<div class="modal-backdrop"><div class="modal">${head(t('modal.colorTitle', { name: escapeHtml(group.name) }), t('modal.colorDescription'))}
    <div class="modal-body"><div class="color-grid">${swatches}</div></div>${actions()}</div></div>`;
  modalRoot().querySelectorAll<HTMLElement>('button[data-color]').forEach((button) => button.addEventListener('click', () => {
    const color = Number(button.dataset.color); if (Number.isInteger(color)) send({ type: 'setGroupColor', id: groupId, color }); closeModal();
  }));
}

export function confirmRemove(kind: 'server' | 'group', id: string): void {
  const remove = () => send(kind === 'server' ? { type: 'removeServer', id } : { type: 'removeGroup', id });
  if (!session.data.confirmBeforeRemove) { remove(); return; }
  const group = kind === 'group' ? findGroup(id) : undefined;
  const name = (kind === 'server' ? findServer(id)?.server.name : group?.name) ?? t(kind === 'server' ? 'modal.thisServer' : 'modal.thisGroup');
  const extra = group?.servers.length ? t('modal.removeServers', { count: group.servers.length }) : '';
  modalRoot().innerHTML = `<div class="modal-backdrop"><div class="modal"><div class="modal-head"><div><div class="confirm-icon">${icon('trash')}</div>
    <h2 class="modal-title">${t('modal.removeTitle', { name: escapeHtml(name) })}</h2><p class="modal-description">${t('modal.removeDescription')}${extra}</p></div>
    <button class="modal-close" data-close-modal>${icon('close')}</button></div>${actions(`<button class="danger" id="confirmRemove">${t('modal.remove')}</button>`)}</div></div>`;
  requireElement('confirmRemove').addEventListener('click', () => { remove(); closeModal(); });
}

function field(id: string, label: MessageKey, placeholder: MessageKey | '', current: string, type = 'text'): string {
  return `<div><label class="field-label" for="${id}">${t(label)}</label><input id="${id}" class="text-field" type="${type}" ${type === 'number' ? 'min="1" max="65535"' : ''} autocomplete="off" placeholder="${placeholder ? t(placeholder) : ''}" value="${escapeHtml(current)}"></div>`;
}
function value(id: string): string { return requireElement<HTMLInputElement>(id).value.trim(); }
function error(message: string): void { requireElement('serverError').textContent = message; }
function head(title: string, description: string): string { return `<div class="modal-head"><div><h2 class="modal-title">${title}</h2><p class="modal-description">${description}</p></div><button type="button" class="modal-close" data-close-modal>${icon('close')}</button></div>`; }
function actions(confirm = ''): string { return `<div class="modal-actions"><button type="button" class="secondary" data-close-modal>${t('modal.cancel')}</button>${confirm}</div>`; }
