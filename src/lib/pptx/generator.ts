/**
 * PowerPoint generation service. Builds the deck by DUPLICATING template slides
 * and replacing named shapes — it never rebuilds or flattens the template.
 * Images are injected over the (grouped) placeholder rectangles at their resolved
 * absolute geometry, contain-fit, via pptx-automizer's bundled pptxgenjs.
 */
import path from 'node:path';
import Automizer, { modify, type ISlide } from 'pptx-automizer';
import type { JobAidDraft, Intake } from '../validation/schemas';
import { TEMPLATE_FILE } from './template-manifest';
import { loadSlideXmls } from './templateReader';
import { resolveAbsoluteRect, emuToInch, type Rect } from './geometry';
import { paginate, buildToc, type ContentPage, type DecisionPage } from './pagination';
import { pruneOrphanSlides } from './cleanup';

export interface GenerateOptions {
  draft: JobAidDraft;
  intake: Intake;
  templateDir: string;
  outputDir: string;
  outputName: string;
  /** Screenshot PNG bytes keyed by step id. Optional — steps may be text-only. */
  screenshots?: Map<string, Buffer>;
  includeClosing?: boolean;
}

/**
 * Shapes that share the name "Content Placeholder 2" / "Text Placeholder N" must
 * be addressed by creationId — pptx-automizer zeroes `nameIdx` whenever a shape
 * has a creationId, so name+index selectors collapse onto the first match.
 * These ids come from the template XML (see scripts/probe-nameidx.ts).
 */
const CID = {
  intro: {
    about: '{CBE5EB84-656F-B540-0DAD-F15CF665DCBC}',
    goal: '{5A2256FB-F322-7C40-4C1A-21691C05A03E}',
    other: '{9E477E0F-924D-4196-CA32-12D45FD0F3BF}',
  },
  toc: {
    topic1: '{16C0A977-F77F-A106-9C0B-051B4E7D077C}',
    sub1: '{9AF4B4B5-47E6-8D42-726C-127608C45FA1}',
    topic2: '{BB1A0504-8CB6-15B3-97A0-16BED935604F}',
    sub2: '{AFCEAF4B-5752-D239-EFBA-A9BFBFE5EDAE}',
  },
  decision: {
    points: [
      '{50E8AF73-5977-0E98-E275-9BA900513727}',
      '{E612D2AF-3C27-E538-8E94-1EB6B4EB9893}',
      '{16FE9133-2C70-BFEC-E40C-F5C99F1D2FDE}',
      '{E3B3FFA2-A3BB-85FE-24E9-24CBE3DDEE0B}',
      '{190BB598-0B7F-F72F-0BDB-3F072993A6D3}',
    ],
    stop: '{C83B61BE-E912-48D3-8F28-3D06519C0420}',
    next: '{F14A94E0-9796-436A-12AB-C2CE64384E82}',
  },
  // The "For more information … <Insert Link …>" resources box appears on each
  // content slide, keyed by slide number.
  resources: {
    4: '{F15E9A1D-3E51-3912-65A1-48AAF8D5E529}',
    5: '{5A462C36-9DF1-BEC1-2DED-9E1CA95B312F}',
    6: '{1EB9249A-C669-09FD-27FF-16C0DD8094A2}',
  } as Record<number, string>,
} as const;

const CP2 = 'Content Placeholder 2';

/**
 * Populate the further-resources box with an approved link, or clear the
 * "<Insert Link …>" prompt entirely when no resource was provided — so no
 * placeholder text ever ships.
 */
function applyResources(slide: ISlide, slideNumber: number, draft: JobAidDraft): void {
  const cid = CID.resources[slideNumber];
  if (!cid) return;
  const r = draft.resources?.[0];
  const text = r ? `For more information, please review the ${r.label}: ${r.url}` : '';
  slide.modifyElement({ name: CP2, creationId: cid }, [modify.setText(text)]);
}

/**
 * Instructional layout specs, keyed by density. Each slot maps a step to its
 * number-oval, text box, and screenshot rectangle (all verified shape names).
 * "one" reuses the two-screen slide with a single large screenshot.
 */
