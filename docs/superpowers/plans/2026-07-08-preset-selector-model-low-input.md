# Preset Selector 10 — optional `model_low` input — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional `model_low` MODEL input to `PresetSelector10` so one node can serve Wan 2.2's two base models — `high_lora` applies to `model`, `low_lora` applies to `model_low` (falling back to `model` when unconnected).

**Architecture:** Python-only change in `preset_selector.py`. `model_low` is a connection input, not a widget, so `widgets_values`, outputs, `preset_index` cycling, the library, and the frontend wiring are all unchanged and backward-compatible.

**Tech Stack:** ComfyUI (`folder_paths`, `comfy.*` via `lora_utils`), Python 3.10 (stdlib `unittest`), Node.js `node --test` (unaffected).

## Global Constraints

- **Backward compatible:** `model_low` is OPTIONAL. When not connected, `low_model` uses `model` — byte-for-byte today's behavior. Existing/migrated workflows must still load and run.
- **Python execution only.** Do NOT change widget names/order, outputs (`high_model, low_model, positive, negative, selected_index, selected_name`), `preset_index`/`control_after_generate`, `lora_utils`, `web/*` (library core/io/wiring), `__init__.py`, or `test/test_registration.py`.
- Routing: `high_model = model + high_lora`; `low_model = (model_low or model) + low_lora`. `high_model` always uses `model`.
- No new runtime dependencies; tests use stdlib `unittest`.

## File Structure

- Modify `preset_selector.py` — `INPUT_TYPES` adds `"optional": {"model_low": ("MODEL",)}`; `select_preset` adds `model_low=None` and routes `low_model` to `model_low or model`.
- Modify `test/test_preset_selector.py` — add routing tests.
- Modify `README.md` — document `model_low` + the Wan single-node wiring.

---

### Task 1: Add the optional `model_low` input and routing (+ tests)

**Files:**
- Modify: `preset_selector.py`
- Test: `test/test_preset_selector.py`

**Interfaces:**
- Consumes: `lora_utils.apply_single_lora`, `lora_utils.encode_text` (unchanged).
- Produces: `PresetSelector10.INPUT_TYPES()` returns an `"optional"` dict containing `model_low: ("MODEL",)`; `select_preset(self, model, clip, preset_index, model_low=None, **kwargs)` returns the same 6-tuple, with `low_model` applied to `model_low` when supplied else `model`.

- [ ] **Step 1: Add the failing tests** — append these methods to the existing `PresetSelector10Refactor` class in `test/test_preset_selector.py` (it already imports `unittest`, `mock`, `install_stubs`, `preset_selector`):

```python
    def test_input_types_expose_optional_model_low(self):
        it = preset_selector.PresetSelector10.INPUT_TYPES()
        self.assertIn("model_low", it.get("optional", {}))
        self.assertEqual(it["optional"]["model_low"], ("MODEL",))

    def _run(self, node, model, clip, **extra):
        return node.select_preset(
            model, clip, 0,
            preset_0_name="Zero",
            preset_0_high_lora="None", preset_0_high_strength=1.0,
            preset_0_low_lora="None", preset_0_low_strength=1.0,
            preset_0_positive="p", preset_0_negative="n",
            **extra,
        )

    def test_low_model_routes_to_model_low_when_connected(self):
        node = preset_selector.PresetSelector10()
        model, model_low = object(), object()
        clip = mock.Mock()
        clip.tokenize.return_value = "T"
        clip.encode_from_tokens.return_value = ("C", "P")
        out = self._run(node, model, clip, model_low=model_low)
        self.assertIs(out[0], model)       # high_model uses `model`
        self.assertIs(out[1], model_low)   # low_model uses `model_low` (low_lora None -> passthrough)

    def test_low_model_falls_back_to_model_when_model_low_absent(self):
        node = preset_selector.PresetSelector10()
        model = object()
        clip = mock.Mock()
        clip.tokenize.return_value = "T"
        clip.encode_from_tokens.return_value = ("C", "P")
        out = self._run(node, model, clip)
        self.assertIs(out[0], model)
        self.assertIs(out[1], model)       # low_model falls back to `model`
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `python3 -m unittest discover -s test -p "test_preset_selector.py" -v`
Expected: FAIL on `test_input_types_expose_optional_model_low` (no `"optional"` key yet) and on
`test_low_model_routes_to_model_low_when_connected` (`model_low` currently lands in `**kwargs`
and is ignored, so `low_model` is `model`, not `model_low`). `test_low_model_falls_back...` and
the pre-existing tests pass (that's the backward-compat baseline).

- [ ] **Step 3: Update `INPUT_TYPES`** in `preset_selector.py` — change its final `return` from
`return {"required": required}` to:

```python
        return {"required": required, "optional": {"model_low": ("MODEL",)}}
