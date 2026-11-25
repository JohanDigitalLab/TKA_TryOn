# MapAdventure: deployment dan kontrak integrasi

## Penyempurnaan timer dan review — 2026-11-25

Timer soal ditampilkan sebagai bar menyusut dengan hitungan waktu aksesibel. SecondChance disembunyikan sebelum jawaban dikunci dan hanya ditampilkan untuk salah/timeout yang belum menggunakan alat ini. SQL kini mendukung pembukaan timeout sekali; jika deadline sudah lewat, server memberikan durasi soal baru dari snapshot, sedangkan jawaban salah dengan waktu tersisa mempertahankan deadline. Perilaku timeout ini membutuhkan penerapan ulang migrasi kanonis secara manual, belum diterapkan live.

Tombol hasil rata kanan pada desktop dan full width pada HP. Header modal review disembunyikan; tombol Kembali ke hasil berada di bawah, rata kanan pada desktop dan full width pada HP. Regresi database/popup/navigasi: 51 tes lulus, termasuk timeout dibuka ulang dan pengiriman jawaban baru. Lint berkas terkait dan pemeriksaan whitespace lulus; belum validasi visual browser.

## Koreksi konflik indeks sesi aktif — 2026-11-25

Error live SideQuest terkonfirmasi berkode 23505 pada indeks `uq_exam_attempts_active_user_grade_subject`. Indeks legacy ini membatasi sesi lintas tahap pada mapel yang sama. Migrasi kanonis kini mempertahankan kunci dan predikat indeks terpasang, dengan pengecualian hanya untuk MAPADVENTURE; batas aplikasi ujian lain tetap berlaku. Indeks unik privat per siswa/node/tahap tetap melindungi MapAdventure. Tidak ada attempt atau jawaban yang dihapus.

**Penerapan manual diperlukan:** jalankan ulang seluruh [migrasi MapAdventure](database/migration-mapadventure.sql) sebagai owner, setelah backup dan validasi staging. Restart aplikasi saja tidak memperbaiki indeks database. Perubahan ini belum diterapkan live. Fixture regresi kini memasang indeks legacy sebelum migrasi dan menjalankan migrasi dua kali.

## Validasi popup soal dan kedua kesempatan — 2026-11-25

- Body popup soal kini memakai padding horizontal 20px (mobile) dan 28px (desktop), padding atas 4px, lewat properti `bodyClass` pada `Modal` khusus Quiz; popup lain tetap seperti semula.
- Tombol **Kirim Jawaban/Jawab** di kiri; kanan berisi **Sebelumnya** dan **Sesudahnya**. Pada soal terakhir, **Sesudahnya** digantikan tombol **Selesaikan sesi** (mobile: **Selesaikan**) yang tetap butuh seluruh soal terjawab (`allHandled`).
- Tool **Clue** hanya ditampilkan bila proyeksi server `question.has_clue` bernilai true (boolean baru di `private.mapadventure_state`, tanpa membocorkan isi clue).
- **SecondChance kini dapat dipakai setelah jawaban salah terkunci** (non-timeout): RPC menghapus record jawaban salah pada slot itu (termasuk baris `exam_attempt_answers`), menyimpannya sebagai `first_answer` privat, mengosongkan feedback, lalu membuka slot untuk jawaban baru; jawaban benar dan timeout tetap beku. Guard exam kini mengizinkan DELETE hanya pada `exam_attempt_answers` selama fase `writing_results` RPC.
- Jalankan ulang seluruh migrasi kanonis MapAdventure agar `has_clue` dan perilaku secondchance aktif; sesi lama tetap kompatibel. Tes: suite MapAdventure database 33 subtest lulus; regresi proyek 330 tes (329 lulus, 1 dilewati).

## Validasi koreksi sesi per node/tahap — 2026-11-25

- Implementasi SQL, backend, dan UI sudah diselaraskan: tidak ada sesi aktif global, kedaluwarsa attempt, atau submit otomatis. Sesi unfinished unik per pengguna/node/tahap; hanya soal yang pernah dibuka mempunyai deadline. Soal belum dijawab yang ditinggalkan tetap mengikuti deadline aslinya, lalu dicatat timeout sekali saat dibaca/ditindaklanjuti kembali. Soal yang belum pernah dibuka tidak ikut habis selama feedback/review.
- Pemuatan percobaan selesai yang ditargetkan mengembalikan hasil beku, bukan membuat sesi baru; ini juga memulihkan respons finish yang hilang tanpa log/hadiah tambahan.
- Pengujian MapAdventure: **94 lulus, 0 gagal, 0 dilewati**, termasuk migrasi log aktual ([bukti](../mapadventure-node-stage-tests.log)). Regresi seluruh proyek dengan loader PGlite BossFight/MapAdventure: **320 lulus, 0 gagal, 1 dilewati** ([bukti](../mapadventure-node-stage-regression.log)).
- Suite database subject-session opsional juga dicoba dengan loader eksplisit: dua subtest gagal (ditambah status induk gagal) pada ekspektasi konflik game legacy dan urutan penolakan ownership BossFight; berkas implementasinya tidak diubah dalam pekerjaan ini. Bukti terpisah: [regresi opsional](../mapadventure-node-stage-optional-subject-regression.log). Jangan menganggap run default sebagai kelulusan suite opsional tersebut.
- Lint seluruh proyek dan build produksi berhasil ([lint](../mapadventure-node-stage-lint.log), [build](../mapadventure-node-stage-build.log)). Pengujian database hanya disposable PGlite; belum browser E2E atau stress race PostgreSQL multi-koneksi.
- **SQL belum diterapkan live.** Terapkan seluruh migrasi kanonis secara manual mengikuti urutan dependensi di bawah, lalu rollout aplikasi. Penggantian indeks global hanya untuk definisi historis yang dikenal, tanpa menghapus sesi. Definisi indeks tak terduga atau duplikasi harus direkonsiliasi operator, bukan dihapus otomatis. Perubahan lokal sebelumnya dipertahankan; tidak ada commit atau penghentian server pengembangan.

## Batas pekerjaan

Integrasi MapAdventure TKA_TryOn mencakup [migrasi SQL](database/migration-mapadventure.sql), [guard exam generik kanonik](database/migration_generic_exam_attempt.sql), [server actions](../src/app/actions/mapadventure.js), [validasi dan proyeksi respons server](../src/lib/server/mapadventure.js), [session bridge](../src/app/api/mapadventure/session/route.js), [client](../src/lib/student/mapadventure-client.js), [hook](../src/components/student/mapadventure/useMapAdventure.js), dan [UI](../src/components/student/mapadventure/MapAdventure.jsx). Pengujian mencakup database, actions, dan client. Tidak ada deployment live atau commit.

## Deployment manual

