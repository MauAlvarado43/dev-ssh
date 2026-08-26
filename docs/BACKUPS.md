# Almacenamiento local y backups con Google Drive

## Qué está implementado

Las cinco extensiones usan su propia carpeta privada de VS Code (`ExtensionContext.globalStorageUri`). El único entorno disponible es `local`. Drive guarda snapshots independientes; no sincroniza ni fusiona las bases activas entre computadoras. Supabase sigue pendiente.

SSH y Commands migran sus datos de `globalState` a JSON privado. Las copias antiguas de Memento no se borran, pero tampoco se siguen actualizando: una versión anterior de la extensión no verá automáticamente los cambios posteriores a la migración. Folder conserva su JSON compartido y Tracker su SQLite. Notes copia una configuración antigua de `storagePath` a la carpeta privada una sola vez, dejando intacta la carpeta original; si hay datos tanto en origen como en destino, detiene la migración para no mezclarlos silenciosamente. Cierra las demás ventanas de VS Code durante la primera actualización.

Las preferencias que antes se guardaban en Memento viven en `preferences.json`. Las configuraciones declaradas en Settings siguen siendo configuraciones normales de VS Code. Los tokens OAuth y la contraseña opcional se guardan en **SecretStorage**, nunca dentro de un backup.

## Sin contraseña adicional por defecto

`backup.encrypt` está desactivado. Un archivo `.devbackup` normal contiene un manifiesto JSON comprimido y los archivos, con hashes de integridad. Puede restaurarse en otra PC sin la máquina original ni sus credenciales. El formato sin cifrar es `DEVBACKUP0\n` seguido de gzip de JSON; los archivos están en base64 dentro del manifiesto y no dependen de una clave oculta. La compresión **no** es cifrado: quien obtenga el archivo puede leerlo.

Las notas, comandos, variables y respuestas recordadas pueden incluir secretos. Revisa lo que guardas y protege tu cuenta de Drive. Las llaves privadas SSH se excluyen por defecto. Para incluirlas hay que activar `devSsh.backup.includePrivateKeys` junto con el cifrado opcional y configurar una contraseña conservada fuera de esta PC. Los archivos externos de proyectos, repositorios y scripts no se copian.

Si activas cifrado opcional, se usa AES-256-GCM con clave derivada de tu contraseña mediante scrypt y salt aleatorio. La restauración pide la contraseña original, no la contraseña de Google ni una clave exclusiva del dispositivo. Cambiarla afecta a futuros backups; los antiguos conservan la anterior.

## Preparar Google Drive

No necesitas un servidor, Supabase ni rclone. Sí necesitas una aplicación OAuth de Google:

