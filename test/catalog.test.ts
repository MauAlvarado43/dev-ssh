import assert from 'node:assert/strict';
import test from 'node:test';
import { english, spanish, translate } from '../src/core/i18n/catalog';

function flatten(value: object, prefix = ''): Record<string, string> {
  return Object.entries(value).reduce<Record<string, string>>((result, [key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof child === 'string') result[path] = child;
    else Object.assign(result, flatten(child as object, path));
    return result;
  }, {});
}

function placeholders(value: string): string[] { return [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]!).sort(); }

test('English and Spanish expose identical keys and placeholders', () => {
  const en = flatten(english); const es = flatten(spanish);
  assert.deepEqual(Object.keys(es).sort(), Object.keys(en).sort());
  for (const key of Object.keys(en)) assert.deepEqual(placeholders(es[key]!), placeholders(en[key]!), key);
});

test('translation interpolates values', () => {
  assert.equal(translate('es', 'toast.connecting', { name: 'API' }), 'Conectando a API');
});
