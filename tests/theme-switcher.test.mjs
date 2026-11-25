import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('ThemeProvider persists one shared session theme and mirrors it onto html.dark', () => {
  const provider = read('src/components/theme-provider.js');
  assert.match(provider, /sessionStorage\.getItem\("tka-theme"\)/);
  assert.match(provider, /sessionStorage\.setItem\("tka-theme", next\)/);
  assert.match(provider, /classList\.toggle\("dark", next === "dark"\)/);
  assert.match(provider, /dataset\.tkaTheme = next/);
});

test('avatar submenu items share icons for Profil, theme, and Keluar', () => {
  const header = read('src/components/portal-header.js');
  assert.match(header, /import \{ LogOut, Moon, Sun, UserRound \} from "lucide-react"/);
  assert.match(header, /<UserRound size=\{16\} aria-hidden="true" \/>/);
  assert.match(header, /<LogOut size=\{16\} aria-hidden="true" \/>/);
  assert.match(header, /<(Sun|Moon) size=\{16\} aria-hidden="true" \/>/);
});

test('portal header offers exactly one theme menu item that follows the active mode', () => {
  const header = read('src/components/portal-header.js');
  assert.match(header, /import \{ useTheme \} from "@\/components\/theme-provider"/);
  assert.match(header, /const \{ theme, toggleTheme \} = useTheme\(\)/);
  assert.match(header, /\{darkActive \? "Mode Terang" : "Mode Gelap"\}/);
  assert.equal((header.match(/Mode Terang/g) || []).length, 1, 'only one light-mode label may exist');
  assert.equal((header.match(/Mode Gelap/g) || []).length, 1, 'only one dark-mode label may exist');
  assert.match(header, /onClick=\{\(\) => \{\s*toggleTheme\(\);\s*setMenuOpen\(false\);/);
});

test('game scope breadcrumbs reuse the shared portal dark palette', () => {
  const css = read('src/app/globals.css');
  assert.match(css, /html\.dark :is\(\.fightboss-scope, \.virtualpet-scope, \.mapadventure-scope\) nav\[aria-label="Breadcrumb"\] \{ color: #a9b7c9/);
  assert.match(css, /html\.dark :is\(\.fightboss-scope, \.virtualpet-scope, \.mapadventure-scope\) nav\[aria-label="Breadcrumb"\] a \{ color: #93c5fd/);
  assert.match(css, /html\.dark :is\(\.fightboss-scope, \.virtualpet-scope, \.mapadventure-scope\) nav\[aria-label="Breadcrumb"\] \[aria-current="page"\] \{ color: #e2e8f0/);
});

test('dark: utilities activate for both the shared html theme and each game scope', () => {
  const css = read('src/app/globals.css');
  assert.match(css, /@custom-variant dark \(&:where\(\.fightboss-scope\.dark[^;]*html\.dark \*\)\)/);
  assert.match(css, /html\.dark body \{ background: #0b1220/);
  assert.match(css, /html\.dark :not\(:is\(\.fightboss-scope, \.virtualpet-scope, \.mapadventure-scope\) \*\)\.bg-white \{ background-color: #101b2d/);
});

test('games share the session theme instead of private localStorage switches', () => {
  const games = {
    'src/components/student/fightboss/BossFightArena.jsx': 'fightboss-scope',
    'src/components/student/virtualpet/VirtualPetRoom.jsx': 'virtualpet-scope',
    'src/components/student/mapadventure/MapAdventure.jsx': 'mapadventure-scope',
  };
  for (const [path, scope] of Object.entries(games)) {
    const source = read(path);
    assert.match(source, /import \{ useTheme \} from "@\/components\/theme-provider"/, path);
    assert.match(source, /const \{ theme, toggleTheme \} = useTheme\(\)/, path);
    assert.match(source, new RegExp(`${scope}.*dark|dark.*${scope}`, 's'), path);
    assert.doesNotMatch(source, /setDark|setTheme\(|localStorage\.(get|set)Item\([^)]*theme/i, `${path} must not keep a private theme store`);
  }
});

test('the CBT header carries the same shared theme switcher', () => {
  const challenge = read('src/app/student/challenge/page.js');
  assert.match(challenge, /import \{ useTheme \} from "@\/components\/theme-provider"/);
  assert.match(challenge, /const \{ theme, toggleTheme \} = useTheme\(\)/);
  assert.match(challenge, /aria-label=\{theme === "dark" \? "Mode Terang" : "Mode Gelap"\}/);
});
