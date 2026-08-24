export type ShellFamily = 'powershell' | 'cmd' | 'posix';
const SAFE = /^[\w@%+=:,./\\-]+$/;

export function shellFamily(shellPath: string): ShellFamily {
  const name = (shellPath.replaceAll('\\', '/').split('/').pop() ?? '').toLowerCase().replace(/\.exe$/, '');
  if (name === 'powershell' || name === 'pwsh' || name === 'powershell_ise') return 'powershell';
  if (name === 'cmd' || name === 'command') return 'cmd';
  return 'posix';
}

export function quoteArgument(value: string, family: ShellFamily): string {
  if (SAFE.test(value)) return value;
  if (family === 'powershell') return `'${value.replaceAll("'", "''")}'`;
  if (family === 'cmd') return `"${value.replaceAll('"', '""')}"`;
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

export function buildCommandLine(parts: string[], family: ShellFamily): string {
  const [executable, ...args] = parts.filter((part) => part.length > 0);
  if (!executable) return '';
  const command = quoteArgument(executable, family);
  const prefix = family === 'powershell' && command !== executable ? '& ' : '';
  return `${prefix}${[command, ...args.map((argument) => quoteArgument(argument, family))].join(' ')}`;
}
