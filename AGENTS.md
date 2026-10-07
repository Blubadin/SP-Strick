# SP-Strick Project Guidelines & Rules

## CRITICAL: Controller Input, Button Mappings & Video Transport Rules
> **DO NOT MODIFY OR BREAK THIS SECTION UNLESS EXPLICITLY ORDERED BY THE USER.**

The Gamepad Controller interaction architecture, button mappings, video transport controls, and chord combinations are finalized and audited. **No agent or automated refactor may alter, revert, or break these mappings or interaction logic unless the user explicitly instructs changes to them.**

### 1. Button & Stick Mapping Rules:
- **Left Stick (LS)**: Reserved EXCLUSIVELY for scouting command option selection (Skill, Zone, Result, Team, Player). LS movement never commits an action on neutral.
- **Right Stick (RS)**: Reserved EXCLUSIVELY for video timeline navigation (Analog Seek / Scrub). Tilting RS Right scrubs forward; tilting RS Left scrubs backward. RS must NEVER trigger or select scouting command options.
- **Hold-to-Select Model**: Face buttons (`A` = Skill, `X` = Zone, `B` = Result, `Y` = Team, `LB` / `L1` = Player) operate strictly via:
  1. Hold button down → Radial / Grid selector opens immediately.
  2. Tilt Left Stick to highlight an option.
  3. Release button → Commits highlighted option.
  4. Moving stick to neutral does NOT commit.
- **R1 (Right Bumper)**: Video Play / Pause toggle. Emitted on button release only (when no chord was triggered).
- **L2 (Left Trigger)**: Active Team Toggle (swaps between Team A and Team B with audio/visual flash).
- **L1 (Left Bumper)**: Player Wheel (Hold L1 + LS to pick player, release L1 to commit).
- **View Button**: Toggle Focus Mode / HUD Mode on/off.
- **ML (Macro Left / Rear Paddle Left)**: Toggle Rally & Sequence History drawer in Focus/HUD mode (`TOGGLE_RALLY_HISTORY`).
- **MR (Macro Right / Rear Paddle Right)**: Clear current draft scouting action (`CLEAR_CURRENT_ACTION`).
- **Video Skip Chords**:
  - `R1 + L2`: Rewind 3 seconds (-3000ms).
  - `R1 + R2`: Forward 5 seconds (+5000ms).
  - While R1 is held, individual actions for L2 and R2 are suppressed.
  - When R1 is released after a chord, Play/Pause toggle is suppressed.

### 2. Relevant Core Files Protected:
- `src/core/controller/GamepadPoller.ts`
- `src/core/controller/GameplayBindings.ts`
- `src/core/controller/StickNormalizer.ts`
- `src/core/controller/ControllerIntent.ts`
- `src/features/scout/LiveScoutInput.ts`
- `src/features/scout/holdSelector.ts`
- `src/features/scout/LiveScout.tsx` (controller intent handling & selector state)
