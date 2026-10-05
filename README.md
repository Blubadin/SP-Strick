# SP Stick

> **"THE SCOUT WATCHES THE GAME, NOT THE INTERFACE."**  
> **"EYES ON GAME. HANDS ON CONTROLLER."**

SP Stick is a high-performance, controller-first sports scouting progressive web application designed for real-time live match observation.

The primary sport adapter implemented is **Volleyball**.

---

## 1. Product Philosophy

Traditional sports scouting workflows force the analyst to look back and forth:
```
Watch field ──> Look down ──> Find paper/tablet control ──> Write or tap ──> Look back at field
```

SP Stick completely replaces this with tactile, controller-driven muscle memory:
```
LOOK ──> HOLD ──> FLICK ──> RELEASE ──> SAVED
```

The analyst holds a standard physical game controller in their hands with their eyes locked on the court. Holding a face button summons a fast radial wheel; flicking the left analog stick selects an item; releasing the face button commits the event without requiring visual confirmation.

---

## 2. Core Architecture

The architecture enforces strict separation of concerns to avoid running high-frequency Gamepad API polling through standard React rendering lifecycles:

```
Physical Hardware (USB / Bluetooth)
        │
        ▼
Gamepad API (navigator.getGamepads)
        │
        ▼
Gamepad Engine & Poller (60 Hz requestAnimationFrame, render-throttled)
        │
        ├──> Stick Normalizer (radial deadzone, magnitude scaling, angle [0, 360))
        ├──> Button State Machine (edge detection: pressedThisFrame, held, releasedThisFrame)
        └──> Radial Selector (angular hysteresis, deactivation cancelation)
        │
        ▼
Controller Profiles (Xbox, DualSense, DualShock, Standard, Custom)
        │
        ▼
Semantic Controls (FACE_SOUTH, FACE_WEST, FACE_EAST, FACE_NORTH, LB, RB, DPAD_*, MENU, etc.)
        │
        ▼
Controller Intent Layer (OPEN_RADIAL, SELECT_TEAM, QUICK_RESULT, UNDO, BOOKMARK, PAUSE)
        │
        ▼
Order-Independent Event Builder & Validator
        │
        ▼
Atomic IndexedDB Transactions (Dexie v2: Sessions, Events, Custom Profiles, Bookmarks)
        │
        ▼
React View Layer & Radial UI (Instruments, Scoreboard, Eyes-Up Responsive Layouts)
```

---

## 3. Controller Mappings & Interaction

### Volleyball Live Controls

| Physical Action | Semantic Control | Xbox Profile | PlayStation Profile | Function |
| :--- | :--- | :--- | :--- | :--- |
| **Hold & Release** | `FACE_SOUTH` | **A** | **✕** | **Skill Wheel** (Attack, Block, Set, Receive, Serve, Dig, Free Ball, Other) |
| **Hold & Release** | `FACE_WEST` | **X** | **□** | **Zone Wheel** (Zones 1 to 6) |
| **Hold & Release** | `FACE_EAST` | **B** | **○** | **Result Wheel** (+1, 0, -1) |
| **Hold & Release** | `FACE_NORTH` | **Y** | **△** | **Team / Player Wheel** (Team A / B, active roster) |
| **Flick & Direct** | `LEFT_STICK` | **L-Stick** | **L-Stick** | **Radial Selection Navigation** |
| **Tap** | `LEFT_BUMPER` | **LB** | **L1** | **Quick Select Team A** (Sticky team) |
| **Tap** | `RIGHT_BUMPER` | **RB** | **R1** | **Quick Select Team B** (Sticky team) |
| **Tap** | `DPAD_UP` | **D-Pad ↑** | **D-Pad ↑** | **Quick Result +1** (Positive / Successful) |
| **Tap** | `DPAD_RIGHT` | **D-Pad →** | **D-Pad →** | **Quick Result 0** (Neutral / Playable) |
| **Tap** | `DPAD_DOWN` | **D-Pad ↓** | **D-Pad ↓** | **Quick Result -1** (Negative / Error) |
| **Tap** | `DPAD_LEFT` | **D-Pad ←** | **D-Pad ←** | **Undo Last Event** (Atomic Score Rollback) |
| **Tap** | `VIEW` | **View** | **Share** | **Alternative Undo** |
| **Tap** | `MENU` | **Menu** | **Options** | **Pause / Live Session Menu** |
| **Tap** | `LEFT_STICK_BUTTON` | **LS / L3** | **L3** | **Quick Edit Last Event** |
| **Tap** | `RIGHT_STICK_BUTTON` | **RS / R3** | **R3** | **Bookmark Moment** |

---

## 4. Hardware Support Status

