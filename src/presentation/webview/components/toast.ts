import type { ToastTone } from '@/core/types';
import { escapeHtml, requireElement } from '@/presentation/webview/lib/dom';
import { icon } from './icons';

let timer: number | undefined;
export function showToast(message: string, tone: ToastTone): void {
  const root = requireElement('toastRoot');
  root.innerHTML = `<div class="toast ${tone}">${icon(tone === 'error' ? 'warning' : 'check')}<span>${escapeHtml(message)}</span></div>`;
  if (timer) clearTimeout(timer);
  timer = window.setTimeout(() => { root.innerHTML = ''; }, 3200);
}
