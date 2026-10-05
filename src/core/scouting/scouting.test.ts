import { describe, it, expect } from 'vitest';
import { EventValidator } from './EventValidator';
import { EventBuilder } from './EventBuilder';
import { calculatePointImpact } from '../sports/volleyball/volleyball.rules';
import { VOLLEYBALL_SKILLS } from '../sports/volleyball/volleyball.skills';
import { VOLLEYBALL_ZONES } from '../sports/volleyball/volleyball.zones';

describe('EventValidator', () => {
  it('returns valid when all required fields are present', () => {
    const res = EventValidator.validate({
      teamId: 'A',
      skill: 'attack',
      originZone: 4,
      evaluation: 1
    });
    expect(res.isValid).toBe(true);
    expect(res.missingFields.length).toBe(0);
  });

  it('identifies missing fields correctly', () => {
    const res = EventValidator.validate({
      teamId: 'A',
      skill: 'attack'
    });
    expect(res.isValid).toBe(false);
    expect(res.missingFields).toContain('originZone');
    expect(res.missingFields).toContain('evaluation');
  });
});

describe('EventBuilder (Order Independence)', () => {
  it('becomes complete regardless of input sequence', () => {
    const builder = new EventBuilder(['teamId', 'skill', 'originZone', 'evaluation']);

    // Sequence 1: Result first
    builder.setField('evaluation', 1);
    expect(builder.isComplete()).toBe(false);

    // Sequence 2: Zone next
    builder.setField('originZone', 4);
    expect(builder.isComplete()).toBe(false);

    // Sequence 3: Team next
    builder.setField('teamId', 'A');
    expect(builder.isComplete()).toBe(false);

    // Sequence 4: Skill last
    builder.setField('skill', 'attack');
    expect(builder.isComplete()).toBe(true);

    const event = builder.build({
      sessionId: 'sess_1',
      matchId: 'match_1',
      setNumber: 1,
      scoreBefore: { teamA: 10, teamB: 8 }
    });

    expect(event.sport).toBe('volleyball');
    expect(event.teamId).toBe('A');
    expect(event.skill).toBe('attack');
    expect(event.originZone).toBe(4);
    expect(event.evaluation).toBe(1);
    expect(event.inputSource).toBe('controller');
  });
});

describe('Rally result point semantics', () => {
  it.each(VOLLEYBALL_SKILLS.map(skill => skill.id))('%s uses the action team for every terminal result', (skill) => {
    for (const enabled of [false, true]) {
      expect(calculatePointImpact(skill, 1, 'A', enabled)).toBe('TEAM_A');
      expect(calculatePointImpact(skill, 1, 'B', enabled)).toBe('TEAM_B');
      expect(calculatePointImpact(skill, -1, 'A', enabled)).toBe('TEAM_B');
      expect(calculatePointImpact(skill, -1, 'B', enabled)).toBe('TEAM_A');
      expect(calculatePointImpact(skill, 0, 'A', enabled)).toBeNull();
    }
  });
});

describe('Volleyball Sport Definition', () => {
  it('maintains deterministic 8 skills layout for muscle memory', () => {
    expect(VOLLEYBALL_SKILLS.length).toBe(8);
    expect(VOLLEYBALL_SKILLS[0].id).toBe('attack');
    expect(VOLLEYBALL_SKILLS[1].id).toBe('block');
    expect(VOLLEYBALL_SKILLS[2].id).toBe('set');
    expect(VOLLEYBALL_SKILLS[3].id).toBe('receive');
    expect(VOLLEYBALL_SKILLS[4].id).toBe('serve');
  });

  it('defines 6 standard volleyball zones', () => {
    expect(VOLLEYBALL_ZONES.length).toBe(6);
    const zoneIds = VOLLEYBALL_ZONES.map((z) => z.id);
    expect(zoneIds).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
