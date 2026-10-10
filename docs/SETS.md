# sets.anypod.org — Workout Interval DJ Sequencer

**sets.anypod.org** (and **pulse.anypod.org**) is a standalone, mobile-first workout interval sequencer for Anypod that directly couples interval training timers (HIIT, Tabata, EMOM, Circuit) with dual-deck Web Audio playback.

---

## 1. Architecture Overview

```
                               ┌─────────────────────────────────┐
                               │  sets.anypod.org / sets.html    │
                               └────────────────┬────────────────┘
                                                │
         ┌──────────────────────────────┼──────────────────────────────┐
         ▼                              ▼                              ▼
┌─────────────────┐           ┌─────────────────┐           ┌─────────────────┐
│ Routine Engine  │           │ Web Audio DJ    │           │ Cross-App Sync  │
│ (src/utils/     │           │ Engine (src/    │           │ (Broadcast      │
│  timeline.ts)   │           │  audio/...)     │           │  Channel)       │
└────────┬────────┘           └────────┬────────┘           └────────┬────────┘
         │                             │                             │
         ▼                             ▼                             ▼
• Nested Sections             • Dual-Deck (<audio> A/B)     • Sync with Anypod
• Repeat Counts (1x..20x)     • Equal-Power Crossfade       • Sync with DJ Studio
• FlatTimelineItem[] array    • Synthesized Cues (440/880Hz)• Active Episode Import
• Drift-proof timing          • Pre-buffering at 5s         • Share URL Hash (#routine)
```

---

## 2. Key Features

- **OLED Black High-Contrast UI**: Base background `#050505` with high-contrast colorways:
  - **Work**: Electric Red (`#ef4444`) with Crimson glow
  - **Rest**: Neon Cyan (`#06b6d4`) with Ice glow
  - **Warmup**: Radiant Amber (`#f59e0b`)
  - **Cooldown**: Mint Emerald (`#10b981`)
- **Gym-Grade Oversized Tap Targets**:
  - Primary Play/Pause: **88px** button with active spring physics.
  - Previous / Next / Reset: **64px** buttons.
  - Massive countdown display (96px+ bold monospaced digits) readable from across the gym.
- **Dual-Deck Web Audio Crossfader**:
  - Maintains alternating Deck A and Deck B HTML5 `<audio>` elements.
  - Pre-buffers next interval 5 seconds before current block finishes.
  - Equal-power crossfade curve (`cos`/`sin`) over 2.0s.
  - Routes external podcast audio streams via Anypod's `/api/audio-proxy?url=`.
- **Synthesized Countdown Cues**:
  - Warning beeps at 3s, 2s, 1s at **440 Hz** (sine wave).
  - Interval switch / GO! confirmation tone at 0s at **880 Hz** (triangle wave).
  - Zero static audio asset downloads required.
  - Automatic music ducking: ducks background audio to 30% during beeps.
  - Optional SpeechSynthesis voice cues ("Sprint!", "Rest!", "Goblet Squats").
- **Platform Integrations**:
  - **Screen WakeLock API**: Keeps phone screen awake on gym benches/mounts.
  - **MediaSession API**: Lockscreen playback controls (Skip/Prev interval) and live workout status metadata.
- **Cross-App Sync with Anypod Player & DJ Studio**:
  - `BroadcastChannel('anypod_workout_sync')`: Automatically pauses main Anypod player and DJ Studio decks when a workout begins.
  - Attach audio from Anypod's currently playing episode (`anypod_last_active_episode`), DJ hot cues (`anypod_dj_cues`), or built-in 909/Funk beats.
  - Jump directly from interval audio to DJ Studio (`/dj.html`).
- **Share Player / Routines**:
  - Encode routines to shareable URL hash (`sets.html#routine=...`).
  - Export and import JSON routine configurations.

---

## 3. Subdomain Routing (`functions/_middleware.js`)

Requests to `sets.anypod.org` or `pulse.anypod.org` are routed directly to `/sets.html`:

```javascript
// sets.anypod.org & pulse.anypod.org bedienen den Workout Interval DJ Sequencer an der Root
if (hostname === 'sets.anypod.org' || hostname === 'pulse.anypod.org') {
  if (url.pathname === '/' || url.pathname === '/index.html') {
    const assetUrl = new URL('/sets.html', url.origin);
    return context.env.ASSETS.fetch(assetUrl);
  }
}
```

---

## 4. Development & Build

```bash
# Production build (bundles and copies sets.html to public/dist)
npm --prefix app run build

# Local dev server with Wrangler
npm --prefix app run dev
# Open http://localhost:8788/sets.html
```