1. Backup database dan audit schema aktual di staging. Jangan menjalankan berkas ini otomatis terhadap production.
2. Pastikan schema autentikasi/profil/exam dari [stage 1](database/migration-stage-1.sql), kolom akun aktif, deadline exam, katalog subjects/subject_topics, dan [fondasi gamifikasi](database/migration-gamification-foundation.sql) sudah ada. Katalog subject harus memiliki kode, nama, jenjang, dan flag aktif. Bank wajib memiliki [kolom theme/topic](database/migration-start-tka-tryout.sql:3), sebagaimana dipakai [exercise terkini](database/migration-start-student-exercise.sql:234); schema lama yang hanya memiliki material/sub_material harus dimigrasikan dan kontennya direkonsiliasi operator terlebih dahulu, bukan diberi fallback diam-diam.
3. Pasang [BossFight](database/migration-bossfight.sql) dan [VirtualPet](database/migration-virtualpet.sql), termasuk private schema dan snapshot grader VirtualPet. Backend ini memakai grader snapshot privat tersebut, bukan query jawaban ke bank saat submit.
4. **Manual saja**, sebagai owner melalui SQL Editor: jalankan [pembuatan log](database/migration-create-map-adventure-logs.sql), kemudian [penambahan bintang log](database/migration-add-map-adventure-logs-stars.sql), baru seluruh [migrasi MapAdventure](database/migration-mapadventure.sql). Urutan ini wajib, termasuk upgrade instalasi lama; dependensi hilang menggagalkan transaksi. Jangan menyalin potongan parsial. Semua migrasi dapat dijalankan ulang tanpa mereset data. Draft lama dengan kolom map_topic_id akan di-rename ke topic_attempt_id, bukan menghapus baris. Duplikasi exam_attempt_id pada log lama menggagalkan pembuatan indeks unik: operator harus merekonsiliasi, tidak ada penghapusan audit otomatis.
5. Jalankan ulang seluruh [migrasi RPC exam generik](database/migration_generic_exam_attempt.sql). Tiga body asli diedit inline, tanpa rename/wrapper. Guard membership MapAdventure opsional sebelum tabel privat terpasang, sehingga tidak merusak deployment fitur lama.
6. Verifikasi akses dengan role authenticated dan JWT STUDENT yang aktif/terkonfirmasi. Jangan memakai service-role sebagai identitas siswa. Uji bootstrap, materi, soal, pembelian, dan replay di staging.
7. Deploy aplikasi bersama perubahan SQL. UI sudah terhubung: browser memperbarui cookie sesi melalui session bridge same-origin, lalu memanggil server actions yang memverifikasi identitas dan menjalankan RPC kanonis. Tidak ada write tabel atau RPC exam generik langsung dari browser MapAdventure.

### Preflight dan data lama

- **Upgrade kontrak sesi wajib menjalankan ulang seluruh [migrasi kanonis MapAdventure](database/migration-mapadventure.sql:97)**, bukan hanya deploy aplikasi atau menyalin fungsi. Migrasi mengganti hanya indeks global lama dengan nama dan definisi historis yang dikenal, lalu membuat indeks unik parsial per siswa/node/stage. Sesi unfinished, exam, pointer, pool, jawaban dan ledger tidak dihapus. Nama indeks lama dengan definisi tak dikenal ditolak untuk review operator; duplikasi sesi pada kombinasi baru juga harus direkonsiliasi operator, bukan dibersihkan otomatis. Jangan menjalankan DROP/DELETE manual untuk memaksa rollout.
- Kolom cursor/ledger baru kompatibel dengan sesi lama: deployment tidak memulai clock. Akses pertama mengadopsi deadline/efek lama dan melengkapi estimasi snapshot yang belum ada; akses berikutnya mempertahankan nilai tersimpan. Uji staging harus mencakup sesi unfinished sebelum upgrade dan dua kali rerun migrasi, tanpa reset data.

- Fondasi progres awal tidak mempunyai jenjang, relasi katalog, urutan topik, bintang per stage, atau reward peti. Migrasi menambah kolom tersebut secara eksplisit, tidak mengganti tabel lama.
- Progres lama dipetakan dari identitas siswa, jenjang profil, nama subject, kode subject yang otoritatif, dan kecocokan tepat tema/topik katalog. Baris yang tidak dapat dipetakan, duplikasi identitas progres/settings, atau katalog ambigu menggagalkan deployment. Operator harus menyelesaikan konflik, bukan menghapus progres atau memilih baris acak.
- Tidak ada pengurangan maupun reset status, attempt lama, poin, bintang, XP, inventori, atau reward. Bintang stage lama tetap 0 bila belum pernah dicatat; migrasi tidak mengarang reward historis dan tidak membayar ulang stage COMPLETED. Ambang baru berlaku ketika sesi diselesaikan; hasil final lama tetap immutable dan tidak dibayar ulang.
- Kontrak kanonis hanya SHOW_TIPS dan tip. Migrasi memperbaiki baris typo SHOW_TIPS1 hanya pada group MAPADVENTURE, mempertahankan nilainya bila SHOW_TIPS belum ada; bila keduanya ada, SHOW_TIPS menang, lalu baris typo dibuang. Group fitur lain tidak disentuh. Request memakai key typo ditolak; respons tidak mengekspornya.
- Wallet baru minimal: satu UUID user sebagai primary key dan saldo points integer wajib nonnegatif. Tidak ada coins. Wallet yang sudah ada dengan struktur berbeda ditolak eksplisit, termasuk kolom tambahan; lakukan migrasi/review operator tersendiri sebelum melanjutkan.
- Saldo status yang sudah ada dibackfill ke wallet, dan wallet yang belum punya status dibackfill ke status. Jika keduanya sudah ada dan tidak cocok, transaksi gagal. Semua gain/spend MapAdventure selanjutnya memperbarui kedua saldo atomik.
- Data katalog tidak dimock atau diseed oleh migrasi. Operator harus menyediakan materi dan soal published yang memadai. UI memvalidasi URL absolut HTTP(S) tanpa kredensial, merender teks sebagai teks, PDF dalam iframe sandbox tanpa referrer, dan tautan baru dengan noopener/noreferrer; tidak merender HTML mentah.
- Penambahan katalog baru ditambahkan ke akhir urutan yang sudah tersimpan. Tema/topik awal diurutkan alfabetis, lalu UUID sebagai tie-breaker. Katalog tidak menyediakan urutan eksplisit. Jangan mengganti nama tema/topik atau menambah topik ke tema COMPLETED tanpa migrasi konten/progres operator; tidak ada reset otomatis atas tema yang sudah selesai.

## Identitas dan keamanan

RPC tunggal: **public.mapadventure(p_action text, p_payload jsonb default '{}') → jsonb**.

