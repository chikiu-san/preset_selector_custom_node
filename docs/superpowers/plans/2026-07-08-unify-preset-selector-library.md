# Unify Preset Selector 10 + Library — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fold the per-pair persistent library into `Preset Selector 10` (each of its 10 slots auto-loads its `(high_lora, low_lora)` prompt from the library and can be saved with one 💾 button), and delete the standalone `PresetLibrarySelector` node — one node, not two.

**Architecture:** Frontend-only integration. `Preset Selector 10`'s Python execution is already widget-driven and does not change. A new JS extension `web/preset_selector_library.js` wires the 10 slots to the existing `web/library_core.js` (`find`) and `web/library_io.js` (`loadLibrary` + a new `upsertMany`). The standalone node, its JS, and its test are removed.

**Tech Stack:** ComfyUI (`folder_paths`, `comfy.*`), browser ES modules, Python 3.10 (stdlib `unittest`), Node.js ≥ 18 (`node --test`). No new runtime deps.

## Global Constraints

- **Target MimicPC** (browser behind a reverse proxy). All frontend↔server I/O via base-path-aware `api.*` (`api.getUserData`/`api.storeUserData`); never raw `fetch('/...')`. All JS imports relative; never absolute `/scripts/...`.
- **Per-pair library**, same file and entry shape as today: `preset_selector_library.json` under the ComfyUI user directory; entry `{high_lora, high_strength, low_lora, low_strength, label, positive, negative}`, key = `(high_lora, low_lora)`. Existing saved entries must remain usable.
- **Slot ↔ entry mapping:** slot widget `preset_i_name` ↔ entry `label`.
- **Preset Selector 10 execution/cycling is UNCHANGED** (Python untouched). Do not break `PresetSelector10` / `Modulo10`. Delete `PresetLibrarySelector`.
- **Auto-fill:** per slot, only on user-initiated `preset_i_high_lora`/`preset_i_low_lora` change; readiness-guarded (one per-node `_presetReady` flag covers all 10 slots); no match → leave that slot unchanged; never auto-fill during graph deserialization.
- **Save all:** one round-trip via `upsertMany` (load-once strict / upsert-each / save-once); skip slots whose pair is `(None, None)`; last entry wins on duplicate pairs.
- No new runtime dependencies; tests use only `node --test` and stdlib `unittest`.

## File Structure

- Modify `web/library_io.js` — add `upsertMany(api, entries)`.
- Modify `test/library_io.test.js` — add `upsertMany` tests.
- Delete `preset_library.py`, `web/preset_library.js`, `test/test_preset_library.py`.
- Modify `__init__.py` — re-export `Preset Selector 10`'s mappings only.
- Add `test/test_registration.py` — the package imports cleanly and registers exactly the two remaining nodes.
- Add `web/preset_selector_library.js` — the 10-slot library wiring.
- Modify `README.md` — replace the standalone node docs with the unified library feature.
- Unchanged: `preset_selector.py`, `lora_utils.py`, `web/library_core.js`, `test/library_core.test.js`, `test/test_lora_utils.py`, `test/test_preset_selector.py`.

---

### Task 1: Add `upsertMany` to `web/library_io.js`

**Files:**
- Modify: `web/library_io.js`
- Test: `test/library_io.test.js`

**Interfaces:**
- Consumes: `loadLibrary(api, {strict})`, `saveLibrary(api, doc)`, `upsert` (already imported), `LIB` (existing in this file).
- Produces: `upsertMany(api, entries) -> {ok, aborted}` — one strict load, fold every entry in with `upsert`, one save. Aborts (`{ok:false, aborted:true}`) without writing when the strict load fails. Last entry wins on duplicate pairs.

- [ ] **Step 1: Write the failing tests** — append to `test/library_io.test.js` (the file already defines `makeApi()` and imports from `../web/library_io.js`).

First, extend the existing import line to include `upsertMany`:

