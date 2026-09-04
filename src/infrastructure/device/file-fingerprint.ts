/**
 * Computes a stable SHA-256 fingerprint of raw file bytes via the
 * browser's Web Crypto API (rule 8: "Calculate a stable file fingerprint
 * from file bytes (Web Crypto SHA-256 preferred)"). Pure infrastructure/
 * device concern — no dependency on SheetJS or any domain/application
 * type, so it is reusable beyond the Excel handover import.
 */
export async function computeFileFingerprint(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return toHex(digest)
}

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let hex = ''
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0')
  }
  return hex
}