- Identitas hanya auth.uid(). Profil wajib STUDENT aktif, email terkonfirmasi, tidak dihapus/diblokir. Jenjang hanya dari profil, dinormalisasi sd/smp/sma.
- Nama subject tersimpan pada settings; kode subject dipilih tepat dari subjects berdasarkan nama + jenjang profil + aktif. Tidak menebak suffix kode. Pasangan nama/jenjang ambigu ditolak saat migrasi.
- Semua aksi mengambil advisory transaction lock per siswa sebelum row lock. Sesi unfinished unik per **siswa + node + stage**, bukan global: sidequest dan gatekeeper satu node, maupun kuis node lain, dapat berlangsung bersamaan. Pergantian mapel tidak membatalkan sesi; kembali ke mapel asal untuk melanjutkannya. Pengubahan jenjang oleh operator memerlukan pemulihan operator; tidak ada API membatalkan sesi untuk reroll bank.
- Payload harus object maksimum 64 KiB, hanya field yang tercantum. Field skor, reward, userId, usedTools, tier otoritatif, kunci jawaban, dan field tambahan ditolak. UUID tidak valid ditolak PostgreSQL. Kesalahan membatalkan seluruh perubahan pada request itu.
- Semua tabel progres, inventori, wallet dan sesi privat ditutup untuk anon/authenticated, RLS diaktifkan. Helper privat tidak executable oleh client. RPC SECURITY DEFINER menggunakan search_path pg_catalog.
- Membership sesi privat menjaga exam_attempts, exam_attempt_questions, dan exam_attempt_answers dari write langsung, penggantian tag aplikasi, perpindahan membership lama/baru, delete, dan INSERT palsu. Authorization write memakai flag privat yang hanya dibuka selama transaksi RPC; tidak memakai setting/GUC client.
- Tiga RPC exam generik menolak membership MapAdventure, termasuk attempt selesai. Browser tidak boleh memanggil endpoint review/resume generik untuk sesi ini.
- Snapshot kunci, clue tersembunyi, record jawaban pertama secondchance, serta pool penuh disimpan privat. Soal aktif tidak memuat kunci/pembahasan, dan clue hanya muncul sesudah alat dipakai. Feedback per jawaban mengembalikan boolean benar/salah dari grader server, bukan kunci. Kunci beku, jawaban final dan pembahasan snapshot (bila tersedia) baru diekspor melalui review hasil final milik siswa tersebut; first_answer tetap privat.
- Owner database/service-role tetap trusted administrator; guard bukan perlindungan terhadap owner yang mengubah fungsi/tabel privat.

## State respons umum

Semua aksi berhasil mengembalikan state otoritatif terbaru dengan bentuk berikut. Field tambahan per aksi dijelaskan pada tabel berikutnya.

| Field | Isi |
|---|---|
| settings | SHOW_TIPS string '1' atau '0'; SUBJECT string nama mapel. Dibuat jika hilang: '1' dan 'Matematika', group MAPADVENTURE. Tidak menimpa preferensi lama. |
| education_level, subject_code | Jenjang profil dan kode subject terpilih. |
| subjects | Daftar mapel aktif jenjang siswa, setiap item name dan subject_code. |
| islands | Baris progres tema milik siswa/subject/jenjang terpilih, terurut order_number dan id. |
| nodes | Baris progres topik, terurut tema lalu topik; id adalah nodeId API, theme_id menghubungkan island, subject_topic_id menghubungkan katalog. Setiap baris mempunyai status dan bintang stage. |
| status | points dan stars global MapAdventure untuk siswa, tidak dipisah per subject. |
| wallet | points; selalu sama dengan status.points pada operasi saldo yang sukses. |
| inventory | clue, freezetime, fiftyfifty, skipreplace, secondchance; semua integer >= 0. Awal 0. |
| profile_xp | XP profil dari database. |
| tip | Satu tip MAPADVENTURE aktif acak berupa id/message jika SHOW_TIPS='1'; null jika dimatikan atau tidak ada tip. |
| session | null bila tidak memilih attempt; sesi terpilih berisi attempt_id, nodeId, stage, index 0-based, total, answered, question saat ini, answer_payload tersimpan atau null, tools, effects, feedback, deadline_at, server_now, remaining_seconds. Question tetap soal pada cursor, termasuk ketika feedback muncul atau semua slot sudah dijawab. Feedback final berisi question_id/accepted/retry/correct/is_timeout. Practice tidak bertimer. Sesi unfinished tetap tersedia sampai finish eksplisit. |
| sessions | Descriptor seluruh sesi unfinished milik siswa, termasuk mapel lain: attempt_id, nodeId, stage, subject_code, theme_id, index, total, answered. Tidak mengandung pool, kunci, efek privat, atau soal lengkap; daftar ini tidak memilih sesi atau memulai clock. |

Question saat ini berisi id, version, type, text, instruction, stimulus, options, category_items, difficulty, estimate_minutes, subject_code, education_level, theme, topic. Options hanya option_code/option_text. Category items hanya item_number/item_text/category_label. Tidak ada is_correct/correct_category/answer_keys pada respons.

Daftar tools pada sesi dan hasil adalah ledger objek tool/question_id/question_index. Indeks slot mencegah penggunaan ulang alat melalui replacement. Effects berlaku hanya pada soal saat ini, dan dapat memuat clue, eliminated (kode opsi), secondchance, retried. First answer hanya ada pada storage privat, bukan respons effects.

## Kontrak aksi persis

Nama field case-sensitive: nodeId/readToken/islandId/chestTier menggunakan camelCase; attempt_id/question_id/answer_payload menggunakan snake_case. Field wajib tidak boleh dihilangkan. Tidak ada parameter userId.

| p_action | p_payload yang diterima | Perilaku / tambahan respons |
|---|---|---|
| bootstrap | object kosong atau attempt_id: UUID | Buat state dasar/progres yang hilang. Object kosong mengembalikan session null dan sessions descriptors, tanpa memilih/menjalankan timer sesi mana pun. Dengan attempt_id, validasi owner + mapel/jenjang aktif, pilih sesi tersebut, lalu terapkan lazy expiry hanya pada soal cursor-nya. ID asing/hilang atau mapel lain ditolak. |
| settings | settings: object berisi hanya SHOW_TIPS dan/atau SUBJECT | Validasi string preferensi dan subject aktif jenjang siswa, persist, seed subject baru. Mapel boleh diganti ketika ada sesi unfinished; semua sesi, pointer, jawaban dan clock lama tetap tersimpan. |
| material | nodeId: UUID topik progres | Tolak LOCKED. Kembalikan material: nodeId, text, url, readToken UUID. Simpan waktu open/token privat. Token stabil per siswa/node, bukan token untuk node lain. |
| read_complete | nodeId: UUID, readToken: UUID dari material | Wajib pernah membuka materi; token dan owner harus cocok. Selesaikan materi dan bayar tepat sekali. Replay sukses tanpa reward tambahan. |
| start | nodeId: UUID, stage: 'practice' / 'sidequest' / 'gatekeeper' | Tolak LOCKED. Pointer kosong membuat attempt/snapshot baru dan langsung menyimpan pointer; pointer unfinished melanjutkan frozen session yang sama (resumed=true). COMPLETED + pointer finished membuat attempt baru dan mengganti pointer. UNLOCKED + pointer finished lulus hanya memulihkan COMPLETED pada klik itu, tanpa attempt/reward baru (resumed=false); hasil gagal ditangani menurut asumsi pemulihan di bawah. Sesi node/stage lain tidak menghalangi. |
| answer | attempt_id: UUID, question_id: UUID soal cursor saat ini, answer_payload: object | Validasi dan simpan sekali, tanpa memajukan cursor. Tambahan answer dan session.feedback: question_id, accepted=true, retry=false, correct boolean, is_timeout. Question tetap tersedia; slot berikutnya tidak dimulai sampai dinavigasi. Secondchance salah pertama: accepted=false/retry=true/correct=false, tetap pada soal/deadline yang sama, audit jawaban pertama privat. Replay slot terjawab mengembalikan feedback/jawaban tersimpan tanpa edit atau penolakan. |
| timeout | attempt_id: UUID, question_id: UUID cursor saat ini; tidak ada field tambahan | Pada deadline server, simpan jawaban kosong is_timeout=true/correct=false tepat sekali tanpa memajukan cursor. Request prematur/practice yang belum dijawab ditolak; slot terjawab mengembalikan feedback tersimpan. timestamp/is_timeout caller tidak diterima. |
| next / previous | attempt_id: UUID, question_id: UUID cursor saat ini | Verifikasi owner dan soal cursor, lalu pindah satu slot dibatasi 0 sampai total−1, termasuk slot belum dijawab. Cursor independen dari jumlah jawaban. Batas awal/akhir tetap pada soal yang sama; request dengan ID cursor lama setelah perpindahan ditolak. Kembali ke slot lama memulihkan deadline/efek/feedback, tidak mereset timer. |
| use_tool | attempt_id: UUID, question_id: UUID cursor saat ini, tool: salah satu nama inventori | Validasi efek, kurangi inventori dan tulis ledger atomik. Tool sama sekali per slot; bila expired, catat timeout tanpa debit dan tetap pada cursor. Slot terjawab hanya mengembalikan feedback tersimpan tanpa debit/replacement. |
| complete_node | attempt_id: UUID | Wajib semua slot dijawab. Server menilai ulang record privat terhadap frozen key, simpan exam submitted termasuk gagal; sukses menyelesaikan stage/reward. Tambahan result di bawah. Replay result sama tanpa reward tambahan. |
| gacha | nodeId: UUID, chestTier: hint opsional | Hanya mysterychest UNLOCKED pada node terpilih. Hint diabaikan; tier dari urutan tema tersimpan. Draw sekali dan selesaikan peti tanpa mengubah gatekeeper. Replay mengembalikan reward tersimpan tanpa draw/bayar lagi. Hanya hint tanpa nodeId ditolak. |
| buy | tool: 'clue' / 'freezetime' / 'fiftyfifty' / 'skipreplace' / 'secondchance' | Beli satu item dengan harga server: 30 / 40 / 50 / 60 / 80 poin. Saldo dan inventori berubah atomik; saldo kurang ditolak. Setiap request adalah pembelian baru, bukan idempotent retry; client mencegah double click dan melakukan reconcile bootstrap jika jaringan putus, tanpa mengulang pembelian otomatis. |
| complete_island | islandId: UUID tema progres | Hanya acknowledgement tema COMPLETED milik siswa dan pilihan aktif. Tidak memberi reward atau membuka urutan secara manual; gatekeeper sudah melakukannya otomatis. Replay aman. |

