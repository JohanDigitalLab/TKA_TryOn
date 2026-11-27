import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('brand logo always uses the official Rajawali asset', () => {
  const source = read('src/components/brand-logo.js');
  assert.match(source, /public\/logo-tka-tryon\.png/);
  assert.match(source, /src=\{logo\}/);
  assert.match(source, /Logo TKA TryOn: rajawali/);
  assert.doesNotMatch(source, /Math\.random|logoIndex|logo-tka-0/);
});

test('footer and metadata retain the TKA TryOn identity', () => {
  assert.match(read('src/components/site-footer.js'), /© 2026 TKA TryOn\. All rights reserved\./);
  const layout = read('src/app/layout.js');
  assert.match(layout, /applicationName: "TKA TryOn"/);
  assert.match(layout, /default: "TKA TryOn"/);
  assert.match(layout, /<ThemeProvider>/);
  assert.match(layout, /<SpeedInsights \/>/);
});

test('source files do not reintroduce the replaced brand names', () => {
  const root = new URL('../src/', import.meta.url);
  for (const path of readdirSync(root, { recursive: true })) {
    if (!/\.(js|jsx|mjs)$/.test(path)) continue;
    const source = readFileSync(new URL(path.replaceAll('\\', '/'), root), 'utf8');
    assert.doesNotMatch(source, /TKA TryOut|TKA TRYOUT|>TryOut<|by TemanSiswa\.Com/, path);
  }
});

test('official logo and social preview assets are valid PNG images', () => {
  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  for (const path of ['public/logo-tka-tryon.png', 'public/og-image.png', 'src/app/icon.png', 'src/app/apple-icon.png']) {
    const image = readFileSync(new URL('../' + path, import.meta.url));
    assert.deepEqual(image.subarray(0, 8), pngSignature, path);
  }
});
