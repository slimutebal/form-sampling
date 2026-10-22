# Font lokal

Font `plus-jakarta-sans-latin-800-normal.woff2` saat ini dipakai khusus oleh
`.type-page-title` sebagai family `Plus Jakarta Sans Page` dengan weight CSS
800, sesuai registrasi di `src/styles/globals.css`.

`plus-jakarta-sans-latin-variable.woff2` adalah subset Latin lokal Plus
Jakarta Sans (weight 400â€“800) yang tersedia untuk eksperimen lokal lain.
`plus-jakarta-sans-google-v12-700.ttf` adalah salinan lokal Plus Jakarta Sans
700 dari CSS Google Fonts resmi, khusus untuk uji nomor Fleet ganjil. Tidak
ada font yang dimuat dari CDN saat aplikasi berjalan. SETUP saat ini
menggunakan Satoshi di bawah ini.

Satoshi untuk uji SETUP tersedia sebagai `Satoshi-Light.otf` (300),
`Satoshi-Regular.otf` (400), `Satoshi-Medium.otf` (500), dan
`Satoshi-Bold.otf` (700). Keempatnya didaftarkan di `globals.css`; token
`.work-setup-page` `--work-setup-font` dan `--work-setup-weight-*` merupakan
satu-satunya konfigurasi yang mengaktifkannya. Route lain tetap memakai font
global yang ada.

Simpan file font aplikasi lain di folder ini, misalnya `geist-sans.woff2`.

Setelah file ditambahkan, minta Codex untuk mendaftarkannya dengan `@font-face`
di `src/styles/globals.css`. Jangan mengubah nama token font di komponen.
