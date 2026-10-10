# 🎧 DJ Anypod Studio — Roadmap, Implemented Controls & Future Features

This document provides a comprehensive audit of all console buttons and controls in **DJ Anypod Studio** (`dj.anypod.org` / `/dj`), detailing what is currently active, what is visual-only, and the technical specification for upcoming features (including dual-output headphone pre-listening via Bluetooth and USB-C).

---

## 🎛️ Control Status & Architecture Matrix

### 1. Master Console (Top Bar)

| Control | Intended DJ Behavior | Current Implementation Status | Notes |
| :--- | :--- | :---: | :--- |
| **FX 1 (DLY / REV / ON / D/W Knob)** | Deck A FX Unit: Delay, Reverb toggle and Dry/Wet mix knob | 🟡 **Visual UI** | CSS active toggle state present; audio nodes need routing into Web Audio graph. |
| **FX 2 (FLT / GATE / ON / D/W Knob)** | Deck B FX Unit: Filter sweep, Beat Gater toggle and Dry/Wet mix knob | 🟡 **Visual UI** | CSS active toggle state present; audio nodes need routing into Web Audio graph. |
| **SNAP** | Quantizes cues and loop points to the nearest grid marker | 🟡 **Visual UI** | Button toggles active state. Full beatgrid lock planned. |
| **QUANT (Quantize)** | Quantizes play/cue triggers to the next full musical beat | 🟡 **Visual UI** | Button toggles active state. Full beatgrid lock planned. |
| **MASTER BPM Display** | Displays the global reference tempo (e.g., `140.00`) | ✅ **Implemented** | Live display bound to `state.masterBpm`. |
| **TAP** | Calculates BPM by averaging manual tap intervals | ✅ **Implemented** | Averages millisecond delta of consecutive taps (60–190 BPM). |
| **SYNC (Master Sync)** | Locks both Decks A & B playback rate to the Master BPM | ✅ **Implemented** | Dynamically calculates and sets `playbackRate` on both decks. |
| **MASTER VU (Stereo LEDs)** | Live stereo output level meter | ✅ **Implemented** | Real-time `AnalyserNode` monitoring master compressor output. |
| **VOL (Master Volume Knob)** | Controls overall studio output gain | ✅ **Implemented** | Drag-adjustable knob linked to master dynamics compressor threshold/gain. |
| **Live Player** | Returns to the standard single-stream podcast player | ✅ **Implemented** | Direct navigation link to `/`. |
| **Sets** | Opens the Workout Interval DJ Sequencer | ✅ **Implemented** | Direct navigation link to `/sets.html`. |
| **⛶ (Fullscreen)** | Toggles browser fullscreen mode | ✅ **Implemented** | Native Fullscreen API integration. |

---

### 2. Deck Headers & Waveform Display

| Control | Intended DJ Behavior | Current Implementation Status | Notes |
| :--- | :--- | :---: | :--- |
| **SYNC (Deck Header)** | Synchronizes individual deck tempo to master clock | 🟡 **Visual UI** | Primary sync handled via central Master SYNC button. |
| **MASTER (Deck Header)** | Designates this deck as tempo master for the opposing deck | 🟡 **Visual UI** | Master role toggle UI. Dynamic clock handoff planned. |
| **Telemetry Badges** | Key (Camelot/OpenKey notation), BPM, and Track Duration | ✅ **Implemented** | Live calculated from track metadata and pitch modifications. |
| **Multiband Waveform** | Scrolling RGB frequency-split waveform with needle | ✅ **Implemented** | 60fps canvas rendering with high/mid/low energy coloring and scrubbing. |
| **Overview Stripe** | Full-track amplitude envelope with cue flags and playhead | ✅ **Implemented** | Clickable stripe for instantaneous scrub/seek across entire track. |

---

### 3. Transport & Performance Controls (Lower Decks)