### Bentuk jawaban

- PG_TUNGGAL: answer_payload memiliki option_codes array tepat satu kode.
- PGK_MA: option_codes array kode unik; kesamaan set penuh menentukan benar. Array kosong valid tetapi salah jika kunci tidak kosong.
- PGK_KATEGORI: category_answers object dengan key nomor item dalam string; semua item wajib dijawab tepat sekali. Nilai string harus masuk kategori slash-separated pada label, dibandingkan tanpa membedakan kapital dan spasi luar.
- Payload jawaban hanya option_codes dan/atau category_answers; bentuk yang tidak relevan harus kosong atau dihilangkan. Kode tak dikenal/duplikat, kategori tak valid, field tambahan, dan jawaban soal lain ditolak atomik.
- Jawaban final tidak dapat diedit. Replay answer/timeout/use_tool untuk soal cursor yang sudah dijawab mengembalikan feedback dan answer_payload tersimpan, tanpa record/debit baru. Client dapat memulihkan sesi melalui bootstrap dengan attempt_id; bootstrap kosong tidak memilih sesi. Client tidak menghitung skor lokal sebagai otoritas.

### Hasil final

Result berisi attempt_id, nodeId, stage, passed boolean, correct, total, score persentase dibulatkan 2 desimal, stars percobaan, best_stars, tools ledger, points/xp yang benar-benar diberikan, serta review. Review adalah array question snapshot beserta answer_keys/explanation (bila tersedia), answer_payload final, correct server dan is_timeout; tidak mengandung clue/first_answer. Adapter MapAdventure memakai tampilan pilihan dan review bersama BossFight/VirtualPet, termasuk navigasi soal dan tombol kembali ke navigasi yang ditambatkan ke viewport dialog.

**Practice wajib 3/3 (100%), sidequest wajib 5/5 (100%), gatekeeper minimal 4/5 (80%). Sidequest 4/5 gagal**, tidak membuka peti dan tidak memberi reward. Gagal: points/xp/stars percobaan=0, attempt SUBMITTED; status yang sebelumnya COMPLETED tidak diturunkan. Start berikutnya membuat attempt baru. Keberhasilan bernilai 3 bintang tanpa tool, 2 dengan tool (termasuk secondchance). Tahap menyimpan maksimum bintang seluruh keberhasilan; global bertambah hanya selisih peningkatan. Poin/XP/log penyelesaian hanya pada keberhasilan pertama. Memanggil ulang complete_node pada attempt yang sama mengembalikan hasil identik tanpa mutasi reward/bintang. Hasil lama tanpa review tidak direkayasa; UI meminta percobaan baru. Client tidak menentukan kelulusan/kebenaran lokal.

### Pemetaan attempt fondasi

- Field API/sesi/hasil adalah attempt_id, menunjuk primary key id pada exam_attempts.
- Pada progres map_adventure_topics, pointer menunjuk **percobaan terbaru, bukan keberhasilan terbaik**: [practice_attempt_id](database/migration-gamification-foundation.sql:110), [sidequest_attempt_id dan gatekeeper_attempt_id](database/migration-gamification-foundation.sql:112). Setiap start baru langsung mengganti pointer dalam transaksi pembuatan exam/snapshot, termasuk retry yang kemudian gagal atau berbintang lebih rendah. Finish/replay hasil lama tidak pernah menimpa pointer terbaru. Bintang terbaik disimpan terpisah dan tidak turun.
- **Asumsi pemulihan untuk ambiguitas UNLOCKED + pointer gagal**: finished bukan berarti lulus. Status tetap UNLOCKED, retry langsung membuat pointer baru; tidak mengarang COMPLETED, membuka cabang/peti, atau memberi reward. Ini mempertahankan syarat 3/3, 5/5, dan 4/5 yang sudah ada. UNLOCKED + pointer hasil privat lulus hanya merekonsiliasi status/cabang dan maksimum bintang, tanpa membayar ulang poin/XP/log aktivitas; klik berikutnya baru membuat attempt. Hasil lama tetap immutable.
- Pointer nonkosong wajib mempunyai sesi privat dan exam MAPADVENTURE milik siswa, node, serta stage yang tepat; pointer hilang/asing/lintas stage atau node ditolak, bukan diganti diam-diam. Pointer kosong pada sesi legacy aktif yang cocok diadopsi tanpa membuat snapshot baru; pointer finished yang bertentangan dengan sesi aktif ditolak. Pointer tidak dikirim browser: pemilihan/resume merupakan keputusan atomik RPC.
- Nama practice_exam_attempt_id dan material_exam_attempt_id bukan kolom kanonis fondasi dan tidak dibuat sebagai alias. Materi tidak membuat exam attempt: penyelesaiannya memakai readToken, status material, dan material_completed_at. Ini pemetaan schema yang disengaja, bukan perubahan nama kolom fondasi.

## Graph progres dan reward

