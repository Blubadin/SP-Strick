export type RadialCategory = 'SKILL' | 'ZONE' | 'RESULT' | 'TEAM_PLAYER';

export type ControllerIntent =
  | { type: 'OPEN_RADIAL'; category: RadialCategory }
  | { type: 'RADIAL_SELECTION_CHANGED'; category: RadialCategory; sectorIndex: number; option: string }
  | { type: 'RADIAL_COMMIT'; category: RadialCategory; option: string }
  | { type: 'RADIAL_CANCEL'; category: RadialCategory }
  | { type: 'SELECT_TEAM_A' }
  | { type: 'SELECT_TEAM_B' }
  | { type: 'QUICK_RESULT_POSITIVE' }
  | { type: 'QUICK_RESULT_NEUTRAL' }
  | { type: 'QUICK_RESULT_NEGATIVE' }
  | { type: 'UNDO_LAST_EVENT' }
  | { type: 'EDIT_LAST_EVENT' }
  | { type: 'BOOKMARK_MOMENT' }
  | { type: 'PAUSE_SESSION' };

export type IntentListener = (intent: ControllerIntent) => void;

class IntentDispatcher {
  private listeners: Set<IntentListener> = new Set();

  public subscribe(listener: IntentListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public dispatch(intent: ControllerIntent): void {
    for (const listener of this.listeners) {
      try {
        listener(intent);
      } catch (err) {
        console.error('Error in controller intent listener:', err);
      }
    }
  }
}

export const intentDispatcher = new IntentDispatcher();