```javascript
import { loadLibrary, saveLibrary, upsertEntry, upsertMany, LIB } from "../web/library_io.js";
```

Then append these tests:

```javascript
test("upsertMany writes multiple new entries in a single save", async () => {
  const api = makeApi();
  let saves = 0;
  const orig = api.storeUserData.bind(api);
  api.storeUserData = async (...a) => { saves++; return orig(...a); };
  const res = await upsertMany(api, [
    { high_lora: "h1", low_lora: "l1", positive: "a" },
    { high_lora: "h2", low_lora: "l2", positive: "b" },
  ]);
  assert.equal(res.ok, true);
  assert.equal(saves, 1); // one round-trip, not one-per-entry
  assert.equal((await loadLibrary(api)).entries.length, 2);
});

test("upsertMany overwrites existing pairs and appends new ones in one pass", async () => {
  const api = makeApi();
  await upsertMany(api, [{ high_lora: "h", low_lora: "l", positive: "old" }]);
  await upsertMany(api, [
    { high_lora: "h", low_lora: "l", positive: "new" },
    { high_lora: "h2", low_lora: "l2", positive: "b" },
  ]);
  const entries = (await loadLibrary(api)).entries;
  assert.equal(entries.length, 2);
  assert.equal(entries.find((e) => e.high_lora === "h").positive, "new");
});

test("upsertMany last-wins on duplicate pairs within the batch", async () => {
  const api = makeApi();
  await upsertMany(api, [
    { high_lora: "h", low_lora: "l", positive: "first" },
    { high_lora: "h", low_lora: "l", positive: "second" },
  ]);
  const entries = (await loadLibrary(api)).entries;
  assert.equal(entries.length, 1);
  assert.equal(entries[0].positive, "second");
});

test("upsertMany aborts (does not wipe) when the existing library can't be read", async () => {
  const api = makeApi();
  await upsertMany(api, [{ high_lora: "h", low_lora: "l", positive: "keep" }]);
  api.getUserData = async () => new Response(null, { status: 503 });
  const res = await upsertMany(api, [{ high_lora: "h2", low_lora: "l2", positive: "new" }]);
  assert.equal(res.aborted, true);
  assert.equal(res.ok, false);
  const doc = JSON.parse(api.store.get(LIB));
  assert.equal(doc.entries.length, 1);
  assert.equal(doc.entries[0].positive, "keep");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/library_io.test.js`
Expected: FAIL — `upsertMany` is not exported (`SyntaxError` or the new tests error on `upsertMany` being undefined).

- [ ] **Step 3: Implement `upsertMany`** — append to `web/library_io.js` (after `upsertEntry`):

```javascript
// Upserts every entry in `entries` (each keyed by its (high_lora, low_lora) pair) in ONE
// round-trip: strict load (so a failed read aborts instead of wiping), fold all in with
// `upsert`, then one save. Duplicate pairs within `entries`: last wins. Returns {ok, aborted}.
export async function upsertMany(api, entries) {
  let doc;
  try {
    doc = await loadLibrary(api, { strict: true });
  } catch (e) {
    console.warn("[PresetLibrary] save aborted — could not read existing library (not overwriting)", e);
    return { ok: false, aborted: true };
  }
  let list = doc.entries;
  for (const entry of entries) list = upsert(list, entry);
  const ok = await saveLibrary(api, { version: 1, entries: list });
  return { ok, aborted: false };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/library_io.test.js`
Expected: PASS — all prior tests plus the 4 new ones (`# pass` increases by 4, `# fail 0`).

- [ ] **Step 5: Commit**

```bash
git add web/library_io.js test/library_io.test.js
git commit -m "feat: add upsertMany for single-round-trip batch library saves"
```

---

### Task 2: Delete the standalone `PresetLibrarySelector` node

**Files:**
- Delete: `preset_library.py`, `web/preset_library.js`, `test/test_preset_library.py`
- Modify: `__init__.py`
- Test: `test/test_registration.py`

