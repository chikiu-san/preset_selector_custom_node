# Preset Library Selector — Design

**Date:** 2026-07-08
**Status:** Approved (ready for implementation planning)

## Problem

The existing `PresetSelector10` node stores 10 fixed preset slots (index 0–9), each
bundling a HIGH LoRA, a LOW LoRA, and positive/negative prompts. The user selects one
by `preset_index`. Two pain points:

1. **No cross-workflow persistence.** Presets live inside the node's widget values. A
   new/other workflow starts empty, forcing the prompts to be re-typed.
2. **No LoRA-driven prompt loading.** Switching LoRAs inside a workflow requires manually
   rewriting the matching prompt every time.

The user wants: pick a LoRA combination → the associated prompt is **preloaded
automatically** from a persistent library, needing only **minimal editing** afterward.

## Goal

Add a **new** ComfyUI node, `Preset Library Selector`, that:

- Lets the user pick a `high_lora` + `low_lora` pair via dropdowns.
- On change, **auto-fills** the positive/negative (and strength) widgets from a persistent
  JSON library keyed by the `(high_lora, low_lora)` pair.
- Keeps the filled values **editable in place**.
- Provides a **💾 Save to library** button that upserts the current values back into the library.
- At execution time, applies LoRAs and encodes prompts using the **on-screen (edited)
  widget values** — the library is not read during execution ("what you see is what runs").

The existing `PresetSelector10` node is left untouched.

**Out of scope (this iteration):** batch auto-cycling per queue run; a full GUI to
list/delete library entries (only lookup + save are implemented).

## Approach

Chosen over the two main alternatives surfaced during brainstorming:

- *Prompt delivery:* **reactive JS auto-fill into editable widgets** (chosen) vs. a
  Python-only "base prompt + separate append field". The JS approach matches the
  "preload → minimal edit" requirement, at the cost of a frontend extension + API routes.
- *Matching key:* **`(high_lora, low_lora)` exact pair** (chosen) vs. per-individual-LoRA
  merge vs. named bundles.
- *Placement:* **new node** (chosen) vs. replacing `PresetSelector10`.

### Architecture (3 + 1 layers)

| Layer | Responsibility |
|---|---|
| **Python node** `PresetLibrarySelector` | Receives `model`/`clip`; applies HIGH/LOW LoRAs to model copies and encodes positive/negative using the current widget values. Reuses the existing `_apply_single_lora` / `_encode_text` / `_resolve_lora_path` logic. |
| **Library store** `preset_library.json` | Persistent map from `(high_lora, low_lora)` to a preset entry. |
| **API routes** (Python) | `GET /preset_lib/lookup` and `POST /preset_lib/save`, registered on `PromptServer.instance.routes`. |
| **JS extension** `web/preset_library.js` | Detects `high_lora`/`low_lora` widget changes → calls lookup → writes values back into the node's widgets. Adds the 💾 Save button → calls save. |

### Data model — `preset_library.json`

```json
{
  "entries": [
    {
      "high_lora": "charA_high.safetensors",
      "high_strength": 1.0,
      "low_lora": "charA_low.safetensors",
      "low_strength": 1.0,
      "positive": "1girl, silver hair, ...",
      "negative": "lowres, bad anatomy, ...",
      "label": "Character A"
    }
  ]
}
```

- **Key = `(high_lora, low_lora)` exact match.** `label` is an optional memo, not used for lookup.
- **Save = upsert:** overwrite the entry whose `(high_lora, low_lora)` matches, else append.
- **Strengths are stored and auto-loaded** along with the prompts (approved default).
- **Location:** node folder root (`preset_library.json`), added to `.gitignore` so personal
  prompts are not committed.

### Node widget layout

```
inputs:  model (MODEL), clip (CLIP)
widgets: high_lora  ▼   / high_strength (FLOAT)
         low_lora   ▼   / low_strength  (FLOAT)
         label    (STRING, single-line, editable — optional memo)
         positive (STRING, multiline, editable)
         negative (STRING, multiline, editable)
         [💾 Save to library]   (button)
outputs: high_model (MODEL), low_model (MODEL),
         positive (CONDITIONING), negative (CONDITIONING),
         selected_label (STRING — echoes the current label widget)
```

`high_lora` / `low_lora` dropdowns are populated from `folder_paths.get_filename_list("loras")`
with `"None"` prepended, matching the existing node.

### Bidirectional flow

1. **Load** — user changes `high_lora` or `low_lora` → JS calls
   `GET /preset_lib/lookup?high=<high>&low=<low>`. If a matching entry exists, JS writes
   `label`, `positive`, `negative`, `high_strength`, `low_strength` into the widgets. **If no
   match, do nothing** (never clobber the user's current edits with empty values).
2. **Edit** — user tweaks the widgets in place.
3. **Save** — 💾 button → JS collects the current values (`high_lora`, `high_strength`,
   `low_lora`, `low_strength`, `label`, `positive`, `negative`) and POSTs to
   `/preset_lib/save`, which upserts into `preset_library.json` keyed by the LoRA pair.
4. **Execute** — Python reads the **current widget values** (post-edit) and applies LoRAs +
   encodes; `selected_label` output echoes the `label` widget. The library JSON is **not**
   consulted during execution.

### Error handling / edge cases

- **No matching entry on lookup** → leave widgets unchanged (protect in-progress edits).
- **`None` in the pair** → treated as a normal key component (e.g. `(charA_high, None)` is a valid key).
- **LoRA file missing** → reuse the existing `_resolve_lora_path` behavior (raises `ValueError`
  with a clear message at execution time).
- **`preset_library.json` missing or corrupt** → treated as an empty library; the first Save
  creates/overwrites a valid file. A corrupt-parse is logged, not fatal.
- **Concurrent writes** → out of scope (local single-user assumption).

### Testing

- **Python unit tests** for the library store: upsert (new + overwrite), exact-pair lookup,
  `None`-containing keys, and corrupt/missing-JSON fallback. ComfyUI dependencies
  (`folder_paths`, `comfy.*`) are mocked so tests run without a ComfyUI runtime.
- **Manual verification** in ComfyUI: select LoRAs → auto-fill → edit → save → restart →
  confirm the entry persists and re-loads.

### Files touched

- `preset_library.py` — **new.** Library read/write helpers, `PresetLibrarySelector` node,
  and the `/preset_lib/*` API routes.
- `web/preset_library.js` — **new.** Frontend extension (reactive fill + Save button).
- `__init__.py` — add `WEB_DIRECTORY = "./web"`; register the new node in the mappings.
- `.gitignore` — add `preset_library.json`.

## Decisions locked

- (a) Strengths **are** saved/auto-loaded with the prompts.
- (b) Library lives in the **node folder** + `.gitignore` (not ComfyUI `user/`).
- (c) No library-management GUI (list/delete) this iteration — lookup + save only.
