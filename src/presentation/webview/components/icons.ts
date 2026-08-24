export type IconName = 'logo' | 'server' | 'folder' | 'search' | 'plus' | 'more' | 'chevron' | 'copy' | 'edit' | 'move' | 'trash' | 'key' | 'terminal' | 'warning' | 'check' | 'close' | 'grip' | 'palette';
export function icon(name: IconName): string { return `<svg class="icon" aria-hidden="true"><use href="#i-${name}"></use></svg>`; }
export function mountIconSprite(): void { document.body.insertAdjacentHTML('afterbegin', SPRITE); }

const SPRITE = `<svg class="icon-sprite" aria-hidden="true">
<symbol id="i-logo" viewBox="0 0 24 24"><rect x="3" y="3.5" width="8" height="6.5" rx="1.7"/><rect x="13" y="14" width="8" height="6.5" rx="1.7"/><path d="M6 6.75h.01M8.25 6.75h.01M15.75 17.25h.01M18 17.25h.01"/><path d="M11 6.75h.8a3.2 3.2 0 0 1 3.2 3.2V14"/><path d="m12.8 11.8 2.2 2.2 2.2-2.2"/></symbol>
<symbol id="i-server" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="6" rx="2"/><rect x="4" y="14" width="16" height="6" rx="2"/><path d="M8 7h.01M8 17h.01M12 7h5M12 17h5"/></symbol>
<symbol id="i-folder" viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></symbol>
<symbol id="i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></symbol>
<symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></symbol>
<symbol id="i-more" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.2" class="fill"/><circle cx="12" cy="12" r="1.2" class="fill"/><circle cx="19" cy="12" r="1.2" class="fill"/></symbol>
<symbol id="i-chevron" viewBox="0 0 24 24"><path d="m8 10 4 4 4-4"/></symbol>
<symbol id="i-copy" viewBox="0 0 24 24"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></symbol>
<symbol id="i-edit" viewBox="0 0 24 24"><path d="m5 16-1 4 4-1L19 8l-3-3zM14.5 6.5l3 3"/></symbol>
<symbol id="i-move" viewBox="0 0 24 24"><path d="M5 8h11M13 5l3 3-3 3M19 16H8M11 13l-3 3 3 3"/></symbol>
<symbol id="i-trash" viewBox="0 0 24 24"><path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></symbol>
<symbol id="i-key" viewBox="0 0 24 24"><circle cx="8" cy="15" r="4"/><path d="m11 12 8-8M16 7l2 2M14 9l2 2"/></symbol>
<symbol id="i-terminal" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M13 15h4"/></symbol>
<symbol id="i-warning" viewBox="0 0 24 24"><path d="M12 4 3.5 19h17zM12 9v4M12 16.5v.2"/></symbol>
<symbol id="i-check" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></symbol>
<symbol id="i-close" viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></symbol>
<symbol id="i-grip" viewBox="0 0 24 24"><circle cx="9" cy="6" r="1" class="fill"/><circle cx="15" cy="6" r="1" class="fill"/><circle cx="9" cy="12" r="1" class="fill"/><circle cx="15" cy="12" r="1" class="fill"/><circle cx="9" cy="18" r="1" class="fill"/><circle cx="15" cy="18" r="1" class="fill"/></symbol>
<symbol id="i-palette" viewBox="0 0 24 24"><path d="M12 4a8 8 0 1 0 0 16h1.2a1.8 1.8 0 0 0 1.2-3.1 1.8 1.8 0 0 1 1.2-3.1H18A2 2 0 0 0 20 12a8 8 0 0 0-8-8Z"/><circle cx="8" cy="10" r="1" class="fill"/></symbol>
</svg>`;