Setiap topik mempunyai graph **material → practice → (sidequest → mysterychest) DAN (gatekeeper)**. Practice membuka sidequest dan gatekeeper bersamaan; peti hanya dibuka oleh keberhasilan sidequest. Gatekeeper tidak memerlukan sidequest/peti, dan peti tidak mengubah status gatekeeper (termasuk yang sudah COMPLETED). Status selalu LOCKED, UNLOCKED, atau COMPLETED. Setiap topik memiliki gatekeeper sendiri. Semua tahap yang selesai dapat dibuka ulang; kuis membuat attempt baru, materi/peti menampilkan data tersimpan tanpa hadiah ulang. Migrasi dan bootstrap memperbaiki gatekeeper lama yang masih LOCKED padahal practice COMPLETED secara forward-only, tanpa membayar reward.

Hanya materi topik pertama tema pertama terbuka awalnya. Gatekeeper topik membuka materi topik berikut pada tema yang sama. Tema selesai setelah seluruh gatekeeper topiknya selesai; baru tema berikut terbuka. Penambahan katalog tidak mereset status lama.

| Penyelesaian pertama | Poin | XP profil | Bintang |
|---|---:|---:|---:|
| Materi | 25 | 1 | tetap 3 |
| Practice | 25 | 1 | 3 tanpa tool / 2 dengan tool |
| Sidequest | 50 | 5 | 3 tanpa tool / 2 dengan tool |
| Gatekeeper | 50 | 1 | 3 tanpa tool / 2 dengan tool |
| Peti | hasil draw | 0 | 0 |
| Tema / complete_island | 0 tambahan | 0 tambahan | tidak dibayar ulang |

Stars global adalah akumulasi bintang terbaik empat stage; replay hanya menambah delta positif ketika rekor meningkat. Replay lebih rendah/gagal tidak mengurangi bintang. Stars island adalah jumlah bintang terbaik gatekeeper topik dalam tema itu (tema satu topik = bintang gatekeeper tersebut), bukan seluruh bintang material/practice/sidequest dan bukan reward baru.

Materi memakai learning_material dan learning_material_url dari katalog nyata. Open + readToken hanya membuktikan sesi sudah membuka endpoint materi; server tidak dapat membuktikan manusia membaca teks/PDF. UI mensyaratkan akhir teks sudah tercapai dan sumber URL dibuka bila tersedia sebelum tombol selesai aktif, tetapi tombol bukan otoritas reward.

## Pemilihan soal dan snapshot

- Praktik: 3 soal, prioritaskan MUDAH, kekurangan diisi SEDANG. Jika tidak ada MUDAH, ketiganya dapat SEDANG.
- Sidequest: tepat 5 soal, prioritaskan **SUSAH/SULIT ATAU (SEDANG DAN estimate_minutes > 5)** dari versi PUBLISHED terbaru. Kekurangan prioritas diisi soal SEDANG lainnya. MUDAH tidak pernah dipilih, termasuk bila estimasinya >5 menit. Ambang tetap 5/5 (100%), hadiah 50 poin dan 5 XP.
- Gatekeeper: tepat 5 soal, **hanya SEDANG**, tanpa fallback ke SUSAH/SULIT atau MUDAH meskipun bank kurang. Ambang tetap minimal 4/5 (80%).
- Tidak ada fallback ke subject, tema, topik, atau jenjang lain. Start dan skipreplace memakai helper pool yang sama dengan filter serta prioritas stage tersebut; skipreplace mengecualikan seluruh soal yang pernah dipilih. Jumlah kurang ditolak sebelum attempt dibuat; sesi, membership exam, ledger alat, dan inventori tetap utuh saat replacement kekurangan soal.
- Filter tepat memakai kode subject terpilih, education_level_id soal, questions.theme=tema katalog, dan questions.topic=topik katalog. Sumber otoritatif: [exercise menggunakan v_theme/q.theme dan q.topic](database/migration-start-student-exercise.sql:234), serta [migrasi penambahan kolom](database/migration-start-tka-tryout.sql:3). material/sub_material adalah field legacy, bukan pengganti tema/topik; fixture mengisi label legacy berbeda dan soal pengalih untuk mencegah regresi ke filter lama.
- Hanya question_status PUBLISHED, versi PUBLISHED paling baru (version_number lalu id), serta PG_TUNGGAL/PGK_MA/PGK_KATEGORI dengan opsi/kategori/kunci valid. Versi terbaru rusak tidak menghidupkan versi lama lagi. Versi DRAFT lebih tinggi tidak dipilih.
- Tidak ada ID ganda pada satu pool. Skip replacement juga mengecualikan semua ID yang pernah dipilih dalam sesi, termasuk soal lama yang dilewati.
- Sesi menyimpan teks, opsi, kategori dan key beku saat start; edit bank kemudian tidak mengubah nilai jawaban sesi aktif. Replacement membekukan soal baru pada saat tool berhasil digunakan. Membership soal yang dilewati tetap tersimpan untuk audit; jumlah membership exam dapat melebihi total slot, tetapi penilaian hanya memakai pool final privat, tidak memakai count membership generik.
- Attempt menggunakan GAMIFICATION, gamification_app MAPADVENTURE, deadline_at NULL. duration_minutes=60 hanya metadata wajib schema lama, bukan batas waktu. Guard exam tetap mewajibkan deadline exam NULL; deadline per-soal privat adalah otoritas.

### Pemilihan dan pemulihan sesi per node/stage

- Peta memuat descriptors, bukan satu sesi global. Memilih tahap pada node lain diperbolehkan; membuka tahap yang sama melanjutkan attempt unfinished yang sama, tanpa pool baru atau reset clock.
- Reload peta memakai bootstrap kosong. Untuk melanjutkan kuis tertentu, pilih descriptor/pointer yang benar dan lakukan bootstrap dengan attempt_id; respons operasi eksplisit yang membawa attempt_id selalu memproyeksikan sesi attempt itu selama unfinished, bukan sesi lain. Sesudah finish, session null dan result immutable tersedia pada complete_node.
- Index cursor bukan jumlah record jawaban. Siswa dapat melewati soal tanpa menjawab melalui next/previous dan kembali ke slot itu. Ini berbeda dari alat skipreplace yang mengganti soal dalam slot serta memakai inventori; navigasi biasa tidak memakai alat atau mengurangi bintang.
- Pergantian mapel hanya mengganti peta aktif. Descriptor sesi mapel lain tetap tersedia, tetapi pemilihan/operasinya memerlukan kembali ke mapel yang sesuai. Jangan menghapus, men-submit, atau me-reset sesi saat mengganti mapel, menutup dialog, atau reload.
- Pemulihan respons hilang harus memilih attempt yang sama; jangan menjalankan start baru otomatis setelah attempt selesai. Perubahan akun membuang memori sesi/navigasi dan mengabaikan respons akun lama. Pemulihan pointer tetap mengikuti aturan owner/node/stage di atas.

### Timer per soal dan pemulihan

