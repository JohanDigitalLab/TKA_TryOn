# Kontrak backend BossFight

Endpoint /api/bossfight memakai Authorization Bearer JWT Supabase pengguna; tanpa service role. Respons no-store, JSON maksimum 64 KiB; sukses membungkus data, gagal membungkus error. Signature publik tetap [public.bossfight(p_action text, p_payload jsonb DEFAULT '{}') RETURNS jsonb](database/migration-bossfight.sql:106). Tidak ada RPC baru yang perlu dipanggil server.

## Actions

- GET / bootstrap: settings string SHOW_TIPS=1, SUBJECT=Matematika, IS_PVP=0, FIGHT_MODE=Maksimal jumlah soal, MAX_QUESTIONS=5, P2_NAME=Player2. Missing settings disisipkan tanpa menimpa nilai tersimpan; tip acak aktif application BOSSFIGHT atau null.
- settings: payload berisi settings patch. Semua nilai wajib string. Nama tidak dikenal ditolak. FIGHT_MODE hanya Maksimal jumlah soal atau Fight to Death; MAX_QUESTIONS integer 1–100. P2_NAME dapat diganti dan tersimpan untuk sesi berikutnya.
- start: membuat/resume satu sesi aktif. Settings dibekukan. SUBJECT dicocokkan dengan jenjang profil; soal dan versi PUBLISHED, estimasi positif maksimal 5 menit, acak tanpa duplikasi. Mode terbatas mengambil maksimal MAX_QUESTIONS, atau lebih sedikit jika bank kurang. Death mengambil initial batch konfigurasi, bukan 1000 soal.
- batch: payload attempt_id dan records array 0–100. Record memuat question_id, answer_payload, is_timeout dan heal boolean eksplisit. Banyak jawaban dapat dikirim dalam satu panggilan; wajib mengikuti urutan outstanding. Skip, duplicate dalam request, urutan mundur, payload tidak valid atau perubahan jawaban terkunci ditolak secara atomik. Retry record identik tidak menggandakan damage. Array kosong me-resume sesi.
- finish: payload sama dengan batch; hanya berhasil bila terminal setelah pemrosesan. Retry setelah selesai mengembalikan hasil tetap tanpa XP/log ganda.

## Batch dan jawaban

Respons sesi memuat attempt_id, settings, hp, combo, healed, used, correct, terminal, questions dan result. **questions adalah seluruh batch outstanding yang tersedia**, bukan hanya satu soal. Setiap soal memuat id, version, text, type, instruction, stimulus, options, category_items, order dan player. Tidak ada answer_keys, is_correct atau correct_category. Server menilai memakai helper ujian existing; client tidak boleh mengasumsikan kunci tersedia.

Format jawaban: pilihan tunggal memakai option_codes satu kode; multi-answer memakai option_codes beberapa kode; kategori memakai category_answers pemetaan nomor ke kategori. Timeout wajib answer_payload object kosong. Server menentukan kebenaran, HP, kombo, pemain, dan hasil; bukan menerima nilai itu dari client. Timestamp jawaban adalah waktu penerimaan server; timeout masih merupakan laporan client, bukan pembuktian wall-clock.

Heal sekali per pemain, +20 maksimal100 sebelum jawaban. Benar damage20, kombo mulai3 damage30; salah/timeout self20 dan reset kombo. PvP lokal bergantian mulai pemain1, bukan multiplayer antar akun. KO langsung terminal. Request yang menyertakan jawaban baru sesudah KO ditolak; client harus mengirim hanya record yang benar-benar digunakan sampai KO.

Mode terbatas terminal saat pool habis; sistem menang bila hidup dan benar lebih dari setengah soal terpakai, atau Boss KO. PvP membandingkan HP; seri tanpa XP. Fight to Death refill hanya setelah batch exhausted dan kedua pihak masih hidup, dengan tambahan default10 unik yang belum pernah disajikan. Jika bank benar-benar habis, sesi terminal; sistem menang hanya bila Boss KO. Konfigurasi initial/additional default10 ada pada [konfigurasi privat](database/migration-bossfight.sql:79), bukan payload client.

## Persistence dan reward

Attempt memakai GAMIFICATION dan aplikasi BOSSFIGHT. Hanya soal terjawab/timeout disimpan ke tabel attempt questions/answers pada finish atomik; cadangan tidak disimpan di tabel hasil. Victory pemilik akun (pemain1) memberi **tepat 1 XP** dan satu log dengan pola nickname bertarung melawan Boss bossname dan menang. Bossname memakai SUBJECT untuk sistem atau P2_NAME untuk PvP. Kalah/seri/pemain2 menang memberi nol XP dan tidak membuat log kemenangan.

Private state dilindungi RLS/revoke; generic save/resume/submit dan mutasi tabel hasil dicegah melewati state machine. Versi PUBLISHED harus immutable selama sesi karena helper menilai version id yang dipilih. Satu sesi belum finish selalu di-resume; tidak ada abandon/reset otomatis.
