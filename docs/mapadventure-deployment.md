# MapAdventure: deployment dan kontrak integrasi

## Batas pekerjaan

Integrasi MapAdventure TKA_TryOn mencakup [migrasi SQL](database/migration-mapadventure.sql), [guard exam generik kanonik](database/migration_generic_exam_attempt.sql), [server actions](../src/app/actions/mapadventure.js), [validasi dan proyeksi respons server](../src/lib/server/mapadventure.js), [session bridge](../src/app/api/mapadventure/session/route.js), [client](../src/lib/student/mapadventure-client.js), [hook](../src/components/student/mapadventure/useMapAdventure.js), dan [UI](../src/components/student/mapadventure/MapAdventure.jsx). Pengujian mencakup database, actions, dan client. Tidak ada deployment live atau commit.

## Deployment manual

1. Backup database dan audit schema aktual di staging. Jangan menjalankan berkas ini otomatis terhadap production.
2. Pastikan schema autentikasi/profil/exam dari [stage 1](database/migration-stage-1.sql), kolom akun aktif, deadline exam, katalog subjects/subject_topics, dan [fondasi gamifikasi](database/migration-gamification-foundation.sql) sudah ada. Katalog subject harus memiliki kode, nama, jenjang, dan flag aktif. Bank wajib memiliki [kolom theme/topic](database/migration-start-tka-tryout.sql:3), sebagaimana dipakai [exercise terkini](database/migration-start-student-exercise.sql:234); schema lama yang hanya memiliki material/sub_material harus dimigrasikan dan kontennya direkonsiliasi operator terlebih dahulu, bukan diberi fallback diam-diam.
3. Pasang [BossFight](database/migration-bossfight.sql) dan [VirtualPet](database/migration-virtualpet.sql), termasuk private schema dan snapshot grader VirtualPet. Backend ini memakai grader snapshot privat tersebut, bukan query jawaban ke bank saat submit.
4. Jalankan seluruh [migrasi MapAdventure](database/migration-mapadventure.sql) melalui SQL Editor sebagai owner migrasi. Migrasi berada dalam satu transaksi dan aman dijalankan ulang; jangan menyalin potongan parsial.
5. Jalankan ulang seluruh [migrasi RPC exam generik](database/migration_generic_exam_attempt.sql). Tiga body asli diedit inline, tanpa rename/wrapper. Guard membership MapAdventure opsional sebelum tabel privat terpasang, sehingga tidak merusak deployment fitur lama.
6. Verifikasi akses dengan role authenticated dan JWT STUDENT yang aktif/terkonfirmasi. Jangan memakai service-role sebagai identitas siswa. Uji bootstrap, materi, soal, pembelian, dan replay di staging.
7. Deploy aplikasi bersama perubahan SQL. UI sudah terhubung: browser memperbarui cookie sesi melalui session bridge same-origin, lalu memanggil server actions yang memverifikasi identitas dan menjalankan RPC kanonis. Tidak ada write tabel atau RPC exam generik langsung dari browser MapAdventure.

### Preflight dan data lama

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
- Semua aksi mengambil advisory transaction lock per siswa sebelum row lock. Satu sesi aktif per siswa, bukan per subject. Selesaikan sesi sebelum mengganti subject. Pengubahan jenjang oleh operator ketika sesi aktif memerlukan pemulihan operator; tidak ada API membatalkan sesi untuk melakukan reroll bank.
- Payload harus object maksimum 64 KiB, hanya field yang tercantum. Field skor, reward, userId, usedTools, tier otoritatif, kunci jawaban, dan field tambahan ditolak. UUID tidak valid ditolak PostgreSQL. Kesalahan membatalkan seluruh perubahan pada request itu.
- Semua tabel progres, inventori, wallet dan sesi privat ditutup untuk anon/authenticated, RLS diaktifkan. Helper privat tidak executable oleh client. RPC SECURITY DEFINER menggunakan search_path pg_catalog.
- Membership sesi privat menjaga exam_attempts, exam_attempt_questions, dan exam_attempt_answers dari write langsung, penggantian tag aplikasi, perpindahan membership lama/baru, delete, dan INSERT palsu. Authorization write memakai flag privat yang hanya dibuka selama transaksi RPC; tidak memakai setting/GUC client.
- Tiga RPC exam generik menolak membership MapAdventure, termasuk attempt selesai. Browser tidak boleh memanggil endpoint review/resume generik untuk sesi ini.
- Snapshot kunci, clue tersembunyi, record jawaban pertama secondchance, serta pool penuh disimpan privat. Respons hanya berisi soal saat ini tanpa answer_keys dan tanpa clue kecuali tool clue sudah dipakai. Jawaban benar tidak dikembalikan per soal; secondchance hanya mengungkap hak retry setelah jawaban salah.
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
| session | null atau attempt_id, nodeId, stage, index 0-based, total, answered, question saat ini, tools, effects, deadline_at, server_now, remaining_seconds. Deadline dan remaining null pada practice atau ketika semua soal selesai. Sesudah semua jawaban, question=null tetapi session tetap ada sampai complete_node. |