- Practice tanpa timer. Sidequest dan gatekeeper memakai snapshot estimate_minutes × 60 detik (minimum defensif 1 detik untuk data estimasi nol/negatif). Nilai default fondasi 2 berarti 120 detik. Waktu hanya dibaca dari clock server, tidak pernah dari payload.
- Ledger privat per slot menyimpan started_at, deadline_at dan effects; question_index adalah cursor terpisah dari records. Kolom question_deadline_at/effects memproyeksikan slot terpilih. Navigasi/back/resume/reload memulihkan nilai yang sama. Clock slot yang pernah dilihat terus berjalan ketika ditinggalkan; slot belum dilihat belum mempunyai clock.
- Helper timer pada bootstrap terpilih/start-resume/operasi mencatat expiry **hanya soal cursor yang sedang diproses**, secara lazy dan tepat sekali. Bootstrap kosong hanya memuat descriptors dan tidak mengeksekusi timer semua sesi. Memilih kembali slot expired otomatis menyimpan jawaban kosong, is_timeout=true/correct=false, tanpa memajukan cursor; tidak perlu menunggu timeout dari browser. Jawaban terlambat, secondchance dan tool tidak dapat menghindari expiry. Penilaian akhir tidak memanggil grader untuk jawaban timeout kosong.
- Feedback/jawaban final tetap terikat soal saat ini; question dan deadline slot tetap tersedia. Membaca feedback atau reload tidak memulai clock slot berikutnya. Navigasi eksplisit baru menampilkan slot tujuan; bila belum pernah dilihat, clock-nya baru dimulai, bila pernah dilihat, clock lama dipakai (dan expiry diproses bila perlu). Replay slot terjawab mengembalikan feedback immutable tanpa record/debit tambahan. Secondchance salah pertama bukan jawaban final dan clock tetap berjalan.
- Tidak ada expiry tingkat attempt, auto-submit, auto-finish, atau penghabisan soal yang belum dikunjungi saat offline. Semua slot harus dijawab (termasuk timeout) lalu siswa memanggil complete_node secara eksplisit; answered=total saja tidak men-submit exam atau menulis log/reward.
- UI menambatkan countdown pada remaining_seconds/deadline/server_now dan jam monotonik lokal, dikurangi allowance transit konservatif. Mengubah jam perangkat tidak menambah waktu; SQL tetap menentukan batas sebenarnya. Network retry merekonsiliasi bootstrap dahulu dan tidak mengirim timeout soal lama sebagai timeout soal berikutnya.
- Migrasi menambah kolom nullable tanpa memulai timer sesi aktif lama. Resume pertama mengisi estimate yang belum ada dari ID versi beku (fallback aman 2 bila versi hilang) lalu menetapkan deadline; resume berikutnya tidak meresetnya. Estimasi snapshot baru tidak berubah mengikuti edit bank. Hasil final lama dan log historis tidak dibackfill/dibayar ulang.

### Log aktivitas transaksional

Fondasi aktual menyediakan **public.gamification_log (singular)**, bukan gamification_logs. Tidak dibuat tabel duplikat. Nickname berasal dari profiles.nickname yang di-trim, fallback profiles.full_name, lalu 'Siswa' bila keduanya kosong/null. Schema profil aktual diperiksa pada snapshot kolom lokal.

- Sukses materi/practice/sidequest/gatekeeper: '<nickname> melewati <label> di pulau <theme>', masing-masing XP 1/1/5/1. Label sama dengan UI: Kemah Ilmu, Latihan, Misi Sampingan, Pos Penjaga.
- Peti, baik hadiah poin maupun alat: '<nickname> menemukan kotak misteri di pulau <theme>', XP 0.
- Transisi pulau menjadi COMPLETED otomatis: '<nickname> selesai menjelajahi pulau <theme>', XP 0. complete_island hanya acknowledgement, tidak menulis ulang log.
- Status progres/peti/pulau, saldo, XP dan insert log berada dalam transaksi RPC serta lock per siswa. Replay material/hasil/peti/ack pulau tidak menambah log atau reward; attempt gagal/pembelian tidak menghasilkan log aktivitas penyelesaian.

### Log setiap percobaan

[Log percobaan plural](database/migration-create-map-adventure-logs.sql) adalah tabel berbeda dari log aktivitas singular di atas. Kolom: id UUID dengan default generator, user_id, topic_attempt_id UUID yang menunjuk **map_adventure_topics.id** (bukan subject_topics.id), node_type PRACTICE/SIDEQUEST/GATEKEEPER, exam_attempt_id UUID, serta stars integer wajib default 0 melalui [migrasi bintang](database/migration-add-map-adventure-logs-stars.sql). RLS aktif dan akses langsung anon/authenticated ditutup.

Setiap finish baru, **lulus maupun gagal**, menulis tepat satu baris dengan bintang percobaan (0/2/3), bukan bintang terbaik. Replay hasil identik tidak menulis ulang. Indeks unik exam_attempt_id menjadi lapisan pertahanan tambahan. Penulisan log, exam submitted, hasil privat, progres, bintang, poin/XP berada dalam satu transaksi ber-advisory lock per siswa: kegagalan insert membatalkan semuanya dan finish dapat dicoba ulang. Tidak ada backfill log hasil final sebelum penerapan, termasuk replay hasil historis tersebut; tidak ada data historis/reward yang direkayasa. Gatekeeper replay hanya meningkatkan maksimum bintang bila perlu, tanpa peti/reward/log aktivitas baru, tetapi mempunyai satu log percobaan sendiri.

## Tools

| Tool | Efek server |
|---|---|
| clue | Kembalikan clue snapshot hanya setelah inventori dikurangi. Jika clue tidak tersedia, tolak tanpa pengurangan. Proyeksi soal aktif menyertakan boolean `has_clue` (tanpa isi clue) agar UI hanya menampilkan tombol ini bila soal memang punya petunjuk. |
| fiftyfifty | Hanya PG_TUNGGAL; hilangkan sekurangnya satu dan sekitar separuh opsi salah. Kunci benar tidak pernah dihapus; answer menolak pilihan yang dihilangkan. Tipe lain ditolak tanpa pengurangan. |
| skipreplace | Ganti slot saat ini dengan soal baru valid memakai filter dan prioritas stage yang sama (sidequest tidak pernah MUDAH; gatekeeper hanya SEDANG), tidak pernah muncul sebelumnya. Deadline dipertahankan, bukan dimulai ulang dari estimasi soal pengganti. Tidak dihitung benar otomatis. Efek soal lama dibuang, tetapi ledger slot tetap ada sehingga bintang maksimal 2 dan alat tidak bisa diulang. Kekurangan pool membatalkan seluruh request. |
| secondchance | Dapat diaktifkan sebelum jawaban, **atau setelah satu jawaban salah yang sudah terkunci** (bukan timeout): server menghapus record salah tersebut, menyimpannya sebagai `first_answer` privat untuk audit, lalu membuka kembali slot yang sama agar jawaban diubah. Setelah reopen, jawaban berikutnya tetap final meskipun masih salah. Jawaban benar dan hasil timeout tidak pernah dibuka ulang. Tetap hanya sekali per slot, tidak mereset deadline dan tidak menghindari timeout. |
| freezetime | Hanya sidequest/gatekeeper sebelum expiry: deadline soal aktif ditambah tepat 30 detik, inventori dikurangi satu dan ledger ditulis atomik. Maksimal sekali per slot, termasuk setelah replacement. Practice ditolak tanpa pengurangan. Dijual 40 poin. |

Pada slot belum dijawab, pemakaian tool yang sama ditolak bila sudah sukses, termasuk setelah navigasi atau replacement. Pada slot sudah dijawab, use_tool mengembalikan feedback immutable tanpa debit, **kecuali secondchance pada jawaban salah non-timeout** yang membuka kembali slot tersebut sesuai baris tabel di atas. Bootstrap dengan attempt_id dipakai untuk reconcile setelah network error. Complete/read/gacha aman diulang karena reward melekat ke identitas sesi/node.