```

- [ ] **Step 4: Update `select_preset`** in `preset_selector.py` — change the signature and the
`low_model` line. The method becomes:

```python
    def select_preset(self, model, clip, preset_index, model_low=None, **kwargs):
        idx = int(preset_index) % 10

        name = kwargs.get(f"preset_{idx}_name", f"Preset {idx}")
        high_lora = kwargs.get(f"preset_{idx}_high_lora", "None")
        high_strength = kwargs.get(f"preset_{idx}_high_strength", 1.0)
        low_lora = kwargs.get(f"preset_{idx}_low_lora", "None")
        low_strength = kwargs.get(f"preset_{idx}_low_strength", 1.0)
        positive = kwargs.get(f"preset_{idx}_positive", "")
        negative = kwargs.get(f"preset_{idx}_negative", "")

        high_model = lora_utils.apply_single_lora(model, clip, high_lora, high_strength)
        low_base = model if model_low is None else model_low
        low_model = lora_utils.apply_single_lora(low_base, clip, low_lora, low_strength)
        positive_cond = lora_utils.encode_text(clip, positive)
        negative_cond = lora_utils.encode_text(clip, negative)

        return (high_model, low_model, positive_cond, negative_cond, idx, str(name))
```

(Only two lines change vs. the current version: the signature gains `model_low=None`, and the
`low_model` computation gains the `low_base = model if model_low is None else model_low` line.)

- [ ] **Step 5: Run the tests to verify they pass, then the full suites**

Run: `python3 -m unittest discover -s test -p "test_preset_selector.py" -v`
Expected: PASS (all, including the two new routing tests).

Run: `python3 -m unittest discover -s test -p "test_*.py" -v`
Expected: PASS — `test_lora_utils`, `test_preset_selector`, `test_registration` all green.

Run: `node --test test/library_core.test.js test/library_io.test.js`
Expected: PASS (unchanged; sanity only).

- [ ] **Step 6: Commit**

```bash
git add preset_selector.py test/test_preset_selector.py
git commit -m "feat: optional model_low input so one node serves dual base models"
```

---

### Task 2: Document `model_low` in the README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a `model_low` note to the `## Usage` section** — after the existing bullet
`- Connect the base **MODEL** and **CLIP** into **Preset Selector 10**.`, insert:

```markdown
- *(Optional)* Connect a second base model to **`model_low`**. When connected, the LOW LoRA is
  applied to `model_low` (and the HIGH LoRA to `model`); when left unconnected, both LoRAs apply
  to `model` as before. This lets one node drive two different base models — see
  [Dual base models](#dual-base-models-wan-22) below.
```

- [ ] **Step 2: Add a new section** immediately before `## License`:

```markdown
## Dual base models (Wan 2.2)

Wan 2.2 denoises in two stages that use two different base UNet models (high-noise and
low-noise), each needing its own LoRA. Connect the optional `model_low` input so a **single**
Preset Selector 10 drives both:

```
high-noise base ─→ model       ┐
low-noise base  ─→ model_low   ┤ Preset Selector 10 → high_model → high-noise sampler
                               │                     → low_model  → low-noise sampler
                               └                     → positive / negative → your conditioning
```

- `high_model = model + high_lora`
- `low_model = model_low + low_lora` (falls back to `model` if `model_low` is unconnected)
- One prompt, one preset slot, `preset_index` cycling — all as usual.

Each preset slot bundles a character's `_HIGH` and `_LOW` LoRA files as one pair, so selecting a
slot applies the right LoRA to each base model.
```

- [ ] **Step 3: Verify suites still green (docs change)**

Run: `python3 -m unittest discover -s test -p "test_*.py" && node --test test/library_core.test.js test/library_io.test.js`
Expected: both PASS.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: document optional model_low input and Wan dual-model wiring"
```

---

## Self-Review

**Spec coverage:**
- Optional `model_low` input → Task 1 (`INPUT_TYPES` optional).
- Routing `low_model = (model_low or model) + low_lora`, `high_model` uses `model` → Task 1 (`select_preset`).
- Backward compatible (unconnected → `model`) → Task 1 fallback test.
- No widget/output/library/JS/cycling change → no task touches those files; constraint stated.
- Docs → Task 2.

**Placeholder scan:** none — every code step has complete code; every run step has a command + expected result.

**Type/name consistency:** `model_low` and the `model_low or model` routing are identical across the spec, the `INPUT_TYPES` optional entry, `select_preset`'s parameter, and the tests. Widget names (`preset_0_*`) match the existing node. Return tuple order unchanged.
