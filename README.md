# Panel NOC

Sebuah aplikasi dashboard NOC berbasis Next.js 14 dan Tailwind CSS yang menampilkan ringkasan operasional dan daftar pendingan terbaru.

## Menjalankan secara lokal

1. Instal dependensi:
   ```bash
   npm install
   ```
2. Jalankan mode pengembangan:
   ```bash
   npm run dev
   ```
3. Buka browser ke `http://localhost:3000`.

## Struktur

- `app/` – App Router Next.js (gabungan layout dan halaman dashboard).
- `components/ui/` – Komponen antarmuka yang dapat digunakan kembali.
- `lib/` – Utilitas kecil bersama seperti helper kelas Tailwind.
- `tailwind.config.ts` & `postcss.config.mjs` – Konfigurasi styling.
