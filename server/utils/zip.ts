// Minimal ZIP writer — STORED (uncompressed) entries only, no external
// library. Cloudflare Workers has no zlib, and every entry here is already a
// compressed PDF, so skipping DEFLATE costs little size and avoids pulling in
// a compression dependency just to re-compress already-compressed bytes.
// Builds the whole archive in memory — fine for the handful of files a batch
// download bundles today, not intended for very large archives.

export interface ZipEntry {
  name: string
  data: Uint8Array
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function dosDateTime(date: Date) {
  const time = ((date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1)) & 0xffff
  const dosDate = (((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) & 0xffff
  return { time, dosDate }
}

export function buildZip(entries: ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder()
  const { time, dosDate } = dosDateTime(new Date())
  const chunks: Uint8Array[] = []
  const centralDirectory: Uint8Array[] = []
  let offset = 0

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name)
    const crc = crc32(entry.data)

    const localHeader = new Uint8Array(30 + nameBytes.length)
    const lv = new DataView(localHeader.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true) // version needed to extract
    lv.setUint16(6, 0, true) // flags
    lv.setUint16(8, 0, true) // method: stored
    lv.setUint16(10, time, true)
    lv.setUint16(12, dosDate, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, entry.data.length, true) // compressed size
    lv.setUint32(22, entry.data.length, true) // uncompressed size
    lv.setUint16(26, nameBytes.length, true)
    lv.setUint16(28, 0, true) // extra field length
    localHeader.set(nameBytes, 30)
    chunks.push(localHeader, entry.data)

    const centralHeader = new Uint8Array(46 + nameBytes.length)
    const cv = new DataView(centralHeader.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true) // version made by
    cv.setUint16(6, 20, true) // version needed
    cv.setUint16(8, 0, true)
    cv.setUint16(10, 0, true) // method: stored
    cv.setUint16(12, time, true)
    cv.setUint16(14, dosDate, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, entry.data.length, true)
    cv.setUint32(24, entry.data.length, true)
    cv.setUint16(28, nameBytes.length, true)
    cv.setUint16(30, 0, true) // extra length
    cv.setUint16(32, 0, true) // comment length
    cv.setUint16(34, 0, true) // disk number start
    cv.setUint16(36, 0, true) // internal attrs
    cv.setUint32(38, 0, true) // external attrs
    cv.setUint32(42, offset, true) // local header offset
    centralHeader.set(nameBytes, 46)
    centralDirectory.push(centralHeader)

    offset += localHeader.length + entry.data.length
  }

  const centralDirStart = offset
  let centralDirSize = 0
  for (const cd of centralDirectory) {
    chunks.push(cd)
    centralDirSize += cd.length
  }

  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(4, 0, true)
  ev.setUint16(6, 0, true)
  ev.setUint16(8, entries.length, true)
  ev.setUint16(10, entries.length, true)
  ev.setUint32(12, centralDirSize, true)
  ev.setUint32(16, centralDirStart, true)
  ev.setUint16(20, 0, true)
  chunks.push(eocd)

  const total = chunks.reduce((sum, c) => sum + c.length, 0)
  const out = new Uint8Array(total)
  let pos = 0
  for (const c of chunks) {
    out.set(c, pos)
    pos += c.length
  }
  return out
}

/** Strips characters that would be awkward or unsafe inside a ZIP entry name. */
export function sanitizeZipEntryName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '-').trim() || 'archivo'
}
