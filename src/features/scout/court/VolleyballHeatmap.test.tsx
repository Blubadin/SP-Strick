// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VolleyballHeatmap } from './VolleyballHeatmap';
import type { ScoutingEvent } from '../../../core/scouting/ScoutingEvent';
import '../../../i18n';

function createEvent(
  id: string,
  teamId: 'A' | 'B',
  originZone: number,
  evaluation: -1 | 0 | 1 = 1,
  actionIndex = 1
): ScoutingEvent {
  return {
    id,
    sport: 'volleyball',
    matchId: 'm-1',
    sessionId: 's-1',
    setNumber: 1,
    teamId,
    skill: 'attack',
    originZone,
    evaluation,
    actionIndex,
    timestamp: 1000,
    videoTimeMs: 14200,
    createdAt: new Date().toISOString(),
    inputSource: 'controller'
  };
}

describe('VolleyballHeatmap (Requirements 47-59, 97, 98)', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders a full two-sided court with Team A and Team B and empty state', () => {
    render(
      <VolleyballHeatmap
        events={[]}
        teamA="Kasem Bundit"
        teamB="Opponent"
      />
    );

    expect(screen.getByText(/Kasem Bundit/)).toBeTruthy();
    expect(screen.getByText(/Opponent/)).toBeTruthy();
    expect(screen.getByText('NET')).toBeTruthy();
    expect(screen.getByText(/Heatmap builds as actions are recorded/)).toBeTruthy();

    // Verify 12 zone buttons are rendered (6 for A, 6 for B)
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBe(12);
  });

  it('aggregates counts and renders heat indicators for recorded actions', () => {
    const events: ScoutingEvent[] = [
      createEvent('e1', 'A', 4, 1, 1),
      createEvent('e2', 'A', 4, 0, 2),
      createEvent('e3', 'A', 2, 1, 3),
      createEvent('e4', 'B', 1, 1, 4)
    ];

    render(
      <VolleyballHeatmap
        events={events}
        teamA="Team A"
        teamB="Team B"
      />
    );

    // Team A zone 4 has 2 actions
    const aZ4Btn = screen.getByRole('button', { name: /Team A Z4: 2 actions/ });
    expect(aZ4Btn).toBeTruthy();

    // Team B zone 1 has 1 action
    const bZ1Btn = screen.getByRole('button', { name: /Team B Z1: 1 actions/ });
    expect(bZ1Btn).toBeTruthy();
  });

  it('allows clicking a zone to inspect events and selecting an event triggers onInspectEvent', () => {
    const onInspectEvent = vi.fn();
    const eventA = createEvent('ev-101', 'A', 4, 1, 7);
    const eventB = createEvent('ev-102', 'A', 4, 0, 8);

    render(
      <VolleyballHeatmap
        events={[eventA, eventB]}
        teamA="Kasem Bundit"
        teamB="Opponent"
        onInspectEvent={onInspectEvent}
      />
    );

    // Click Team A Zone 4
    const aZ4Btn = screen.getByRole('button', { name: /Kasem Bundit Z4/ });
    fireEvent.click(aZ4Btn);

    // Detail section should open with action list
    expect(screen.getByText(/Kasem Bundit · Z4 \(2 actions\)/)).toBeTruthy();

    const actionRow = screen.getByRole('button', { name: /Inspect Attack \+1/ });
    expect(actionRow).toBeTruthy();

    fireEvent.click(actionRow);
    expect(onInspectEvent).toHaveBeenCalledWith(eventA);
  });
});
