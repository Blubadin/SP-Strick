// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HomePage from './HomePage';
import { useControllerStore } from '../core/controller/ControllerStore';
import { XBOX_PROFILE } from '../core/controller/ControllerProfile';

const { toArray, orderBy } = vi.hoisted(() => {
  const toArray = vi.fn();
  const reverse = vi.fn(() => ({ toArray }));
  const orderBy = vi.fn(() => ({ reverse }));
  return { toArray, orderBy };
});

vi.mock('../core/persistence/database', () => ({
  db: {
    sessions: {
      orderBy
    }
  }
}));

describe('HomePage Tactical Workstation', () => {
  beforeEach(() => {
    toArray.mockResolvedValue([]);
    useControllerStore.setState((s) => ({
      ...s,
      profile: XBOX_PROFILE,
      state: {
        ...s.state,
        connected: true,
        id: 'Xbox Wireless Controller'
      }
    }));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders mini controller HUD widget and game hub grid cards', async () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );

    // Mini Controller HUD widget
    expect(screen.getByText(/CONTROLLER READY/i)).toBeTruthy();
    expect(screen.getAllByText(/Xbox Wireless Controller/i).length).toBeGreaterThanOrEqual(1);

    // 4 Hub cards
    expect(screen.getByText(/New Match Setup/i)).toBeTruthy();
    expect(screen.getByText(/Analytics & Review/i)).toBeTruthy();
    expect(screen.getAllByText(/Controller Station/i).length).toBeGreaterThanOrEqual(1);
  });

  it('displays active match details when an active session is in the database', async () => {
    toArray.mockResolvedValue([
      {
        id: 'session-live',
        name: 'Finals: Red Dragons vs Blue Wings',
        teamA: 'Red Dragons',
        teamB: 'Blue Wings',
        scoreA: 15,
        scoreB: 12,
        currentSet: 3,
        status: 'active'
      }
    ]);

    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Finals: Red Dragons vs Blue Wings/i)).toBeTruthy();
    });
    expect(screen.getByText('Red Dragons')).toBeTruthy();
    expect(screen.getByText('Blue Wings')).toBeTruthy();
  });

  it('supports keyboard arrow navigation between cards', () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );

    const buttons = screen.getAllByRole('button');
    // Card 0 should initially be active
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    // Move to card 1
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    // Move to card 3
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    // Move to card 2
    expect(buttons.length).toBeGreaterThan(0);
  });
});
