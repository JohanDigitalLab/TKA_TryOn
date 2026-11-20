# Snapshot Parsial Schema Supabase

Tanggal snapshot: 2026-11-19  
Sumber: `Supabase Snippet Untitled query.csv` dari `information_schema.columns`  
Status: **parsial dan hanya metadata kolom yang terverifikasi**

Dokumen ini tidak menggantikan schema resmi Supabase. CSV sumber hanya memuat sebagian baris untuk banyak tabel; kolom yang tidak tercantum di CSV tetap **belum terverifikasi**, bukan dianggap tidak ada. Constraint, foreign key, index, policy, trigger, enum, view, RPC, dan isi data tidak tercakup dalam snapshot ini.

## Tabel yang relevan untuk engine CBT

### `questions`

| Posisi | Kolom | Tipe | Null | Default |
|---:|---|---|---|---|
| 1 | `id` | `uuid` | NO | `gen_random_uuid()` |
| 2 | `question_code` | `text` | NO | `null` |
| 3 | `education_level_id` | `text` | NO | `null` |
| 4 | `grade` | `smallint` | NO | `null` |
| 5 | `school_type` | `text` | YES | `null` |
| 6 | `subject_code` | `text` | YES | `null` |
| 7 | `subject_name` | `text` | NO | `null` |
| 8 | `subject_category` | `text` | NO | `'WAJIB'::text` |
| 9 | `curriculum_reference` | `text` | YES | `null` |
| 10 | `element` | `text` | YES | `null` |
| 11 | `material` | `text` | YES | `null` |
| 12 | `sub_material` | `text` | YES | `null` |
| 13 | `competency` | `text` | YES | `null` |
| 14 | `indicator` | `text` | YES | `null` |
| 15 | `cognitive_level` | `text` | YES | `null` |
| 16 | `difficulty` | `text` | YES | `null` |
| 17 | `question_structure` | `text` | NO | `'SOAL_TUNGGAL'::text` |
| 18 | `group_order` | `integer` | YES | `null` |
| 19 | `question_type` | `text` | NO | `null` |
| 20 | `question_status` | `text` | NO | `'DRAFT'::text` |
| 21 | `import_batch_id` | `uuid` | YES | `null` |
| 22 | `source_type` | `text` | NO | `'IMPORT'::text` |
| 23 | `source_reference` | `text` | YES | `null` |
| 24 | `usage_rights` | `text` | YES | `'ORISINAL'::text` |
| 25 | `created_by` | `uuid` | YES | `null` |
| 26 | `created_at` | `timestamp with time zone` | NO | `now()` |
| 27 | `updated_at` | `timestamp with time zone` | NO | `now()` |

### `question_versions`

| Posisi | Kolom | Tipe | Null | Default |
|---:|---|---|---|---|
| 1 | `id` | `uuid` | NO | `gen_random_uuid()` |
| 2 | `question_id` | `uuid` | NO | `null` |
| 3 | `version_number` | `integer` | NO | `null` |
| 4 | `stimulus_id` | `uuid` | YES | `null` |
| 5 | `instruction` | `text` | YES | `null` |
| 6 | `question_text` | `text` | NO | `null` |
| 7 | `explanation` | `text` | NO | `null` |
| 8 | `scoring_rule` | `jsonb` | NO | `'{}'::jsonb` |
| 9 | `content_hash` | `text` | YES | `null` |
| 10 | `version_status` | `text` | NO | `'DRAFT'::text` |
| 11 | `is_current` | `boolean` | NO | `true` |
| 12 | `created_by` | `uuid` | YES | `null` |
| 13 | `created_at` | `timestamp with time zone` | NO | `now()` |

### `question_options`

| Posisi | Kolom | Tipe | Null | Default |
|---:|---|---|---|---|
| 1 | `id` | `uuid` | NO | `gen_random_uuid()` |
| 2 | `question_version_id` | `uuid` | NO | `null` |
| 3 | `option_code` | `text` | NO | `null` |
| 4 | `option_text` | `text` | NO | `null` |
| 5 | `option_order` | `integer` | NO | `1` |
| 6 | `is_correct` | `boolean` | NO | `false` |
| 7 | `explanation` | `text` | YES | `null` |
| 8 | `created_at` | `timestamp with time zone` | NO | `now()` |

### `question_category_items`

| Posisi | Kolom | Tipe | Null | Default |
|---:|---|---|---|---|
| 1 | `id` | `uuid` | NO | `gen_random_uuid()` |
| 2 | `question_version_id` | `uuid` | NO | `null` |
| 3 | `item_number` | `integer` | NO | `null` |
| 4 | `item_text` | `text` | NO | `null` |
| 5 | `category_label` | `text` | NO | `null` |
| 6 | `correct_category` | `text` | NO | `null` |
| 7 | `explanation` | `text` | YES | `null` |
| 8 | `created_at` | `timestamp with time zone` | NO | `now()` |

## Tabel konfigurasi TKA

### `tka_configurations`

