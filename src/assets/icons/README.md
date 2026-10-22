# Icon khusus

Simpan SVG khusus di sini hanya bila `lucide-react` tidak memiliki icon yang
sesuai. Import file dari `@/assets/icons/...` agar Vite memasukkannya ke build.

Jika SVG adalah vektor dengan `fill="currentColor"` atau `stroke="currentColor"`,
warnanya dapat diatur dari class seperti `text-primary` atau
`text-muted-foreground`. Jangan mengubah warna satu per satu di file SVG.

`truck.svg` saat ini adalah gambar PNG yang dibungkus SVG, bukan path vektor.
Warnanya tidak dapat mengikuti `currentColor` tanpa mengganti visual icon.
Pertahankan file tersebut sampai tersedia source SVG vektor yang setara.