| Control | Intended DJ Behavior | Current Implementation Status | Notes |
| :--- | :--- | :---: | :--- |
| **Play / Pause (`▶` / `❚❚`)** | Starts or pauses deck playback | ✅ **Implemented** | Fully wired for Web Audio files, synth beats, and YouTube IFrame. |
| **CUE** | Returns playhead to Cue 1 and pauses; previews on hold | ✅ **Implemented** | Pauses playback and seeks to Cue 0. |
| **CUP (Cue Play)** | Immediately jumps to Cue 1 and starts playback | ✅ **Implemented** | Triggers Cue 0 and calls `play()`. |
| **Hot Cues (1, 2, 3, 4)** | Instant jump/set; hold (700ms) to clear cue point | ✅ **Implemented** | Persistent cue storage in `localStorage` (`anypod_dj_cues`). |
| **LOOP 4** | Activates seamless 4-beat loop at current playback head | ✅ **Implemented** | Toggles loop mode and sets in/out loop boundaries. |
| **½ / 2× (Loop Halve / Double)** | Dynamically halves or doubles active loop length | 🟡 **Pending Wiring** | UI buttons exist; step size multiplier to be connected to loop engine. |
| **TEMPO Fader (-20% to +20%)** | Continuous pitch / speed slider with percentage readout | ✅ **Implemented** | Smooth audio rate scaling via Web Audio & YouTube playback rate. |
| **Pitch Nudge (`−` / `+`)** | Fine tempo nudge (±0.5% adjustments) for manual beatmatching | ✅ **Implemented** | Step adjustments with live slider and badge updates. |

---

### 4. Hardware Central Mixer

| Control | Intended DJ Behavior | Current Implementation Status | Notes |
| :--- | :--- | :---: | :--- |
| **GAIN Knobs (CH A / CH B)** | Pre-amplification trim (-12 dB to +12 dB) | ✅ **Implemented** | Web Audio `GainNode` before EQ stage. |
| **HI / MID / LOW Knobs** | 3-Band Isolator / Shelf Equalizer (-24 dB to +12 dB) | ✅ **Implemented** | High-shelf, peaking, and low-shelf `BiquadFilterNodes`. Double-click resets to center. |
| **FILTER Knobs** | Bipolar Color Filter (CCW = Lowpass, CW = Highpass) | ✅ **Implemented** | Morphing filter with resonant peak at cutoff. Double-click resets to center. |
| **Channel Level Meters** | Multi-segment LED VU meters for each channel | ✅ **Implemented** | Driven by per-deck `AnalyserNode` instances. |
| **Vertical Volume Faders** | Channel level control (0.0 to 1.0) | ✅ **Implemented** | Individual linear/logarithmic volume faders. |
| **Crossfader** | Smooth crossfade between Channel A and Channel B | ✅ **Implemented** | Equal-power panning curve (`Math.cos` / `Math.sin`). |
| **🎧 PFL (Pre-Fade Listen)** | Sends channel pre-fader audio to headphone monitor bus | 🟡 **Visual Toggle** *(See roadmap below for hardware routing)* | Toggles UI state; hardware multi-device routing detailed below. |

---

### 5. Track Collection & Browser (Lower Console)

| Control | Intended DJ Behavior | Current Implementation Status | Notes |
| :--- | :--- | :---: | :--- |
| **Search Input & `✕`** | Instant search across titles, artists, and channels | ✅ **Implemented** | Live filtering with clear button. |
| **Sidebar Navigation** | Filter by All, YouTube Playlists, Podcasts, Downloads, Queue, Favorites | ✅ **Implemented** | Real-time counts and reactive filtering. |
| **+ Add URL** | Quick-import YouTube playlists or podcast RSS feeds | ✅ **Implemented** | Parses feeds, saves to IndexedDB, displays success toast. |
| **📁 Collapse All / 📂 Expand All** | Batch expand/collapse all folder headers | ✅ **Implemented** | **Default state:** All folders start collapsed for clean initial view. |
| **Folder Headers (Click)** | Expand/collapse individual playlist folder | ✅ **Implemented** | Accordion toggle with track counter badges. |
| **◄ LOAD A / LOAD B ►** | Load selected track into Deck A or Deck B | ✅ **Implemented** | Direct CDN fallback, IndexedDB caching, and YouTube embed initialization. |

