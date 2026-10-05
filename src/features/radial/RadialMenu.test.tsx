// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { RadialMenu } from './RadialMenu';
afterEach(cleanup);
it('allows an accessible choice and explicit cancellation alongside hold-release controls', () => {
  const choose=vi.fn(), cancel=vi.fn();
  const option={id:'attack',label:'Attack'};
  render(<RadialMenu options={[option,{id:'block',label:'Block'}]} activeOptionId="attack" categoryLabel="Skill" onChoose={choose} onCancel={cancel} size="large" />);
  const button=screen.getByRole('button',{name:'Attack'});
  expect(button.getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(button);
  expect(choose).toHaveBeenCalledWith(option);
  fireEvent.click(screen.getByRole('button',{name:'Cancel'}));
  expect(cancel).toHaveBeenCalledOnce();
});

it('uses compact physical wheel sizes and a subtle backdrop for each size preference', () => {
  const expectedSizes = [
    ['normal', '280px'],
    ['large', '300px'],
    ['extraLarge', '320px'],
  ] as const;

  for (const [size, diameter] of expectedSizes) {
    const { unmount } = render(
      <RadialMenu options={[]} activeOptionId={null} categoryLabel="Skill" size={size} />,
    );
    const wheel = document.querySelector('[data-size]');
    const overlay = wheel?.parentElement;

    expect(wheel?.getAttribute('data-size')).toBe(size);
    expect(wheel?.getAttribute('style')).toContain(`--preferred-size: ${diameter}`);
    expect(overlay?.getAttribute('style')).toContain('--backdrop-opacity: 0.12');
    unmount();
  }
});
