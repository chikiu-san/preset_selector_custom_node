# Preset Library Selector — Design

**Date:** 2026-07-08
**Status:** Approved — **v2 (MimicPC-hardened)**. See "Changelog" and "MimicPC compatibility".

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
**Target runtime: MimicPC** (browser-hosted ComfyUI on cloud instances).

## Goal

Add a **new** ComfyUI node, `Preset Library Selector`, that:

- Lets the user pick a `high_lora` + `low_lora` pair via dropdowns.
- On a **user-initiated** change, **auto-fills** the label/positive/negative/strength widgets
  from a persistent library keyed by the `(high_lora, low_lora)` pair.
- Keeps the filled values **editable in place**.
- Provides a **💾 Save to library** button that upserts the current values back into the library.
- At execution time, applies LoRAs and encodes prompts using the **on-screen (edited)
  widget values** — the library is not read during execution ("what you see is what runs").

The existing `PresetSelector10` node is left untouched.

**Out of scope (this iteration):** batch auto-cycling per queue run; a full GUI to
list/delete library entries (only lookup + save are implemented); a configurable/absolute
library path (fixed userdata filename is used).

## Approach

Chosen over the alternatives surfaced during brainstorming:

- *Prompt delivery:* **reactive JS auto-fill into editable widgets** (chosen) vs. a
  Python-only "base prompt + separate append field".
- *Matching key:* **`(high_lora, low_lora)` exact pair** (chosen) vs. per-individual-LoRA
  merge vs. named bundles.
- *Placement:* **new node** (chosen) vs. replacing `PresetSelector10`.
- *Persistence + frontend↔storage (v2 decision):* **ComfyUI's built-in userdata API**
  (chosen) vs. custom `PromptServer` routes writing a file in the node folder (v1, rejected
  as MimicPC-fragile — see MimicPC compatibility).

### Architecture (3 layers — no custom server routes)

| Layer | Responsibility |
|---|---|
| **Python node** `PresetLibrarySelector` | Receives `model`/`clip`; applies HIGH/LOW LoRAs to model copies and encodes positive/negative using the **current widget values**. Reuses the existing `_apply_single_lora` / `_encode_text` / `_resolve_lora_path` logic. **No file I/O, no persistence code** — it never reads the library. |
| **Library store** (a single JSON file) | Persistent array of entries keyed by `(high_lora, low_lora)`. Stored under ComfyUI's **user directory** (`folder_paths.get_user_directory()`), read/written entirely through ComfyUI's standard userdata API. |
| **JS extension** `web/preset_library.js` (+ pure `web/library_core.js`) | On a **user-initiated** `high_lora`/`low_lora` change → `api.getUserData(LIB)` → find the pair → write values into the node's widgets. Adds the 💾 Save button → upsert into the array → `api.storeUserData(LIB, ...)`. All backend I/O goes through the base-path-aware `api.*` helpers; core find/upsert logic lives in `library_core.js` so it is unit-testable without a browser. |

There are **no custom `PromptServer` routes**. Persistence rides entirely on ComfyUI's
existing `/userdata/{file}` endpoints (`api.getUserData` / `api.storeUserData`), which the
frontend `api` object exposes and which write into the persistent user directory.

### Data model — the library file

`LIB = "preset_selector_library.json"` (flat filename at the user-data root — avoids any
dependence on nested-directory auto-creation across ComfyUI versions).

```json
{
  "version": 1,
  "entries": [
    {
      "high_lora": "charA_high.safetensors",
      "high_strength": 1.0,
      "low_lora": "charA_low.safetensors",
      "low_strength": 1.0,
      "label": "Character A",
      "positive": "1girl, silver hair, ...",
      "negative": "lowres, bad anatomy, ..."
    }
  ]
}
```

- **Key = `(high_lora, low_lora)` exact match.** `label` is an optional memo, not used for lookup.
- **Save = upsert:** overwrite the entry whose `(high_lora, low_lora)` matches, else append.
- **Strengths are stored and auto-loaded** along with the prompts.
- **Location:** ComfyUI user directory via the userdata API — persistent on MimicPC,
  survives node updates, and requires no `.gitignore` entry (it lives outside the repo).

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

1. **Load (auto-fill)** — user changes `high_lora` or `low_lora` **via the UI** → JS calls
   `api.getUserData(LIB)`, finds the entry matching `(high, low)`, and writes `label`,
   `positive`, `negative`, `high_strength`, `low_strength` into the widgets.
   - **Readiness guard:** auto-fill fires **only** for user-initiated changes. During graph
     deserialization (loading a saved workflow) the node's saved widget values must be
     restored **without** triggering a library lookup, so a saved workflow's prompts are
     never clobbered by the (possibly newer) library. Implemented via a per-node "ready"
     flag set after configuration completes; the combo callback no-ops while not ready.
   - **No match → leave widgets unchanged** (never clobber with empty). This doubles as the
     "author a new preset" path: pick a new pair, type the prompt, then 💾.
2. **Edit** — user tweaks the widgets in place. (Switching to a different pair may replace the
   text; save first with 💾 to keep unsaved edits.)
3. **Save** — 💾 button → JS reads the current widget values (`high_lora`, `high_strength`,
   `low_lora`, `low_strength`, `label`, `positive`, `negative`) → `api.getUserData(LIB)`
   (empty library if 404) → `upsert` by pair → `api.storeUserData(LIB, json, {overwrite:true})`.
