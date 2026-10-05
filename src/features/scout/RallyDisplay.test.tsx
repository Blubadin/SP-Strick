// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CourtMap } from './CourtMap';
import { RallyHistory } from './RallyHistory';
import { ZoneGridMenu } from './ZoneGridMenu';
import type { ScoutingEvent } from '../../core/scouting/ScoutingEvent';
import '../../i18n';

afterEach(cleanup);
const action = (id: number, teamId = 'A'): ScoutingEvent => ({
  id: `action-${id}`, sport: 'volleyball', sessionId: 'match', matchId: 'match',
  timestamp: id, createdAt: new Date(id).toISOString(), setNumber: 1,
  teamId, skill: 'attack', originZone: 2, evaluation: 0, inputSource: 'controller',
  rallyId: 'rally-1', rallyNumber: 1, actionIndex: id + 1,
  videoTimeMs: 65_000, scoreBefore: {teamA:0,teamB:0}, scoreAfter:{teamA:0,teamB:0}
});

describe('rally display', () => {
  it('keeps every action of a long open rally accessible with detailed information', () => {
    const actions = Array.from({length:100}, (_,i) => action(i));
    render(<RallyHistory events={actions} teamA="Home" teamB="Away" teamAPlayers={[]} teamBPlayers={[]} onInspect={vi.fn()} />);
    expect(screen.getAllByRole('button', {name:/View action/})).toHaveLength(100);
    expect(screen.getAllByText('Pass')).toHaveLength(100);
    expect(screen.getAllByText(/01:05/).length).toBeGreaterThan(0);
  });

  it('filters map markers by displayed team and forwards the recorded action on click', () => {
    const inspect = vi.fn();
    render(<CourtMap events={[action(0),action(1,'B')]} teamId="A" teamName="Home" draft={{originZone:3,skill:'block'}} previewZone={3} onInspect={inspect} />);
    const markers = screen.getAllByRole('button', {name:/View action/});
    expect(markers).toHaveLength(1);
    fireEvent.click(markers[0]);
    expect(inspect).toHaveBeenCalledWith(expect.objectContaining({id:'action-0'}));
    expect(screen.getByText('Block')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('Z3');
  });

  it('lets touch and keyboard users choose one of the six court cells', () => {
    const choose = vi.fn();
    render(<ZoneGridMenu selectedZone={2} onChoose={choose} onCancel={vi.fn()} />);
    const frontRight = screen.getByRole('button', {name:/Z2.*Front Right/});
    expect(frontRight.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(frontRight);
    expect(choose).toHaveBeenCalledWith(2);
  });
});
