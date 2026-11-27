import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hasSuperAdminRole } from "../src/lib/dashboard/global-role.mjs";

function client(result) {
  return { from(table) {
    assert.equal(table, "user_global_roles");
    return { select(column) { assert.equal(column, "role"); return this; },
      eq(column, value) {
        assert.equal(value, column === "user_id" ? "actor" : "super_admin");
        return this;
      }, maybeSingle: async () => result };
  } };
}
test("superadmin uses database role rather than student account type", async () => {
  assert.equal(await hasSuperAdminRole(client({ data: { role: "super_admin" }, error: null }), "actor"), true);
});
test("missing or other role never grants superadmin navigation", async () => {
  assert.equal(await hasSuperAdminRole(client({ data: null, error: null }), "actor"), false);
  assert.equal(await hasSuperAdminRole(client({ data: { role: "operator" }, error: null }), "actor"), false);
});
test("role lookup errors fail closed", async () => {
  const error = new Error("permission denied");
  await assert.rejects(hasSuperAdminRole(client({ data: null, error }), "actor"), error);
});
test("home checks global role before profile routing and admin guard scopes override", () => {
  const home = readFileSync(new URL("../src/app/home/page.js", import.meta.url), "utf8");
  const guard = readFileSync(new URL("../src/components/portal-guard.js", import.meta.url), "utf8");
  assert(home.indexOf("await hasSuperAdminRole") < home.indexOf('.from("profiles")'));
  assert.match(home, /router\.replace\("\/admin"\)/);
  assert.match(guard, /if \(wanted\.includes\("ADMIN"\)\) \{\s*const isSuperAdmin = await hasSuperAdminRole/);
});
