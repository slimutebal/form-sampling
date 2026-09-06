/**
 * Triggers a browser file download for already-built bytes (Phase 18
 * wiring correction §13 Excel export). Plain, standard `Blob`/object-URL
 * mechanics — no server, no new storage; the object URL is revoked
 * immediately after the synthetic click so it never leaks.
 */
export function downloadFile(bytes: ArrayBuffer, filename: string, mimeType: string): void {
  const blob = new Blob([bytes], { type: mimeType })
  const url = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
  } finally {
    URL.revokeObjectURL(url)
  }
}
