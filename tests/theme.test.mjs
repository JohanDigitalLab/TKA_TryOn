import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import { resolveTheme, THEME_STORAGE_KEY, themeInitScript } from "../src/lib/theme.mjs";

for (const systemDark of [true, false]) {
  for (const preference of [null, undefined, "invalid", "light", "dark"]) {
    test(`theme resolution: ${preference}, system dark ${systemDark}`, () => {
      assert.equal(resolveTheme(preference, systemDark), ["light", "dark"].includes(preference) ? preference : systemDark ? "dark" : "light");
    });
  }
}

for (const stored of [null, "light", "dark", "invalid", "blocked"]) {
  test(`pre-paint script: ${stored}`, () => {
    const root = { dataset: {}, style: {} };
    vm.runInNewContext(themeInitScript, {
      document: { documentElement: root },
      localStorage: { getItem(key) { assert.equal(key, THEME_STORAGE_KEY); if (stored === "blocked") throw new Error("blocked"); return stored; } },
      matchMedia: () => ({ matches: true }),
    });
    const expected = stored === "light" ? "light" : "dark";
    assert.equal(root.dataset.theme, expected);
    assert.equal(root.style.colorScheme, expected);
  });
}

test("theme is initialized before the body and isolated from authentication", () => {
  const layout = fs.readFileSync(new URL("../src/app/layout.js", import.meta.url), "utf8");
  assert.ok(layout.indexOf("themeInitScript }}") < layout.indexOf("<body"));
  assert.match(layout, /<html[\s\S]*?suppressHydrationWarning/);
  const toggle = fs.readFileSync(new URL("../src/components/theme-toggle.js", import.meta.url), "utf8");
  assert.doesNotMatch(toggle, /supabase|auth\.|location\.reload/);
  assert.match(toggle, /localStorage.setItem\(THEME_STORAGE_KEY, theme\)/);
});

test("all application colors use centralized tokens, excluding neutral overlays", () => {
  function walk(url) {
    for (const entry of fs.readdirSync(url, { withFileTypes: true })) {
      const child = new URL(entry.name + (entry.isDirectory() ? "/" : ""), url);
      if (entry.isDirectory()) walk(child);
      else if (entry.name.endsWith(".js")) {
        const source = fs.readFileSync(child, "utf8");
        assert.doesNotMatch(source, /#[0-9a-fA-F]{3,8}\b/, child.pathname);
        assert.doesNotMatch(source, /\b(?:bg|text|border(?:-[trblxy])?|ring|from|to|fill|stroke)-(?:blue|slate|indigo|red|green|emerald|amber|violet|rose)-\d/, child.pathname);
      }
    }
  }
  walk(new URL("../src/", import.meta.url));
});
