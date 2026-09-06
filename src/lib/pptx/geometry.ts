/**
 * Resolves the ABSOLUTE position (in EMU) of a named shape in a slide, including
 * shapes nested inside groups. Screenshot placeholders in this template are
 * solid rectangles inside <p:grpSp>, so their local coordinates must be mapped
 * through the group transform:
 *
 *   absX = groupOff.x + (childOff.x - groupChOff.x) * (groupExt.cx / groupChExt.cx)
 *
 * Pure functions over XML strings so they are unit-testable without a real file.
 */

export interface Rect {
  x: number;
  y: number;
  cx: number;
  cy: number;
}

interface Xfrm {
  off: { x: number; y: number };
  ext: { cx: number; cy: number };
  chOff?: { x: number; y: number };
  chExt?: { cx: number; cy: number };
}

function parseXfrm(block: string): Xfrm | null {
  const off = /<a:off x="(-?\d+)" y="(-?\d+)"\/>/.exec(block);
  const ext = /<a:ext cx="(\d+)" cy="(\d+)"\/>/.exec(block);
  if (!off || !ext) return null;
  const chOff = /<a:chOff x="(-?\d+)" y="(-?\d+)"\/>/.exec(block);
  const chExt = /<a:chExt cx="(\d+)" cy="(\d+)"\/>/.exec(block);
  return {
    off: { x: +off[1], y: +off[2] },
    ext: { cx: +ext[1], cy: +ext[2] },
    chOff: chOff ? { x: +chOff[1], y: +chOff[2] } : undefined,
    chExt: chExt ? { cx: +chExt[1], cy: +chExt[2] } : undefined,
  };
}

/**
 * Compute balanced [start, end] byte ranges for every <p:grpSp>…</p:grpSp>,
 * handling nesting via a stack. Returns ranges paired with the group's own xfrm.
 */
function groupRanges(slideXml: string): Array<{ start: number; end: number; xfrm: Xfrm }> {
  const tag = /<p:grpSp>|<\/p:grpSp>/g;
  const stack: number[] = [];
  const ranges: Array<{ start: number; end: number; xfrm: Xfrm }> = [];
  let m: RegExpExecArray | null;
  while ((m = tag.exec(slideXml))) {
    if (m[0] === '<p:grpSp>') {
      stack.push(m.index);
    } else {
      const start = stack.pop();
      if (start === undefined) continue;
      const end = m.index;
      // The group's own transform lives in its <p:grpSpPr>, before any child.
      const head = slideXml.slice(start, Math.min(end, start + 2000));
      const grpPr = /<p:grpSpPr>[\s\S]*?<a:xfrm[^>]*>([\s\S]*?)<\/a:xfrm>/.exec(head);
      const xfrm = grpPr ? parseXfrm(grpPr[1]) : null;
      if (xfrm && xfrm.chOff && xfrm.chExt) ranges.push({ start, end, xfrm });
    }
  }
  return ranges;
}

/**
 * The innermost group that TRULY encloses the shape (shapeIndex within its
 * balanced range). This template has no nested groups, so a single transform
 * applies; a standalone shape (e.g. Rectangle 39) correctly returns null.
 */
function enclosingGroupXfrm(slideXml: string, shapeIndex: number): Xfrm | null {
  const containing = groupRanges(slideXml).filter(
    (r) => r.start <= shapeIndex && shapeIndex < r.end,
  );
  if (!containing.length) return null;
  // innermost = largest start
  containing.sort((a, b) => b.start - a.start);
  return containing[0].xfrm;
}

/** Locate a shape by exact name and return its local <a:xfrm>. */
function shapeLocalRect(slideXml: string, shapeName: string): { rect: Rect; index: number } | null {
  const nameIdx = slideXml.indexOf(`name="${shapeName}"`);
  if (nameIdx < 0) return null;
  const window = slideXml.slice(nameIdx, nameIdx + 900);
  const xf = /<a:xfrm[^>]*>([\s\S]*?)<\/a:xfrm>/.exec(window);
  if (!xf) return null;
  const parsed = parseXfrm(xf[1]);
  if (!parsed) return null;
  return {
    rect: { x: parsed.off.x, y: parsed.off.y, cx: parsed.ext.cx, cy: parsed.ext.cy },
    index: nameIdx,
  };
}

/** Absolute rectangle (EMU) of a named shape, mapping through a parent group. */
export function resolveAbsoluteRect(slideXml: string, shapeName: string): Rect | null {
  const local = shapeLocalRect(slideXml, shapeName);
  if (!local) return null;
  const group = enclosingGroupXfrm(slideXml, local.index);
  if (!group || !group.chOff || !group.chExt) return local.rect;

  const sx = group.ext.cx / group.chExt.cx;
  const sy = group.ext.cy / group.chExt.cy;
  return {
    x: Math.round(group.off.x + (local.rect.x - group.chOff.x) * sx),
    y: Math.round(group.off.y + (local.rect.y - group.chOff.y) * sy),
    cx: Math.round(local.rect.cx * sx),
    cy: Math.round(local.rect.cy * sy),
  };
}

export const EMU_PER_INCH = 914400;
export const emuToInch = (emu: number) => emu / EMU_PER_INCH;
