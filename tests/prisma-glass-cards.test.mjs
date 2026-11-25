import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { transformSync } from 'esbuild';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const html = read('prisma/recovered-deployment/index.html');
const css = read('prisma/recovered-deployment/cards-prisma-v2.css');
const app = read('prisma/recovered-deployment/app.js');

test('EC Glass stylesheet loads after the original cards CSS', () => {
  assert.equal((html.match(/href="\.\/cards-prisma-v2\.css"/g) || []).length, 1);
  assert.ok(html.indexOf('href="./cards.css"') < html.indexOf('href="./cards-prisma-v2.css"'));
  assert.match(html, /src="\.\/access\.js"/);
});

test('Glass CSS parses without errors', () => {
  const compiled = transformSync(css, { loader: 'css', minify: true });
  assert.ok(compiled.code.includes('planning-grid'));
});

test('Planning first section restores its independent glass container', () => {
  assert.match(css, /\.content \.planning-grid>\.panel\.card-section:first-child\s*\{/);
  const block = css.match(/\.content \.planning-grid>\.panel\.card-section:first-child\s*\{([^}]*)\}/)?.[1];
  assert.ok(block);
  assert.match(block, /background:var\(--ec-glass-panel\)/);
  assert.match(block, /border:1px solid/);
  assert.match(block, /padding:clamp/);
  assert.doesNotMatch(block, /background:transparent/);
});

test('Detailed finance cards, rows and responsive states are covered', () => {
  for (const selector of ['.purchase-sheet', '.card-object', '.metric', '.card-facts>div',
    '.list>.row', '.bill-list>li', '.section-pair', '.plan-totals', '.card-progress']) {
    assert.ok(css.includes(selector), 'Missing: ' + selector);
  }
  assert.match(css, /@media \(max-width:650px\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /:focus-visible/);
});

test('Parcelamento details open by default without changing finance calculations', () => {
  assert.match(app, /<details class="plan-totals" open><summary>Resumo dos parcelamentos<\/summary>/);
  execFileSync(process.execPath, ['--check', new URL('../prisma/recovered-deployment/app.js', import.meta.url).pathname], {
    stdio: 'pipe'
  });
});
