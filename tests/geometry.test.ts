import { describe, it, expect } from 'vitest';
import { resolveAbsoluteRect } from '../src/lib/pptx/geometry';

// A minimal slide with a rectangle nested inside a group. The group maps a
// child coordinate space (chOff/chExt) onto a placed box (off/ext).
const groupedSlide = `<p:spTree>
<p:grpSp><p:nvGrpSpPr/><p:grpSpPr><a:xfrm>
  <a:off x="1000000" y="2000000"/><a:ext cx="4000000" cy="4000000"/>
  <a:chOff x="0" y="0"/><a:chExt cx="8000000" cy="8000000"/>
</a:xfrm></p:grpSpPr>
  <p:sp><p:nvSpPr><p:cNvPr id="5" name="Rectangle 20"/></p:nvSpPr><p:spPr><a:xfrm>
    <a:off x="2000000" y="2000000"/><a:ext cx="4000000" cy="4000000"/>
  </a:xfrm></p:spPr></p:sp>
</p:grpSp>
</p:spTree>`;

const ungroupedSlide = `<p:spTree><p:sp><p:nvSpPr><p:cNvPr id="9" name="Plain"/></p:nvSpPr>
<p:spPr><a:xfrm><a:off x="500000" y="600000"/><a:ext cx="700000" cy="800000"/></a:xfrm></p:spPr></p:sp></p:spTree>`;

describe('geometry resolver', () => {
  it('maps a shape through its parent group transform (scale 0.5, offset)', () => {
    const r = resolveAbsoluteRect(groupedSlide, 'Rectangle 20');
    // scale = 4,000,000 / 8,000,000 = 0.5
    // x = 1,000,000 + (2,000,000 - 0) * 0.5 = 2,000,000
    // cx = 4,000,000 * 0.5 = 2,000,000
    expect(r).toEqual({ x: 2_000_000, y: 3_000_000, cx: 2_000_000, cy: 2_000_000 });
  });

  it('returns local rect when the shape is not grouped', () => {
    const r = resolveAbsoluteRect(ungroupedSlide, 'Plain');
    expect(r).toEqual({ x: 500_000, y: 600_000, cx: 700_000, cy: 800_000 });
  });

  it('returns null for a missing shape', () => {
    expect(resolveAbsoluteRect(ungroupedSlide, 'Nope')).toBeNull();
  });

  it('does NOT apply a group transform to a standalone shape that follows the group', () => {
    // Regression: a shape after </p:grpSp> must not inherit that group's xfrm.
    const xml =
      groupedSlide.replace('</p:spTree>', '') +
      `<p:sp><p:nvSpPr><p:cNvPr id="99" name="Standalone"/></p:nvSpPr><p:spPr><a:xfrm>
        <a:off x="4000000" y="7000000"/><a:ext cx="3000000" cy="1000000"/>
      </a:xfrm></p:spPr></p:sp></p:spTree>`;
    expect(resolveAbsoluteRect(xml, 'Standalone')).toEqual({
      x: 4_000_000, y: 7_000_000, cx: 3_000_000, cy: 1_000_000,
    });
  });
});
