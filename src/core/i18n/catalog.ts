import type { AppLocale } from '../types';

export const english = {
  shell: {
    subtitle: 'Your servers, one click away',
    searchLabel: 'Search servers', searchPlaceholder: 'Search servers…', clearSearch: 'Clear search',
    addServer: 'Add server', newGroup: 'New group', ungrouped: 'No group',
    serverCount: '{count} servers', serverCountOne: '{count} server',
    groupCount: '{count} groups', groupCountOne: '{count} group',
    noResults: 'We found no servers for'
  },
  empty: {
    title: 'Your connections start here',
    description: 'Save a server and its private-key path to connect from an integrated terminal.',
    addServer: 'Add your first server', createGroup: 'Create an empty group'
  },
  group: {
    addServerHere: 'Add server here', dragToReorder: 'Drag to reorder', moreActions: 'More actions',
    noServers: 'No servers yet.', addServer: 'Add server'
  },
  server: {
    connect: 'Connect to {destination}', connectAction: 'Connect', dragToReorder: 'Drag to reorder',
    moreActions: 'More actions', missingIdentity: 'Private key not found'
  },
  menu: {
    connect: 'Connect', copyAddress: 'Copy address', copyCommand: 'Copy SSH command', revealIdentity: 'Reveal private key',
    editServer: 'Edit server', moveToGroup: 'Move to group', removeServer: 'Remove server',
    addServer: 'Add server', renameGroup: 'Rename', changeColor: 'Change color', removeGroup: 'Remove group'
  },
  modal: {
    close: 'Close', cancel: 'Cancel', save: 'Save changes', createGroup: 'New group', editGroup: 'Edit group',
    groupDescription: 'Create a space to organize related servers.', name: 'Name',
    groupPlaceholder: 'For example: Production, Staging, Clients', nameRequired: 'Write a name.',
    groupTaken: 'A group with that name already exists.', create: 'Create group',
    addServer: 'Add server', editServer: 'Edit server', serverDescription: 'A private copy of the key is stored inside Dev SSH; the original stays untouched.',
    serverName: 'Server name', serverNamePlaceholder: 'For example: API production', host: 'Host or IP', hostPlaceholder: '203.0.113.10',
    user: 'User', userPlaceholder: 'ubuntu', port: 'Port', identityFile: 'PEM / private key', identityPlaceholder: '/path/to/key.pem',
    browse: 'Browse…', requiredFields: 'Complete name, host, user, port, and private key.', invalidPort: 'Use a port between 1 and 65535.',
    addTo: 'Add to', moveServer: 'Move server', moveDescription: 'Select the destination group.', noGroup: 'Save without grouping',
    groupServers: '{count} servers', colorTitle: 'Color of “{name}”', colorDescription: 'The color helps you recognize the group quickly.',
    removeTitle: 'Remove “{name}”', removeDescription: 'It will be removed from Dev SSH. No files will be deleted.',
    removeServers: ' Its {count} servers will be removed too.', remove: 'Remove', thisServer: 'this server', thisGroup: 'this group'
  },
  colors: { violet: 'Violet', mint: 'Mint', amber: 'Amber', pink: 'Pink', blue: 'Blue', lavender: 'Lavender', lime: 'Lime', coral: 'Coral' },
  toast: {
    groupCreated: 'Group “{name}” created', groupUpdated: 'Group updated', groupRemoved: 'Group removed', colorUpdated: 'Color updated',
    serverAdded: 'Server “{name}” added', serverUpdated: 'Server updated', serverMoved: 'Server moved', serverRemoved: 'Server removed',
    addressCopied: 'Address copied', commandCopied: 'SSH command copied', connecting: 'Connecting to {name}', viewRefreshed: 'View refreshed',
    missingIdentity: 'The private key no longer exists. Edit the server and select it again.', noDestination: 'There is no other destination available.'
  },
  host: {
    unexpectedError: 'Something went wrong.', groupNameRequired: 'Write a name for the group.', groupNameTaken: 'A group with that name already exists.',
    groupMissing: 'The group no longer exists.', invalidColor: 'The group or color is no longer valid.', serverMissing: 'The server no longer exists.',
    serverNameRequired: 'Write a server name.', hostRequired: 'Write a valid host or IP.', userRequired: 'Write a valid SSH user.',
    portInvalid: 'The SSH port must be between 1 and 65535.', identityRequired: 'Select a PEM or private-key file.', identityMissing: 'The private-key file does not exist.',
    duplicateServer: 'That SSH connection is already saved.', chooseIdentity: 'Select PEM or private key', useIdentity: 'Import this key',
    identityImportFailed: 'The private key could not be copied to Dev SSH storage.', revealFailed: 'The private-key file does not exist.'
  }
} as const;

