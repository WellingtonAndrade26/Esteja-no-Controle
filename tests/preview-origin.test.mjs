import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../server/edge.js', import.meta.url), 'utf8');
const built = readFileSync(new URL('../supabase/functions/finance-v2/index.ts', import.meta.url), 'utf8');

test('source and deployed build allow only this Pages project preview origins', () => {
  const fragment = String.raw`/^https:\/\/[a-z0-9-]+\.esteja-no-controle-prisma\.pages\.dev$/`;
  assert.ok(source.includes(fragment), 'source lacks strict origin pattern');
  assert.ok(built.includes(fragment), 'compiled source lacks strict origin pattern');
  const matches = [
    ['https://8ea54112.esteja-no-controle-prisma.pages.dev', true],
    ['https://testeec.esteja-no-controle-prisma.pages.dev', true],
    ['https://other.pages.dev', false],
    ['https://8ea54112.esteja-no-controle-prisma.pages.dev.evil.example', false],
    ['http://testeec.esteja-no-controle-prisma.pages.dev', false],
    ['https://esteja-no-controle-prisma.pages.dev', false],
  ];
  const pattern = /^https:\/\/[a-z0-9-]+\.esteja-no-controle-prisma\.pages\.dev$/;
  for (const [origin, expected] of matches)
    assert.equal(pattern.test(origin), expected, origin);
});

test('changing CORS does not alter existing bearer authentication', () => {
  assert.match(source, /Authorization/);
  assert.match(source, /bearer\.startsWith\('Bearer '\)/);
  assert.match(built, /bearer\.startsWith\("Bearer "\)/);
  assert.match(source, /allowed\.has\(origin\)/);
  assert.match(source, /req\.method==='OPTIONS'/);
});
