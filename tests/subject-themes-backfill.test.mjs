import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const modulePath = process.env.VIRTUALPET_PGLITE_MODULE || process.env.BOSSFIGHT_PGLITE_MODULE;
test("subject themes backfill supports multiple themes, preserves existing data and is repeatable", { skip: !modulePath }, async t => {
  const { PGlite } = await import(pathToFileURL(modulePath).href);
  const db = new PGlite();
  t.after(() => db.close());
  const migration = await readFile(new URL("../docs/database/migration-backfill-subject-themes.sql", import.meta.url), "utf8");
  await db.exec(`
    CREATE TABLE subject_themes (
      topic_uid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      subject varchar(20) NOT NULL UNIQUE, theme varchar(255) NOT NULL, icon text
    );
    CREATE UNIQUE INDEX legacy_subject_index ON subject_themes(subject);
    CREATE TABLE subject_topics (subject_code varchar(20), theme varchar(255));
    INSERT INTO subject_themes(subject,theme,icon) VALUES ('mat-sd','Bilangan','existing-icon');
    INSERT INTO subject_topics VALUES
      ('mat-sd','Bilangan'),('mat-sd','Bilangan'),('mat-sd','Geometri'),
      ('ipa-sd','Energi'),('ipa-sd','Energi'),('mat-sd',' Geometri '),
      ('','Invalid'),('   ','Invalid'),(NULL,'Invalid'),('mat-sd',''),('mat-sd',NULL);
  `);
  const before = (await db.query("SELECT * FROM subject_themes")).rows[0];
  await db.exec(migration);
  await db.exec(migration);
  const rows = (await db.query("SELECT * FROM subject_themes ORDER BY subject,theme")).rows;
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.find(row => row.theme === "Bilangan"), before);
  assert.ok(rows.some(row => row.theme === " Geometri "));
  assert.equal(rows.filter(row => row.subject === "mat-sd").length, 3);
  await assert.rejects(db.exec("INSERT INTO subject_themes(subject,theme) VALUES('mat-sd','Bilangan')"), /unique/);
});