---

## 🚀 Future Roadmap & Pending Features

### 1. 🎧 Headphone Cueing / Pre-Listening (PFL) over Bluetooth + USB-C / Jack

A critical requirement for live DJ mixing is pre-listening to the incoming track in headphones (CUE/PFL) while the main mix plays through the master PA speakers. In a web browser environment, this is achieved through two architectures:

#### Approach A: Multi-Device Routing via Web Audio Audio Output Devices API (`setSinkId`)
Modern Chromium browsers (Desktop Chrome/Edge and modern Android) support routing separate audio elements or contexts to distinct physical devices.

- **Master Output:** Main speakers / PA connected via **USB-C DAC or 3.5mm Headphone Jack** (`sinkId = "default"` or explicit USB device ID).
- **Headphone Monitor (PFL):** Wireless **Bluetooth Headphones / AirPods** (`sinkId = "<bluetooth_device_id>"`).

```text
[Deck A Audio Source] ──┬── [EQ / Filter / Volume Fader] ── [Master Bus] ──► USB-C / Jack (PA Speakers)
                        │
                        └── [PFL Switch A] ──┬── [Headphone Bus] ──► Bluetooth Headset (setSinkId)
                                             │
[Deck B Audio Source] ──┬── [EQ / Filter / Volume Fader] ── [Master Bus]
                        │
                        └── [PFL Switch B] ──┘
```

**Implementation Steps:**
1. **Device Permission Request**: Prompt user via `navigator.mediaDevices.getUserMedia({ audio: true })` once to reveal hardware device labels (preventing browser fingerprinting restrictions).
2. **Device Enumeration**: Query `navigator.mediaDevices.enumerateDevices()` filtered by `kind === 'audiooutput'`.
3. **Settings Modal**: Add an Audio Settings dialog where users assign:
   - *Master Output Device* (USB-C / Built-in Speakers / Audio Interface).
   - *Headphones / Cue Device* (Bluetooth Headset / Secondary Soundcard).
4. **Secondary Audio Context / Element**: Route pre-fader audio taps to the secondary sink using `audioCtx.setSinkId(selectedHeadphoneId)`.

#### Approach B: DJ Splitter Cable Mode (Universal Fallback / iOS Safari)
For platforms that restrict `setSinkId` (such as iOS Safari), provide a 1-click **Split Output** toggle:
- **Left Channel (Mono):** Master Output (sent to PA speakers via DJ splitter cable).
- **Right Channel (Mono):** Cue / PFL Monitor (sent to headphones via DJ splitter cable).

---

### 2. 🎛️ Audio FX Processors (FX 1 & FX 2)
Route audio through modular Web Audio nodes when FX units are activated:
- **Delay (DLY)**: Tempo-synchronized feedback delay (1/2 beat, 3/4 beat, 1 beat).
- **Reverb (REV)**: Algorithmic or ConvolverNode impulse response for spatial transitions.
- **Beat Gater (GATE)**: Square-wave LFO ducking volume to 1/8th or 1/16th notes for rhythmic build-ups.
- **Filter Sweep (FLT)**: Resonant bandpass filter modulated across the frequency spectrum.

---

### 3. ⏱️ Loop Size Halve / Double (`½` / `2×`)
- Dynamically alter active loop duration by factor of 0.5 or 2.0 while keeping current loop phase intact.

---

### 4. 🎵 Beatgrid Lock & Real Quantization
- Analyze transient peaks or read ID3 beat markers to lock Hot Cue presses to the nearest 16th-note transient.
