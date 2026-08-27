import * as vscode from 'vscode';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { activeRoot, activateRestoredRoot, assertWritable, deviceId, PrivatePreferences } from './local-data';
import { collect, decodePlain, decrypt, encodePlain, encrypt, extract, hash, inventory, isEncrypted, MAX_BYTES, type BackupFile, type BackupPayload } from './archive';
import { authorize, credentialsFromJson, DriveClient, type Credentials, type Tokens } from './drive';
import { SharedJsonFile } from './shared-json-file';

export interface BackupAdapter {
  beforeRestore?(): Promise<void>;
  capture(includePrivateKeys: boolean): Promise<{ files: BackupFile[]; exclusions: string[] }>;
  restore(payload: BackupPayload, destination: string): Promise<void>;
}
const credentialKey = 'backup.google.credentials.v1';
const tokenKey = 'backup.google.tokens.v1';
const passwordKey = 'backup.passphrase.v1';
const errorMessage = (e: unknown): string => e instanceof Error ? e.message : String(e);

interface BackupSettingsState {
  automatic: boolean;
  busy: boolean;
  connected: boolean;
  encrypted: boolean;
  environment: string;
  error?: string;
  intervalMinutes: number;
  lastLocal?: string;
  lastRemote?: string;
  nextRun?: number;
  passphraseConfigured: boolean;
  pendingUploads: number;
  privateKeys?: boolean;
  supportsPrivateKeys: boolean;
}

export async function initializeLocal(context: vscode.ExtensionContext, namespace: string, legacyKeys: string[] = []): Promise<{ root: vscode.Uri; preferences: PrivatePreferences }> {
  if (vscode.workspace.getConfiguration(namespace).get('environment', 'local') !== 'local') throw new Error('Only the local environment is available. Supabase is not implemented.');
  const root = await activeRoot(context.globalStorageUri.fsPath);
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  const preferences = await PrivatePreferences.create(root, context.globalState, legacyKeys);
  context.subscriptions.push(preferences);
  const settingsPath = path.join(root, 'restored-settings.json');
  let settings: Record<string, unknown> | undefined;
  try { settings = JSON.parse(await fs.readFile(settingsPath, 'utf8')) as Record<string, unknown>; }
  catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
  if (settings) {
    const allowed = settingKeys(context, namespace);
    for (const [key, value] of Object.entries(settings)) if (allowed.includes(key)) await vscode.workspace.getConfiguration().update(key, value, vscode.ConfigurationTarget.Global);
    await fs.rm(settingsPath);
  }
  return { root: vscode.Uri.file(root), preferences };
}

function settingKeys(context: vscode.ExtensionContext, namespace: string): string[] {
  const properties = context.extension.packageJSON.contributes?.configuration?.properties as Record<string, unknown> | undefined;
  return Object.keys(properties ?? {}).filter((key) => key.startsWith(namespace + '.') && !key.startsWith(namespace + '.backup.') && key !== namespace + '.environment' && key !== namespace + '.storagePath');
}

