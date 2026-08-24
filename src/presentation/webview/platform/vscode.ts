import type { ClientMessage } from '@/core/types';

export interface PersistedUi { expanded?: string[]; }
interface VsCodeApi { postMessage(message: ClientMessage): void; getState(): PersistedUi | undefined; setState(state: PersistedUi): void; }
declare function acquireVsCodeApi(): VsCodeApi;
const api = acquireVsCodeApi();
export function send(message: ClientMessage): void { api.postMessage(message); }
export function readUi(): PersistedUi { return api.getState() ?? {}; }
export function writeUi(state: PersistedUi): void { api.setState(state); }
