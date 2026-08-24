import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ACCENT_HEXES } from '../src/core/accents';

test('CSS and host accent palettes stay synchronized', () => {
  const css = readFileSync('src/presentation/webview/styles/base.css', 'utf8');
  ACCENT_HEXES.forEach((hex, index) => assert.match(css, new RegExp(`--accent-${index}:\\s*${hex}`, 'i')));
});
