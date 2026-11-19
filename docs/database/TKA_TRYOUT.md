# TKA tryout — migration pending

Status: **implemented in repository, NOT applied or live-verified**. Exported column metadata is not proof of deployed RPCs, constraints, or grants.

## Deployment

Review and apply [migration-start-tka-tryout.sql](migration-start-tka-tryout.sql) in staging first. Prerequisites: existing CBT tables/save/submit/review engine, TKA configuration tables, subject catalog, profile education level, active-account helper from stage 4, and learning-access policy from stage 9. The migration uses the observed nullable TKA code/deadline fields, not the historical configuration UID field. The attempt type is TRYOUT (fits the historical ten-character field).

The migration adds nullable theme/topic classifications (255 characters each). **No automatic copying from element/material**; classify questions explicitly through a separately approved workflow. Until classified, RANDOM quotas can miss and the subject/level fallback supplies questions.

Latest published means highest version number among PUBLISHED versions, regardless of current-version flag or a newer draft. RANDOM quotas match the new independent classifications; SET joins question codes. Both cap at target, exclude duplicates, and fill shortages from published questions of the same subject, grade and level. Insufficient inventory produces a smaller attempt with its actual count; zero inventory raises an error. Global configuration is never rewritten.

## Resume and access

The complete deployed resume body is absent from repository scripts/migrations; the audit only describes it. Deployment moves it once into a private legacy function, revokes direct client execution, and installs a public ownership-checking dispatcher. Non-TKA attempts delegate unchanged; TKA attempts use an explicit allowlist loader, reading persisted version IDs rather than selecting again. Inspect deployed function dependencies/grants in staging before production deployment, including any callers retaining the original function OID. Standard PL/pgSQL callers resolve the public dispatcher.

Start serializes by the existing learning-user advisory lock plus user/TKA lock. An unexpired same-user/config attempt is returned before entitlement rechecking; active verified account and matching profile level are still required. New starts consult installed learning-access context: unrestricted or subscribed is accepted. This migration targets stage 9; it deliberately does not implement the retired trial consumption scheme. An older installation fails closed for unsubscribed starts. Expired subject attempts become EXPIRED. Another active subject session is rejected rather than incorrectly resumed or invalidating its history; the legacy one-active-subject index is retained.

The allowlisted CBT response contains ordered questions, nested options/category items, saved answers and server remaining seconds; it excludes correctness flags, category keys and explanations. Save/submit/review functions are unchanged. An expired resume returns zero remaining seconds to permit the existing CBT auto-submit behavior.

The [tryout page](../../src/app/student/tryout/page.js) calls start asynchronously, guards double clicks, displays errors and navigates with the server attempt ID. The [challenge page](../../src/app/student/challenge/page.js) already resumes by this ID. No local configuration is needed and exercise/assignment entry paths are unchanged.

## Validation

Run the local source-contract tests with the project's test command. Run [database integration tests](../../tests/database/tka-tryout.sql) only against disposable staging after deployment; they roll back all changes and require two verified active profiles plus published inventory. They check fallback shortages/cap, duplicate SET mappings, latest published snapshots, answer restoration, expiry, ownership, anonymous denial and grants. Source tests are not SQL execution or proof of concurrency correctness.

Additional staging checks: run two simultaneous authenticated starts for the same idle user/TKA and confirm identical attempt IDs and exactly one new attempt. Test matching RANDOM classification quotas, a published version followed by a newer draft, empty inventory, level mismatch, save/submit/review for all three question types, and an unexpired different-config subject session. Verify legacy exercise and assignment start/resume still work. These integration/concurrency checks must pass before production rollout.

### Local validation — 2026-11-19

- Full project lint: passed; whitespace diff check: passed.
- Targeted tryout and CBT helper tests: 8 passed, 0 failed.
- Full suite: 92 passed, 3 failed outside changed implementation: subscription contact expectation, registration subscription-link expectation, and missing login page fixture. Those unrelated files were not changed for this task.
- Production build: blocked by missing local document-processing dependencies (mammoth, pdf-parse, tesseract.js).
- Database migration, SQL integration tests and concurrent-session verification: **not executed**. No live database changes were made.
