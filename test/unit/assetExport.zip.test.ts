import { describe, expect, it } from 'vitest'
import { buildZip, sanitizeZipEntryName } from '../../server/utils/zip'

/**
 * Manually parses the STORED-only ZIP structure this writer produces (no
 * decompression needed, entries are stored raw) — a genuine structural
 * round-trip check against the actual byte layout, not a trust-the-writer
 * assertion on entry count alone.
 */
function readStoredZipEntries(zip: Uint8Array): Array<{ name: string; data: Uint8Array }> {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  const entries: Array<{ name: string; data: Uint8Array }> = []
  let offset = 0
  while (offset < zip.length && view.getUint32(offset, true) === 0x04034b50) {
    const method = view.getUint16(offset + 8, true)
    const compressedSize = view.getUint32(offset + 18, true)
    const nameLen = view.getUint16(offset + 26, true)
    const extraLen = view.getUint16(offset + 28, true)
    const nameStart = offset + 30
    const name = new TextDecoder().decode(zip.slice(nameStart, nameStart + nameLen))
    const dataStart = nameStart + nameLen + extraLen
    const data = zip.slice(dataStart, dataStart + compressedSize)
    expect(method).toBe(0) // STORED — this test only knows how to read uncompressed entries
    entries.push({ name, data })
    offset = dataStart + compressedSize
  }
  return entries
}

describe('buildZip', () => {
  it('round-trips multiple entries with correct names and bytes', () => {
    const a = new TextEncoder().encode('contenido del archivo A')
    const b = new Uint8Array([0, 1, 2, 255, 254, 253, 10, 20, 30])
    const zip = buildZip([
      { name: 'pdf/dossier-es.pdf', data: a },
      { name: 'metadata.json', data: b },
    ])

    const entries = readStoredZipEntries(zip)
    expect(entries.map((e) => e.name)).toEqual(['pdf/dossier-es.pdf', 'metadata.json'])
    expect([...entries[0].data]).toEqual([...a])
    expect([...entries[1].data]).toEqual([...b])
  })

  it('ends with a valid End Of Central Directory record', () => {
    const zip = buildZip([{ name: 'a.txt', data: new TextEncoder().encode('x') }])
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
    // EOCD is exactly 22 bytes and must be the last thing in the archive.
    const eocdOffset = zip.length - 22
    expect(view.getUint32(eocdOffset, true)).toBe(0x06054b50)
    expect(view.getUint16(eocdOffset + 8, true)).toBe(1) // one entry on this disk
    expect(view.getUint16(eocdOffset + 10, true)).toBe(1) // one entry total
  })

  it('produces an empty-but-valid archive for zero entries', () => {
    const zip = buildZip([])
    expect(zip.length).toBe(22) // just the EOCD record
    const view = new DataView(zip.buffer)
    expect(view.getUint32(0, true)).toBe(0x06054b50)
  })

  it('preserves byte-exact content for binary (non-UTF8-safe) data', () => {
    const binary = new Uint8Array(256)
    for (let i = 0; i < 256; i++) binary[i] = i
    const zip = buildZip([{ name: 'binary.bin', data: binary }])
    const [entry] = readStoredZipEntries(zip)
    expect([...entry.data]).toEqual([...binary])
  })
})

describe('sanitizeZipEntryName', () => {
  it('strips path-unsafe characters', () => {
    expect(sanitizeZipEntryName('a/b\\c:d*e?f"g<h>i|j')).toBe('a-b-c-d-e-f-g-h-i-j')
  })

  it('falls back to a placeholder for an empty/whitespace name', () => {
    expect(sanitizeZipEntryName('   ')).toBe('archivo')
  })

  it('leaves a normal name untouched', () => {
    expect(sanitizeZipEntryName('Piso en Malasaña 3hab.pdf')).toBe('Piso en Malasaña 3hab.pdf')
  })
})