interface Slot { num: string; text: string; shot: string }
interface LayoutSpec { slide: number; title: string; slots: Slot[] }

const LAYOUTS: Record<'two' | 'four', LayoutSpec> = {
  four: {
    slide: 5,
    title: 'TextBox 128',
    slots: [
      { num: 'Oval 12', text: 'TextBox 14', shot: 'Rectangle 20' },
      { num: 'Oval 13', text: 'TextBox 15', shot: 'Rectangle 30' },
      { num: 'Oval 16', text: 'TextBox 18', shot: 'Rectangle 34' },
      { num: 'Oval 17', text: 'TextBox 19', shot: 'Rectangle 39' },
    ],
  },
  two: {
    slide: 6,
    title: 'TextBox 52',
    slots: [
      { num: 'Oval 48', text: 'TextBox 50', shot: 'Rectangle 20' },
      { num: 'Oval 49', text: 'TextBox 51', shot: 'Rectangle 30' },
    ],
  },
};

export async function generateDeck(opts: GenerateOptions): Promise<{ file: string; slideCount: number }> {
  const { draft, intake } = opts;
  const pages = paginate(draft, intake);
  const toc = buildToc(pages);

  // Resolve screenshot placeholder geometry from the real template once, per layout.
  const xmls = await loadSlideXmls(path.join(opts.templateDir, TEMPLATE_FILE));
  const shotRects: Record<'two' | 'four', Rect[]> = {
    two: LAYOUTS.two.slots.map((s) => resolveAbsoluteRect(xmls[LAYOUTS.two.slide], s.shot)!),
    four: LAYOUTS.four.slots.map((s) => resolveAbsoluteRect(xmls[LAYOUTS.four.slide], s.shot)!),
  };

  const automizer = new Automizer({
    templateDir: opts.templateDir,
    outputDir: opts.outputDir,
    removeExistingSlides: true,
    mediaDir: opts.outputDir,
  });
  const pres = automizer.loadRoot(TEMPLATE_FILE).load(TEMPLATE_FILE, 'tmpl');

  // 1) Cover
  pres.addSlide('tmpl', 1, (slide) => {
    slide.modifyElement('Title 6', [modify.setText(draft.title)]);
    if (draft.subtitle) slide.modifyElement('Text Placeholder 24', [modify.setText(draft.subtitle)]);
  });

  // 2) Introduction (about / goal / other)
  pres.addSlide('tmpl', 2, (slide) => {
    slide.modifyElement({ name: CP2, creationId: CID.intro.about }, [modify.setText(draft.purpose)]);
    slide.modifyElement({ name: CP2, creationId: CID.intro.goal }, [modify.setText(`Audience: ${draft.audience}`)]);
    slide.modifyElement({ name: CP2, creationId: CID.intro.other }, [modify.setText(draft.disclaimer)]);
  });

  // 3) TOC + document info + disclaimer
  pres.addSlide('tmpl', 3, (slide) => {
    slide.modifyElement(CP2, [modify.setText(draft.disclaimer)]); // only one on this slide
    if (toc[0]) {
      slide.modifyElement({ name: 'Text Placeholder 1', creationId: CID.toc.topic1 }, [modify.setText(toc[0].title)]);
      slide.modifyElement({ name: 'Text Placeholder 5', creationId: CID.toc.sub1 }, [modify.setText(toc[0].detail)]);
    }
    if (toc[1]) {
      slide.modifyElement({ name: 'Text Placeholder 1', creationId: CID.toc.topic2 }, [modify.setText(toc[1].title)]);
      slide.modifyElement({ name: 'Text Placeholder 5', creationId: CID.toc.sub2 }, [modify.setText(toc[1].detail)]);
    }
  });

  // 4) Content slides: instructional (density-aware) and decision.
  for (const page of pages) {
    if (page.kind === 'decision') {
      addDecisionSlide(pres, page, draft);
      continue;
    }

    // "one" reuses the two-screen slide with a single large screenshot.
    const layoutKey: 'two' | 'four' = page.density === 'four' ? 'four' : 'two';
    const layout = LAYOUTS[layoutKey];
    const rects = shotRects[layoutKey];
    const single = page.density === 'one';
    const usable = single ? 1 : layout.slots.length;
    const stepsForPage = page.steps.slice(0, usable);

    const localMedia: Array<{ data: string; rect: Rect; alt: string }> = [];
    stepsForPage.forEach((step, i) => {
      const png = opts.screenshots?.get(step.id);
      if (!png) return;
      // One key screen: span the union of both two-screen placeholders.
      const rect = single ? unionRect(rects) : rects[i];
      if (rect) localMedia.push({ data: `image/png;base64,${png.toString('base64')}`, rect, alt: step.instruction });
    });

    pres.addSlide('tmpl', layout.slide, (slide) => {
      slide.modifyElement(layout.title, [modify.setText(page.sectionTitle)]);
      stepsForPage.forEach((step, i) => {
        const body = step.expectedResult ? `${step.instruction}\n${step.expectedResult}` : step.instruction;
        slide.modifyElement(layout.slots[i].text, [modify.setText(body)]);
        slide.modifyElement(layout.slots[i].num, [modify.setText(String(step.number))]); // continuous numbering
      });
      // Remove unused slots cleanly (no empty numbered placeholders left behind).
      for (let i = stepsForPage.length; i < layout.slots.length; i++) {
        try {
          slide.removeElement(layout.slots[i].num);
          slide.removeElement(layout.slots[i].text);
        } catch {
          /* slot may not exist on this layout */
        }
      }

      applyResources(slide, layout.slide, draft);

      if (localMedia.length) {
        slide.generate((gen) => {
          for (const m of localMedia) {
            const x = emuToInch(m.rect.x);
            const y = emuToInch(m.rect.y);
            const w = emuToInch(m.rect.cx);
            const h = emuToInch(m.rect.cy);
            gen.addImage({ data: m.data, x, y, w, h, sizing: { type: 'contain', w, h }, altText: m.alt });
          }
        });
      }
    });
  }

  // 5) Closing
  if (opts.includeClosing !== false) {
    pres.addSlide('tmpl', 8, () => {});
  }

  const summary = await pres.write(opts.outputName);
  const file = path.join(opts.outputDir, opts.outputName);
  // Strip the orphaned original template slides pptx-automizer leaves behind.
  await pruneOrphanSlides(file);
  return { file, slideCount: summary.slides ?? 0 };
}