- **Standard Gamepad API**: Fully supported with automatic connection detection, hotplugging, and disconnect recovery.
- **Xbox Wireless / Series Controllers**: Semantic mappings implemented.
- **PlayStation DualSense & DualShock 4**: Semantic mappings implemented with native glyph presentation (`✕`, `○`, `□`, `△`, `L1`, `R1`).
- **Custom Gamepads**: Step-by-step interactive **Custom Mapping Wizard** allows binding any generic USB/Bluetooth controller to semantic controls and saving the profile to IndexedDB.
- *Note*: Specific controller profiles are mathematically mapped and automated with unit tests. Final production deployment on target client machines should verify physical device transport characteristics.

---

## 5. Offline Persistence & Recovery

- **Dexie.js (IndexedDB)**: Schema Version 2 provides offline storage for Sessions, Events, Custom Controller Profiles, Bookmarks, and Settings.
- **Atomic Transactions**: Event commits and scoreboard updates are committed within a single database transaction. Undo restores both event history and set score simultaneously.
- **Session Recovery**: Reloading the browser or navigating away safely preserves match state. The Home screen detects active matches and provides a single-tap **Resume Match** workflow.

---

## 6. Project Structure

```
src/
├── app/
│   ├── App.tsx             # Application root with lifecycle-safe Gamepad listeners
│   └── router.tsx          # React Router route definitions
├── components/
│   └── ControllerGlyph.tsx # Profile-aware button glyph component
├── core/
│   ├── controller/
│   │   ├── ButtonStateMachine.ts # Edge detection (pressed/held/released)
│   │   ├── ControllerIntent.ts   # Semantic controller intent layer
│   │   ├── ControllerProfile.ts  # Xbox, DualSense, Standard profile definitions
│   │   ├── ControllerStore.ts    # Zustand store for profiles and controller state
│   │   ├── ControllerTypes.ts    # Strong TypeScript controller types
│   │   ├── GamepadDetector.ts    # Lifecycle-safe connect/disconnect scanning
│   │   ├── GamepadPoller.ts      # 60 Hz rAF poller with render throttling
│   │   ├── HapticManager.ts      # Feature-detected dual-rumble feedback
│   │   ├── RadialSelector.ts     # Angular hysteresis & sector math
│   │   ├── StickNormalizer.ts    # Radial deadzone & drift protection
│   │   └── controller.test.ts    # Pure unit tests for controller mechanics
│   ├── persistence/
│   │   └── database.ts           # Versioned Dexie database schema
│   ├── scouting/
│   │   ├── EventBuilder.ts       # Order-independent event draft builder
│   │   ├── EventValidator.ts     # Profile completeness validation
│   │   ├── ScoutingEvent.ts      # Normalized scouting event schema
│   │   ├── ScoutStore.ts         # Central scouting state machine
│   │   └── scouting.test.ts      # Pure unit tests for event validation & scoring
│   └── sports/
│       └── volleyball/
│           ├── volleyball.config.ts  # Volleyball SportConfig bundle
│           ├── volleyball.rules.ts   # Evaluation & decoupled point impact
│           ├── volleyball.skills.ts  # Deterministic 8-skill muscle memory layout
│           ├── volleyball.types.ts   # Volleyball domain types
│           └── volleyball.zones.ts   # Court zones (1-6)
├── features/
│   ├── radial/
│   │   ├── RadialMenu.module.css # CSS variables transform composition
│   │   └── RadialMenu.tsx        # High-performance responsive radial wheel
│   └── scout/
│       ├── LiveScout.module.css  # Responsive desktop, tablet, and Eyes-Up mobile
│       └── LiveScout.tsx         # Primary live match scouting surface
├── i18n/
│   ├── en.json                   # English translations
│   ├── index.ts                  # i18next configuration
│   └── th.json                   # Sports-accurate Thai volleyball terminology
└── pages/
    ├── CommonPage.module.css     # Clean Apple-like dark design tokens
    ├── ControllerPage.tsx        # Controller setup, diagnostics, wizard
    ├── HomePage.tsx              # Minimal tool launchpad with session restore
    ├── ReviewPage.tsx            # Session-filtered review, edit, CSV/JSON export
    ├── ScoutPage.tsx             # Active scouting boundary & reconnect handler
    ├── SettingsPage.tsx          # General, controller, and scouting rules
    └── SetupPage.tsx             # Match setup, rosters, quick controller test
```

---

## 7. Development & Testing Commands

```bash
# Start local development server
npm run dev

# Run Vitest unit test suite
npm test

# Run Oxlint linter
npm run lint

# Compile TypeScript & generate production build with PWA assets
npm run build

# Preview production build locally
npm run preview
```

---

## 8. Future Roadmap

- **SportsScout Integration**: Export normalized `ScoutingEvent` records via standard event streams to SportsScout analytics, heatmaps, and timeline visualizers.
- **SP Voice Compatibility**: Support voice intent ingestion into the identical `EventBuilder` pipeline.
- **Volleyball Scouting**: Continue refining rally workflows, court maps, and volleyball event analytics.
