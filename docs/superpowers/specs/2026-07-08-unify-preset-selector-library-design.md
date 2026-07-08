# Unify Preset Selector 10 + Library — Design

**Date:** 2026-07-08
**Status:** Approved (ready for implementation planning)

## Problem

The repo currently ships two nodes with overlapping purpose:

- **Preset Selector 10** — 10 indexed slots (each with HIGH/LOW LoRA, strengths, name,
  positive/negative), selected by `preset_index` with `control_after_generate` auto-increment
  cycling. Presets live only in the workflow (not persisted).
- **Preset Library Selector** — a single active `(high_lora, low_lora)` pair that auto-loads
  its prompt from a persistent per-user library, editable in place, with a 💾 Save button.
  No index/cycling.

The user wants **one node, not two**: keep Preset Selector 10's 10-slot layout and
auto-increment cycling, and fold in the library's persistence so each slot can auto-load
and save its prompt from the same per-pair library.

## Goal

Evolve **Preset Selector 10** so that, per slot, choosing a `(high_lora, low_lora)` pair
auto-loads that pair's prompt/strengths/label from the persistent library, and a single
**💾 Save all slots to library** button upserts every non-empty slot back into it. Delete
the standalone **Preset Library Selector** node. Reuse the existing library core and the
existing library file unchanged.

**Out of scope:** set-level (named 10-slot config) save/load; per-slot Save buttons;
library-management GUI; any change to the execution/cycling semantics.

## Approach

- **Per-pair library** (chosen in brainstorming over set-level and both): the library stays
  a flat map keyed by `(high_lora, low_lora)`, identical in file and entry shape to what the
  standalone node used — so **entries already saved remain usable**.
- **Frontend-only integration.** Preset Selector 10's execution is already widget-driven
  (no file I/O); the library wiring lives entirely in a new JS extension that reuses the
  existing `web/library_core.js` (`find`/`upsert`) and `web/library_io.js`
  (`loadLibrary`/`saveLibrary`/`upsertEntry`). Python execution is unchanged.
- **Consolidate to one node.** Delete the standalone `PresetLibrarySelector` (Python + its
  JS + its test); keep the shared library modules.

### Architecture

| Layer | Change |
|---|---|
| `preset_selector.py` (`PresetSelector10`) | **No execution change** — still applies the `preset_index` slot's LoRAs + encodes its prompts from widget values via `lora_utils`. |
| `web/library_core.js` | **Reused unchanged** (already unit-tested). |
| `web/library_io.js` | **Reused; extended** with a browser-free `upsertMany(api, entries)` (load-once / upsert-each / save-once, strict-load-guarded) for the Save-all path — with unit tests. |
| `web/preset_selector_library.js` | **New.** Frontend extension targeting node `PresetSelector10`: per-slot reactive auto-fill + one Save-all button. |
| `preset_library.py`, `web/preset_library.js`, `test/test_preset_library.py` | **Deleted.** |
| `__init__.py` | Drop the `PresetLibrarySelector` import/registration; keep `WEB_DIRECTORY`. |

### Data model (unchanged — reused file)

`preset_selector_library.json` under ComfyUI's user directory (userdata API). Entry:

```json
{ "high_lora": "...", "high_strength": 1.0, "low_lora": "...", "low_strength": 1.0,
  "label": "...", "positive": "...", "negative": "..." }
```

- Key = `(high_lora, low_lora)` exact pair. Save = upsert by pair.
- **Slot ↔ entry field mapping:** the slot's `preset_i_name` ↔ entry `label`.

### Node widgets

Unchanged layout, plus one button:

```
inputs:  model (MODEL), clip (CLIP)
preset_index (INT, control_after_generate)          # cycles 0..9, unchanged
for i in 0..9:
  preset_i_name, preset_i_high_lora, preset_i_high_strength,
  preset_i_low_lora, preset_i_low_strength, preset_i_positive, preset_i_negative
[💾 Save all slots to library]                       # NEW (added client-side by the JS)
outputs: high_model, low_model, positive, negative, selected_index, selected_name  # unchanged
```

The Save button is a frontend-only widget (added by the JS extension), not a Python input.

### Behavior