/** Smallest rectangle covering all given rects (for the single-screen layout). */
function unionRect(rects: Rect[]): Rect | undefined {
  if (!rects.length) return undefined;
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  const right = Math.max(...rects.map((r) => r.x + r.cx));
  const bottom = Math.max(...rects.map((r) => r.y + r.cy));
  return { x, y, cx: right - x, cy: bottom - y };
}

// Slide 4 decision placeholders (all named "Content Placeholder 2"), by doc order:
// 0..4 = decision points, 5 = stop, 6 = next step, 8 = resources (left untouched).
const DECISION_POINT_SLOTS = 5;

/**
 * Populate the decision/process-flow template. We only insert content grounded in
 * the source (the question + provided paths); any decision-point/stop/next slot we
 * do not fill is cleared so no "<Insert …>" placeholder text ever ships.
 */
function addDecisionSlide(pres: Automizer, page: DecisionPage, draft: JobAidDraft): void {
  pres.addSlide('tmpl', 4, (slide) => {
    slide.modifyElement('TextBox 223', [modify.setText(page.decision.question)]);
    applyResources(slide, 4, draft);
    for (let i = 0; i < DECISION_POINT_SLOTS; i++) {
      const p = page.decision.paths[i];
      const text = p ? `If ${p.label}: ${p.destination}` : '';
      slide.modifyElement({ name: CP2, creationId: CID.decision.points[i] }, [modify.setText(text)]);
    }
    // Clear the stop-point and next-step placeholder prompts so none ships.
    slide.modifyElement({ name: CP2, creationId: CID.decision.stop }, [modify.setText('')]);
    slide.modifyElement({ name: CP2, creationId: CID.decision.next }, [modify.setText('')]);
  });
}

export { paginate, buildToc };
export type { ContentPage };
