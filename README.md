# Preset Selector 10 — ComfyUI custom node

A ComfyUI custom node that stores 10 presets and applies the selected one by index.
Each preset bundles a HIGH LoRA, a LOW LoRA, and positive / negative prompts, so you
can switch between full setups with a single integer.

## Nodes

- **Preset Selector 10** — pick 1 of 10 presets and output the LoRA-applied models and encoded conditioning.
- **Modulo 10** — small helper that wraps an incrementing INT into the 0–9 range.
- **Preset Library Selector** — *planned (designed, not yet implemented)*. Pick a HIGH+LOW LoRA pair and auto-load its saved prompt from a persistent library. See [Planned](#planned-preset-library-selector) below.

## Files

- `__init__.py`
- `preset_selector.py`

## Install

1. Copy the folder `preset_selector_custom_node` into your ComfyUI `custom_nodes` folder:
   ```
   custom_nodes/preset_selector_custom_node/
   ```
2. Restart ComfyUI.
3. Search for these nodes:
   - `Preset Selector 10`
   - `Modulo 10`

## Usage

- Connect the base **MODEL** and **CLIP** into **Preset Selector 10**.
- Set `preset_index`.
- Fill the `preset_0` … `preset_9` fields.

### Outputs

| Output | Description |
|--------|-------------|
| `high_model` | Base model with the preset's HIGH LoRA applied |
| `low_model` | Base model with the preset's LOW LoRA applied |
| `positive` | Encoded positive conditioning |
| `negative` | Encoded negative conditioning |
| `selected_index` | The resolved preset index (0–9) |
| `selected_name` | The selected preset's name |

`preset_index` is wrapped with modulo 10, so `10 → 0`, `11 → 1`, and so on.

## Auto-changing the preset per queue run

**Option A — manual**
- Add an INT (or primitive int) node and set *Control After Generate = increment*.
- Connect that INT to `preset_index`, or route it through **Modulo 10** first.
- Each queue run advances to the next preset.

**Option B — with a batch image loader**
- Keep your batch loader's `image_index` incrementing.
- Keep a separate INT node incrementing for presets, starting both from 0.
- The selector wraps `preset_index % 10`, so 0–9 cycle cleanly even as the INT keeps rising.

## Notes

- The HIGH / LOW LoRA fields are dropdowns populated from your ComfyUI `loras` folder (e.g. MimicPC's `models/loras`). Pick **None** to skip the LoRA for that slot.
- The dropdown list is read when ComfyUI loads. After adding files to `models/loras`, restart ComfyUI (or reload the node) to see them.

## Planned: Preset Library Selector

> **Status:** designed, **not yet implemented**. Full design:
> [`docs/superpowers/specs/2026-07-08-preset-library-selector-design.md`](docs/superpowers/specs/2026-07-08-preset-library-selector-design.md).

A new node that flips the model from *index-based fixed slots* to a **persistent
LoRA → prompt library**, so prompts don't have to be re-typed across workflows or when
switching LoRAs:

- Pick a `high_lora` + `low_lora` pair via dropdowns.
- The matching positive / negative prompt (and strengths) **auto-loads** from a persistent
  library file stored in ComfyUI's user data (via ComfyUI's built-in userdata API, so it
  survives node updates and persists on MimicPC), keyed by the `(high_lora, low_lora)` pair.
- Loaded values stay **editable in place**; a **💾 Save to library** button upserts your
  current values back into the library.
- At run time the node uses the **on-screen (edited) values** — what you see is what runs.

The existing **Preset Selector 10** node is left untouched.

## License

[MIT](LICENSE)
