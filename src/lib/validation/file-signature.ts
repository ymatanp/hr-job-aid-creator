/**
 * Content-based file type detection. We never trust the client-supplied
 * extension or MIME type for security decisions; we sniff magic bytes.
 */

export type DetectedKind = 'mp4' | 'mov' | 'webm' | 'txt' | 'md' | 'docx' | 'unknown';

const startsWith = (buf: Buffer, bytes: number[], offset = 0) =>
  bytes.every((b, i) => buf[offset + i] === b);

/** ISO Base Media (mp4/mov) files carry an 'ftyp' box at offset 4. */
function isoBrand(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (!(buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70)) return null; // 'ftyp'
  return buf.subarray(8, 12).toString('ascii');
}

export function detectFileKind(buf: Buffer): DetectedKind {
  if (buf.length < 4) return 'unknown';

  // WEBM / Matroska: EBML header 0x1A45DFA3
  if (startsWith(buf, [0x1a, 0x45, 0xdf, 0xa3])) return 'webm';

  const brand = isoBrand(buf);
  if (brand) {
    if (/^qt/i.test(brand)) return 'mov';
    // isom, mp4x, avc1, iso2, mmp4, M4V ... -> treat as mp4 container
    return 'mp4';
  }

  // DOCX / any OOXML is a ZIP (PK\x03\x04). Caller confirms it is truly a docx.
  if (startsWith(buf, [0x50, 0x4b, 0x03, 0x04])) return 'docx';

  // Fall back to text heuristic: valid UTF-8-ish with no NULs in the head.
  const head = buf.subarray(0, 512);
  if (!head.includes(0x00)) return 'txt';

  return 'unknown';
}

export function isAcceptedVideoKind(kind: DetectedKind): kind is 'mp4' | 'mov' | 'webm' {
  return kind === 'mp4' || kind === 'mov' || kind === 'webm';
}
