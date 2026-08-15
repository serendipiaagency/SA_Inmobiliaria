import { PDFDocument } from 'pdf-lib'

/**
 * Confirms an uploaded PDF is actually a well-formed document, not just bytes
 * that start with "%PDF" (the magic-byte check in media.ts) and stop mattering
 * after that. Reuses pdf-lib — already a dependency, already trusted
 * elsewhere in this codebase for rendering — instead of hand-rolling a PDF
 * structure parser: a truncated xref table or a broken object stream is
 * exactly the kind of thing a real parser catches and an ad hoc byte check
 * doesn't.
 *
 * Deliberately lenient on spec conformance (`throwOnInvalidObject: false`,
 * the pdf-lib default): plenty of real-world PDFs from banks, government
 * portals and scanners have minor spec violations that every major PDF
 * viewer tolerates. This is a corruption/truncation check, not a conformance
 * check — rejecting a legitimate customer's bank statement because their
 * bank's PDF generator is imperfect would be the wrong tradeoff.
 */
export async function validatePdfIntegrity(bytes: Uint8Array): Promise<{ ok: boolean; reason?: string; pageCount?: number }> {
  let doc
  try {
    doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })
  } catch (err: any) {
    return { ok: false, reason: `PDF dañado o truncado: ${err?.message || 'no se pudo analizar'}` }
  }
  const pageCount = doc.getPageCount()
  if (pageCount < 1) return { ok: false, reason: 'El PDF no contiene páginas.' }
  return { ok: true, pageCount }
}
