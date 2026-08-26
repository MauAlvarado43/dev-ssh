# Security policy

Please report vulnerabilities privately to the repository owner instead of opening a public issue.

Dev SSH imports private keys only into its extension-owned VS Code `globalStorage` directory. Managed directories use `0700` and key files use `0600` on POSIX systems. Source files must never be modified or deleted, and key contents must never be logged. They are excluded from backups by default; explicitly opting into private-key backup requires passphrase encryption before an authorized Drive upload. Recovery extracts them only into a fresh private directory with restrictive permissions.

## Optional backups

Backups have no additional encryption by default and may contain readable notes, command environment variables, remembered inputs, paths and attachments. Google OAuth uses `drive.file`, PKCE and a local loopback callback. Tokens and Desktop OAuth credentials are stored in VS Code SecretStorage and excluded from snapshots. Optional passphrase encryption is portable: users must retain the passphrase outside the original computer. Import only trusted snapshots; unencrypted hashes detect accidental damage, not malicious modification. See [backup documentation](docs/BACKUPS.md).
