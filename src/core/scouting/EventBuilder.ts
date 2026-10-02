import type { ScoutingEvent } from './ScoutingEvent';
import { EventValidator } from './EventValidator';

export class EventBuilder {
  private draft: Partial<ScoutingEvent> = {};
  private requiredFields: string[] = ['teamId', 'skill', 'originZone', 'evaluation'];

  constructor(requiredFields?: string[]) {
    if (requiredFields) {
      this.requiredFields = requiredFields;
    }
  }

  public setRequiredFields(fields: string[]): void {
    this.requiredFields = fields;
  }

  public setField<K extends keyof ScoutingEvent>(key: K, value: ScoutingEvent[K]): void {
    this.draft[key] = value;
  }

  public updateDraft(fields: Partial<ScoutingEvent>): void {
    this.draft = { ...this.draft, ...fields };
  }

  public getDraft(): Partial<ScoutingEvent> {
    return { ...this.draft };
  }

  public isComplete(): boolean {
    return EventValidator.validate(this.draft, this.requiredFields).isValid;
  }

  public clear(): void {
    this.draft = {};
  }

  public build(
    context: {
      sessionId: string;
      matchId: string;
      setNumber: number;
      scoreBefore: { teamA: number; teamB: number };
      inputSource?: ScoutingEvent['inputSource'];
      controllerProfileId?: string;
    }
  ): ScoutingEvent {
    const now = Date.now();
    return {
      id: crypto.randomUUID(),
      sport: 'volleyball',
      sessionId: context.sessionId,
      matchId: context.matchId,
      timestamp: now,
      createdAt: new Date(now).toISOString(),
      setNumber: context.setNumber,
      teamId: this.draft.teamId || 'A',
      playerId: this.draft.playerId,
      skill: this.draft.skill || 'other',
      subSkill: this.draft.subSkill,
      originZone: this.draft.originZone,
      targetZone: this.draft.targetZone,
      evaluation: this.draft.evaluation ?? 0,
      pointImpact: this.draft.pointImpact ?? null,
      scoreBefore: context.scoreBefore,
      scoreAfter: context.scoreBefore, // will be updated by store/transaction if pointImpact is set
      inputSource: context.inputSource || 'controller',
      controllerProfileId: context.controllerProfileId,
      metadata: this.draft.metadata
    };
  }
}