**Interfaces:**
- Produces: the package exposes `NODE_CLASS_MAPPINGS` with exactly `PresetSelector10` and `Modulo10`, and `WEB_DIRECTORY == "./web"`.

- [ ] **Step 1: Write the failing test** — create `test/test_registration.py`:

```python
import importlib
import os
import sys
import unittest

from comfy_stubs import install_stubs

install_stubs()


class Registration(unittest.TestCase):
    def test_package_registers_exactly_the_two_nodes(self):
        repo = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        parent = os.path.dirname(repo)
        if parent not in sys.path:
            sys.path.insert(0, parent)
        pkg = importlib.import_module(os.path.basename(repo))
        self.assertEqual(set(pkg.NODE_CLASS_MAPPINGS), {"PresetSelector10", "Modulo10"})
        self.assertEqual(pkg.WEB_DIRECTORY, "./web")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run it to verify current state**

Run: `python3 -m unittest discover -s test -p "test_registration.py" -v`
Expected: FAIL — the package currently also registers `PresetLibrarySelector`, so the set assertion fails (`{'Modulo10', 'PresetLibrarySelector', 'PresetSelector10'} != {'PresetSelector10', 'Modulo10'}`).

- [ ] **Step 3: Delete the standalone node and its artifacts**

```bash
git rm preset_library.py web/preset_library.js test/test_preset_library.py
```

- [ ] **Step 4: Rewrite `__init__.py`** to re-export only Preset Selector 10's mappings:

```python
from .preset_selector import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS

WEB_DIRECTORY = "./web"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
```

- [ ] **Step 5: Run the test to verify it passes, then the full Python suite**

Run: `python3 -m unittest discover -s test -p "test_registration.py" -v`
Expected: PASS.

Run: `python3 -m unittest discover -s test -p "test_*.py" -v`
Expected: PASS — `test_lora_utils`, `test_preset_selector`, `test_registration` all green; `test_preset_library.py` no longer exists.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: remove standalone PresetLibrarySelector; register only the two nodes"
```

---

### Task 3: Wire the 10 slots to the library (`web/preset_selector_library.js`)

**Files:**
- Create: `web/preset_selector_library.js`

**Interfaces:**
- Consumes: `find` from `./library_core.js`; `loadLibrary`, `upsertMany` from `./library_io.js` (Task 1); ComfyUI `app`/`api`; node id `"PresetSelector10"`; slot widget names `preset_${i}_{high_lora,high_strength,low_lora,low_strength,name,positive,negative}` for `i` in 0..9.
- Produces: browser behavior only (no automated unit test — verified by the manual E2E checklist).

- [ ] **Step 1: Implement `web/preset_selector_library.js`**

