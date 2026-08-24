import type { DropPosition } from '@/core/types';
import { send } from '@/presentation/webview/platform/vscode';

interface Config {
  handle: string; key: string; target: string; dragging: string; before: string; after: string;
  id(element: HTMLElement): string | undefined; accepts?(target: HTMLElement, source: HTMLElement): boolean;
  drop(id: string, targetId: string, position: DropPosition): void;
}

export function registerDragAndDrop(app: HTMLElement): void {
  register(app, {
    handle: '[data-drag-group]', key: 'dragGroup', target: '.group-card[data-group-id]', dragging: 'dragging', before: 'drop-before', after: 'drop-after',
    id: (element) => element.dataset.groupId,
    drop: (id, targetId, position) => send({ type: 'reorderGroup', id, targetId, position })
  });
  register(app, {
    handle: '[data-drag-server]', key: 'dragServer', target: '.server-row[data-server-id]', dragging: 'server-dragging', before: 'server-drop-before', after: 'server-drop-after',
    id: (element) => element.dataset.serverId,
    accepts: (target, source) => target.dataset.groupId === source.dataset.groupId,
    drop: (id, targetId, position) => send({ type: 'reorderServer', id, targetId, position })
  });
}

function register(app: HTMLElement, config: Config): void {
  let draggedId: string | undefined;
  let source: HTMLElement | undefined;
  const clear = () => document.querySelectorAll(`.${config.before},.${config.after}`).forEach((element) => element.classList.remove(config.before, config.after));
  const finish = () => { document.querySelectorAll(`.${config.dragging}`).forEach((element) => element.classList.remove(config.dragging)); clear(); draggedId = undefined; source = undefined; };
  const targetOf = (event: DragEvent) => {
    if (!draggedId || !source) return undefined;
    const target = (event.target as HTMLElement).closest<HTMLElement>(config.target);
    return target && config.id(target) !== draggedId && (!config.accepts || config.accepts(target, source)) ? target : undefined;
  };
  app.addEventListener('dragstart', (event) => {
    const handle = (event.target as HTMLElement).closest<HTMLElement>(config.handle);
    if (!handle) return;
    draggedId = handle.dataset[config.key]; source = handle.closest<HTMLElement>(config.target) ?? undefined;
    if (!draggedId || !source) return;
    event.dataTransfer?.setData('text/plain', draggedId); if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    requestAnimationFrame(() => source?.classList.add(config.dragging));
  });
  app.addEventListener('dragover', (event) => {
    const target = targetOf(event); if (!target) return; event.preventDefault(); clear(); target.classList.add(positionOf(event, target) === 'before' ? config.before : config.after);
  });
  app.addEventListener('drop', (event) => {
    const target = targetOf(event); const targetId = target ? config.id(target) : undefined;
    if (!target || !targetId || !draggedId) return; event.preventDefault(); config.drop(draggedId, targetId, positionOf(event, target)); finish();
  });
  app.addEventListener('dragend', finish);
}

function positionOf(event: DragEvent, target: HTMLElement): DropPosition {
  const bounds = target.getBoundingClientRect(); return event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after';
}