Question saat ini berisi id, version, type, text, instruction, stimulus, options, category_items, difficulty, estimate_minutes, subject_code, education_level, theme, topic. Options hanya option_code/option_text. Category items hanya item_number/item_text/category_label. Tidak ada is_correct/correct_category/answer_keys pada respons.

Daftar tools pada sesi dan hasil adalah ledger objek tool/question_id/question_index. Indeks slot mencegah penggunaan ulang alat melalui replacement. Effects berlaku hanya pada soal saat ini, dan dapat memuat clue, eliminated (kode opsi), secondchance, retried. First answer hanya ada pada storage privat, bukan respons effects.

## Kontrak aksi persis

Nama field case-sensitive: nodeId/readToken/islandId/chestTier menggunakan camelCase; attempt_id/question_id/answer_payload menggunakan snake_case. Field wajib tidak boleh dihilangkan. Tidak ada parameter userId.

| p_action | p_payload yang diterima | Perilaku / tambahan respons |
|---|---|---|
| bootstrap | object kosong | Buat settings/status/wallet/tools yang belum ada, generate progres katalog yang hilang, kembalikan state/sesi aktif. |
| settings | settings: object berisi hanya SHOW_TIPS dan/atau SUBJECT | Validasi string preferensi dan subject aktif jenjang siswa, persist, seed subject baru. SUBJECT ditolak ketika ada sesi aktif. |
| material | nodeId: UUID topik progres | Tolak LOCKED. Kembalikan material: nodeId, text, url, readToken UUID. Simpan waktu open/token privat. Token stabil per siswa/node, bukan token untuk node lain. |
| read_complete | nodeId: UUID, readToken: UUID dari material | Wajib pernah membuka materi; token dan owner harus cocok. Selesaikan materi dan bayar tepat sekali. Replay sukses tanpa reward tambahan. |
| start | nodeId: UUID, stage: 'practice' / 'sidequest' / 'gatekeeper' | Stage wajib UNLOCKED. Buat snapshot soal + attempt GAMIFICATION/MAPADVENTURE + membership. Tambahan resumed=false. Request stage/node sama saat aktif mengembalikan sesi sama dan resumed=true; sesi berbeda ditolak. |
| answer | attempt_id: UUID, question_id: UUID soal saat ini, answer_payload: object | Validasi dan simpan jawaban sekali, pindah soal. Tambahan answer: accepted=true,retry=false. Jika secondchance aktif dan jawaban pertama salah: accepted=false,retry=true dan tetap pada soal sama; jawaban pertama disimpan privat. |
| timeout | attempt_id: UUID, question_id: UUID saat ini; tidak ada field tambahan | Hanya setelah deadline server tercapai, simpan jawaban kosong is_timeout=true dan correct=false, pindah satu soal. Request prematur/practice ditolak; timestamp/is_timeout dari caller tidak diterima. |
| use_tool | attempt_id: UUID, question_id: UUID saat ini, tool: salah satu nama inventori | Validasi efek lebih dulu, kurangi inventori dan tulis ledger atomik. Tool sama hanya sekali per slot soal. Bila sudah expired, catat timeout dan pindah tanpa mengurangi alat. Respons state memuat efek/soal pengganti. |
| complete_node | attempt_id: UUID | Wajib semua slot dijawab. Server menilai ulang record privat terhadap frozen key, simpan exam submitted termasuk gagal; sukses menyelesaikan stage/reward. Tambahan result di bawah. Replay result sama tanpa reward tambahan. |
| gacha | nodeId: UUID, chestTier: hint opsional | Hanya mysterychest UNLOCKED pada node terpilih. Hint diabaikan; tier dari urutan tema tersimpan. Draw sekali, simpan reward, selesaikan peti dan buka gatekeeper. Replay mengembalikan reward tersimpan tanpa draw/bayar lagi. Hanya hint tanpa nodeId ditolak. |
| buy | tool: 'clue' / 'freezetime' / 'fiftyfifty' / 'skipreplace' / 'secondchance' | Beli satu item dengan harga server: 30 / 40 / 50 / 60 / 80 poin. Saldo dan inventori berubah atomik; saldo kurang ditolak. Setiap request adalah pembelian baru, bukan idempotent retry; client mencegah double click dan melakukan reconcile bootstrap jika jaringan putus, tanpa mengulang pembelian otomatis. |
| complete_island | islandId: UUID tema progres | Hanya acknowledgement tema COMPLETED milik siswa dan pilihan aktif. Tidak memberi reward atau membuka urutan secara manual; gatekeeper sudah melakukannya otomatis. Replay aman. |

