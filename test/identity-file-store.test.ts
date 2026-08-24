import assert from 'node:assert/strict';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { IdentityFileStore } from '../src/infrastructure/identity-file-store';

test('imports identities into managed storage and never deletes the source', async (context) => {
  const temporary = await fsp.mkdtemp(path.join(os.tmpdir(), 'dev-ssh-identities-'));
  context.after(async () => { await fsp.rm(temporary, { recursive: true, force: true }); });
  const source = path.join(temporary, 'source.pem');
  const storage = path.join(temporary, 'global-storage', 'identities');
  await fsp.writeFile(source, 'private-key-content', { mode: 0o644 });

  const identities = new IdentityFileStore(storage);
  const imported = await identities.adopt(source);
  assert.equal(imported.imported, true);
  assert.equal(identities.isManaged(imported.path), true);
  assert.notEqual(imported.path, source);
  assert.equal(await fsp.readFile(imported.path, 'utf8'), 'private-key-content');
  if (process.platform !== 'win32') {
    assert.equal((await fsp.stat(imported.path)).mode & 0o777, 0o600);
    assert.equal((await fsp.stat(storage)).mode & 0o777, 0o700);
  }

  const adoptedAgain = await identities.adopt(imported.path);
  assert.deepEqual(adoptedAgain, { path: imported.path, imported: false });
  const independentCopy = await identities.adopt(imported.path, false);
  assert.equal(independentCopy.imported, true);
  assert.notEqual(independentCopy.path, imported.path);
  await identities.remove(imported.path);
  await assert.rejects(fsp.stat(imported.path));
  assert.equal(await fsp.readFile(source, 'utf8'), 'private-key-content');
});

test('refuses to delete files outside its managed directory', async (context) => {
  const temporary = await fsp.mkdtemp(path.join(os.tmpdir(), 'dev-ssh-boundary-'));
  context.after(async () => { await fsp.rm(temporary, { recursive: true, force: true }); });
  const source = path.join(temporary, 'source.pem');
  await fsp.writeFile(source, 'keep-me');
  const identities = new IdentityFileStore(path.join(temporary, 'managed'));
  await identities.remove(source);
  assert.equal(await fsp.readFile(source, 'utf8'), 'keep-me');
});
