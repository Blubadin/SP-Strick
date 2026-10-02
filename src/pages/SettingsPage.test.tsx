// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import SettingsPage from './SettingsPage';

describe('SettingsPage', () => {
  it('renders preferences without entering a state update loop', () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Haptic feedback' })).toBeTruthy();
  });
});
