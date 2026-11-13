# TKA TryOn

Platform persiapan, latihan, dan simulasi Tes Kemampuan Akademik (TKA) dengan area peserta dan administrasi konten akademik.

## Teknologi

- Next.js App Router `16.4.5` dan React `19.3.0`.
- JavaScript dengan Tailwind CSS 4.
- Supabase Auth, PostgREST, PostgreSQL RPC, dan RLS.
- Import XLSX/XLS/CSV, DOCX, PDF, gambar, serta OCR.
- Groq AI untuk menstrukturkan soal hasil import. AI selalu menghasilkan draft yang membutuhkan review manusia.

## Menjalankan lokal

1. Instal dependensi:

   ```bash
   npm install
   ```

2. Salin [`.env.example`](.env.example) menjadi `.env.local`, lalu isi kredensial proyek lokal. Jangan commit `.env.local`.

3. Jalankan development server:

   ```bash
   npm run dev
   ```

4. Buka `http://localhost:3000`.

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`: URL proyek Supabase.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: publishable/anon key untuk client dan request yang dibatasi RLS.
- `GROQ_API_KEY`: key server-only untuk endpoint AI. Jangan menggunakan prefix `NEXT_PUBLIC_`.

Lihat [`.env.example`](.env.example) dan [`docs/SECURITY_AND_DATABASE.md`](docs/SECURITY_AND_DATABASE.md).

## Area aplikasi

- `/`: landing page publik.
- `/register` dan `/login`: autentikasi peserta.
- `/student`: dashboard peserta.
- `/student/subjects`: pilihan mata pelajaran.
- `/student/missions`: konfigurasi latihan/simulasi.
- `/student/challenge`: engine CBT.
- `/student/results`: rekap dan review hasil.
- `/admin`: dashboard administrasi.
- `/admin/questions`: bank soal versioned.
- `/admin/import`: Smart Import Center.

## Alur Smart Import

```text
Upload → Extract → Structure → Validate → Review → Save as DRAFT
```

Ekstraksi dokumen tersedia pada `/api/import/extract`. Structuring AI tersedia pada `/api/import/structure`. Keduanya memerlukan autentikasi server dan permission import. Endpoint `/api/groq-test` juga tidak lagi publik dan memerlukan akses Super Admin.

## Database dan keamanan

Repository tidak menyimpan migration SQL saat ini. Aplikasi mengandalkan tabel dan RPC yang sudah terpasang di Supabase. Daftar objek dan checklist RLS/RPC ada pada [`docs/SECURITY_AND_DATABASE.md`](docs/SECURITY_AND_DATABASE.md).

Sebelum deployment:

- Pastikan RLS dan pemeriksaan user aktif di semua tabel/RPC.
- Pastikan role dan permission admin dibatasi di database.
- Rotasi secret yang pernah terekspos melalui dashboard provider.
- Dokumentasikan schema, signature RPC, foreign key, enum, dan policy sebagai migration versioned.

## Verifikasi

```bash
npm test
npm run lint
npm run build
```

`npm run build` harus berhasil. Lint pada area server/API yang diperbarui harus bersih; lint global dapat masih menemukan masalah lama pada page besar yang belum selesai dipecah, terutama aturan React effect dan dependency hook.