4. **Execute** — Python reads the **current widget values** (post-edit) and applies LoRAs +
   encodes; `selected_label` output echoes the `label` widget. The library file is **not**
   read during execution.

### Frontend robustness rules (MimicPC / reverse-proxy safe)

- All server communication uses **`api.*`** helpers (`api.getUserData` / `api.storeUserData`,
  or `api.fetchApi` if ever needed) — never raw `fetch('/...')` with a leading slash, which
  would drop the proxy base path.
- Module imports are **relative** (`import { app } from "../../scripts/app.js"`,
  `import { api } from "../../scripts/api.js"`) — relative specifiers resolve against the
  already-based module URL, so they stay correct behind MimicPC's base-path proxy. Absolute
  `/scripts/...` imports must be avoided.

### Error handling / edge cases

- **No matching entry on lookup** → leave widgets unchanged (protect in-progress edits;
  enables duplicate-and-tweak authoring).
- **Deserialization** → never auto-fill (readiness guard), preserving workflow reproducibility.
- **`None` in the pair** → treated as a normal key component (e.g. `(charA_high, None)` is valid).
- **LoRA file missing** → reuse the existing `_resolve_lora_path` behavior (raises `ValueError`
  with a clear message at execution time).
- **Library file missing (first run)** → `getUserData` 404 is treated as an empty library;
  the first Save creates it.
- **Library file corrupt** → JSON parse failure is caught in JS; treated as empty (logged to
  console), and the next Save overwrites it with a valid document.
- **Concurrent writes** → out of scope (local single-user assumption).

### Testing

- **JS unit tests** for `library_core.js` (pure, no browser/ComfyUI): `find(entries, high, low)`
  exact-pair match incl. `None` components; `upsert(entries, entry)` new-append vs.
  overwrite-in-place; empty/corrupt-input handling.
- **Python:** the node is trivial (LoRA apply + encode, no I/O). A light smoke test with a
  stubbed `clip`/`model` and mocked `folder_paths`/`comfy.*`, plus reuse of the existing
  resolution logic. No persistence to test on the Python side.
- **Manual E2E on MimicPC** (the real integration test): select LoRAs → auto-fill → edit →
  💾 → reload workflow (confirm no clobber) → **stop/restart the MimicPC instance** → confirm
  the library entry persists. This restart step also validates the one residual assumption
  below.

### Files touched

- `preset_library.py` — **new.** `PresetLibrarySelector` node class + mappings only
  (no routes, no file I/O).
- `web/preset_library.js` — **new.** Frontend extension (readiness-guarded reactive fill +
  Save button; uses `api.*` + relative imports).
- `web/library_core.js` — **new.** Pure `find` / `upsert` helpers (unit-testable).
- `__init__.py` — add `WEB_DIRECTORY = "./web"`; register the new node in the mappings.
- (No `.gitignore` change — the library lives in ComfyUI's user directory, outside the repo.)

## MimicPC compatibility

Verified against MimicPC's public docs and current ComfyUI source (not yet run on a live
MimicPC instance):

- **LoRA resolution** — already environment-agnostic via `folder_paths`; resolves MimicPC's
  `models/loras`. ✅
- **Custom JS + `WEB_DIRECTORY`** — standard ComfyUI; works on MimicPC (many popular nodes
  ship frontend JS there). ✅
- **Persistence** — handled by ComfyUI's userdata API, which writes to
  `folder_paths.get_user_directory()` and **auto-creates parent dirs**. This is the same
  mechanism ComfyUI uses for saved workflows, which MimicPC persists. ✅ (see residual below)
- **Reverse-proxy / base path** — `api.*` helpers prepend `api_base`; relative imports keep
  the base. Both rules are mandated above. ✅

**Residual assumption to validate during manual E2E:** that ComfyUI's user directory sits on
MimicPC's persistent volume. High confidence, because MimicPC persists saved ComfyUI
workflows (stored under that same user directory) across sessions. Quick check: confirm a
saved workflow (or the first saved preset) survives a full instance stop/restart.

_Verification sources: ComfyUI frontend `api.ts` (`getUserData`/`storeUserData`/`fetchApi`/
`apiURL`), ComfyUI `app/user_manager.py` (`/userdata/{file}`, parent-dir creation,
`folder_paths.get_user_directory()`), and MimicPC storage docs._

## Decisions locked

- (a) Strengths **are** saved/auto-loaded with the prompts.
- (b) **v2:** the library is stored via ComfyUI's **userdata API** under the **user directory**
  (flat filename `preset_selector_library.json`) — **not** in the node folder. No `.gitignore`.
- (c) No library-management GUI (list/delete) this iteration — lookup + save only.
- (d) **v2:** **no custom `PromptServer` routes** — frontend persistence rides entirely on
  ComfyUI's built-in userdata API.
- (e) **v2:** auto-fill triggers **only on user-initiated dropdown changes** (readiness guard),
  never during graph deserialization.
- (f) **v2:** all frontend↔server I/O uses base-path-aware `api.*` helpers; all module imports
  are relative (MimicPC reverse-proxy safety).

## Changelog

- **v2 (MimicPC-hardened):** Replaced custom `PromptServer` routes + node-folder JSON with
  ComfyUI's built-in userdata API under the user directory; Python node no longer performs any
  file I/O. Added the readiness guard against load-time clobber, and explicit reverse-proxy
  rules (`api.*` helpers + relative imports). Split pure `library_core.js` out for testability.
  Added the MimicPC compatibility section.
- **v1:** Initial approved design (custom routes, node-folder library).
