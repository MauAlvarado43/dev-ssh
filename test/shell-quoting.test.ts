import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCommandLine, quoteArgument, shellFamily } from '../src/domain/shell-quoting';

test('classifies common shells', () => {
  assert.equal(shellFamily('/bin/zsh'), 'posix');
  assert.equal(shellFamily('C:\\Windows\\System32\\cmd.exe'), 'cmd');
  assert.equal(shellFamily('C:\\Program Files\\PowerShell\\pwsh.exe'), 'powershell');
});

test('escapes quotes without letting arguments become shell syntax', () => {
  assert.equal(quoteArgument("it's.pem", 'posix'), "'it'\\''s.pem'");
  assert.equal(quoteArgument("it's.pem", 'powershell'), "'it''s.pem'");
  assert.equal(buildCommandLine(['ssh', '-i', '/tmp/key; touch nope'], 'posix'), "ssh -i '/tmp/key; touch nope'");
});
