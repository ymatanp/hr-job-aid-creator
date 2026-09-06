import { describe, it, expect } from 'vitest';
import { paginate, buildToc, chooseDensity } from '../src/lib/pptx/pagination';
import type { JobAidDraft, Intake, Section } from '../src/lib/validation/schemas';

const baseIntake: Intake = {
  title: 'T',
  audience: 'A',
  purpose: 'P',
  owner: 'O',
  disclaimer: '',
  allowDecisionSlide: false,
  screenshotDensity: 'two',
};

function step(n: number, extra: Partial<{ instruction: string; expectedResult: string }> = {}) {
  return {
    id: `s${n}`,
    instruction: extra.instruction ?? `Do step ${n}`,
    expectedResult: extra.expectedResult,
    frameTimestampMs: n * 1000,
    confidence: 0.9,
    reviewFlags: [],
    redactions: [],
  };
}

function draft(sections: Section[]): JobAidDraft {
  return {
    title: 'T', audience: 'A', purpose: 'P', disclaimer: 'D', owner: 'O',
    lastUpdated: '2026-09-03', sections,
  };
}

describe('pagination + numbering', () => {
  it('splits steps by density and numbers continuously across pages', () => {
    const d = draft([
      { id: 'sec1', title: 'One', kind: 'steps', steps: [step(1), step(2), step(3)] },
      { id: 'sec2', title: 'Two', kind: 'steps', steps: [step(4), step(5)] },
    ]);
    const pages = paginate(d, { ...baseIntake, screenshotDensity: 'two' });
    // sec1 -> 2 pages (2+1), sec2 -> 1 page
    expect(pages).toHaveLength(3);
    const nums = pages.flatMap((p) => (p.kind === 'instructional' ? p.steps.map((s) => s.number) : []));
    expect(nums).toEqual([1, 2, 3, 4, 5]); // continuous, no resets across sections/pages
  });

  it('four density fits four per slide', () => {
    const d = draft([{ id: 'sec1', title: 'One', kind: 'steps', steps: [1, 2, 3, 4, 5].map((n) => step(n)) }]);
    const pages = paginate(d, { ...baseIntake, screenshotDensity: 'four' });
    expect(pages).toHaveLength(2);
    expect(pages[0].kind === 'instructional' && pages[0].steps.length).toBe(4);
  });

  it('omits decision pages unless allowed', () => {
    const decisionSection: Section = {
      id: 'd', title: 'Choose', kind: 'decision', steps: [],
      decision: { question: 'Q?', paths: [{ label: 'Yes', destination: 'A' }, { label: 'No', destination: 'B' }] },
    };
    expect(paginate(draft([decisionSection]), baseIntake)).toHaveLength(0);
    expect(paginate(draft([decisionSection]), { ...baseIntake, allowDecisionSlide: true })).toHaveLength(1);
  });

  it('auto density picks two-up for text-heavy steps', () => {
    const heavy: Section = { id: 's', title: 'H', kind: 'steps', steps: [step(1, { expectedResult: 'x' })] };
    const light: Section = { id: 's', title: 'L', kind: 'steps', steps: [step(1)] };
    expect(chooseDensity(heavy, 'auto')).toBe('two');
    expect(chooseDensity(light, 'auto')).toBe('four');
  });

  it('builds a TOC with correct step ranges after pagination', () => {
    const d = draft([
      { id: 'sec1', title: 'One', kind: 'steps', steps: [step(1), step(2), step(3)] },
      { id: 'sec2', title: 'Two', kind: 'steps', steps: [step(4)] },
    ]);
    const toc = buildToc(paginate(d, { ...baseIntake, screenshotDensity: 'two' }));
    expect(toc).toEqual([
      { title: 'One', detail: 'Steps 1–3' },
      { title: 'Two', detail: 'Step 4' },
    ]);
  });
});
