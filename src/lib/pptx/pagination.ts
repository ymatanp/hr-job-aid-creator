/**
 * Turns an approved JobAidDraft into a concrete slide plan: chooses one
 * instructional density per section, splits steps across duplicated slides, and
 * assigns CONTINUOUS step numbers across the whole deck. Pure + unit-testable.
 */
import type { JobAidDraft, Section, Step } from '../validation/schemas';
import type { Intake } from '../validation/schemas';

export type Density = 'one' | 'two' | 'four';

export interface NumberedStep extends Step {
  /** 1-based number continuous across the entire job aid. */
  number: number;
}

export interface InstructionalPage {
  kind: 'instructional';
  sectionId: string;
  sectionTitle: string;
  density: Density;
  /** Slots per page: 1, 2, or 4. */
  steps: NumberedStep[];
}

export interface DecisionPage {
  kind: 'decision';
  sectionId: string;
  sectionTitle: string;
  decision: NonNullable<Section['decision']>;
}

export type ContentPage = InstructionalPage | DecisionPage;

const SLOTS: Record<Density, number> = { one: 1, two: 2, four: 4 };

/** Auto density: use two-up when steps are text-heavy, else four-up. */
export function chooseDensity(section: Section, requested: Intake['screenshotDensity']): Density {
  if (requested !== 'auto') return requested;
  const heavy = section.steps.some(
    (s) => (s.instruction?.length ?? 0) > 120 || !!s.expectedResult,
  );
  return heavy ? 'two' : 'four';
}

export function paginate(draft: JobAidDraft, intake: Intake): ContentPage[] {
  const pages: ContentPage[] = [];
  let counter = 0;

  for (const section of draft.sections) {
    if (section.kind === 'decision' && section.decision) {
      if (!intake.allowDecisionSlide) continue; // only when the operator permits
      pages.push({
        kind: 'decision',
        sectionId: section.id,
        sectionTitle: section.title,
        decision: section.decision,
      });
      continue;
    }

    const density = chooseDensity(section, intake.screenshotDensity);
    const perPage = SLOTS[density];
    const numbered: NumberedStep[] = section.steps.map((s) => ({ ...s, number: ++counter }));

    for (let i = 0; i < numbered.length; i += perPage) {
      pages.push({
        kind: 'instructional',
        sectionId: section.id,
        sectionTitle: section.title,
        density,
        steps: numbered.slice(i, i + perPage),
      });
    }
  }
  return pages;
}

/** TOC entries reflect the final paginated sections (built AFTER pagination). */
export interface TocEntry {
  title: string;
  /** Step range shown as a sub-topic, e.g. "Steps 1–4". */
  detail: string;
}

export function buildToc(pages: ContentPage[]): TocEntry[] {
  const bySection = new Map<string, { title: string; numbers: number[] }>();
  for (const p of pages) {
    const entry = bySection.get(p.sectionId) ?? { title: p.sectionTitle, numbers: [] };
    if (p.kind === 'instructional') entry.numbers.push(...p.steps.map((s) => s.number));
    bySection.set(p.sectionId, entry);
  }
  return [...bySection.values()].map(({ title, numbers }) => {
    if (numbers.length === 0) return { title, detail: 'Decision' };
    const lo = Math.min(...numbers);
    const hi = Math.max(...numbers);
    return { title, detail: lo === hi ? `Step ${lo}` : `Steps ${lo}–${hi}` };
  });
}
