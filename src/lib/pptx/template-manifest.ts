/**
 * Template manifest.
 *
 * Maps semantic job-aid fields to the EXACT slide numbers and shape names found
 * in `HR Job Aid Creator Template.pptx` (verified by inspecting the deck's XML,
 * not by visual coordinates). `npm run template:validate` asserts every required
 * shape below still exists in the template and fails loudly if one is missing.
 *
 * NOTE: The brief's prose assumed a 7-slide "Video-to-Job-Aid" template. The file
 * actually supplied is an 8-slide HR job-aid template (Letter portrait, 8.5x11).
 * This manifest reflects the real file. Differences from the brief:
 *   - Slide 3 also carries the Disclaimer (brief put it on slide 2).
 *   - Slide 7 is an FAQ layout (brief assumed a closing slide here).
 *   - Slide 8 is the closing slide.
 */

export interface ShapeRef {
  /** Exact shape name as authored in the template XML (<p:cNvPr name=...>). */
  name: string;
  /** Whether template:validate should fail if this shape is absent. */
  required: boolean;
  /** Human note for maintainers. */
  note?: string;
}

export interface SlideManifest {
  /** 1-based slide number in the supplied template. */
  slideNumber: number;
  role:
    | 'cover'
    | 'introduction'
    | 'toc-and-disclaimer'
    | 'decision'
    | 'instructional-four'
    | 'instructional-two'
    | 'faq'
    | 'closing';
  /** Whether this slide is duplicated per generated content. */
  duplicable: boolean;
  shapes: Record<string, ShapeRef>;
}

export const TEMPLATE_FILE = 'HR Job Aid Creator Template.pptx';

/** Letter portrait, in EMU. Used to sanity-check the loaded template. */
export const SLIDE_SIZE_EMU = { cx: 7772400, cy: 10058400 } as const;
export const EMU_PER_INCH = 914400;

export const TEMPLATE_MANIFEST: SlideManifest[] = [
  {
    slideNumber: 1,
    role: 'cover',
    duplicable: false,
    shapes: {
      title: { name: 'Title 6', required: true },
      subtitle: { name: 'Text Placeholder 24', required: true },
    },
  },
  {
    slideNumber: 2,
    role: 'introduction',
    duplicable: false,
    shapes: {
      // Three content areas share the name "Content Placeholder 2"; they are
      // disambiguated by shape id in the loader (87 = about, 14 = goal, 18 = other).
      about: { name: 'Content Placeholder 2', required: true, note: 'shape id 87' },
      goal: { name: 'Content Placeholder 2', required: true, note: 'shape id 14' },
      other: { name: 'Content Placeholder 2', required: false, note: 'shape id 18' },
    },
  },
  {
    slideNumber: 3,
    role: 'toc-and-disclaimer',
    duplicable: true,
    shapes: {
      disclaimer: { name: 'Content Placeholder 2', required: true, note: 'shape id 49' },
      tocTopic1: { name: 'Text Placeholder 1', required: true, note: 'shape id 112' },
      tocSub1: { name: 'Text Placeholder 5', required: true, note: 'shape id 111' },
      tocTopic2: { name: 'Text Placeholder 1', required: false, note: 'shape id 5' },
      tocSub2: { name: 'Text Placeholder 5', required: false, note: 'shape id 4' },
    },
  },
  {
    slideNumber: 4,
    role: 'decision',
    duplicable: false,
    shapes: {
      // Included only for genuine branching content.
      topicTitle: { name: 'TextBox 223', required: false },
    },
  },
  {
    slideNumber: 5,
    role: 'instructional-four',
    duplicable: true,
    shapes: {
      sectionTitle: { name: 'TextBox 128', required: true, note: 'section-title band, y≈1.09"' },
      step1Text: { name: 'TextBox 14', required: true },
      step2Text: { name: 'TextBox 15', required: true },
      step3Text: { name: 'TextBox 18', required: true },
      step4Text: { name: 'TextBox 19', required: true },
      step1Num: { name: 'Oval 12', required: true },
      step2Num: { name: 'Oval 13', required: true },
      step3Num: { name: 'Oval 16', required: true },
      step4Num: { name: 'Oval 17', required: true },
      // Screenshot targets: solid rectangles. Slots 1–3 are nested inside groups;
      // slot 4 (Rectangle 39) is standalone. Images are injected via resolved
      // absolute geometry (group transform), not by swapping an existing <p:pic>.
      shot1: { name: 'Rectangle 20', required: true, note: 'inside Group 28' },
      shot2: { name: 'Rectangle 30', required: true, note: 'inside Group 29' },
      shot3: { name: 'Rectangle 34', required: true, note: 'inside Group 33' },
      shot4: { name: 'Rectangle 39', required: true, note: 'standalone (not grouped)' },
    },
  },
  {
    slideNumber: 6,
    role: 'instructional-two',
    duplicable: true,
    shapes: {
      sectionTitle: { name: 'TextBox 52', required: true },
      step1Text: { name: 'TextBox 50', required: true },
      step2Text: { name: 'TextBox 51', required: true },
      step1Num: { name: 'Oval 48', required: true },
      step2Num: { name: 'Oval 49', required: true },
      shot1: { name: 'Rectangle 20', required: true, note: 'inside Group 28' },
      shot2: { name: 'Rectangle 30', required: true, note: 'inside Group 29' },
    },
  },
  {
    slideNumber: 7,
    role: 'faq',
    duplicable: true,
    shapes: {
      faq1: { name: 'Content Placeholder 2', required: false, note: 'shape id 87' },
    },
  },
  {
    slideNumber: 8,
    role: 'closing',
    duplicable: false,
    shapes: {},
  },
];

export function slideByRole(role: SlideManifest['role']): SlideManifest {
  const m = TEMPLATE_MANIFEST.find((s) => s.role === role);
  if (!m) throw new Error(`No template slide mapped for role "${role}"`);
  return m;
}
