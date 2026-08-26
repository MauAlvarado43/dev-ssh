# Local storage and Google Drive backups

## What is implemented

Each of the five extensions uses its own private VS Code directory (`ExtensionContext.globalStorageUri`). The only available environment is `local`. Drive stores independent snapshots; it does not synchronize or merge active databases across computers. Supabase remains deferred.

SSH and Commands migrate their data from `globalState` to private JSON files. Old Memento copies are retained but no longer updated, so an older extension version will not automatically see changes made after migration. Folder keeps its shared JSON file and Tracker keeps SQLite. Notes copies a legacy `storagePath` into the private directory once and leaves the source intact; if both source and destination contain data, migration stops instead of silently merging them. Close other VS Code windows during the first update.

Preferences previously stored in Memento now live in `preferences.json`. Settings declared in the extension manifest remain regular VS Code settings. OAuth tokens and the optional passphrase are stored in **SecretStorage**, never in a backup.

## No extra passphrase by default

`backup.encrypt` is disabled by default. A regular `.devbackup` contains a compressed JSON manifest and files with integrity hashes. It can be restored on another computer without the original machine or its credentials. The unencrypted format is `DEVBACKUP0\n` followed by gzipped JSON; file contents are base64 encoded in the manifest and do not depend on a hidden key. Compression **is not** encryption: anyone who obtains the file can read it.

Notes, commands, variables, and remembered answers may contain secrets. Review what you store and protect your Drive account. SSH private keys are excluded by default. To include managed keys, enable both `devSsh.backup.includePrivateKeys` and optional encryption, then set a passphrase kept outside this computer. External project, repository, and script files are never copied.

Optional encryption uses AES-256-GCM with a key derived from your passphrase through scrypt and a random salt. Restore asks for the original passphrase, not your Google password or a device-specific key. Changing the passphrase affects future backups; older backups retain their previous passphrase.

## Set up Google Drive

You do not need a server, Supabase, or rclone. You do need a Google OAuth application:

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create or select your own project.
2. Enable the **Google Drive API**.
3. Configure consent in **Google Auth Platform**. For personal testing, add your account as a test user when applicable.
4. Create an **OAuth Client ID** of type **Desktop app**. Do not choose a service account or web application.
5. Download its JSON file. Keep a safe copy that is accessible from another computer, or retain access to the Google Cloud project. Do not commit it to Git or paste it into a chat.
6. In a local VS Code window, open the Command Palette and run **[extension name]: Connect Google Drive**. Select the JSON file and authorize your account in the browser.
7. Run **Create backup now** and inspect **Show backup status**. Confirm that a remote upload completed and that the file exists in Drive before relying on the backup.

Authorization uses the browser, a `127.0.0.1` callback, PKCE, and the `drive.file` scope. It only requests access to files created or authorized for this application. Your Google password is never entered in VS Code. Desktop credentials and tokens remain in SecretStorage. See Google's [OAuth 2.0 for desktop apps](https://developers.google.com/identity/protocols/oauth2/native-app) and [Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).

You can reuse one OAuth client for all five extensions. Each extension authorizes separately and filters backups by its own ID. Files appear in My Drive with the extension ID, device, date, and a unique ID in the filename. There is no shared `backup.zip` that every device overwrites.

