import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const modulePath = process.env.MAPADVENTURE_PGLITE_MODULE || process.env.BOSSFIGHT_PGLITE_MODULE;
test("map adventure logs migration enforces requested columns, node types and access", { skip: !modulePath }, async t => {
  const { PGlite } = await import(pathToFileURL(modulePath).href);
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec("CREATE ROLE anon; CREATE ROLE authenticated;");
  const sql = await readFile(new URL("../docs/database/migration-create-map-adventure-logs.sql", import.meta.url), "utf8");
  await db.exec(sql);
  await db.exec(sql);
  const columns = (await db.query("SELECT column_name,is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='map_adventure_logs' ORDER BY ordinal_position")).rows;
  assert.deepEqual(columns.map(column => column.column_name), ["id", "user_id", "topic_attempt_id", "node_type", "exam_attempt_id", "stars"]);
  assert.ok(columns.every(column => column.is_nullable === "NO"));
  const insert = "INSERT INTO map_adventure_logs(user_id,topic_attempt_id,node_type,exam_attempt_id) VALUES(gen_random_uuid(),gen_random_uuid(),$1,gen_random_uuid()) RETURNING id";
  for (const type of ["PRACTICE", "SIDEQUEST", "GATEKEEPER"]) {
    assert.match((await db.query(insert, [type])).rows[0].id, /^[0-9a-f-]{36}$/);
  }
  await assert.rejects(db.query(insert, ["MATERIAL"]), /check constraint/);
  await assert.rejects(db.query(insert, [null]), /not-null constraint/);
  await assert.rejects(db.exec("INSERT INTO map_adventure_logs SELECT * FROM map_adventure_logs LIMIT 1"), /unique constraint/);
  assert.equal((await db.query("SELECT relrowsecurity FROM pg_class WHERE oid='public.map_adventure_logs'::regclass")).rows[0].relrowsecurity, true);
  const starsMigration = await readFile(new URL("../docs/database/migration-add-map-adventure-logs-stars.sql", import.meta.url), "utf8");
  await db.exec(starsMigration);
  await db.exec(starsMigration);
  assert.ok((await db.query("SELECT stars FROM map_adventure_logs")).rows.every(row => row.stars === 0));
  const column = (await db.query("SELECT data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='map_adventure_logs' AND column_name='stars'")).rows[0];
  assert.equal(column.data_type, "integer");
  assert.equal(column.is_nullable, "NO");
  assert.equal(column.column_default, "0");
  const id = (await db.query(insert, ["PRACTICE"])).rows[0].id;
  assert.equal((await db.query("SELECT stars FROM map_adventure_logs WHERE id=$1", [id])).rows[0].stars, 0);
  await db.query("UPDATE map_adventure_logs SET stars=3 WHERE id=$1", [id]);
  await db.exec(starsMigration);
  assert.equal((await db.query("SELECT stars FROM map_adventure_logs WHERE id=$1", [id])).rows[0].stars, 3);
  await assert.rejects(db.query("UPDATE map_adventure_logs SET stars=NULL WHERE id=$1", [id]), /not-null constraint/);
  await db.exec("SET ROLE authenticated");
  await assert.rejects(db.query("SELECT * FROM map_adventure_logs"), /permission denied/);
});

test("manual log migrations preserve earlier draft rows and stars on redeploy", { skip: !modulePath }, async t => {
  const { PGlite } = await import(pathToFileURL(modulePath).href);
  const db = new PGlite(); t.after(() => db.close());
  await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE TABLE map_adventure_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,map_topic_id uuid NOT NULL,node_type text NOT NULL,exam_attempt_id uuid NOT NULL,stars integer NOT NULL DEFAULT 0); INSERT INTO map_adventure_logs(user_id,map_topic_id,node_type,exam_attempt_id,stars) VALUES(gen_random_uuid(),gen_random_uuid(),'PRACTICE',gen_random_uuid(),3)");
  const before=(await db.query("SELECT id,map_topic_id,stars FROM map_adventure_logs")).rows[0];
  for (let run=0; run<2; run++) for (const name of ["migration-create-map-adventure-logs.sql", "migration-add-map-adventure-logs-stars.sql"]) {
    await db.exec(await readFile(new URL(`../docs/database/${name}`, import.meta.url), "utf8"));
  }
  assert.deepEqual((await db.query("SELECT id,topic_attempt_id,stars FROM map_adventure_logs")).rows,[{id:before.id,topic_attempt_id:before.map_topic_id,stars:3}]);
});