```javascript
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { find } from "./library_core.js";
import { loadLibrary, upsertMany } from "./library_io.js";

const NODE = "PresetSelector10";
const SLOTS = 10;
const FILL_KEYS = ["positive", "negative", "high_strength", "low_strength"];

function widget(node, name) {
  return node.widgets && node.widgets.find((w) => w.name === name);
}
function slotWidget(node, i, field) {
  return widget(node, `preset_${i}_${field}`);
}

async function autofillSlot(node, i) {
  const high = slotWidget(node, i, "high_lora");
  const low = slotWidget(node, i, "low_lora");
  if (!high || !low) return;
  const doc = await loadLibrary(api);
  const entry = find(doc.entries, high.value, low.value);
  if (!entry) return; // no match -> leave this slot untouched
  for (const key of FILL_KEYS) {
    const w = slotWidget(node, i, key);
    if (w && entry[key] !== undefined && entry[key] !== null) w.value = entry[key];
  }
  if (entry.label !== undefined && entry.label !== null && entry.label !== "") {
    const nameW = slotWidget(node, i, "name");
    if (nameW) nameW.value = entry.label;
  }
  node.setDirtyCanvas && node.setDirtyCanvas(true, true);
}

async function saveAll(node) {
  const entries = [];
  for (let i = 0; i < SLOTS; i++) {
    const high = slotWidget(node, i, "high_lora");
    const low = slotWidget(node, i, "low_lora");
    if (!high || !low) continue;
    const h = high.value, l = low.value;
    if (h === "None" && l === "None") continue; // skip empty pair
    const get = (field, fb) => {
      const w = slotWidget(node, i, field);
      return w ? w.value : fb;
    };
    entries.push({
      high_lora: h,
      high_strength: get("high_strength", 1.0),
      low_lora: l,
      low_strength: get("low_strength", 1.0),
      label: get("name", ""),
      positive: get("positive", ""),
      negative: get("negative", ""),
    });
  }
  if (!entries.length) {
    console.log("[PresetLibrary] nothing to save (no slot has a LoRA pair)");
    return;
  }
  const { ok, aborted } = await upsertMany(api, entries);
  if (aborted) return;
  console.log(ok
    ? `[PresetLibrary] saved ${entries.length} slot(s) to library`
    : "[PresetLibrary] save FAILED — check console/network");
}

function hookSlotAutofill(node, i, field) {
  const w = slotWidget(node, i, field);
  if (!w) return;
  const prev = w.callback;
  w.callback = function (v) {
    const r = prev ? prev.apply(this, arguments) : undefined;
    if (node._presetReady) autofillSlot(node, i);
    return r;
  };
}

app.registerExtension({
  name: "presetselector.PresetSelector10Library",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== NODE) return;

    const onNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
      this._presetReady = false;
      this.addWidget("button", "💾 Save all slots to library", null, () => saveAll(this));
      for (let i = 0; i < SLOTS; i++) {
        hookSlotAutofill(this, i, "high_lora");
        hookSlotAutofill(this, i, "low_lora");
      }
      requestAnimationFrame(() => { this._presetReady = true; });
      return r;
    };

    const onConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function (info) {
      this._presetReady = false;
      const r = onConfigure ? onConfigure.apply(this, arguments) : undefined;
      requestAnimationFrame(() => { this._presetReady = true; });
      return r;
    };
  },
});
```

- [ ] **Step 2: Validate syntax and imports (no browser here)**

Run: `node --check web/preset_selector_library.js`
Expected: no output (valid ES-module syntax; `node --check` does not resolve the `../../scripts/*.js` browser imports).

