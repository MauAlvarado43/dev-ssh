import assert from 'node:assert/strict';
import test from 'node:test';
import { addServer, countServers, createGroup, emptyState, moveServer, normalizeState, removeGroup, renameGroup, reorderServer, updateServer, validateDraft } from '../src/domain/servers';

const draft = (host = '203.0.113.10') => ({ name: 'Production', host, user: 'ubuntu', port: 22, identityFile: '/tmp/server.pem' });

test('creates groups with unique names and rotating accents', () => {
  const state = emptyState();
  const first = createGroup(state, ' Production ');
  const second = createGroup(state, 'Staging');
  assert.equal(first.name, 'Production');
  assert.equal(first.color, 0);
  assert.equal(second.color, 1);
  assert.throws(() => createGroup(state, 'production'));
  assert.throws(() => renameGroup(state, second.id, 'PRODUCTION'));
});

test('adds, edits, moves, and counts servers', () => {
  const state = emptyState();
  const group = createGroup(state, 'Production');
  const server = addServer(state, group.id, draft());
  assert.equal(countServers(state), 1);
  assert.equal(server.identityFile, '/tmp/server.pem');
  updateServer(state, server.id, { ...draft(), name: 'API' });
  assert.equal(server.name, 'API');
  assert.equal(moveServer(state, server.id, undefined), true);
  assert.equal(state.servers[0]?.id, server.id);
});

test('rejects duplicate endpoints even when names and key paths differ', () => {
  const state = emptyState();
  addServer(state, undefined, draft());
  assert.throws(() => addServer(state, undefined, { ...draft(), name: 'Other', identityFile: '/tmp/other.pem' }));
  assert.doesNotThrow(() => addServer(state, undefined, { ...draft(), port: 2222 }));
});

test('rejects hosts that could become options or markup', () => {
  assert.throws(() => validateDraft({ ...draft(), host: '-oProxyCommand=bad' }));
  assert.throws(() => validateDraft({ ...draft(), host: 'host\"><script>' }));
  assert.doesNotThrow(() => validateDraft({ ...draft(), host: '[2001:db8::1]' }));
});

test('reorders only inside the same group', () => {
  const state = emptyState();
  const group = createGroup(state, 'A');
  const first = addServer(state, group.id, draft('one.example.com'));
  const second = addServer(state, group.id, draft('two.example.com'));
  const outside = addServer(state, undefined, draft('three.example.com'));
  assert.equal(reorderServer(state, first.id, second.id, 'after'), true);
  assert.deepEqual(group.servers.map((server) => server.id), [second.id, first.id]);
  assert.equal(reorderServer(state, first.id, outside.id, 'before'), false);
});

test('removing a group removes its contained servers without touching ungrouped entries', () => {
  const state = emptyState();
  const group = createGroup(state, 'A');
  addServer(state, group.id, draft());
  addServer(state, undefined, draft('other.example.com'));
  removeGroup(state, group.id);
  assert.equal(countServers(state), 1);
});

test('normalizes malformed persisted state and drops duplicate connections', () => {
  const state = normalizeState({ groups: [{ id: 'g', name: ' G ', color: 99, servers: [
    { id: 'a', ...draft(), addedAt: 1 }, { id: 'b', ...draft(), name: 'Duplicate', addedAt: 2 }
  ] }], servers: [{ id: 'c', name: '', host: 'x', user: 'u', port: 22, identityFile: '/tmp/x' }] });
  assert.equal(state.groups[0]?.name, 'G');
  assert.equal(state.groups[0]?.color, 0);
  assert.equal(state.groups[0]?.servers.length, 1);
  assert.equal(state.servers.length, 0);
});

test('legacy Memento migrates once to private storage and concurrent stores retain changes', async () => {
  const { mkdtemp, rm, readFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { ServerStore } = await import('../src/infrastructure/server-store');
  const root = await mkdtemp(join(tmpdir(), 'dev-ssh-migration-'));
  const legacy = { version: 1, groups: [{ id: 'original', name: 'Legacy', color: 0, servers: [] }], servers: [] };
  const memento = { get: () => structuredClone(legacy), update: async () => { throw new Error('Must not write to Memento'); }, keys: () => [] } as unknown as import('vscode').Memento;
  const first = await ServerStore.create(memento, root);
  const second = await ServerStore.create(memento, root);
  try {
    await Promise.all([first.addGroup('Window A'), second.addGroup('Window B')]);
    const state = JSON.parse(await readFile(join(root, 'state-v1.json'), 'utf8')) as { groups: { name: string }[] };
    assert.deepEqual(state.groups.map((g) => g.name).sort(), ['Legacy', 'Window A', 'Window B']);
    assert.equal(legacy.groups.length, 1);
  } finally { first.dispose(); second.dispose(); await rm(root, { recursive: true, force: true }); }
});
