# Dev SSH architecture

## Data flow

The webview sends typed `ClientMessage` objects to the extension host. `AppController` applies pure domain rules through `ServerStore`, which serializes writes to VS Code global storage. A fresh `ViewState` is then projected and sent back to the webview.

```text
Webview -> ClientMessage -> AppController -> ServerStore -> globalState
   ^                                                          |
   +--------------------- ViewState (HostMessage) ------------+
```

The selected private key is imported into an extension-owned directory under VS Code `globalStorage`. `IdentityFileStore` is the only component allowed to copy or delete those files, restricts deletion to direct children of its own directory, and applies `0700`/`0600` permissions on POSIX systems. Existing path-based profiles are migrated on activation without modifying their source files.

## Source boundaries

| Area | Responsibility |
| --- | --- |
| `src/core/` | Shared state/message contracts, accents, and bilingual catalog. |
| `src/domain/` | Server validation, grouping, ordering, normalization, and SSH command construction. No VS Code or DOM. |
| `src/infrastructure/` | Serialized state persistence and extension-owned identity-file storage. |
| `src/integrations/` | VS Code terminal integration. |
| `src/presentation/host/` | Settings, view-state projection, actions, dialogs, and webview hosting. |
| `src/presentation/webview/` | Sidebar rendering, forms, menus, drag-and-drop, and local UI state. |

## Practical rules

- Domain rules never depend on VS Code or the DOM.
- `ServerStore.mutate` is the only persistence write path.
- `IdentityFileStore` is the only private-key copy/delete path; source PEMs are never deleted.
- The webview renders `ViewState`; it does not read files or extension state.
- SSH commands are assembled from an argument array and quoted for the active shell.
- User-facing text belongs in the typed catalog.
