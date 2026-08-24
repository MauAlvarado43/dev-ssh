import assert from 'node:assert/strict';
import test from 'node:test';
import { sshArguments, sshCommand, sshDestination } from '../src/domain/ssh-command';

const server = { id: 's', name: 'API', host: '203.0.113.10', user: 'ubuntu', port: 2222, identityFile: '/home/me/My Keys/api.pem', addedAt: 1 };

test('builds OpenSSH arguments in a deterministic order', () => {
  assert.equal(sshDestination(server), 'ubuntu@203.0.113.10');
  assert.deepEqual(sshArguments(server), ['-i', '/home/me/My Keys/api.pem', '-p', '2222', 'ubuntu@203.0.113.10']);
});

test('quotes identity paths for the active shell family', () => {
  assert.equal(sshCommand('ssh', server, 'posix'), "ssh -i '/home/me/My Keys/api.pem' -p 2222 ubuntu@203.0.113.10");
  assert.equal(sshCommand('C:\\Program Files\\OpenSSH\\ssh.exe', server, 'powershell'), "& 'C:\\Program Files\\OpenSSH\\ssh.exe' -i '/home/me/My Keys/api.pem' -p 2222 ubuntu@203.0.113.10");
});
