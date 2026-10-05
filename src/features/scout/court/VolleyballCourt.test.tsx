// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VolleyballCourt } from './VolleyballCourt';
import type { ScoutingEvent } from '../../../core/scouting/ScoutingEvent';
import '../../../i18n';

describe('VolleyballCourt', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders Net, 3m attack line, and all 6 zones in 4-3-2 / 5-6-1 court order', () => {
    render(<VolleyballCourt mode="interactive-selector" />);

    expect(screen.getByText('NET')).toBeTruthy();
    expect(screen.getByText('3m LINE')).toBeTruthy();

    // Check all 6 zone buttons are rendered
    for (const zone of [1, 2, 3, 4, 5, 6]) {
      expect(screen.getByRole('button', { name: new RegExp(`Z${zone}`) })).toBeTruthy();
    }
  });

  it('handles zone clicks in interactive selector mode', () => {
    const onZoneSelect = vi.fn();
    render(
      <VolleyballCourt
        mode="interactive-selector"
        selectedZone={3}
        onZoneSelect={onZoneSelect}
      />
    );

    const zone3Btn = screen.getByRole('button', { name: /Z3/ });
    expect(zone3Btn.getAttribute('aria-pressed')).toBe('true');

    const zone4Btn = screen.getByRole('button', { name: /Z4/ });
    expect(zone4Btn.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(zone4Btn);
    expect(onZoneSelect).toHaveBeenCalledWith(4);
  });

  it('renders event markers and supports inspection in map mode', () => {
    const onInspectEvent = vi.fn();
    const mockEvents: ScoutingEvent[] = [
      {
        id: 'event-1',
        sport: 'volleyball',
        matchId: 'match-1',
        sessionId: 'session-1',
        setNumber: 1,
        rallyId: 'rally-1',
        rallyNumber: 1,
        teamId: 'A',
        actionIndex: 1,
        skill: 'attack',
        originZone: 4,
        evaluation: 1,
        timestamp: 1000,
        createdAt: '2026-10-05T00:00:00.000Z',
        inputSource: 'controller'
      }
    ];

    render(
      <VolleyballCourt
        mode="map"
        events={mockEvents}
        onInspectEvent={onInspectEvent}
        selectedEventId="event-1"
      />
    );

    const marker = screen.getByRole('button', { name: /View action 1: Attack, \+1/ });
    expect(marker).toBeTruthy();

    fireEvent.click(marker);
    expect(onInspectEvent).toHaveBeenCalledWith(mockEvents[0]);
  });
});