export type LocaleMessages<T> = { [Key in keyof T]: T[Key] extends string ? string : LocaleMessages<T[Key]> };

export const spanish: LocaleMessages<typeof english> = {
  shell: {
    subtitle: 'Tus servidores, a un clic', searchLabel: 'Buscar servidores', searchPlaceholder: 'Buscar servidores…', clearSearch: 'Limpiar búsqueda',
    addServer: 'Agregar servidor', newGroup: 'Nuevo grupo', ungrouped: 'Sin grupo', serverCount: '{count} servidores', serverCountOne: '{count} servidor',
    groupCount: '{count} grupos', groupCountOne: '{count} grupo', noResults: 'No encontramos servidores para'
  },
  empty: {
    title: 'Tus conexiones empiezan aquí', description: 'Guarda un servidor y la ruta de su clave privada para conectarte desde una terminal integrada.',
    addServer: 'Agregar tu primer servidor', createGroup: 'Crear un grupo vacío'
  },
  group: {
    addServerHere: 'Agregar servidor aquí', dragToReorder: 'Arrastrar para reordenar', moreActions: 'Más acciones', noServers: 'No hay servidores todavía.', addServer: 'Agregar servidor'
  },
  server: {
    connect: 'Conectar a {destination}', connectAction: 'Conectar', dragToReorder: 'Arrastrar para reordenar', moreActions: 'Más acciones', missingIdentity: 'No se encontró la clave privada'
  },
  menu: {
    connect: 'Conectar', copyAddress: 'Copiar dirección', copyCommand: 'Copiar comando SSH', revealIdentity: 'Mostrar clave privada',
    editServer: 'Editar servidor', moveToGroup: 'Mover a grupo', removeServer: 'Quitar servidor', addServer: 'Agregar servidor',
    renameGroup: 'Cambiar nombre', changeColor: 'Cambiar color', removeGroup: 'Quitar grupo'
  },
  modal: {
    close: 'Cerrar', cancel: 'Cancelar', save: 'Guardar cambios', createGroup: 'Nuevo grupo', editGroup: 'Editar grupo',
    groupDescription: 'Crea un espacio para organizar servidores relacionados.', name: 'Nombre', groupPlaceholder: 'Ej. Producción, Staging, Clientes',
    nameRequired: 'Escribe un nombre.', groupTaken: 'Ya existe un grupo con ese nombre.', create: 'Crear grupo', addServer: 'Agregar servidor', editServer: 'Editar servidor',
    serverDescription: 'Se guarda una copia privada de la clave dentro de Dev SSH; el original no se modifica.', serverName: 'Nombre del servidor', serverNamePlaceholder: 'Ej. API producción',
    host: 'Host o IP', hostPlaceholder: '203.0.113.10', user: 'Usuario', userPlaceholder: 'ubuntu', port: 'Puerto', identityFile: 'PEM / clave privada',
    identityPlaceholder: '/ruta/a/clave.pem', browse: 'Elegir…', requiredFields: 'Completa nombre, host, usuario, puerto y clave privada.',
    invalidPort: 'Usa un puerto entre 1 y 65535.', addTo: 'Agregar a', moveServer: 'Mover servidor', moveDescription: 'Selecciona el grupo de destino.',
    noGroup: 'Guardar sin agrupar', groupServers: '{count} servidores', colorTitle: 'Color de “{name}”', colorDescription: 'El color ayuda a reconocer el grupo rápidamente.',
    removeTitle: 'Quitar “{name}”', removeDescription: 'Se quitará de Dev SSH. No se borrará ningún archivo.', removeServers: ' También se quitarán sus {count} servidores.',
    remove: 'Quitar', thisServer: 'este servidor', thisGroup: 'este grupo'
  },
  colors: { violet: 'Violeta', mint: 'Menta', amber: 'Ámbar', pink: 'Rosa', blue: 'Azul', lavender: 'Lavanda', lime: 'Lima', coral: 'Coral' },
  toast: {
    groupCreated: 'Grupo “{name}” creado', groupUpdated: 'Grupo actualizado', groupRemoved: 'Grupo quitado', colorUpdated: 'Color actualizado',
    serverAdded: 'Servidor “{name}” agregado', serverUpdated: 'Servidor actualizado', serverMoved: 'Servidor movido', serverRemoved: 'Servidor quitado',
    addressCopied: 'Dirección copiada', commandCopied: 'Comando SSH copiado', connecting: 'Conectando a {name}', viewRefreshed: 'Vista actualizada',
    missingIdentity: 'La clave privada ya no existe. Edita el servidor y selecciónala de nuevo.', noDestination: 'No hay otro destino disponible.'
  },
  host: {
    unexpectedError: 'Ocurrió un error.', groupNameRequired: 'Escribe un nombre para el grupo.', groupNameTaken: 'Ya existe un grupo con ese nombre.',
    groupMissing: 'El grupo ya no existe.', invalidColor: 'El grupo o color ya no es válido.', serverMissing: 'El servidor ya no existe.',
    serverNameRequired: 'Escribe un nombre para el servidor.', hostRequired: 'Escribe un host o IP válido.', userRequired: 'Escribe un usuario SSH válido.',
    portInvalid: 'El puerto SSH debe estar entre 1 y 65535.', identityRequired: 'Selecciona un archivo PEM o clave privada.', identityMissing: 'El archivo de clave privada no existe.',
    duplicateServer: 'Esa conexión SSH ya está guardada.', chooseIdentity: 'Seleccionar PEM o clave privada', useIdentity: 'Importar esta clave',
    identityImportFailed: 'No se pudo copiar la clave privada al almacenamiento de Dev SSH.', revealFailed: 'El archivo de clave privada no existe.'
  }
};