**OAuth testing mode:** Google normally limits refresh tokens to seven days for an external app in testing that requests Drive access. You will have to authorize again. For routine backups, review the publication status and any requirements Google shows for your project. Tokens can also expire or be revoked for other reasons. See [Google token expiration](https://developers.google.com/identity/protocols/oauth2#expiration).

This first version requires a local VS Code window for sign-in. Remote SSH, WSL, and Dev Container hosts are not supported because the loopback callback may not reach a browser on the same machine.

## Settings

Replace `PREFIX` with the corresponding namespace:

| Extension | `PREFIX` |
|---|---|
| Dev SSH | `devSsh` |
| Dev Commands | `devCommands` |
| DevFolder | `devfolder` |
| Dev Notes | `devNotes` |
| DevTracker | `devtracker` |

| Setting | Default | Purpose |
|---|---|---|
| `PREFIX.environment` | `local` | Private local directory; Supabase cannot be selected yet. |
| `PREFIX.backup.autoEnabled` | `false` | Enables automatic snapshots while the extension host is active. |
| `PREFIX.backup.intervalMinutes` | `30` | Interval from 5 to 1440 minutes; creates another version only when data changed. |
| `PREFIX.backup.encrypt` | `false` | Optional extra passphrase. Setting a passphrase does not enable encryption by itself. |
| `devSsh.backup.includePrivateKeys` | `false` | Includes managed key copies; requires encryption. |

Tracker example:

```json
{
  "devtracker.environment": "local",
  "devtracker.backup.autoEnabled": true,
  "devtracker.backup.intervalMinutes": 30,
  "devtracker.backup.encrypt": false
}
```

Automatic backups remain disabled until you enable them. The extensions activate after VS Code finishes starting; Tracker retains its activity-capture option. A timer checks every minute whether a backup is due and does nothing while VS Code is closed. A backup created without Drive connected remains **local only** and will not protect against disk failure.

When Drive fails, the local snapshot remains pending and new local backups continue to be created when data changes. Later runs retry pending uploads, up to five historical snapshots per run. Uploads use a resumable session and verify the size and MD5 returned by Drive. A failure restarts that snapshot's upload and never replaces an older file. See the [Drive upload API](https://developers.google.com/workspace/drive/api/guides/manage-uploads).

## Commands

- **Connect Google Drive**: import Desktop credentials and authorize in the browser.
- **Disconnect Google Drive**: remove credentials and tokens from this installation without deleting backups or revoking other computers. Revoke global access from your Google account.
- **Create backup now**: create a local snapshot and upload it when Drive is connected; requires confirmation.
- **Restore backup**: choose a local file or one of the 100 most recent Drive backups.
- **Set backup passphrase (optional)**: save a passphrase for future encrypted backups after entering it twice.
- **Show backup status**: show the active data directory, latest local snapshot, latest completed upload, and recorded errors.

## Included data

| Extension | Included | Excluded |
|---|---|---|
| SSH | Servers, groups, preferences, and keys only when enabled | Private keys by default; unmanaged external keys always |
| Commands | Workspaces, commands, embedded scripts, parameters, remembered answers, and preferences | External script files and repository contents |
| Folder | Projects, groups, order, colors, and preferences | Files inside project directories |
| Notes | Notebooks, Markdown, editable boards, hidden attachments, and empty notebooks | Unsaved changes; saving is requested before capture |
| Tracker | A consistent logical SQLite export, tasks, notes, activity, metrics, and saved attachments | Repositories and attachments in unsaved drafts |

Data and files are compared during capture to detect concurrent changes. Tracker exports inside a read transaction instead of copying an active `.sqlite3` file without its WAL. If data changes or an attachment disappears during capture, the backup fails clearly instead of being published as complete.

## Recover after losing a computer

### Without setting up OAuth again

1. Open Google Drive in a browser and download the extension's `.devbackup` file.
2. Install the extension on the new computer.
3. Run **Restore backup → Local file** and choose the downloaded file.
4. A regular backup needs no additional passphrase. An encrypted backup asks for the passphrase you stored separately.
5. Save open documents and close other windows and MCP processes. Confirm restore.
6. The window reloads with the restored data. Repeat for every extension you need.

### From the built-in Drive picker

Connect the same account with the same OAuth client, choose **Restore backup → Google Drive**, and select a snapshot. If you changed OAuth clients, `drive.file` permissions may not list files created by the previous application. Download the file in a browser and use local restore instead.

Restore creates `restored/<uuid>` in the private directory and switches `active-data.json` only after validation completes. Previous files remain intact. Old JSON and SQLite stores reject new writes once the switch is active. Note editors that remain open may still point to the previous generation: close other windows, stop editing them, and reload.

Paths for managed keys and attachments are recalculated. External project, script, shell, and interpreter paths are **not** guessed; update them for the new computer. Excluded keys must be selected again. For Tracker, restart MCP clients and copy the configuration from the extension again. Any configuration containing an explicit old path must be updated.

Google tokens and the previous device identity are not restored. A new installation creates its own device ID and authorization; this does not prevent it from reading old backup files.

## Limits and operation

- Initial maximum: **64 MiB of uncompressed content and 10,000 entries** per snapshot. The decompressed manifest has a separate 128 MiB limit. Exceeding a limit reports an error instead of truncating the backup.
- Symlinks are not followed, and absolute or traversal paths are not extracted. Hashes detect accidental corruption. An unencrypted backup provides no authenticity against someone who can modify it; restore only trusted copies.
- **Old backups are not deleted automatically** in this version. Monitor local and Drive storage and remove old copies only after verifying that a recent backup can be restored. Previous data generations are not removed automatically either.
- OAuth files, tokens, the optional passphrase, caches, temporary files, and runtime binaries are not part of a backup.
- Tracker releases include two VSIX files: `win32-x64` for Windows x64 and `linux-x64` for Linux x64 with glibc. Install the package that matches the computer. ARM64, Alpine/musl, and macOS are not supported. Backup files are portable between the two supported platforms.
- Backups do not include the installed extension. Reinstall a compatible VSIX before restoring. Restore validates the extension ID and schema version.
- Two computers create distinct snapshots. This does **not** resolve simultaneous changes like a future synchronization service will; deliberately choose which snapshot to restore.
- A very specific abrupt shutdown can leave a `.lock.recovering` guard that blocks writes. Do not remove it while windows or MCP processes are active. Close every process, retain a copy of the directory, and remove the abandoned guard before reopening.
- The modules under `src/infrastructure/backup` are vendored in each repository so every VSIX and CI pipeline remains independent. Apply backup-core changes and their tests to all five copies.

## Supabase: next phase

No Supabase connection or credentials are implemented. A future implementation will require the project URL, a **publishable key**, and user sign-in such as OAuth with PKCE, along with RLS policies and a versioned synchronization protocol with an outbox and conflict handling. The public key identifies the application; it does not replace a user session. Never put a `service_role` or secret key in a distributed extension. See [Supabase API keys and authentication](https://supabase.com/docs/guides/getting-started/api-keys).

## Verify before relying on backups

Builds and automated tests cover files, restore, optional encryption, concurrency, and OAuth/Drive flows with mocked responses. **A real connection to your account and a real upload/download require your authorization and must be verified before you rely on the backup.**

Test with non-sensitive content: create a note and attachment, upload a backup, download it from Drive, and restore it in a clean profile. Also inspect the latest remote status after enabling automatic backups.