export class BackupController implements vscode.Disposable {
  private timer: NodeJS.Timeout;
  private busy = false;
  private disposed = false;
  private settingsPanel: vscode.WebviewPanel | undefined;
  private readonly output: vscode.OutputChannel;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly metadata: SharedJsonFile<{ lastHash?: string; nextRun?: number; local?: string; remote?: string; error?: string }>;
  constructor(private readonly context: vscode.ExtensionContext, private readonly namespace: string, private readonly root: vscode.Uri, private readonly adapter: BackupAdapter) {
    this.output = vscode.window.createOutputChannel(context.extension.packageJSON.displayName + ' Backups');
    this.metadata = new SharedJsonFile(path.join(context.globalStorageUri.fsPath, 'backup-status.json'));
    const command = (name: string, action: () => Promise<void>): void => {
      this.disposables.push(vscode.commands.registerCommand(`${namespace}.${name}`, async () => {
        if (this.busy) { void vscode.window.showWarningMessage(this.t('Hay una operación de backup en curso.', 'A backup operation is already running.')); return; }
        this.busy = true;
        void this.postSettingsState();
        try { await action(); } catch (e) { this.output.appendLine(errorMessage(e)); void vscode.window.showErrorMessage(errorMessage(e)); }
        finally { this.busy = false; void this.postSettingsState(); }
      }));
    };
    this.disposables.push(vscode.commands.registerCommand(`${namespace}.openBackupSettings`, () => this.openSettingsPanel()));
    command('connectDrive', () => this.connect());
    command('disconnectDrive', async () => {
      await context.secrets.delete(tokenKey); await context.secrets.delete(credentialKey);
      void vscode.window.showInformationMessage(this.t('Drive desconectado aquí. Puedes revocar el acceso en tu cuenta de Google. Los backups no se borraron.', 'Drive disconnected on this device. You can revoke access in your Google account. Backups were not deleted.'));
    });
    command('setBackupPassphrase', () => this.setPassphrase());
    command('backupNow', async () => { await this.backup(false); });
    command('restoreBackup', () => this.restore());
    command('backupStatus', async () => {
      this.output.appendLine(JSON.stringify((await this.metadata.read())?.value ?? {}, null, 2));
      this.output.appendLine(this.t('Datos: ', 'Data: ') + root.fsPath);
      this.output.appendLine(this.t('Backups locales: ', 'Local backups: ') + this.backupDirectory);
      this.output.show();
    });
    this.timer = setInterval(() => { void this.tick().catch((e) => this.output.appendLine(errorMessage(e))); }, 60000);
    this.timer.unref();
    this.disposables.push(vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(`${namespace}.backup`) || event.affectsConfiguration(`${namespace}.environment`)) void this.postSettingsState();
      if (event.affectsConfiguration(`${namespace}.backup.autoEnabled`) && this.config.get('backup.autoEnabled', false)) {
        void vscode.window.showWarningMessage(this.t('Backups automáticos activos mientras VS Code está abierto. Sin cifrado adicional, los archivos pueden contener secretos legibles. Revisa las exclusiones y guarda una copia fuera de esta PC.', 'Automatic backups run while VS Code is open. Without additional encryption, files may contain readable secrets. Review exclusions and keep a copy outside this PC.'));
      }
    }));
  }
  private get config(): vscode.WorkspaceConfiguration { return vscode.workspace.getConfiguration(this.namespace); }
  private get backupDirectory(): string { return path.join(this.context.globalStorageUri.fsPath, 'backups'); }
  private get extension(): string { return this.context.extension.id; }
  private t(es: string, en: string): string { return this.config.get('language', vscode.env.language).startsWith('es') ? es : en; }
  private supportsSetting(name: string): boolean {
    const properties = this.context.extension.packageJSON.contributes?.configuration?.properties as Record<string, unknown> | undefined;
    return Boolean(properties?.[`${this.namespace}.${name}`]);
  }
  private async settingsState(): Promise<BackupSettingsState> {
    const metadata = (await this.metadata.read())?.value ?? {};
    let pendingUploads = 0;
    try { pendingUploads = (await fs.readdir(this.backupDirectory)).filter((name) => name.endsWith('.devbackup.pending')).length; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const supportsPrivateKeys = this.supportsSetting('backup.includePrivateKeys');
    return {
      automatic: this.config.get('backup.autoEnabled', false),
      busy: this.busy,
      connected: Boolean(await this.context.secrets.get(credentialKey) && await this.context.secrets.get(tokenKey)),
      encrypted: this.config.get('backup.encrypt', false),
      environment: this.config.get('environment', 'local'),
      error: metadata.error,
      intervalMinutes: Math.max(5, Math.min(1440, Number(this.config.get('backup.intervalMinutes', 30)) || 30)),
      lastLocal: metadata.local ? path.basename(metadata.local) : undefined,
      lastRemote: metadata.remote,
      nextRun: metadata.nextRun,
      passphraseConfigured: Boolean(await this.context.secrets.get(passwordKey)),
      pendingUploads,
      privateKeys: supportsPrivateKeys ? this.config.get('backup.includePrivateKeys', false) : undefined,
      supportsPrivateKeys
    };
  }
  private async postSettingsState(): Promise<void> {
    if (!this.settingsPanel) return;
    try { await this.settingsPanel.webview.postMessage({ type: 'state', value: await this.settingsState() }); }
    catch (error) { this.output.appendLine(errorMessage(error)); }
  }
  private async updateBackupSetting(key: string, value: unknown): Promise<void> {
    const booleans = new Set(['backup.autoEnabled', 'backup.encrypt', 'backup.includePrivateKeys']);
    if (booleans.has(key)) {
      if (typeof value !== 'boolean' || !this.supportsSetting(key)) throw new Error('Invalid backup setting.');
      await this.config.update(key, value, vscode.ConfigurationTarget.Global);
      return;
    }
    if (key === 'backup.intervalMinutes') {
      const minutes = Number(value);
      if (!Number.isInteger(minutes) || minutes < 5 || minutes > 1440) throw new Error(this.t('El intervalo debe estar entre 5 y 1440 minutos.', 'The interval must be between 5 and 1440 minutes.'));
      await this.config.update(key, minutes, vscode.ConfigurationTarget.Global);
      return;
    }
    throw new Error('Invalid backup setting.');
  }
  private openSettingsPanel(): void {
    if (this.settingsPanel) { this.settingsPanel.reveal(vscode.ViewColumn.One); void this.postSettingsState(); return; }
    const title = `${this.context.extension.packageJSON.displayName} · ${this.t('Backups', 'Backups')}`;
    const panel = vscode.window.createWebviewPanel(`${this.namespace}.backupSettings`, title, vscode.ViewColumn.One, { enableScripts: true, retainContextWhenHidden: true });
    this.settingsPanel = panel;
    panel.webview.html = this.settingsHtml(panel.webview);
    panel.onDidDispose(() => { if (this.settingsPanel === panel) this.settingsPanel = undefined; }, undefined, this.disposables);
    panel.webview.onDidReceiveMessage(async (message: unknown) => {
      if (!message || typeof message !== 'object') return;
      const value = message as { type?: unknown; action?: unknown; key?: unknown; value?: unknown };
      try {
        if (value.type === 'ready') await this.postSettingsState();
        else if (value.type === 'update' && typeof value.key === 'string') { await this.updateBackupSetting(value.key, value.value); await this.postSettingsState(); }
        else if (value.type === 'action' && typeof value.action === 'string') {
          const commands = new Set(['connectDrive', 'disconnectDrive', 'backupNow', 'restoreBackup', 'setBackupPassphrase', 'backupStatus']);
          if (!commands.has(value.action)) throw new Error('Invalid backup action.');
          await vscode.commands.executeCommand(`${this.namespace}.${value.action}`);
          await this.postSettingsState();
        } else if (value.type === 'openFolder') {
          await fs.mkdir(this.backupDirectory, { recursive: true, mode: 0o700 });
          await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(this.backupDirectory));
        } else if (value.type === 'openSettings') {
          await vscode.commands.executeCommand('workbench.action.openSettings', `@ext:${this.extension} backup`);
        }
      } catch (error) {
        this.output.appendLine(errorMessage(error));
        void vscode.window.showErrorMessage(errorMessage(error));
      }
    }, undefined, this.disposables);
    void this.postSettingsState();
  }
  private settingsHtml(webview: vscode.Webview): string {
    const nonce = randomUUID().replaceAll('-', '');
    const es = this.config.get('language', vscode.env.language).startsWith('es');
    const labels = es ? {
      title: 'Backups y recuperación', subtitle: 'Copias privadas de esta extensión. Cada dispositivo crea archivos únicos para evitar sobrescribir a otros.',
      environment: 'Entorno', drive: 'Google Drive', connected: 'Conectado', disconnected: 'No conectado', connect: 'Conectar Drive', disconnect: 'Desconectar',
      automatic: 'Backups automáticos', autoHelp: 'Se ejecutan mientras VS Code está abierto y sólo crean una copia cuando cambian los datos.', interval: 'Intervalo (minutos)',
      encryption: 'Cifrado opcional', encryptionHelp: 'Desactivado por defecto. Si lo activas, conserva la contraseña fuera de esta computadora.', passphrase: 'Configurar contraseña', configured: 'Contraseña configurada', missing: 'Sin contraseña configurada',
      privateKeys: 'Incluir llaves SSH privadas', privateHelp: 'Requiere cifrado y contraseña de recuperación.', actions: 'Recuperación manual', backup: 'Crear backup ahora', restore: 'Restaurar backup', folder: 'Abrir carpeta local', log: 'Ver estado detallado', vscode: 'Abrir Settings de VS Code',
      lastLocal: 'Último archivo local', lastRemote: 'Última subida a Drive', nextRun: 'Próxima revisión', pending: 'Subidas pendientes', none: 'Todavía no hay backups', error: 'Último error', busy: 'Operación en curso…', ready: 'Listo'
    } : {
      title: 'Backups and recovery', subtitle: 'Private snapshots for this extension. Every device creates unique files so other devices are never overwritten.',
      environment: 'Environment', drive: 'Google Drive', connected: 'Connected', disconnected: 'Not connected', connect: 'Connect Drive', disconnect: 'Disconnect',
      automatic: 'Automatic backups', autoHelp: 'They run while VS Code is open and only create a snapshot when data changes.', interval: 'Interval (minutes)',
      encryption: 'Optional encryption', encryptionHelp: 'Off by default. If enabled, keep the passphrase outside this computer.', passphrase: 'Set passphrase', configured: 'Passphrase configured', missing: 'No passphrase configured',
      privateKeys: 'Include private SSH keys', privateHelp: 'Requires encryption and a recovery passphrase.', actions: 'Manual recovery', backup: 'Create backup now', restore: 'Restore backup', folder: 'Open local folder', log: 'Show detailed status', vscode: 'Open VS Code Settings',
      lastLocal: 'Latest local file', lastRemote: 'Latest Drive upload', nextRun: 'Next check', pending: 'Pending uploads', none: 'No backups yet', error: 'Latest error', busy: 'Operation in progress…', ready: 'Ready'
    };
    const json = JSON.stringify(labels).replaceAll('<', '\\u003c');
    return `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';"><style nonce="${nonce}">
      :root{color-scheme:light dark}*{box-sizing:border-box}body{margin:0;padding:28px;color:var(--vscode-foreground);background:var(--vscode-editor-background);font:13px/1.5 var(--vscode-font-family)}main{max-width:920px;margin:auto}header{margin-bottom:22px}h1{margin:0 0 6px;font-size:24px}h2{margin:0 0 14px;font-size:15px}.muted{color:var(--vscode-descriptionForeground)}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px}.card{padding:18px;border:1px solid var(--vscode-widget-border);border-radius:10px;background:var(--vscode-sideBar-background)}.row{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:11px 0}.row:first-of-type{margin-top:0}.stack{display:grid;gap:8px}.status{display:inline-flex;align-items:center;gap:6px}.dot{width:8px;height:8px;border-radius:50%;background:var(--vscode-testing-iconFailed)}.dot.on{background:var(--vscode-testing-iconPassed)}button,input{font:inherit}button{padding:7px 11px;border:1px solid var(--vscode-button-border,transparent);border-radius:5px;color:var(--vscode-button-foreground);background:var(--vscode-button-background);cursor:pointer}button:hover{background:var(--vscode-button-hoverBackground)}button.secondary{color:var(--vscode-button-secondaryForeground);background:var(--vscode-button-secondaryBackground)}button.secondary:hover{background:var(--vscode-button-secondaryHoverBackground)}button:disabled,input:disabled{opacity:.55;cursor:not-allowed}input[type=number]{width:86px;padding:5px 7px;color:var(--vscode-input-foreground);background:var(--vscode-input-background);border:1px solid var(--vscode-input-border)}input[type=checkbox]{accent-color:var(--vscode-focusBorder)}.actions{display:flex;flex-wrap:wrap;gap:8px}.facts{margin:18px 0 0}.fact{display:grid;grid-template-columns:150px 1fr;gap:12px;padding:8px 0;border-bottom:1px solid var(--vscode-widget-border);overflow-wrap:anywhere}.error{margin-top:14px;padding:10px;border-left:3px solid var(--vscode-testing-iconFailed);background:var(--vscode-inputValidation-errorBackground);color:var(--vscode-inputValidation-errorForeground)}#private-row[hidden],#error[hidden]{display:none}.footer{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:16px}.busy{color:var(--vscode-descriptionForeground)}@media(max-width:520px){body{padding:18px}.fact{grid-template-columns:1fr;gap:2px}}
    </style></head><body><main><header><h1>${labels.title}</h1><div class="muted">${labels.subtitle}</div></header><div class="grid">
      <section class="card"><h2>${labels.drive}</h2><div class="row"><span class="status"><span id="drive-dot" class="dot"></span><strong id="drive-state">${labels.disconnected}</strong></span><div class="actions"><button id="connect">${labels.connect}</button><button id="disconnect" class="secondary">${labels.disconnect}</button></div></div><div class="row"><span>${labels.environment}</span><strong id="environment">local</strong></div></section>
      <section class="card"><h2>${labels.automatic}</h2><div class="row"><span class="muted">${labels.autoHelp}</span><input id="automatic" type="checkbox"></div><div class="row"><label for="interval">${labels.interval}</label><input id="interval" type="number" min="5" max="1440" step="1"></div></section>
      <section class="card"><h2>${labels.encryption}</h2><div class="row"><span class="muted">${labels.encryptionHelp}</span><input id="encrypted" type="checkbox"></div><div class="row"><span id="passphrase-state" class="muted">${labels.missing}</span><button id="passphrase" class="secondary">${labels.passphrase}</button></div><div id="private-row" hidden><div class="row"><span><strong>${labels.privateKeys}</strong><br><span class="muted">${labels.privateHelp}</span></span><input id="private-keys" type="checkbox"></div></div></section>
      <section class="card"><h2>${labels.actions}</h2><div class="actions"><button id="backup">${labels.backup}</button><button id="restore" class="secondary">${labels.restore}</button><button id="folder" class="secondary">${labels.folder}</button><button id="log" class="secondary">${labels.log}</button></div></section>
    </div><section class="card facts"><div class="fact"><strong>${labels.lastLocal}</strong><span id="last-local">${labels.none}</span></div><div class="fact"><strong>${labels.lastRemote}</strong><span id="last-remote">—</span></div><div class="fact"><strong>${labels.nextRun}</strong><span id="next-run">—</span></div><div class="fact"><strong>${labels.pending}</strong><span id="pending">0</span></div><div id="error" class="error" hidden><strong>${labels.error}</strong><div id="error-text"></div></div></section><div class="footer"><button id="vscode" class="secondary">${labels.vscode}</button><span id="activity" class="busy">${labels.ready}</span></div>
    </main><script nonce="${nonce}">
      const vscode=acquireVsCodeApi(),labels=${json};const byId=id=>document.getElementById(id);const action=(id,name)=>byId(id).addEventListener('click',()=>vscode.postMessage({type:'action',action:name}));
      action('connect','connectDrive');action('disconnect','disconnectDrive');action('backup','backupNow');action('restore','restoreBackup');action('passphrase','setBackupPassphrase');action('log','backupStatus');byId('folder').addEventListener('click',()=>vscode.postMessage({type:'openFolder'}));byId('vscode').addEventListener('click',()=>vscode.postMessage({type:'openSettings'}));
      byId('automatic').addEventListener('change',e=>vscode.postMessage({type:'update',key:'backup.autoEnabled',value:e.target.checked}));byId('encrypted').addEventListener('change',e=>vscode.postMessage({type:'update',key:'backup.encrypt',value:e.target.checked}));byId('private-keys').addEventListener('change',e=>vscode.postMessage({type:'update',key:'backup.includePrivateKeys',value:e.target.checked}));byId('interval').addEventListener('change',e=>vscode.postMessage({type:'update',key:'backup.intervalMinutes',value:Number(e.target.value)}));
      const date=value=>value?new Date(value).toLocaleString(): '—';window.addEventListener('message',event=>{if(event.data?.type!=='state')return;const s=event.data.value;byId('automatic').checked=s.automatic;byId('encrypted').checked=s.encrypted;byId('interval').value=String(s.intervalMinutes);byId('private-keys').checked=Boolean(s.privateKeys);byId('private-row').hidden=!s.supportsPrivateKeys;byId('environment').textContent=s.environment;byId('drive-dot').classList.toggle('on',s.connected);byId('drive-state').textContent=s.connected?labels.connected:labels.disconnected;byId('connect').hidden=s.connected;byId('disconnect').hidden=!s.connected;byId('passphrase-state').textContent=s.passphraseConfigured?labels.configured:labels.missing;byId('last-local').textContent=s.lastLocal||labels.none;byId('last-remote').textContent=date(s.lastRemote);byId('next-run').textContent=s.automatic?date(s.nextRun):'—';byId('pending').textContent=String(s.pendingUploads);byId('error').hidden=!s.error;byId('error-text').textContent=s.error||'';byId('activity').textContent=s.busy?labels.busy:labels.ready;document.querySelectorAll('button,input').forEach(el=>{if(el.id!=='vscode')el.disabled=s.busy});});vscode.postMessage({type:'ready'});
    </script></body></html>`;
  }
  private async drive(): Promise<DriveClient | undefined> {
    const credentials = await this.context.secrets.get(credentialKey), tokens = await this.context.secrets.get(tokenKey);
    if (!credentials || !tokens) return undefined;
    return new DriveClient(JSON.parse(credentials) as Credentials, JSON.parse(tokens) as Tokens, (value) => this.context.secrets.store(tokenKey, JSON.stringify(value)));
  }
  private async connect(): Promise<void> {
    if (vscode.env.remoteName) throw new Error(this.t('Conecta Drive desde una ventana local de VS Code. El inicio de sesión por loopback no está disponible en hosts remotos.', 'Connect Drive from a local VS Code window. Loopback sign-in is not supported on remote hosts.'));
    const files = await vscode.window.showOpenDialog({ canSelectMany: false, filters: { 'Google OAuth Desktop JSON': ['json'] }, title: this.t('Selecciona la credencial OAuth Desktop descargada de Google Cloud', 'Choose the Desktop OAuth credentials downloaded from Google Cloud') });
    if (!files?.[0]) return;
    const bytes = await vscode.workspace.fs.readFile(files[0]);
    if (bytes.length > 65536) throw new Error('OAuth credential file is too large.');
    let credentialJson: unknown;
    try { credentialJson = JSON.parse(Buffer.from(bytes).toString('utf8')); }
    catch { throw new Error('The OAuth credential file is not valid JSON.'); }
    const credentials = credentialsFromJson(credentialJson);
    const tokens = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: this.t('Autoriza Drive en tu navegador (máximo 3 minutos)', 'Authorize Drive in your browser (up to 3 minutes)') }, () => authorize(credentials, (url) => vscode.env.openExternal(vscode.Uri.parse(url))));
    await this.context.secrets.store(credentialKey, JSON.stringify(credentials));
    await this.context.secrets.store(tokenKey, JSON.stringify(tokens));
    void vscode.window.showInformationMessage(this.t('Drive conectado. Crea un backup manual para comprobarlo. Los backups automáticos se habilitan por separado en Configuración.', 'Drive connected. Create a manual backup to verify it. Automatic backups are enabled separately in Settings.'));
  }
  private async setPassphrase(): Promise<void> {
    const password = await vscode.window.showInputBox({ password: true, ignoreFocusOut: true, prompt: this.t('Contraseña opcional del backup. Guárdala fuera de esta PC; sin ella no podrás recuperar backups cifrados.', 'Optional backup passphrase. Keep it outside this PC; encrypted backups cannot be recovered without it.'), validateInput: (value) => value.length >= 12 ? undefined : this.t('Mínimo 12 caracteres', 'At least 12 characters') });
    if (!password) return;
    const again = await vscode.window.showInputBox({ password: true, ignoreFocusOut: true, prompt: this.t('Repite la contraseña', 'Repeat the passphrase') });
    if (again === undefined) return;
    if (password !== again) throw new Error(this.t('Las contraseñas no coinciden.', 'Passphrases do not match.'));
    await this.context.secrets.store(passwordKey, password);
    void vscode.window.showInformationMessage(this.t('Contraseña guardada en este dispositivo. El cifrado sigue dependiendo de backup.encrypt; conserva esta contraseña también fuera de la PC.', 'Passphrase saved on this device. Encryption is controlled by backup.encrypt; also keep this passphrase outside the PC.'));
  }
  private async tick(): Promise<void> {
    if (this.disposed || this.busy || !this.config.get('backup.autoEnabled', false)) return;
    if (await activeRoot(this.context.globalStorageUri.fsPath) !== this.root.fsPath) return;
    this.busy = true;
    try {
      const minutes = Math.max(5, Math.min(1440, Number(this.config.get('backup.intervalMinutes', 30)) || 30));
      let run = false;
      await this.metadata.update({}, (current) => {
        if ((current.nextRun ?? 0) <= Date.now()) { run = true; current.nextRun = Date.now() + minutes * 60000; }
        return current;
      });
      if (run) await this.backup(true);
    } catch (e) {
      const message = errorMessage(e); this.output.appendLine(message);
      await this.metadata.update({}, (current) => ({ ...current, error: message, nextRun: Date.now() + 5 * 60000 }));
      void vscode.window.showWarningMessage(this.t('Falló el backup automático: ', 'Automatic backup failed: ') + message);
    } finally { this.busy = false; }
  }
  private async backup(automatic: boolean, upload = true): Promise<string | undefined> {
    await assertWritable(this.root.fsPath);
    if (!automatic) {
      const proceed = this.t('Crear backup', 'Create backup');
      const confirmation = await vscode.window.showWarningMessage(this.t('Se guardará una copia de los datos. Si conectaste Drive, se subirá allí. Sin cifrado adicional, notas, variables y comandos pueden contener secretos legibles. Los archivos externos de proyectos/scripts no se incluyen.', 'A copy of your data will be saved and uploaded if Drive is connected. Without additional encryption, notes, variables and commands may contain readable secrets. External project/script files are not included.'), { modal: true }, proceed);
      if (confirmation !== proceed) return undefined;
    }
    const encrypted = this.config.get('backup.encrypt', false);
    const includeKeys = this.config.get('backup.includePrivateKeys', false);
    if (includeKeys && !encrypted) throw new Error(this.t('Para incluir llaves privadas activa el cifrado y define una contraseña de recuperación.', 'To include private keys, enable encryption and set a recovery passphrase.'));
    const password = encrypted ? await this.context.secrets.get(passwordKey) : undefined;
    if (encrypted && !password) throw new Error(this.t('Primero ejecuta «Configurar contraseña del backup». Guárdala fuera de la PC.', 'Run Set backup passphrase first, and keep it outside this PC.'));
    // Never silently omit unsaved custom-editor buffers from a supposedly complete snapshot.
    const dirty = vscode.workspace.textDocuments.some((d) => d.isDirty && d.uri.scheme === 'file' && d.uri.fsPath.startsWith(this.root.fsPath + path.sep));
    if (dirty) throw new Error(this.t('Guarda los documentos de la extensión antes de crear el backup.', 'Save extension documents before creating a backup.'));
    const drive = upload ? await this.drive() : undefined;
    const capture = await this.adapter.capture(includeKeys);
    const settings: Record<string, unknown> = {};
    for (const name of settingKeys(this.context, this.namespace)) settings[name] = vscode.workspace.getConfiguration().get(name);
    const fingerprint = hash(JSON.stringify([this.root.fsPath, inventory(capture.files), capture.exclusions, settings, encrypted]));
    if (automatic && (await this.metadata.read())?.value.lastHash === fingerprint) {
      if (drive) await this.retryPending(drive);
      return undefined;
    }
    const payload: BackupPayload = { version: 1, extension: this.extension, extensionVersion: String(this.context.extension.packageJSON.version), createdAt: new Date().toISOString(), deviceId: await deviceId(this.context.globalStorageUri.fsPath), sourceRoot: this.root.fsPath, exclusions: capture.exclusions, settings, files: capture.files };
    const bytes = password ? await encrypt(payload, password) : encodePlain(payload);
    const name = `${this.extension}-${payload.deviceId}-${Date.now()}-${randomUUID()}.devbackup`;
    await fs.mkdir(this.backupDirectory, { recursive: true, mode: 0o700 });
    const target = path.join(this.backupDirectory, name);
    await fs.writeFile(target + '.tmp', bytes, { flag: 'wx', mode: 0o600 });
    await fs.rename(target + '.tmp', target);
    // Every snapshot remains pending until a checksum-verified upload succeeds.
    await fs.writeFile(target + '.pending', '', { flag: 'wx', mode: 0o600 });
    await this.metadata.update({}, (current) => ({ ...current, lastHash: fingerprint, local: target, error: undefined }));
    if (drive) {
      try {
        await drive.upload(this.extension, name, bytes);
        await fs.rm(target + '.pending', { force: true });
        await this.metadata.update({}, (current) => ({ ...current, remote: new Date().toISOString(), error: undefined }));
        await this.retryPending(drive);
      } catch (error) {
        await this.metadata.update({}, (current) => ({ ...current, error: errorMessage(error) }));
        throw new Error(errorMessage(error) + ' Local backup: ' + target);
      }
    }
    this.output.appendLine(`Backup: ${target}. Exclusions: ${payload.exclusions.join('; ')}`);
    if (!automatic) void vscode.window.showInformationMessage(this.t('Backup creado', 'Backup created') + (drive ? ' · Google Drive' : this.t(' · Sólo local; conecta Drive para tener una copia fuera de esta PC', ' · Local only; connect Drive for an off-device copy')) + `. ${payload.exclusions.join('; ')}`);
    return target;
  }
  private async retryPending(drive: DriveClient): Promise<void> {
    let names: string[];
    try { names = await fs.readdir(this.backupDirectory); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return; throw e; }
    for (const pending of names.filter((n) => n.endsWith('.devbackup.pending')).sort().slice(0, 5)) {
      const name = pending.slice(0, -8), target = path.join(this.backupDirectory, name);
      const bytes = await fs.readFile(target);
      if (bytes.length > MAX_BYTES * 2) throw new Error('Pending backup is too large.');
      await drive.upload(this.extension, name, bytes); await fs.rm(target + '.pending', { force: true });
      await this.metadata.update({}, (current) => ({ ...current, remote: new Date().toISOString(), error: undefined }));
    }
  }
  private async restore(): Promise<void> {
    const local = this.t('Archivo local', 'Local file'), remote = 'Google Drive';
    const source = await vscode.window.showQuickPick([local, remote], { title: this.t('Restaurar backup', 'Restore backup') });
    if (!source) return;
    let bytes: Buffer;
    if (source === remote) {
      const drive = await this.drive(); if (!drive) throw new Error(this.t('Primero conecta Google Drive.', 'Connect Google Drive first.'));
      const files = await drive.list(this.extension);
      const chosen = await vscode.window.showQuickPick(files.map((file) => ({ label: file.name, description: file.createdTime, file })), { title: this.t('Últimos 100 backups en Drive', 'Latest 100 Drive backups') });
      if (!chosen) return;
      bytes = await drive.download(chosen.file.id, MAX_BYTES * 2);
    } else {
      const file = (await vscode.window.showOpenDialog({ canSelectMany: false, filters: { 'Dev backup': ['devbackup'] } }))?.[0];
      if (!file) return;
      const stat = await vscode.workspace.fs.stat(file); if (stat.size > MAX_BYTES * 2) throw new Error('Backup is too large.');
      bytes = Buffer.from(await vscode.workspace.fs.readFile(file));
    }
    let payload: BackupPayload;
    if (isEncrypted(bytes)) {
      const password = await vscode.window.showInputBox({ password: true, ignoreFocusOut: true, prompt: this.t('Contraseña con la que se creó este backup (no la contraseña de Google)', 'Passphrase used to create this backup (not your Google password)') });
      if (!password) return;
      payload = await decrypt(bytes, password, this.extension);
    } else payload = decodePlain(bytes, this.extension);
    const restore = this.t('Restaurar y recargar', 'Restore and reload');
    const confirmation = await vscode.window.showWarningMessage(this.t('Se activará una copia restaurada. Los datos anteriores se conservan en su carpeta. Guarda tus documentos, cierra las otras ventanas de VS Code y detén el MCP antes de continuar. Al terminar reinicia el MCP y actualiza su configuración. Exclusiones: ', 'A restored copy will become active. Previous data remains in its folder. Save documents, close other VS Code windows and stop MCP before continuing. Afterwards restart MCP and update its configuration. Exclusions: ') + payload.exclusions.join('; '), { modal: true }, restore);
    if (confirmation !== restore) return;
    if (vscode.workspace.textDocuments.some((d) => d.isDirty && d.uri.scheme === 'file' && d.uri.fsPath.startsWith(this.root.fsPath + path.sep))) throw new Error('Save your extension documents before restoring.');
    await this.adapter.beforeRestore?.();
    const destination = path.join(this.context.globalStorageUri.fsPath, 'restored', randomUUID());
    await fs.mkdir(destination, { recursive: true, mode: 0o700 });
    let activated = false;
    try {
      await this.adapter.restore(payload, destination);
      const settings = Object.fromEntries(Object.entries(payload.settings).filter(([key]) => settingKeys(this.context, this.namespace).includes(key)));
      await fs.writeFile(path.join(destination, 'restored-settings.json'), JSON.stringify(settings), { flag: 'wx', mode: 0o600 });
      await activateRestoredRoot(this.context.globalStorageUri.fsPath, this.root.fsPath, destination);
      activated = true;
    } finally { if (!activated) await fs.rm(destination, { recursive: true, force: true }); }
    await vscode.commands.executeCommand('workbench.action.reloadWindow');
  }
  dispose(): void { this.disposed = true; clearInterval(this.timer); this.settingsPanel?.dispose(); for (const d of this.disposables) d.dispose(); this.output.dispose(); }
}

export async function captureFiles(root: string, names: string[]): Promise<BackupFile[]> {
  const first = await collect(root, names), second = await collect(root, names);
  if (inventory(first) !== inventory(second)) throw new Error('Data changed during backup. Retry after saving.');
  return second;
}
export async function restoreFiles(payload: BackupPayload, destination: string, allowed: (name: string) => boolean): Promise<void> {
  if (payload.files.some((file) => !allowed(file.path))) throw new Error('Backup contains files not owned by this extension.');
  await extract(destination, payload.files);
}