### Bentuk jawaban

- PG_TUNGGAL: answer_payload memiliki option_codes array tepat satu kode.
- PGK_MA: option_codes array kode unik; kesamaan set penuh menentukan benar. Array kosong valid tetapi salah jika kunci tidak kosong.
- PGK_KATEGORI: category_answers object dengan key nomor item dalam string; semua item wajib dijawab tepat sekali. Nilai string harus masuk kategori slash-separated pada label, dibandingkan tanpa membedakan kapital dan spasi luar.
- Payload jawaban hanya option_codes dan/atau category_answers; bentuk yang tidak relevan harus kosong atau dihilangkan. Kode tak dikenal/duplikat, kategori tak valid, field tambahan, dan jawaban soal lain ditolak atomik.
- Jawaban final yang diterima tidak dapat diedit/replay lewat answer: client menggunakan bootstrap untuk mengetahui index/flag retry terbaru jika request kehilangan respons. Client tidak menghitung skor lokal sebagai otoritas.

### Hasil final

Result berisi attempt_id, nodeId, stage, passed boolean, correct, total, score persentase dibulatkan 2 desimal, stars, tools ledger, points dan xp yang benar-benar diberikan. Gagal: points/xp/stars=0, attempt tetap SUBMITTED, node tetap UNLOCKED, start berikutnya membuat attempt baru. **Practice wajib 3/3 (100%), sidequest wajib 5/5 (100%), gatekeeper minimal 4/5 (80%). Sidequest 4/5 gagal**, tidak membuka peti dan tidak memberi reward. Replay hasil gagal maupun sukses tidak menambah poin/XP/bintang; replay percobaan gagal setelah retry sukses juga tidak membatalkan progres. Setiap keberhasilan mendapat 3 bintang bila tanpa tool, 2 bila memakai setidaknya satu tool, termasuk jawaban secondchance yang diperbaiki. Client hanya menampilkan syarat dan hasil server, tidak menentukan kelulusan lokal.

### Pemetaan attempt fondasi

- Field API/sesi/hasil adalah attempt_id, menunjuk primary key id pada exam_attempts.
- Pada progres map_adventure_topics, keberhasilan practice menyimpan ID tersebut pada [practice_attempt_id](database/migration-gamification-foundation.sql:110); sidequest dan gatekeeper memakai [sidequest_attempt_id dan gatekeeper_attempt_id](database/migration-gamification-foundation.sql:112). Percobaan gagal tetap tercatat di exam dan sesi privat, tidak mengisi referensi keberhasilan progres.
- Nama practice_exam_attempt_id dan material_exam_attempt_id bukan kolom kanonis fondasi dan tidak dibuat sebagai alias. Materi tidak membuat exam attempt: penyelesaiannya memakai readToken, status material, dan material_completed_at. Ini pemetaan schema yang disengaja, bukan perubahan nama kolom fondasi.

## Graph progres dan reward

Setiap topik mempunyai urutan **material → practice → sidequest → mysterychest → gatekeeper**. Status selalu LOCKED, UNLOCKED, atau COMPLETED. Setiap topik memiliki gatekeeper sendiri, bukan hanya gatekeeper terakhir.

Hanya materi topik pertama tema pertama terbuka awalnya. Gatekeeper topik membuka materi topik berikut pada tema yang sama. Tema selesai setelah seluruh gatekeeper topiknya selesai; baru tema berikut terbuka. Penambahan katalog tidak mereset status lama.

| Penyelesaian pertama | Poin | XP profil | Bintang |
|---|---:|---:|---:|
| Materi | 25 | 1 | tetap 3 |
| Practice | 25 | 1 | 3 tanpa tool / 2 dengan tool |
| Sidequest | 50 | 5 | 3 tanpa tool / 2 dengan tool |
| Gatekeeper | 50 | 1 | 3 tanpa tool / 2 dengan tool |
| Peti | hasil draw | 0 | 0 |
| Tema / complete_island | 0 tambahan | 0 tambahan | tidak dibayar ulang |

Stars global dijumlah tepat sekali dari empat stage yang memberikan bintang. Stars island adalah jumlah bintang gatekeeper topik dalam tema itu (tema satu topik = bintang gatekeeper tersebut), bukan seluruh bintang material/practice/sidequest dan bukan reward baru.

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

### Timer per soal dan pemulihan