| Posisi | Kolom | Tipe | Null | Default |
|---:|---|---|---|---|
| 1 | `id` | `uuid` | NO | `gen_random_uuid()` |
| 2 | `tka_code` | `character varying` | NO | `null` |
| 3 | `education_level` | `character varying` | NO | `null` |
| 4 | `subject_code` | `character varying` | NO | `null` |
| 5 | `total_questions` | `integer` | NO | `null` |
| 6 | `duration_minutes` | `integer` | NO | `null` |
| 7 | `type` | `character varying` | NO | `'RANDOM'::character varying` |
| 8 | `syllabus` | `character varying` | YES | `null` |
| 9 | `is_default` | `smallint` | NO | `0` |

### `tka_question_set`

| Posisi | Kolom | Tipe | Null | Default |
|---:|---|---|---|---|
| 1 | `id` | `uuid` | NO | `gen_random_uuid()` |
| 2 | `tka_code` | `character varying` | NO | `null` |
| 3 | `question_code` | `character varying` | NO | `null` |

### `tka_question_config`

| Posisi | Kolom | Tipe | Null | Default |
|---:|---|---|---|---|
| 1 | `id` | `uuid` | NO | `gen_random_uuid()` |
| 2 | `tka_code` | `character varying` | NO | `null` |
| 3 | `theme` | `character varying` | NO | `null` |
| 4 | `topic` | `character varying` | NO | `null` |
| 5 | `no_of_questions` | `integer` | NO | `1` |

## Tabel attempt yang terverifikasi sebagian

### `exam_attempts`

| Posisi | Kolom | Tipe | Null | Default |
|---:|---|---|---|---|
| 1 | `id` | `uuid` | NO | `gen_random_uuid()` |
| 2 | `user_id` | `uuid` | NO | `null` |
| 3 | `education_level` | `text` | NO | `null` |
| 4 | `grade` | `integer` | NO | `null` |
| 5 | `subject_name` | `text` | NO | `null` |
| 6 | `attempt_status` | `text` | NO | `'IN_PROGRESS'::text` |
| 7 | `duration_minutes` | `integer` | NO | `60` |
| 8 | `total_questions` | `integer` | NO | `0` |
| 9 | `correct_answers` | `integer` | YES | `null` |
| 10 | `score` | `numeric` | YES | `null` |
| 11 | `started_at` | `timestamp with time zone` | NO | `now()` |
| 12 | `submitted_at` | `timestamp with time zone` | YES | `null` |
| 13 | `created_at` | `timestamp with time zone` | NO | `now()` |
| 14 | `attempt_type` | `character varying` | NO | `null` |
| 15 | `tka_code` | `character varying` | YES | `null` |
| 16 | `deadline_at` | `timestamp with time zone` | YES | `null` |

### `exam_attempt_questions`

| Posisi | Kolom | Tipe | Null | Default |
|---:|---|---|---|---|
| 1 | `id` | `uuid` | NO | `gen_random_uuid()` |
| 2 | `attempt_id` | `uuid` | NO | `null` |
| 3 | `question_id` | `uuid` | NO | `null` |
| 4 | `question_version_id` | `uuid` | NO | `null` |
| 5 | `question_order` | `integer` | NO | `null` |
| 6 | `created_at` | `timestamp with time zone` | NO | `now()` |

## Informasi project yang diperbarui

- `tka_question_set.question_code` dapat dipetakan ke `questions.question_code` berdasarkan nama kolom yang sama.
- Fallback soal tambahan dapat menggunakan `questions.subject_code`, sedangkan label dapat menggunakan `questions.subject_name`.
- Kontrak migration tryout memilih nomor versi terbesar di antara versi PUBLISHED, tanpa mensyaratkan flag current; draft yang lebih baru tidak menggantikan versi published. Ini keputusan implementasi pending, bukan hasil verifikasi RPC live.
- Kolom klasifikasi theme/topic pada questions ditambahkan nullable, masing-masing varchar(255), oleh [migration tryout pending](migration-start-tka-tryout.sql). Keduanya tidak ada pada snapshot CSV ini dan tidak diisi otomatis dari element/material. Lihat [panduan deployment](TKA_TRYOUT.md).
- Relasi yang terlihat dari nama kolom: `question_versions.question_id -> questions.id`, `question_options.question_version_id -> question_versions.id`, `question_category_items.question_version_id -> question_versions.id`, dan `exam_attempt_questions.question_version_id -> question_versions.id`.

## Batasan snapshot

- CSV tidak memuat seluruh baris untuk semua tabel; beberapa posisi ordinal hilang dari hasil ekspor.
- Tidak ada data contoh baris, foreign key, constraint, index, RLS policy, trigger, atau definisi RPC di dalam CSV.
- File CSV mentah disimpan sebagai [`supabase-information-schema-columns-partial.csv`](supabase-information-schema-columns-partial.csv:1) untuk audit dan pembandingan berikutnya.
- Migration lama tidak diubah otomatis karena metadata CSV adalah observasi schema produksi, sedangkan migration adalah histori perubahan dan dapat sengaja berbeda.
