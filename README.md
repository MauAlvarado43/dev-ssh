# Dev SSH

Dev SSH is a VS Code sidebar for organizing SSH connections into groups and opening them in integrated terminals.

## Features

- Add servers with name, host/IP, user, port, and an imported PEM/private key.
- Group, rename, recolor, move, reorder, and remove servers.
- Search by server, host, user, or group.
- Connect with one click in a dedicated VS Code terminal.
- Reveal a saved key, copy the address, or copy the generated SSH command.
- English and Spanish UI.

## Security

Dev SSH copies the selected identity file into its VS Code `globalStorage` directory and stores the managed path with the connection metadata. On Linux and macOS, the directory is restricted to `0700` and each copied key to `0600`. The source PEM is never modified or deleted. Removing a server or group removes its managed copies.

## Development

```sh
pnpm install
pnpm run check
```

Press `F5` in VS Code to launch an Extension Development Host.

## Private storage and Google Drive backups

The `local` environment supports manual snapshots, optional automatic backups, Google Drive authorization, and restoration on another computer. Backups have no additional encryption by default; passphrase encryption is optional. No account is connected or automatic upload enabled by installation alone. See [backup setup and recovery](docs/BACKUPS.md), including exclusions and limits. Supabase is not implemented yet.