- Practice tanpa timer. Sidequest dan gatekeeper memakai snapshot estimate_minutes × 60 detik (minimum defensif 1 detik untuk data estimasi nol/negatif). Nilai default fondasi 2 berarti 120 detik. Waktu hanya dibaca dari clock server, tidak pernah dari payload.
- private.mapadventure_sessions.question_deadline_at menyimpan deadline soal aktif. Jawaban pada atau setelah deadline, termasuk jawaban benar atau secondchance, diubah server menjadi jawaban kosong, is_timeout=true, correct=false; soal maju. Penilaian akhir membaca flag timeout privat dan tidak memanggil grader dengan jawaban kosong tersebut.
- Bootstrap/resume mengembalikan soal expired dengan remaining_seconds=0, tidak diam-diam menghabiskan semua soal saat offline. UI mengirim satu aksi timeout otomatis per soal, dengan busy ref dan kunci attempt/soal; tombol manual/muat ulang memulihkan kegagalan jaringan. Server juga menangani expiry pada answer/use_tool sehingga tanpa UI pun jawaban terlambat tidak dapat lulus.
- Timer soal berikutnya dimulai dari waktu server saat soal diaktifkan sesudah jawaban/timeout, bukan deadline lama. Satu request hanya memajukan satu soal. Mengabaikan browser tidak memberi jawaban benar atau hadiah.
- UI menambatkan countdown pada remaining_seconds/deadline/server_now dan jam monotonik lokal, dikurangi allowance transit konservatif. Mengubah jam perangkat tidak menambah waktu; SQL tetap menentukan batas sebenarnya. Network retry merekonsiliasi bootstrap dahulu dan tidak mengirim timeout soal lama sebagai timeout soal berikutnya.
- Migrasi menambah kolom nullable tanpa memulai timer sesi aktif lama. Resume pertama mengisi estimate yang belum ada dari ID versi beku (fallback aman 2 bila versi hilang) lalu menetapkan deadline; resume berikutnya tidak meresetnya. Estimasi snapshot baru tidak berubah mengikuti edit bank. Hasil final lama dan log historis tidak dibackfill/dibayar ulang.

### Log aktivitas transaksional

Fondasi aktual menyediakan **public.gamification_log (singular)**, bukan gamification_logs. Tidak dibuat tabel duplikat. Nickname berasal dari profiles.nickname yang di-trim, fallback profiles.full_name, lalu 'Siswa' bila keduanya kosong/null. Schema profil aktual diperiksa pada snapshot kolom lokal.

- Sukses materi/practice/sidequest/gatekeeper: '<nickname> melewati <label> di pulau <theme>', masing-masing XP 1/1/5/1. Label sama dengan UI: Kemah Ilmu, Latihan, Misi Sampingan, Pos Penjaga.
- Peti, baik hadiah poin maupun alat: '<nickname> menemukan kotak misteri di pulau <theme>', XP 0.
- Transisi pulau menjadi COMPLETED otomatis: '<nickname> selesai menjelajahi pulau <theme>', XP 0. complete_island hanya acknowledgement, tidak menulis ulang log.
- Status progres/peti/pulau, saldo, XP dan insert log berada dalam transaksi RPC serta lock per siswa. Replay material/hasil/peti/ack pulau tidak menambah log atau reward; attempt gagal/pembelian tidak menghasilkan log aktivitas penyelesaian.

## Tools

| Tool | Efek server |
|---|---|
| clue | Kembalikan clue snapshot hanya setelah inventori dikurangi. Jika clue tidak tersedia, tolak tanpa pengurangan. |
| fiftyfifty | Hanya PG_TUNGGAL; hilangkan sekurangnya satu dan sekitar separuh opsi salah. Kunci benar tidak pernah dihapus; answer menolak pilihan yang dihilangkan. Tipe lain ditolak tanpa pengurangan. |
| skipreplace | Ganti slot saat ini dengan soal baru valid memakai filter dan prioritas stage yang sama (sidequest tidak pernah MUDAH; gatekeeper hanya SEDANG), tidak pernah muncul sebelumnya. Deadline dipertahankan, bukan dimulai ulang dari estimasi soal pengganti. Tidak dihitung benar otomatis. Efek soal lama dibuang, tetapi ledger slot tetap ada sehingga bintang maksimal 2 dan alat tidak bisa diulang. Kekurangan pool membatalkan seluruh request. |
| secondchance | Harus diaktifkan sebelum jawaban. Jawaban salah pertama mendapat satu retry pada soal yang sama; jawaban berikutnya final meskipun masih salah. Jawaban pertama dicatat privat untuk audit. Tidak bisa digunakan ulang pada slot itu, tidak mereset deadline dan tidak menghindari timeout. |
| freezetime | Hanya sidequest/gatekeeper sebelum expiry: deadline soal aktif ditambah tepat 30 detik, inventori dikurangi satu dan ledger ditulis atomik. Maksimal sekali per slot, termasuk setelah replacement. Practice ditolak tanpa pengurangan. Dijual 40 poin. |

Tool use tidak idempotent; pemakaian tool yang sama pada soal yang sama ditolak bila sudah sukses. Bootstrap dipakai untuk reconcile setelah network error. Complete/read/gacha aman diulang karena reward melekat ke identitas sesi/node.

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
