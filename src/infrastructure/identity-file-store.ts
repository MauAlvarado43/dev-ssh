import { randomUUID } from 'node:crypto';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';

export interface AdoptedIdentity {
  path: string;
  /** True when this call created a new managed copy. */
  imported: boolean;
}

/**
 * Owns the extension's private copies of SSH identity files.
 * Only direct children of `directory` can ever be deleted through this class.
 */
export class IdentityFileStore {
  private readonly root: string;

  constructor(directory: string) {
    this.root = path.resolve(directory);
  }

  isManaged(filePath: string): boolean {
    return path.dirname(path.resolve(filePath)) === this.root;
  }

  async adopt(sourcePath: string, reuseManaged = true): Promise<AdoptedIdentity> {
    const source = path.resolve(sourcePath);
    if (this.isManaged(source) && reuseManaged) return { path: source, imported: false };

    await this.ensureDirectory();
    const target = path.join(this.root, `${randomUUID()}${safeExtension(source)}`);
    await fsp.copyFile(source, target);
    if (process.platform !== 'win32') await fsp.chmod(target, 0o600);
    return { path: target, imported: true };
  }

  async remove(filePath: string): Promise<void> {
    if (!this.isManaged(filePath)) return;
    await fsp.rm(path.resolve(filePath), { force: true });
  }

  private async ensureDirectory(): Promise<void> {
    await fsp.mkdir(this.root, { recursive: true, mode: 0o700 });
    if (process.platform !== 'win32') await fsp.chmod(this.root, 0o700);
  }
}

function safeExtension(filePath: string): string {
  const extension = path.extname(filePath).toLocaleLowerCase();
  return ['.pem', '.key', '.ppk'].includes(extension) ? extension : '.key';
}