## Gacha

Tier otoritatif: tema urutan 1 wooden, urutan 2 silver, urutan >=3 golden. Semua peti di tema yang sama memakai tier tersebut. Ini pemetaan sederhana berbasis server; hint chestTier tidak mengubah peluang. Draw RNG hanya di SQL, satu reward tersimpan per node. Distribusi hadiah mempertahankan rollChest prototipe, dengan nama tool dipetakan ke kolom fondasi:

| Tier | Distribusi |
|---|---|
| wooden | 70% poin integer uniform 20–60; 30% satu tool, clue/freezetime masing-masing 50% dari cabang tool. |
| silver | 60% poin integer uniform 75–150; 40% satu tool, fiftyfifty/skipreplace masing-masing 50% dari cabang tool. |
| golden | 50% poin integer uniform 200–500; 25% secondchance; 25% combo fiftyfifty + clue. |

Reward respons/persisted: tier, points integer (0 bila tool), tools object nama tool → jumlah. Poin peti menyinkronkan wallet/status; tools ditambahkan ke inventori. Tidak ada bonus gacha otomatis setelah stage selain peti node-scoped ini, sehingga tidak ada endpoint draw tier tanpa batas.

## Pengujian lokal disposable

Jalankan Node test runner untuk [pengujian MapAdventure](../tests/mapadventure-database.test.mjs). Default loader memakai cache PGlite lokal yang diberikan pada task; environment MAPADVENTURE_PGLITE_MODULE dapat menggantinya dengan absolute path modul PGlite. Tidak membaca env database aplikasi dan tidak membuka koneksi live.

Jalankan ketiga suite MapAdventure (database, actions, client) untuk memeriksa kontrak lintas lapisan. Regresi database lintas fitur memakai BOSSFIGHT_PGLITE_MODULE menunjuk cache yang sama untuk BossFight dan fallback loader VirtualPet; VIRTUALPET_PGLITE_MODULE juga dapat diisi secara eksplisit. Suite MapAdventure memakai SQL migrasi aktual dan role authenticated. Hasil audit terbaru dicatat pada bagian validasi di bawah.

Cakupan: gate akun, settings/tip persistence, seed berulang, jenjang/kode subject otoritatif, materi/token/reward replay, filter soal/version/fallback/3 tipe, jumlah kurang tanpa write parsial, frozen keys, ownership, failed attempt retry, tools/stars, secondchance, replacement atomic, 50:50, seluruh tier peti, graph lintas topik/tema, wallet/XP/stars agregat, guard exam/generic/old-new membership, revoke role, lock advisory yang benar-benar dipegang, redeploy progres, dan wallet tidak kompatibel/konflik saldo.

### Validasi sesi node/stage dan navigasi 2026-11-25

- Suite runtime menjalankan SQL migrasi aktual pada PGlite disposable. Cakupan lama grading/reward/log/pointer tetap dipertahankan; tambahan menguji tiga sesi unfinished lintas node/stage, sesi mapel kedua, descriptors lintas mapel, pemilihan owner/asing, navigasi bounded termasuk slot belum dijawab, replay immutable, serta finish eksplisit setelah semua slot terjawab.
- Uji clock memeriksa deadline/efek per slot saat back/forward/reload/resume, freeze tepat +30 detik tersimpan di ledger, replacement tidak mereset waktu atau menghapus ledger alat, expiry lazy hanya pada soal terpilih tepat sekali, dan soal belum dikunjungi tidak mempunyai clock. Attempt tidak expired/auto-submit ketika slot expired.
- Uji upgrade memasang kembali indeks global historis pada fixture, menjalankan ulang migrasi kanonis dua kali, lalu membandingkan seluruh sesi/exam/jawaban/pointer. Definisi indeks lama tak dikenal ditolak; indeks baru benar-benar menolak dua sesi unfinished pada kombinasi siswa/node/stage yang sama tanpa melarang kombinasi berbeda.
- Hasil runtime terbaru: **32 lulus, 0 gagal, 0 dilewati** (31 subtest dan satu induk), memakai loader PGlite default lokal. Lint berkas pengujian database dan pemeriksaan whitespace kedua berkas perubahan lulus. Tidak ada kegagalan SQL tersisa pada eksekusi akhir; kesalahan fixture awal diperbaiki tanpa mengubah SQL. Tidak menjalankan ulang build atau suite aplikasi/lintas fitur untuk pekerjaan pengujian/dokumentasi ini.
- Angka audit historis di bawah bukan hasil validasi kontrak sesi terbaru. PGlite satu koneksi membuktikan coexistence dan constraint, bukan race/blocking multi-koneksi; uji staging PostgreSQL dan browser tetap diperlukan. Tidak ada migrasi live, penghentian server pengembangan, atau commit.

### Bukti historis re-attempt/pointer/log 2026-11-25 (sebelum kontrak sesi node/stage)

- Deployment masih **manual-only dan belum diterapkan ke database live**; ikuti dependensi pembuatan log → bintang log → MapAdventure → guard exam generik sebelum rollout aplikasi. Tidak ada commit atau penghentian server pengembangan.
- Fixture PGlite yang memasang migrasi MapAdventure kini memasang kedua dependensi log terlebih dahulu. Pengujian mencakup seluruh status/pointer untuk ketiga stage, adopsi legacy, stale successful recovery tanpa attempt pada klik sama, failed recovery tanpa completion palsu, pointer asing/lintas node/stage, pointer terbaru setelah lower-score/fail, dan replay hasil lama ketika retry aktif.
- Uji kegagalan insert log memastikan submission/result/progres/reward rollback lalu retry hanya menghasilkan satu log. Gatekeeper replay menjaga peti, saldo/XP/log aktivitas; best stars dan agregat hanya bertambah delta positif. Migrasi log diuji rerunnable dan rename draft lama mempertahankan baris/bintang.
- Saat respons start hilang, client melakukan bootstrap tanpa mengirim ulang start otomatis. Bila bootstrap juga gagal, klik berikutnya memeriksa state dahulu; stale-success recovery tidak berubah menjadi attempt baru tanpa klik eksplisit berikutnya. Pengujian mencakup respons start/resume dan recovery tanpa sesi.
- Hasil aktual: lima suite MapAdventure (database/actions/client/navigation/log) **71 lulus, 0 gagal, 0 dilewati** ([bukti](../mapadventure-reattempt-tests.log)); delapan suite regresi BossFight (termasuk database)/VirtualPet/exam/tryout **46 lulus, 0 gagal, 0 dilewati** ([bukti](../mapadventure-reattempt-regression.log)). Seluruh database pengujian disposable PGlite, tanpa koneksi live.
- Lint seluruh proyek berhasil tanpa error/peringatan ([bukti](../mapadventure-reattempt-lint.log)); build produksi berhasil, 38 halaman ([bukti](../mapadventure-reattempt-build.log)); pemeriksaan whitespace diff lulus. Pengujian PGlite satu koneksi tidak menggantikan staging PostgreSQL multi-koneksi atau browser E2E.

### Validasi progres/replay/feedback/review 2026-11-25 (sebelum pembaruan pointer/log)

