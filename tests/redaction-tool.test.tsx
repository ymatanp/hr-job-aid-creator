// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import RedactionTool, { type Rect } from '../src/components/RedactionTool';

const oneRect: Rect[] = [{ x: 0.1, y: 0.1, w: 0.3, h: 0.2 }];

function setup(rects: Rect[]) {
  const onChange = vi.fn();
  const utils = render(
    <RedactionTool
      idBase="s1"
      src="/frame.png"
      alt="Selected screenshot for step 1: Open the HR portal"
      rects={rects}
      onChange={onChange}
    />,
  );
  return { onChange, ...utils };
}

describe('RedactionTool accessibility + keyboard', () => {
  it('labels the drawing surface for screen readers', () => {
    setup([]);
    const canvas = screen.getByRole('application');
    expect(canvas).toHaveAccessibleName(/Redaction canvas.*Open the HR portal/i);
  });

  it('announces region count in a live status region', () => {
    setup([]);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(/No blur regions/i);
    setup(oneRect);
    expect(screen.getAllByRole('status').some((n) => /1 blur region/i.test(n.textContent || ''))).toBe(true);
  });

  it('removes a region via keyboard only (Tab to the labelled button, Enter)', async () => {
    const user = userEvent.setup();
    const { onChange } = setup(oneRect);
    const removeBtn = screen.getByRole('button', { name: /Remove region 1/i });

    await user.tab();
    expect(removeBtn).toHaveFocus(); // reachable by keyboard, no mouse
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith([]); // region removed
  });

  it('has no axe violations with and without regions', async () => {
    const { container: empty } = setup([]);
    expect(await axe(empty)).toHaveNoViolations();
    const { container: withRect } = setup(oneRect);
    expect(await axe(withRect)).toHaveNoViolations();
  });
});