type Join<Key extends string, Suffix extends string> = `${Key}.${Suffix}`;
export type MessageKey<T = typeof english> = { [Key in keyof T & string]: T[Key] extends string ? Key : Join<Key, MessageKey<T[Key]>> }[keyof T & string];
export type TranslationValues = Record<string, number | string>;

export const messages: Record<AppLocale, LocaleMessages<typeof english>> = { en: english, es: spanish };
export const defaultLocale: AppLocale = 'en';

function lookup(locale: AppLocale, key: string): unknown {
  return key.split('.').reduce<unknown>((current, part) => current && typeof current === 'object' ? (current as Record<string, unknown>)[part] : undefined, messages[locale]);
}

export function interpolate(template: string, values?: TranslationValues): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => name in values ? String(values[name]) : `{${name}}`);
}

export function translate(locale: AppLocale, key: MessageKey, values?: TranslationValues): string {
  const message = lookup(locale, key) ?? lookup(defaultLocale, key);
  return typeof message === 'string' ? interpolate(message, values) : key;
}

export function isAppLocale(value: unknown): value is AppLocale { return value === 'en' || value === 'es'; }

export class LocalizedError extends Error {
  constructor(readonly key: MessageKey, readonly values?: TranslationValues) { super(key); }
  localize(locale: AppLocale): string { return translate(locale, this.key, this.values); }
}

export function localizeError(error: unknown, locale: AppLocale): string {
  return error instanceof LocalizedError ? error.localize(locale) : translate(locale, 'host.unexpectedError');
}