Confirm the imported names exist: `web/library_core.js` exports `find`; `web/library_io.js` exports `loadLibrary` and `upsertMany`. (Do NOT run the file — its browser-only imports won't resolve in Node.)

- [ ] **Step 3: Manual E2E verification (human, on a live ComfyUI/MimicPC instance)**

Deferred to human — cannot run here. Steps:
1. Restart ComfyUI; confirm no console import errors from `preset_selector_library.js`.
2. Add **Preset Selector 10**; it shows the 10 slots + a **💾 Save all slots to library** button.
3. In slot 0 pick a `(high, low)` pair, type positive/negative/name → **💾** → console logs `saved 1 slot(s)`.
4. Change slot 0's `high_lora` away and back → slot 0's prompt/strengths/name auto-fill.
5. Set slot 1 to a different pair + prompt → 💾 → both persist.
6. **Save workflow, reload page, reopen** → slots are exactly as saved (readiness guard: not clobbered).
7. **Restart the MimicPC instance** → selecting the saved pairs auto-fills (persistence).
8. Confirm `preset_index` + `Control After Generate = increment` still cycles slots at execution (unchanged).

- [ ] **Step 4: Commit**

```bash
git add web/preset_selector_library.js
git commit -m "feat: wire Preset Selector 10's 10 slots to the per-pair library (auto-fill + Save all)"
```

---

### Task 4: Update `README.md`

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the `## Nodes` list** — replace the three bullets with:

```markdown
- **Preset Selector 10** — pick 1 of 10 presets and output the LoRA-applied models and encoded conditioning. Each slot's `(high_lora, low_lora)` pair can auto-load its prompt from a persistent library and be saved back with one button — see [Library persistence](#library-persistence) below.
- **Modulo 10** — small helper that wraps an incrementing INT into the 0–9 range.
```

- [ ] **Step 2: Replace the entire `## Preset Library Selector` section** (heading through its `### Outputs` table and the no-match note) with:

```markdown
## Library persistence

Each of the 10 slots can auto-load its prompt from — and save it to — a persistent per-user
library keyed by the slot's `(high_lora, low_lora)` pair, so you don't re-type prompts across
workflows.

- Changing a slot's `high_lora` / `low_lora` auto-fills that slot's `positive` / `negative` /
  strengths / name from the library (if that pair was saved). No saved entry → the slot is left
  unchanged. Opening a saved workflow never overwrites its slots.
- **💾 Save all slots to library** upserts every slot that has a LoRA pair (skipping empty
  `None`/`None` slots) back into the library in one write.
- Loaded values are **editable in place**; execution uses the on-screen values (what you see is
  what runs). The library is stored via ComfyUI's userdata API as `preset_selector_library.json`
  in ComfyUI's user directory, so it survives node updates and persists on MimicPC.
```

- [ ] **Step 3: Update the `## Using on MimicPC` section** — replace the "Use it" list so it targets Preset Selector 10 (find the "**Use it**" block and replace it with):

```markdown
**Use it**
1. Right-click the canvas → **Add Node → presets → Preset Selector 10** (or double-click and search).
2. Connect **MODEL** and **CLIP** (from your checkpoint loader).
3. In any slot, pick `high_lora` + `low_lora`. For a new pair, type the prompts (and a name), then
   click **💾 Save all slots to library**.
4. Next time — in any workflow — set a slot to the same pair and its saved prompt / strengths / name
   **auto-fill**. Tweak in place; press 💾 again to update. Use `preset_index` (with
   *Control After Generate = increment*) to cycle through the 10 slots as before.
```

Leave the section's Prerequisites, Install, and Notes/troubleshooting intact (they already reference `custom_nodes`, `models/loras`, and `preset_selector_library.json`, all still correct). If any remaining line names the deleted "Preset Library Selector" node, change it to "Preset Selector 10".

- [ ] **Step 4: Verify no dangling references and suites still green**

Run: `grep -n "Preset Library Selector" README.md`
Expected: no matches (the standalone node name is gone).

Run: `python3 -m unittest discover -s test -p "test_*.py" && node --test test/library_core.test.js test/library_io.test.js`
Expected: both PASS (docs change doesn't affect them).

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: document unified library persistence on Preset Selector 10"
```

---

## Self-Review

**Spec coverage:**
- Per-pair library folded into Preset Selector 10, reusing core/io → Tasks 1 & 3.
- Single Save-all in one round-trip → Task 1 (`upsertMany`) + Task 3 (`saveAll`).
- Per-slot reactive auto-fill, readiness-guarded, name↔label → Task 3.
- Delete standalone node; register only the two nodes → Task 2 (+ `test_registration`).
- Python execution/cycling unchanged → no task touches `preset_selector.py`.
- MimicPC constraints (api.* / relative imports / filename) → Task 3 code + Global Constraints.
- Docs updated, no dangling node name → Task 4 (with grep check).
- Existing saved entries stay usable (same file/shape) → unchanged `library_io`/`library_core` contract.

**Placeholder scan:** none — every code step has complete code; every run step has an exact command + expected result. Task 3's browser E2E is explicitly a human step (this layer has no automated test by design).

**Type/name consistency:** `upsertMany(api, entries) -> {ok, aborted}` identical across Task 1 (impl + tests) and Task 3 (`saveAll`). Slot widget names `preset_${i}_...` and `FILL_KEYS` match the existing `PresetSelector10.INPUT_TYPES`. `find`/`upsert`/`loadLibrary`/`saveLibrary` signatures match the reused modules. Library filename `preset_selector_library.json` matches `library_io.js`.