1. **Auto-fill (per slot, user-initiated).** When the user changes `preset_i_high_lora` or
   `preset_i_low_lora`, look up `(high_i, low_i)` via `find`; on a match, write into slot i:
   `preset_i_positive`, `preset_i_negative`, `preset_i_high_strength`, `preset_i_low_strength`,
   and `preset_i_name` (from `label`, only if the entry has a non-empty label). **No match →
   leave slot i unchanged** (never clobber). `(None, None)` or an empty component → no lookup.
2. **Readiness guard.** A per-node `_presetReady` flag (false in `onNodeCreated`/`onConfigure`,
   true after `requestAnimationFrame`) gates auto-fill so loading a saved workflow — which
   restores all 10 slots' widget values — never triggers library overwrites of those slots.
3. **Save all.** The 💾 button collects, for each slot whose pair is not `(None, None)` (and
   neither component empty), an entry built from the slot's widgets (`preset_i_name` → `label`).
   It calls the new **`upsertMany(api, entries)`**: one `loadLibrary(api, {strict:true})`, fold
   every entry in with `upsert`, then one `saveLibrary` — so the whole set is written in a single
   round-trip and a failed (non-404) read aborts without wiping. Do **not** call `upsertEntry`
   in a loop (that re-reads/re-writes per entry). Duplicate pairs across slots: last entry wins
   (documented).
4. **Execution unchanged.** Python applies the `preset_index % 10` slot's LoRAs + encodes its
   prompts from the current widget values; the library is not read at execution.

### MimicPC / proxy safety (unchanged constraints)

All server I/O via base-path-aware `api.*`; all JS imports relative; library at the flat
userdata filename `preset_selector_library.json`.

### Files touched

- Delete: `preset_library.py`, `web/preset_library.js`, `test/test_preset_library.py`.
- Modify: `__init__.py` (remove `PresetLibrarySelector`), `README.md` (replace the standalone
  "Preset Library Selector" section with the unified library feature under Preset Selector 10;
  update the Nodes list and the MimicPC section).
- Add: `web/preset_selector_library.js`.
- Modify: `web/library_io.js` (add `upsertMany`) and `test/library_io.test.js` (cover it).
- Reuse unchanged: `web/library_core.js`, `test/library_core.test.js`.
- Unchanged: `preset_selector.py`, `lora_utils.py`, `test/test_lora_utils.py`,
  `test/test_preset_selector.py`.

### Testing

- The library core/IO keep their existing browser-free unit tests (`node --test`); add tests
  for `upsertMany` (adds multiple new entries; overwrites existing pairs in one pass; aborts
  without wiping when the strict load fails; last-wins on duplicate pairs).
- Removing `PresetLibrarySelector` removes `test/test_preset_library.py`; the remaining Python
  suite (`test_lora_utils`, `test_preset_selector`) must stay green, and the package must still
  import cleanly registering exactly `PresetSelector10` + `Modulo10`.
- `web/preset_selector_library.js` is browser wiring with no automated test → **manual E2E**:
  in one node, set slot 0's pair → type + 💾 Save all → change slot 0 away and back → prompt
  auto-fills; set a second slot's pair and save; reload workflow → slots not clobbered; restart
  MimicPC instance → entries persist; auto-increment still cycles slots at execution.

### Edge cases / error handling

- No library match for a slot → that slot untouched.
- Deserialization → no auto-fill (readiness guard), for all 10 slots (one per-node flag).
- Save skips slots with `(None, None)` / empty components (no junk entries).
- Duplicate `(high, low)` across slots on Save-all → last slot processed wins.
- Failed (non-404) library read during Save-all → abort without overwriting (reuse the strict-load guard).
- Corrupt library file → treated as empty (can be overwritten), consistent with `library_io.js`.

## Decisions locked

- (a) Unify into **Preset Selector 10**; **delete** the standalone `PresetLibrarySelector`.
- (b) **Per-pair** library granularity (same file/shape as before — back-compatible).
- (c) One **💾 Save all slots** button (not per-slot ×10, not set-level named configs).
- (d) Auto-fill is **per slot, user-initiated, readiness-guarded**; `preset_i_name` ↔ `label`.
- (e) Python execution/cycling **unchanged**; integration is frontend-only, reusing
  `library_core.js` / `library_io.js`.
