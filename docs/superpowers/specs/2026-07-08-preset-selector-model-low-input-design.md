# Preset Selector 10 — optional `model_low` input

**Date:** 2026-07-08
**Status:** Approved (ready for implementation planning)

## Problem

Wan 2.2 denoises in two stages that use two **different** base UNet models (a high-noise
model and a low-noise model). `PresetSelector10` has a single `model` input and produces
`high_model = model + high_lora` and `low_model = model + low_lora` — both from the same
input. So for Wan you cannot get `(high-noise + high_lora)` and `(low-noise + low_lora)` from
one node: its `low_model` would be `(high-noise + low_lora)`, the wrong base.

Today users work around this with **two** `PresetSelector10` nodes (one per base model),
using only the matching half of each (HIGH node → `high_model`; LOW node → `low_model`).
That works but is visually cluttered and looks duplicated (both nodes show a high_lora and a
low_lora, and both carry a prompt even though only one is wired).

## Goal

Add an **optional** `model_low` MODEL input so **one** `PresetSelector10` can serve both Wan
paths: `high_lora` applies to `model`, `low_lora` applies to `model_low`. Fully
backward-compatible — when `model_low` is not connected it falls back to `model` (exactly
today's behavior).

**Out of scope:** any change to widgets, outputs, `preset_index`/cycling, the library
(`library_core.js` / `library_io.js`), the frontend wiring (`preset_selector_library.js`),
Save-all, or auto-fill. Splitting the high/low LoRA pair into single-LoRA presets (rejected —
the pair intentionally bundles a Wan character's `_HIGH` + `_LOW` files as one preset).

## Approach

**Python-only, minimal.** The change lives entirely in `preset_selector.py`:

- `INPUT_TYPES` gains `"optional": {"model_low": ("MODEL",)}`.
- `select_preset` gains a `model_low=None` parameter and routes:
  - `high_model = apply_single_lora(model, clip, high_lora, high_strength)` (unchanged)
  - `low_base = model if model_low is None else model_low`
  - `low_model = apply_single_lora(low_base, clip, low_lora, low_strength)`
- Everything else (positive/negative encode, the returned 6-tuple, `% 10` indexing) unchanged.

### Why nothing else changes

`model_low` is a **connection input, not a widget**. `widgets_values` (preset_index +
control_after_generate + 10 slots × 7) is unchanged, so:
- Saved workflows (including the just-migrated 2-node one) load unchanged; their `model`/`clip`
  connections and widget values are unaffected, `model_low` simply stays unconnected.
- The frontend extension keys off widget names (`preset_i_*`) — none change — so auto-fill,
  the readiness guard, and 💾 Save-all are untouched.
- The library file/shape and `library_core.js` / `library_io.js` are untouched.

Optional inputs render after the required ones, so the node's input order becomes
`model` (0), `clip` (1), `model_low` (2). Existing links to slots 0/1 are unaffected.

### Node interface (after)

```
inputs:   model (MODEL, required), clip (CLIP, required), model_low (MODEL, optional)
widgets:  preset_index (+ control_after_generate) + 10 slots (unchanged)
outputs:  high_model, low_model, positive, negative, selected_index, selected_name (unchanged)
```

`high_model = model + high_lora`; `low_model = (model_low or model) + low_lora`.

### Wan single-node usage (the payoff)

```
high-noise base ─→ model       ┐
low-noise base  ─→ model_low   ┤ one PresetSelector10 → high_model → high-noise sampler
                               │                       → low_model  → low-noise sampler
                               └                       → positive / negative → WanImageToVideo
```

One node, one prompt, `preset_index` cycling + library all intact.

### Files touched

- Modify: `preset_selector.py` (optional input + routing).
- Modify: `test/test_preset_selector.py` (routing tests).
- Modify: `README.md` (document `model_low` + the Wan single-node wiring).
- Unchanged: `lora_utils.py`, `web/*`, `test/library_*`, `__init__.py`, `test/test_registration.py`.
- Follow-up (separate deliverable, not a node change): rebuild the user's Wan workflow JSON as a
  single-`PresetSelector10` version.

### Testing

- `test/test_preset_selector.py`: with `preset_0_low_lora="None"` (so `apply_single_lora` is a
  passthrough), assert `low_model is model_low` when `model_low` is supplied, and
  `low_model is model` when it is omitted; `high_model is model` in both. Keep the existing
  characterization test green. Full Python + Node suites stay green.
- Manual: the migrated 2-node workflow still loads and runs (regression); a new single-node
  Wan workflow produces the same result with one node.

### Edge cases

- `model_low` omitted / not connected → `low_base = model` (current behavior).
- `model_low` connected → `low_base = model_low`; `high_model` still uses `model`.
- `low_lora == "None"` → `low_model` is the (unchanged) `low_base` — i.e., `model_low` passes
  through when no low LoRA is set. Correct.

## Decisions locked

- (a) Second input is **optional** `model_low` (backward-compatible), not two required inputs.
- (b) Routing: `high_lora`→`model`; `low_lora`→`model_low` with fallback to `model`.
- (c) No changes to widgets/outputs/library/JS/cycling — Python execution only.
