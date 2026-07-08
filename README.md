# Preset Selector 10 — ComfyUI custom node

A ComfyUI custom node that stores 10 presets and applies the selected one by index.
Each preset bundles a HIGH LoRA, a LOW LoRA, and positive / negative prompts, so you
can switch between full setups with a single integer.

## Nodes

- **Preset Selector 10** — pick 1 of 10 presets and output the LoRA-applied models and encoded conditioning.
- **Modulo 10** — small helper that wraps an incrementing INT into the 0–9 range.
- **Preset Library Selector** — pick a HIGH+LOW LoRA pair; the matching prompt (and strengths) auto-loads from a persistent per-user library, editable in place, with a 💾 Save button. See [Preset Library Selector](#preset-library-selector) below.

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

## Preset Library Selector

Pick a `high_lora` + `low_lora` pair and the matching preset auto-loads, so you don't
re-type prompts across workflows or when switching LoRAs.

- Selecting either LoRA dropdown auto-fills `label` / `positive` / `negative` and both
  strengths from a persistent library keyed by the `(high_lora, low_lora)` pair.
- Loaded values are **editable in place**; execution uses the on-screen values
  (what you see is what runs).
- **💾 Save to library** upserts the current values back into the library.
- The library is stored via ComfyUI's built-in userdata API as
  `preset_selector_library.json` in ComfyUI's user directory, so it survives node updates
  and persists on MimicPC.

### Outputs

| Output | Description |
|--------|-------------|
| `high_model` | Base model with the HIGH LoRA applied |
| `low_model` | Base model with the LOW LoRA applied |
| `positive` | Encoded positive conditioning (from the on-screen text) |
| `negative` | Encoded negative conditioning (from the on-screen text) |
| `selected_label` | Echoes the current `label` widget |

No-match behavior: choosing a pair with no saved entry leaves the widgets unchanged — type
a prompt and press 💾 to create it. Loading a saved workflow never overwrites its prompts.

## Using on MimicPC

MimicPC runs stock ComfyUI (plus ComfyUI Manager) in the browser, so install and usage are
the same as any ComfyUI. Two things are MimicPC-specific: LoRAs are read from
`Storage > models > loras` (persistent), and this node's library JSON lives in ComfyUI's
`user/` directory — the same persistent area as saved workflows — so **your presets survive
instance restarts and node updates.**

**Prerequisites**
- A ComfyUI app running on MimicPC.
- Your LoRA files uploaded to `Storage > models > loras` (the dropdowns read from there).

**Install**

Option A — ComfyUI Manager (recommended):
1. In ComfyUI, open **Manager → Install via Git URL**.
2. Paste `https://github.com/chikiu-san/preset_selector_custom_node` and click **Install**.
3. **Restart the ComfyUI app.**

Option B — manual: place this folder under ComfyUI's `custom_nodes/` (clone or upload), then restart.

**Use it**
1. Right-click the canvas → **Add Node → presets → Preset Library Selector** (or double-click and search).
2. Connect **MODEL** and **CLIP** (from your checkpoint loader). Use whichever of `high_model` /
   `low_model` you need; set an unused LoRA slot to `None`.
3. Pick `high_lora` + `low_lora`. For a new pair, type `positive` / `negative` (and optionally
   `label` and the strengths), then click **💾 Save to library**.
4. Next time — in any workflow — just pick the same pair and the saved prompt / strengths / label
   **auto-fill**. Tweak in place; press 💾 again to update the entry.

**Notes & troubleshooting**
- The LoRA dropdowns are read at ComfyUI startup — after adding files to `models/loras`, restart to see them.
- The library persists at `user/preset_selector_library.json` on MimicPC (survives restarts and node updates).
- Node missing after install → confirm you restarted ComfyUI, and check the Manager log for errors.
- Auto-fill does nothing → you haven't 💾-saved that exact `(high_lora, low_lora)` pair yet
  (an unsaved pair leaving the widgets untouched is expected behavior).

## License

[MIT](LICENSE)