1. Abre [Google Cloud Console](https://console.cloud.google.com/) y crea o selecciona un proyecto propio.
2. Habilita **Google Drive API**.
3. Configura el consentimiento en **Google Auth Platform**. Para pruebas personales, agrega tu cuenta como usuario de prueba si corresponde.
4. Crea un **OAuth Client ID** de tipo **Desktop app / Aplicación de escritorio**. No elijas cuenta de servicio ni aplicación web.
5. Descarga su JSON. Conserva una copia segura accesible desde otra PC o conserva acceso al proyecto de Google Cloud. No lo publiques en Git ni lo pegues en un chat.
6. En una ventana local de VS Code, abre la paleta de comandos y ejecuta **[nombre de extensión]: Conectar Google Drive**. Selecciona ese JSON y autoriza tu cuenta en el navegador.
7. Ejecuta **Crear backup ahora** y revisa **Mostrar estado de backups**. Confirma que aparezca una subida remota completada y que el archivo exista en Drive antes de depender del respaldo.

La autorización usa navegador, callback en `127.0.0.1`, PKCE y el scope `drive.file`. Sólo pide acceso a archivos creados/autorizados para esta aplicación. No usa la contraseña de Google dentro de VS Code. Las credenciales de escritorio y los tokens quedan en SecretStorage. [Flujo oficial OAuth Desktop](https://developers.google.com/identity/protocols/oauth2/native-app), [scope de Drive](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).

Puedes reutilizar el mismo cliente OAuth para las cinco extensiones. Cada extensión se conecta por separado y filtra sus propios backups por ID. Los archivos aparecen en Mi unidad con el ID de la extensión, dispositivo, fecha e ID único en el nombre. No se sobrescribe un `backup.zip` global.

**Atención al modo Testing:** para una aplicación OAuth externa en pruebas que solicita acceso a Drive, Google limita normalmente el refresh token a siete días. Esto exige volver a autorizar. Para respaldo habitual, revisa el estado de publicación y los requisitos que Google indique para tu proyecto; los tokens también pueden caducar o revocarse por otras causas. [Caducidad de tokens de Google](https://developers.google.com/identity/protocols/oauth2#expiration).

El inicio de sesión de esta primera versión requiere una ventana local de VS Code. No está soportado desde hosts Remote SSH/WSL/Containers porque el callback loopback no necesariamente llega al navegador de la misma máquina.

## Configuración

Sustituye `PREFIJO` por el namespace correspondiente:

| Extensión | PREFIJO |
|---|---|
| Dev SSH | `devSsh` |
| Dev Commands | `devCommands` |
| DevFolder | `devfolder` |
| Dev Notes | `devNotes` |
| DevTracker | `devtracker` |

| Configuración | Valor inicial | Uso |
|---|---|---|
| `PREFIJO.environment` | `local` | Carpeta privada; Supabase no es seleccionable todavía. |
| `PREFIJO.backup.autoEnabled` | `false` | Activa snapshots automáticos mientras esté activo el host de la extensión. |
| `PREFIJO.backup.intervalMinutes` | `30` | Intervalo entre 5 y 1440 minutos; sólo crea otra versión si hay cambios. |
| `PREFIJO.backup.encrypt` | `false` | Contraseña adicional opcional. Configurarla no activa el cifrado por sí solo. |
| `devSsh.backup.includePrivateKeys` | `false` | Incluir copias administradas de llaves; requiere cifrado. |

Ejemplo para Tracker:

```json
{
  "devtracker.environment": "local",
  "devtracker.backup.autoEnabled": true,
  "devtracker.backup.intervalMinutes": 30,
  "devtracker.backup.encrypt": false
}
```

Los backups automáticos están desactivados hasta que tú los habilites. Las extensiones se activan al terminar de iniciar VS Code; Tracker conserva su opción de captura de actividad. El temporizador revisa cada minuto si toca hacer un backup; no ejecuta nada con VS Code cerrado. Un respaldo sin Drive conectado sigue siendo **sólo local** y no protege ante la muerte del disco.

Si Drive falla, se conserva el snapshot local como pendiente y se siguen creando nuevos backups locales cuando cambian los datos. En posteriores ejecuciones se reintentan subidas pendientes, con un máximo de cinco históricas por ejecución. La subida usa una sesión resumable y verifica tamaño y MD5 devueltos por Drive; un fallo reinicia el envío del snapshot, no sustituye archivos anteriores. [API de subida](https://developers.google.com/workspace/drive/api/guides/manage-uploads).

## Comandos

- **Conectar Google Drive**: importar credencial Desktop y autorizar en navegador.
- **Desconectar Google Drive**: quitar credenciales/tokens de esta instalación; no borrar backups ni revocar los de otras PCs. La revocación global se hace desde tu cuenta de Google.
- **Crear backup ahora**: crear copia local y subirla si Drive está conectado; requiere confirmación.
- **Restaurar backup**: elegir archivo local o uno de los 100 backups más recientes de Drive.
- **Configurar contraseña del backup (opcional)**: guardar una contraseña para futuros backups cifrados, confirmándola dos veces.
- **Mostrar estado de backups**: ver carpeta de datos activa, último archivo local, última subida completada y errores registrados.

## Qué se incluye

| Extensión | Datos incluidos | Exclusiones |
|---|---|---|
| SSH | Servidores, grupos, preferencias; llaves sólo si lo habilitas | Llaves privadas por defecto; llaves externas no administradas siempre |
| Commands | Espacios, comandos, scripts embebidos, parámetros, respuestas recordadas y preferencias | Archivos de scripts externos y contenido de repositorios |
| Folder | Proyectos, agrupaciones, orden, colores y preferencias | Los archivos de las carpetas de proyectos |
| Notes | Notebooks, Markdown, pizarrones editables, adjuntos ocultos y notebooks vacíos | Cambios aún no guardados; se pide guardar antes del snapshot |
| Tracker | Export lógico consistente de SQLite, tareas, notas, actividad, métricas y adjuntos guardados | Repositorios y adjuntos de borradores no guardados |

Los datos y archivos se comparan durante la captura para detectar cambios concurrentes. Tracker exporta dentro de una transacción de lectura, no copia un `.sqlite3` activo sin su WAL. Si cambian datos o falta un adjunto durante la captura, el backup falla claramente en vez de publicarse como completo.

## Recuperar después de perder una PC

### Sin configurar OAuth de nuevo

1. Entra a Google Drive desde el navegador y descarga el `.devbackup` de la extensión.
2. Instala esa extensión en la nueva PC.
3. Ejecuta **Restaurar backup → Archivo local** y elige el archivo.
4. Si es un backup normal, no pide ninguna contraseña adicional. Si lo creaste cifrado, pide la que conservaste por separado.
5. Guarda los documentos abiertos y cierra otras ventanas/MCP. Confirma la restauración.
6. La ventana se recarga usando los datos restaurados. Repite para cada extensión que necesites.

### Desde el selector integrado de Drive

Conecta la misma cuenta con el mismo cliente OAuth, elige **Restaurar backup → Google Drive** y selecciona un snapshot. Si cambiaste de cliente OAuth, los permisos `drive.file` pueden no permitir listar archivos de la aplicación anterior: usa la descarga desde el navegador y restauración local.

La restauración crea `restored/<uuid>` dentro de la carpeta privada y cambia el puntero `active-data.json` sólo cuando termina la validación. Los archivos anteriores quedan intactos. Los stores antiguos de JSON y SQLite rechazan nuevas escrituras cuando se activa el cambio. Los editores de notas que quedaron abiertos pueden seguir apuntando a la generación anterior: cierra las otras ventanas, no continúes editando allí y recárgalas.

Se recalculan las rutas de llaves y adjuntos administrados. Las rutas externas de proyectos, scripts, shells e intérpretes **no** se adivinan: actualízalas para la nueva PC. Las llaves excluidas deben volver a seleccionarse. Para Tracker, reinicia los clientes MCP y vuelve a copiar la configuración desde la extensión: una configuración con una ruta explícita antigua debe actualizarse.

No se restauran tokens de Google ni la identidad del dispositivo anterior. Una nueva instalación genera su propio ID y una autorización nueva; esto no impide leer los archivos de backup antiguos.

## Límites y operación

- Máximo inicial: **64 MiB de contenido sin comprimir y 10000 entradas** por snapshot; el manifiesto descomprimido tiene otro límite de 128 MiB. Si los supera, se informa un error, no se recorta el backup.
- No se siguen symlinks ni se extraen rutas absolutas o con traversal. Los hashes detectan daños accidentales. Un backup sin cifrado no ofrece autenticidad frente a alguien que pueda modificar el archivo: restaura sólo copias confiables.
- **No se borran automáticamente backups antiguos** en esta primera versión. Vigila el espacio local y de Drive y elimina copias antiguas sólo después de verificar que puedes recuperar una reciente. Las carpetas de generaciones anteriores tampoco se eliminan automáticamente.
- Los archivos OAuth, tokens, contraseña opcional, cachés, temporales y binarios de runtime no forman parte del paquete.
- El VSIX de Tracker generado en esta máquina incluye SQLite nativo para Linux x64. En otros sistemas hay que instalar o compilar una versión compatible; el formato de los backups sí es portable.
- Los backups no incluyen la extensión instalada: reinstala un VSIX compatible antes de restaurar. Se valida el ID de la extensión y la versión del esquema.
- Dos PCs producen snapshots distintos. Esto **no** resuelve cambios simultáneos como lo hará un futuro servicio de sincronización; elige conscientemente qué snapshot restaurar.
- Después de un cierre abrupto muy concreto puede quedar una guarda `.lock.recovering` y bloquear escrituras. No la elimines con ventanas/MCP activos. Cierra todos los procesos, conserva una copia del directorio y retira la guarda abandonada antes de reabrir.
- Los módulos de `src/infrastructure/backup` están vendorizados en cada repositorio para que cada VSIX/CI sea independiente; los cambios al núcleo y sus pruebas deben aplicarse a las cinco copias.

## Supabase: siguiente fase

No hay conexión ni credenciales de Supabase implementadas. Cuando se añada necesitaremos URL del proyecto, **publishable key** e inicio de sesión del usuario (por ejemplo OAuth con PKCE), además de permisos RLS y el protocolo de sincronización con versiones, outbox y conflictos. La clave pública identifica la aplicación; no sustituye la sesión del usuario. No debe ponerse una clave `service_role` o secret key en una extensión distribuida. [Claves públicas y autenticación de Supabase](https://supabase.com/docs/guides/getting-started/api-keys).

## Verificación antes de confiar en el backup

La compilación y las pruebas automáticas cubren archivos, restauración, cifrado opcional, concurrencia y flujos OAuth/Drive con respuestas simuladas. **La conexión real a tu cuenta y una subida/descarga real requieren tu autorización y deben comprobarse antes de depender del respaldo.**

Haz una prueba con contenido no sensible: crea una nota y adjunto, sube un backup, descárgalo desde Drive y restáuralo en un perfil limpio. Comprueba también el último estado remoto después de habilitar los backups automáticos.
