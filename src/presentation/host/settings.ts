import * as vscode from 'vscode';
import { defaultLocale, isAppLocale } from '../../core/i18n/catalog';
import type { AppLocale } from '../../core/types';

export interface DevSshSettings {
  locale: AppLocale;
  sshPath: string;
  defaultUser: string;
  confirmBeforeRemove: boolean;
}

export function readSettings(): DevSshSettings {
  const configuration = vscode.workspace.getConfiguration('devSsh');
  const language = configuration.get<string>('language', defaultLocale);
  return {
    locale: isAppLocale(language) ? language : defaultLocale,
    sshPath: configuration.get<string>('sshPath', 'ssh').trim() || 'ssh',
    defaultUser: configuration.get<string>('defaultUser', '').trim(),
    confirmBeforeRemove: configuration.get<boolean>('confirmBeforeRemove', true)
  };
}
