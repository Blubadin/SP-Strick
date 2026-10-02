// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SettingsSwitch from './SettingsSwitch';

describe('SettingsSwitch', () => {
  it('exposes an accessible switch and reports the next value on activation', () => {
    const onChange = vi.fn();
    render(
      <SettingsSwitch
        title="Haptic feedback"
        description="Subtle controller vibration"
        checked={false}
        onChange={onChange}
      />
    );

    const control = screen.getByRole('switch', { name: 'Haptic feedback' });
    expect(control.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(control);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
