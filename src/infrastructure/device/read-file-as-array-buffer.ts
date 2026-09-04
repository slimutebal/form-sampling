/**
 * Reads a File's raw bytes as an ArrayBuffer. Prefers the modern
 * `File.prototype.arrayBuffer()` (supported by every targeted field
 * browser — TECH_STACK.md §11: modern Chrome/Chromium, Safari 16.4+),
 * falling back to the classic `FileReader` API when unavailable.
 */
export function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') {
    return file.arrayBuffer()
  }

  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'))
    reader.readAsArrayBuffer(file)
  })
}