- **Pending deployment manual**: jalankan ulang seluruh [migrasi MapAdventure](database/migration-mapadventure.sql) di staging lalu production sesuai checklist, bersama aplikasi baru. Header MANUAL DEPLOY tetap berlaku. Tidak ada migrasi live atau commit pada pekerjaan ini.
- Empat suite MapAdventure (database/actions/client/navigation): **62 lulus, 0 gagal, 0 dilewati**; [bukti pengujian](../mapadventure-update-tests.log). Database hanya PGlite disposable melalui MAPADVENTURE_PGLITE_MODULE yang ditentukan pengguna.
- Cakupan baru: practice membuka dua cabang; gatekeeper tanpa sidequest/peti; peti sesudah gatekeeper tidak menurunkan status; perbaikan graph lama; replay semua tahap dengan bintang 2→3, lalu 2/gagal tanpa downgrade; delta global/island; nol poin/XP/log tambahan; complete/gacha replay tetap idempotent.
- Audit ini memakai kontrak feedback lama; kontrak tersebut telah digantikan oleh cursor dan ledger per slot di atas. Frozen review tetap memuat semua tipe soal, jawaban final/kunci, status benar/salah/timeout; bank diedit sesudah start tidak mengubah hasil. Proyeksi aktif tetap membuang kunci dan audit privat.
- Regresi MapAdventure/BossFight/VirtualPet: **100 lulus, 0 gagal, 0 dilewati**; [bukti regresi](../mapadventure-update-regression.log). Seluruh suite database memakai modul cache PGlite yang sama, tanpa koneksi live.
- Lint targeted dan seluruh proyek berhasil tanpa error/peringatan ([bukti lint](../mapadventure-update-lint.log)); build produksi berhasil (38 halaman; [bukti build](../mapadventure-update-build.log)). UI memakai BossFightChoices/BossFightReview yang sudah ada, tidak mengubah berkas fitur BossFight/VirtualPet. Pengujian visual browser/E2E belum dilakukan; staging multi-koneksi tetap wajib sesuai batas validasi di bawah.

### Validasi pembaruan seleksi soal 2026-11-24

- Ketiga suite MapAdventure (database, actions, client): **49 lulus, 0 gagal, 0 dilewati**, dijalankan dengan MAPADVENTURE_PGLITE_MODULE menunjuk cache PGlite yang diberikan pengguna. Database disposable saja; tanpa koneksi live, commit, atau perubahan fitur lain.
- Uji runtime membedakan MUDAH >5 menit (selalu dikecualikan dari sidequest), SEDANG >5 menit (prioritas setara SUSAH/SULIT), SEDANG tepat 5 menit (fallback), dan gatekeeper hanya SEDANG pada bank yang sama. Scope subject/tema/topik/jenjang tetap tepat.
- Start sidequest/gatekeeper ditolak saat hanya 4 soal memenuhi syarat meskipun ada soal terlarang yang published. Kekurangan replacement juga ditolak tanpa mengubah attempt, membership, sesi, ledger/inventori alat, progres, saldo, atau jumlah log. Replacement berhasil mengikuti prioritas/filter stage yang sama, mengecualikan semua seen IDs, serta mempertahankan deadline.
- Lint pengujian database/client/actions, helper client, dan komponen UI MapAdventure: exit 0 tanpa error/peringatan. Pemeriksaan whitespace diff lulus; pemberitahuan LF/CRLF Git bukan kesalahan whitespace. Build dan regresi lintas fitur tidak dijalankan ulang untuk pembaruan seleksi ini; hasil di bawah adalah bukti audit sebelumnya.

### Bukti validasi audit sebelumnya 2026-11-24

- Tiga suite MapAdventure: **46 lulus, 0 gagal, 0 dilewati** ([database](../tests/mapadventure-database.test.mjs), [actions](../tests/mapadventure-actions.test.mjs), [client](../tests/mapadventure-client.test.mjs)); bukti pada [log MapAdventure](../mapadventure-tests.log).
- Regresi sembilan suite MapAdventure/BossFight/VirtualPet (database, actions/backend, client): **82 lulus, 0 gagal, 0 dilewati**; bukti pada [log regresi](../mapadventure-regression.log).
- Database pengujian disposable PGlite memakai modul cache yang diberikan pengguna, bukan koneksi database aplikasi. Tidak ada migrasi live atau commit.
- Lint seluruh proyek berhasil tanpa error/peringatan (exit 0; [log lint](../mapadventure-lint.log)); build produksi berhasil (exit 0, 42 halaman dihasilkan; [log build](../mapadventure-build.log)). Pemeriksaan whitespace diff berhasil; Git hanya memberi pemberitahuan normalisasi LF/CRLF Windows.
- Uji timer memanipulasi deadline privat sebagai owner, tanpa menunggu 120 detik fixture: timeout prematur ditolak, batas deadline/late correct disimpan kosong dan salah, replay tidak menambah record, timer berikutnya mulai baru, seluruh 5 timeout menghasilkan skor 0 tanpa error grader/reward, dan secondchance tidak memberi retry setelah expiry. Gatekeeper berdurasi snapshot 6 menit tetap 360 detik meski bank diubah menjadi 1 menit.
- Uji alat: Freeze Time tepat +30 detik dan satu debit, pemakaian ulang ditolak (termasuk setelah ganti soal), secondchance/replacement mempertahankan deadline, pemakaian setelah expiry mencatat timeout tanpa debit, practice tanpa timer menolak timeout/Freeze Time tanpa debit. Redeploy sesi aktif lama tidak memulai deadline sampai resume pertama.
- Uji log memeriksa seluruh stage sukses (XP 1/1/5/1), peti dan pulau XP 0, nickname/full_name/fallback Siswa, dan tidak ada tambahan log setelah replay serta acknowledgement pulau berulang. Tidak ada tabel log plural baru.
- Bukti batas kelulusan: practice 2/3 gagal lalu 3/3 lulus; sidequest 4/5 gagal dengan nol reward dan peti tetap terkunci, attempt baru 5/5 lulus; gatekeeper 3/5 gagal lalu 4/5 lulus. Replay sukses/gagal, termasuk replay gagal setelah retry sukses, tidak menambah poin/XP/bintang. Referensi attempt progres diverifikasi terhadap kolom fondasi.
- Bukti filter: fixture memiliki theme/topic terkini dan label legacy yang sengaja berbeda. Soal bertema/topik salah tetap dikecualikan meskipun material/sub_material cocok; subject/jenjang lain juga tidak masuk pool.
- Bukti kontrak tips: preferensi string tersimpan, tip hilang ketika dimatikan, typo ditolak oleh SQL/actions, proyeksi publik hanya mengeluarkan nama kanonis, dan redeploy memperbaiki preferensi MapAdventure tanpa menyentuh group VirtualPet.
- Tiga fungsi exam generik tetap hanya memakai guard dalam migrasi kanonis; audit ini tidak mengubah definisi legacy di berkas migrasi lainnya.

Batas validasi: PGlite menjalankan satu koneksi; test membuktikan lock dipegang dalam transaksi dan unique index sesi aktif, bukan stress test blocking dua koneksi Postgres. Sebelum production, staging PostgreSQL multi-koneksi harus mencoba race complete_node/gacha/buy untuk siswa sama; complete/gacha hanya membayar sekali, buy adalah dua pembelian sah jika dua request terotorisasi. Test client/actions memeriksa perilaku request dan kontrak sumber UI, bukan browser E2E. Build tidak menggantikan uji visual/aksesibilitas browser.
