# Changelog

## [Unreleased]

### Changed

- Rewrote the backup and recovery guide in English and updated the DevTracker platform-package guidance.

## [0.2.0] - 2026-08-26

### Added

- Manual and opt-in automatic backups, Google Drive Desktop OAuth, backup status, and restore commands.
- A private `local` data environment with portable snapshots of server groups, connection settings, and preferences.
- Optional recovery-passphrase encryption. Managed SSH private keys are excluded by default and can only be included when encryption is enabled.
- A validate-and-release workflow that publishes the VSIX with notes from the matching changelog section.

### Changed

- Server data migrates from legacy `globalState` into the extension's private storage directory without deleting the original state.
- Shared JSON writes use cross-process locks and refresh other windows instead of replacing newer state with a cached copy.

### Backup and recovery

- Backups have no additional encryption by default and can be restored on another computer without the original machine's credentials. Recovery-passphrase encryption is optional; keep the passphrase outside the computer if enabled.
- Local snapshots are retained when Drive is unavailable and pending uploads are retried. Device-specific, uniquely named snapshots do not overwrite other computers' backups or synchronize live data.
- Restore validates the extension, schema, paths, and checksums, then switches to a new data generation while retaining the original files.
- OAuth credentials and tokens are kept in VS Code SecretStorage and excluded from backups. Drive setup, recovery, limits, and exclusions are documented in `docs/BACKUPS.md`; Supabase remains deferred.

### Validation

- `pnpm run check`: 32 tests, TypeScript validation, and production bundles on Linux.
- Backup tests cover portable restore, optional encryption, damaged archives, attachments, concurrent writers, mocked OAuth/Drive requests, and offline upload retries. Live Google account authorization remains a manual setup check.

## [0.1.0] - 2026-08-24

- Initial server groups, connection profiles, terminal connections, search, reordering, and bilingual UI.
- PEM/private keys are imported into extension-owned VS Code global storage with restricted POSIX permissions.
- Existing path-based profiles migrate automatically while leaving their source files untouched.
