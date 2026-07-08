# Preset Library Selector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `Preset Library Selector` ComfyUI node that auto-loads a saved positive/negative prompt (and LoRA strengths) when a `(high_lora, low_lora)` pair is chosen, editable in place, with a 💾 button that persists edits to a per-user library — all persisting on MimicPC.

**Architecture:** Three layers with **no custom server routes**. (1) A pure JS module `library_core.js` holds `find`/`upsert` over the entry array. (2) A thin Python node `PresetLibrarySelector` applies LoRAs + encodes prompts from its widget values (no file I/O), reusing shared helpers extracted into `lora_utils.py`. (3) A JS extension `preset_library.js` wires dropdown changes to `library_core` + ComfyUI's built-in `api.getUserData`/`api.storeUserData` (persistent user directory), guarded so graph-load never clobbers saved prompts.

**Tech Stack:** Python 3.10 (stdlib `unittest`, no pip installs), ComfyUI (`folder_paths`, `comfy.sd`, `comfy.utils`), browser ES modules, Node.js ≥ 18 built-in test runner (`node --test`, no npm installs).

## Global Constraints

- **Target runtime: MimicPC** (browser-hosted ComfyUI behind a reverse proxy). All frontend↔server I/O MUST use base-path-aware `api.*` helpers (`api.getUserData`, `api.storeUserData`); never raw `fetch('/...')`. All JS module imports MUST be relative (`../../scripts/app.js`), never absolute `/scripts/...`.
- **Persistence:** library stored via ComfyUI's userdata API at the flat filename `preset_selector_library.json` under `folder_paths.get_user_directory()`. The Python node performs **no file I/O** and never reads the library.
- **Matching key:** `(high_lora, low_lora)` exact string pair. `"None"` is a valid key component.
- **Auto-fill trigger:** only on **user-initiated** dropdown changes (readiness guard). Never during graph deserialization. On no match, leave widgets unchanged.
- **DRY:** shared LoRA-apply / text-encode / path-resolve logic lives in `lora_utils.py`; both the existing `PresetSelector10` and the new node use it. No duplication.
- **Do not break** the existing `PresetSelector10` / `Modulo10` nodes.
- **No new runtime dependencies.** Tests use only Node's built-in runner and Python stdlib `unittest`.
- **Node ids** (used by saved workflows) are stable strings: `"PresetLibrarySelector"` (class), display name `"Preset Library Selector"`.

## File Structure

- Create `lora_utils.py` — shared module functions: `resolve_lora_path`, `load_lora_file`, `apply_single_lora`, `encode_text` (+ `_lora_cache`).
- Modify `preset_selector.py` — `PresetSelector10` delegates to `lora_utils` (behavior preserved); dual-import shim.
- Create `preset_library.py` — `PresetLibrarySelector` node + its `NODE_CLASS_MAPPINGS` / `NODE_DISPLAY_NAME_MAPPINGS`; dual-import shim.
- Modify `__init__.py` — merge mappings from both node files; add `WEB_DIRECTORY = "./web"`.
- Create `web/library_core.js` — pure `find` / `upsert` (ES module).
- Create `web/preset_library.js` — ComfyUI extension (readiness-guarded auto-fill + Save button).
- Create `package.json` — `{"type":"module"}` + `test` script (enables `node --test`).
- Create `test/comfy_stubs.py` — installs stub `folder_paths` / `comfy.*` modules and puts repo root on `sys.path`.
- Create `test/test_lora_utils.py`, `test/test_preset_selector.py`, `test/test_preset_library.py`, `test/library_core.test.js`.

---

### Task 1: Pure JS library core (`find` / `upsert`) + test harness

**Files:**
- Create: `package.json`
- Create: `web/library_core.js`
- Test: `test/library_core.test.js`

**Interfaces:**
- Produces: `find(entries, high, low) -> entry|null` (exact `high_lora`/`low_lora` string match; treats non-array `entries` as empty). `upsert(entries, entry) -> Entry[]` (returns a NEW array; replaces the element with the same `(high_lora, low_lora)` in place, else appends; never mutates the input). `entry` shape: `{high_lora, high_strength, low_lora, low_strength, label, positive, negative}`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "preset-selector-custom-node",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test test/library_core.test.js"
  }
}
```

- [ ] **Step 2: Write the failing test**

Create `test/library_core.test.js`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { find, upsert } from "../web/library_core.js";

const A = { high_lora: "a_high", high_strength: 1, low_lora: "a_low", low_strength: 1, label: "A", positive: "pa", negative: "na" };
const B = { high_lora: "b_high", high_strength: 1, low_lora: "None", low_strength: 1, label: "B", positive: "pb", negative: "nb" };

test("find returns the entry matching the exact pair", () => {
  assert.deepEqual(find([A, B], "a_high", "a_low"), A);
});

test("find matches a None low component", () => {
  assert.deepEqual(find([A, B], "b_high", "None"), B);
});

test("find returns null when no pair matches", () => {
  assert.equal(find([A, B], "a_high", "None"), null);
});

test("find treats non-array input as empty", () => {
  assert.equal(find(undefined, "a_high", "a_low"), null);
});

test("upsert appends a new entry", () => {
  const out = upsert([A], B);
  assert.equal(out.length, 2);
  assert.deepEqual(out[1], B);
});

test("upsert overwrites the entry with the same pair in place", () => {
  const edited = { ...A, positive: "EDITED" };
  const out = upsert([A, B], edited);
  assert.equal(out.length, 2);
  assert.equal(out[0].positive, "EDITED");
  assert.deepEqual(out[1], B);
});

test("upsert does not mutate the input array", () => {
  const input = [A];
  const out = upsert(input, { ...A, positive: "X" });
  assert.equal(input[0].positive, "pa");
  assert.notEqual(out, input);
});

test("upsert treats non-array base as empty", () => {
  assert.deepEqual(upsert(null, A), [A]);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --test test/library_core.test.js`
Expected: FAIL — cannot resolve `../web/library_core.js` (module not found).

- [ ] **Step 4: Implement `web/library_core.js`**

```javascript
// Pure, dependency-free helpers over the preset library entry array.
// Loaded in-browser by preset_library.js AND imported by Node's test runner.

function asList(entries) {
  return Array.isArray(entries) ? entries : [];
}

export function find(entries, high, low) {
  for (const e of asList(entries)) {
    if (e && e.high_lora === high && e.low_lora === low) return e;
  }
  return null;
}

export function upsert(entries, entry) {
  const list = asList(entries);
  const next = list.slice();
  const i = next.findIndex(
    (e) => e && e.high_lora === entry.high_lora && e.low_lora === entry.low_lora
  );
  if (i >= 0) next[i] = entry;
  else next.push(entry);
  return next;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test test/library_core.test.js`
Expected: PASS — `# tests 8`, `# pass 8`, `# fail 0`.

- [ ] **Step 6: Commit**

```bash
git add package.json web/library_core.js test/library_core.test.js
git commit -m "feat: pure library_core find/upsert with node --test coverage"
```

---

### Task 2: Shared Python LoRA/encode helpers (`lora_utils.py`)

**Files:**
- Create: `lora_utils.py`
- Create: `test/comfy_stubs.py`
- Test: `test/test_lora_utils.py`

**Interfaces:**
- Produces: `resolve_lora_path(lora_name) -> str|None` (raises `ValueError` when a non-empty, non-`"None"` name resolves to nothing). `load_lora_file(lora_name) -> dict|None` (cached). `apply_single_lora(model, clip, lora_name, strength) -> model` (returns `model` unchanged when name is empty/`"None"` or `abs(strength) < 1e-12`; else the LoRA-applied model). `encode_text(clip, text) -> [[cond, {"pooled_output": pooled}]]`.

- [ ] **Step 1: Create the test stub helper `test/comfy_stubs.py`**

```python
"""Install stub `folder_paths` / `comfy.*` modules so the node code imports
without a running ComfyUI, and put the repo root on sys.path for direct imports."""
import os
import sys
import types

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def install_stubs():
    if REPO_ROOT not in sys.path:
        sys.path.insert(0, REPO_ROOT)

    if "folder_paths" not in sys.modules:
        fp = types.ModuleType("folder_paths")
        fp.get_filename_list = lambda folder: []
        fp.get_full_path = lambda folder, name: None
        fp.get_user_directory = lambda: "/tmp"
        sys.modules["folder_paths"] = fp

    comfy = sys.modules.get("comfy") or types.ModuleType("comfy")
    sys.modules["comfy"] = comfy
    if "comfy.sd" not in sys.modules:
        sd = types.ModuleType("comfy.sd")
        sd.load_lora_for_models = lambda model, clip, lora, s1, s2: (model, clip)
        sys.modules["comfy.sd"] = sd
    if "comfy.utils" not in sys.modules:
        cu = types.ModuleType("comfy.utils")
        cu.load_torch_file = lambda path, safe_load=True: {"_stub_lora": path}
        sys.modules["comfy.utils"] = cu
    # Submodules were pre-inserted into sys.modules, so `import comfy.sd` will
    # NOT set these attributes on the parent. Set them explicitly so both
    # lora_utils' runtime access (comfy.sd.load_lora_for_models) and the tests'
    # patch.object(lora_utils.comfy.sd, ...) resolve.
    comfy.sd = sys.modules["comfy.sd"]
    comfy.utils = sys.modules["comfy.utils"]

    return sys.modules["folder_paths"], sys.modules["comfy.sd"], sys.modules["comfy.utils"]
```

- [ ] **Step 2: Write the failing test `test/test_lora_utils.py`**

```python
import unittest
from unittest import mock

from comfy_stubs import install_stubs

install_stubs()
import lora_utils  # noqa: E402


class ResolveLoraPath(unittest.TestCase):
    def test_none_and_empty_return_none(self):
        self.assertIsNone(lora_utils.resolve_lora_path("None"))
        self.assertIsNone(lora_utils.resolve_lora_path(""))
        self.assertIsNone(lora_utils.resolve_lora_path(None))

    def test_direct_full_path(self):
        with mock.patch.object(
            lora_utils.folder_paths, "get_full_path", return_value="/loras/a.safetensors"
        ) as m:
            self.assertEqual(lora_utils.resolve_lora_path("a.safetensors"), "/loras/a.safetensors")
            m.assert_called_once_with("loras", "a.safetensors")

    def test_missing_raises_valueerror(self):
        with mock.patch.object(lora_utils.folder_paths, "get_full_path", return_value=None), \
             mock.patch.object(lora_utils.folder_paths, "get_filename_list", return_value=[]):
            with self.assertRaises(ValueError):
                lora_utils.resolve_lora_path("ghost.safetensors")


class ApplySingleLora(unittest.TestCase):
    def test_none_name_is_passthrough(self):
        model = object()
        with mock.patch.object(lora_utils.comfy.sd, "load_lora_for_models") as m:
            out = lora_utils.apply_single_lora(model, object(), "None", 1.0)
        self.assertIs(out, model)
        m.assert_not_called()

    def test_zero_strength_is_passthrough(self):
        model = object()
        with mock.patch.object(lora_utils.comfy.sd, "load_lora_for_models") as m:
            out = lora_utils.apply_single_lora(model, object(), "real.safetensors", 0.0)
        self.assertIs(out, model)
        m.assert_not_called()

    def test_applies_lora_and_returns_model(self):
        model, clip, applied = object(), object(), object()
        with mock.patch.object(lora_utils.folder_paths, "get_full_path", return_value="/loras/r.safetensors"), \
             mock.patch.object(lora_utils.comfy.sd, "load_lora_for_models", return_value=(applied, clip)) as m:
            out = lora_utils.apply_single_lora(model, clip, "r.safetensors", 0.8)
        self.assertIs(out, applied)
        self.assertEqual(m.call_args.args[3], 0.8)


class EncodeText(unittest.TestCase):
    def test_returns_conditioning_shape(self):
        clip = mock.Mock()
        clip.tokenize.return_value = "TOK"
        clip.encode_from_tokens.return_value = ("COND", "POOL")
        out = lora_utils.encode_text(clip, "hello")
        self.assertEqual(out, [["COND", {"pooled_output": "POOL"}]])
        clip.tokenize.assert_called_once_with("hello")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `python3 -m unittest discover -s test -p "test_lora_utils.py" -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'lora_utils'`.

- [ ] **Step 4: Implement `lora_utils.py`**

```python
import os

import folder_paths
import comfy.sd
import comfy.utils

_lora_cache = {}


def resolve_lora_path(lora_name):
    if not lora_name:
        return None
    lora_name = lora_name.strip()
    if not lora_name or lora_name == "None":
        return None

    if os.path.isabs(lora_name) and os.path.exists(lora_name):
        return lora_name

    direct_path = folder_paths.get_full_path("loras", lora_name)
    if direct_path is not None:
        return direct_path

    target_base = os.path.basename(lora_name)
    for available in folder_paths.get_filename_list("loras"):
        if os.path.basename(available) == target_base:
            path = folder_paths.get_full_path("loras", available)
            if path is not None:
                return path

    raise ValueError(
        f"LoRA not found: '{lora_name}'. Use the exact filename from your loras folder."
    )


def load_lora_file(lora_name):
    path = resolve_lora_path(lora_name)
    if path is None:
        return None
    if path in _lora_cache:
        return _lora_cache[path]
    lora = comfy.utils.load_torch_file(path, safe_load=True)
    _lora_cache[path] = lora
    return lora


def apply_single_lora(model, clip, lora_name, strength):
    name = "" if lora_name is None else str(lora_name).strip()
    if name in ("", "None") or abs(float(strength)) < 1e-12:
        return model
    lora_data = load_lora_file(name)
    model_lora, _clip_unused = comfy.sd.load_lora_for_models(model, clip, lora_data, float(strength), 0.0)
    return model_lora


def encode_text(clip, text):
    text = "" if text is None else str(text)
    tokens = clip.tokenize(text)
    cond, pooled = clip.encode_from_tokens(tokens, return_pooled=True)
    return [[cond, {"pooled_output": pooled}]]
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `python3 -m unittest discover -s test -p "test_lora_utils.py" -v`
Expected: PASS — `Ran 7 tests ... OK`.

- [ ] **Step 6: Commit**

```bash
git add lora_utils.py test/comfy_stubs.py test/test_lora_utils.py
git commit -m "feat: extract shared lora_utils (resolve/load/apply/encode) with tests"
```

---

### Task 3: Refactor `PresetSelector10` to reuse `lora_utils`

**Files:**
- Modify: `preset_selector.py`
- Test: `test/test_preset_selector.py`

**Interfaces:**
- Consumes: `lora_utils.apply_single_lora`, `lora_utils.encode_text` (from Task 2).
- Produces: unchanged public behavior of `PresetSelector10` — `select_preset(...)` still returns `(high_model, low_model, positive_cond, negative_cond, idx, name)`.

- [ ] **Step 1: Write the characterization test `test/test_preset_selector.py`**

```python
import unittest
from unittest import mock

from comfy_stubs import install_stubs

install_stubs()
import preset_selector  # noqa: E402


class PresetSelector10Refactor(unittest.TestCase):
    def test_input_types_still_expose_preset_slots(self):
        req = preset_selector.PresetSelector10.INPUT_TYPES()["required"]
        self.assertIn("preset_0_high_lora", req)
        self.assertIn("preset_9_negative", req)

    def test_select_preset_none_loras_passthrough(self):
        node = preset_selector.PresetSelector10()
        model = object()
        clip = mock.Mock()
        clip.tokenize.return_value = "T"
        clip.encode_from_tokens.return_value = ("C", "P")
        out = node.select_preset(
            model, clip, 0,
            preset_0_name="Zero",
            preset_0_high_lora="None", preset_0_high_strength=1.0,
            preset_0_low_lora="None", preset_0_low_strength=1.0,
            preset_0_positive="p", preset_0_negative="n",
        )
        self.assertIs(out[0], model)
        self.assertIs(out[1], model)
        self.assertEqual(out[2], [["C", {"pooled_output": "P"}]])
        self.assertEqual(out[4], 0)
        self.assertEqual(out[5], "Zero")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the test to verify current behavior (baseline)**

Run: `python3 -m unittest discover -s test -p "test_preset_selector.py" -v`
Expected: PASS (the pre-refactor node already behaves this way). This is the safety net for the refactor.

- [ ] **Step 3: Refactor `preset_selector.py` to delegate to `lora_utils`**

Replace the top imports:

```python
import os
import folder_paths

try:
    from . import lora_utils
except ImportError:  # allow standalone import for tests
    import lora_utils
```

Delete the now-unused helper methods `_resolve_lora_path`, `_load_lora_file`, `_apply_single_lora`, `_encode_text` and the `_lora_cache = {}` class attribute from `PresetSelector10`. Then replace the body of `select_preset` so it calls the shared module:

```python
    def select_preset(self, model, clip, preset_index, **kwargs):
        idx = int(preset_index) % 10

        name = kwargs.get(f"preset_{idx}_name", f"Preset {idx}")
        high_lora = kwargs.get(f"preset_{idx}_high_lora", "None")
        high_strength = kwargs.get(f"preset_{idx}_high_strength", 1.0)
        low_lora = kwargs.get(f"preset_{idx}_low_lora", "None")
        low_strength = kwargs.get(f"preset_{idx}_low_strength", 1.0)
        positive = kwargs.get(f"preset_{idx}_positive", "")
        negative = kwargs.get(f"preset_{idx}_negative", "")

        high_model = lora_utils.apply_single_lora(model, clip, high_lora, high_strength)
        low_model = lora_utils.apply_single_lora(model, clip, low_lora, low_strength)
        positive_cond = lora_utils.encode_text(clip, positive)
        negative_cond = lora_utils.encode_text(clip, negative)

        return (high_model, low_model, positive_cond, negative_cond, idx, str(name))
```

Leave `INPUT_TYPES`, `RETURN_TYPES`, `RETURN_NAMES`, `CATEGORY`, `FUNCTION`, the `Modulo10` class, and the mapping dicts at the bottom untouched. `os` stays imported only if still used; if not, remove it to avoid an unused import. (`folder_paths` is still used by `INPUT_TYPES`.)

- [ ] **Step 4: Run the test to verify behavior is preserved**

Run: `python3 -m unittest discover -s test -p "test_preset_selector.py" -v`
Expected: PASS — `Ran 2 tests ... OK`.

- [ ] **Step 5: Commit**

```bash
git add preset_selector.py test/test_preset_selector.py
git commit -m "refactor: PresetSelector10 delegates to lora_utils (behavior preserved)"
```

---

### Task 4: New Python node `PresetLibrarySelector` + registration

**Files:**
- Create: `preset_library.py`
- Modify: `__init__.py`
- Test: `test/test_preset_library.py`

**Interfaces:**
- Consumes: `lora_utils.apply_single_lora`, `lora_utils.encode_text` (Task 2); the widget names the JS layer (Task 5) reads/writes: `high_lora`, `high_strength`, `low_lora`, `low_strength`, `label`, `positive`, `negative`.
- Produces: class `PresetLibrarySelector` with `RETURN_NAMES = ("high_model","low_model","positive","negative","selected_label")` and `select_preset(self, model, clip, high_lora, high_strength, low_lora, low_strength, label, positive, negative)`. Registered under id `"PresetLibrarySelector"`. Package exposes `WEB_DIRECTORY = "./web"`.

- [ ] **Step 1: Write the failing test `test/test_preset_library.py`**

```python
import unittest
from unittest import mock

from comfy_stubs import install_stubs

install_stubs()
import preset_library  # noqa: E402


class PresetLibrarySelectorNode(unittest.TestCase):
    def test_input_types_expose_expected_widgets(self):
        req = preset_library.PresetLibrarySelector.INPUT_TYPES()["required"]
        for key in ["model", "clip", "high_lora", "high_strength",
                    "low_lora", "low_strength", "label", "positive", "negative"]:
            self.assertIn(key, req)

    def test_lora_dropdown_starts_with_none(self):
        req = preset_library.PresetLibrarySelector.INPUT_TYPES()["required"]
        self.assertEqual(req["high_lora"][0][0], "None")
        self.assertEqual(req["low_lora"][0][0], "None")

    def test_return_names(self):
        self.assertEqual(
            preset_library.PresetLibrarySelector.RETURN_NAMES,
            ("high_model", "low_model", "positive", "negative", "selected_label"),
        )

    def test_select_preset_passthrough_and_label_echo(self):
        node = preset_library.PresetLibrarySelector()
        model = object()
        clip = mock.Mock()
        clip.tokenize.return_value = "T"
        clip.encode_from_tokens.return_value = ("C", "P")
        out = node.select_preset(model, clip, "None", 1.0, "None", 1.0, "MyLabel", "pos", "neg")
        high_model, low_model, positive, negative, label = out
        self.assertIs(high_model, model)
        self.assertIs(low_model, model)
        self.assertEqual(positive, [["C", {"pooled_output": "P"}]])
        self.assertEqual(negative, [["C", {"pooled_output": "P"}]])
        self.assertEqual(label, "MyLabel")


class Registration(unittest.TestCase):
    def test_mappings_present(self):
        self.assertIn("PresetLibrarySelector", preset_library.NODE_CLASS_MAPPINGS)
        self.assertEqual(
            preset_library.NODE_DISPLAY_NAME_MAPPINGS["PresetLibrarySelector"],
            "Preset Library Selector",
        )


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `python3 -m unittest discover -s test -p "test_preset_library.py" -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'preset_library'`.

- [ ] **Step 3: Implement `preset_library.py`**

```python
import folder_paths

try:
    from . import lora_utils
except ImportError:  # allow standalone import for tests
    import lora_utils


class PresetLibrarySelector:
    """
    Pick a (high_lora, low_lora) pair; the matching prompt/strengths are
    auto-loaded into the widgets by the frontend extension (web/preset_library.js)
    from a persistent per-user library. Execution uses the *current* widget
    values — the library is never read here ("what you see is what runs").
    """

    CATEGORY = "presets"
    RETURN_TYPES = ("MODEL", "MODEL", "CONDITIONING", "CONDITIONING", "STRING")
    RETURN_NAMES = ("high_model", "low_model", "positive", "negative", "selected_label")
    FUNCTION = "select_preset"

    @classmethod
    def INPUT_TYPES(cls):
        lora_options = ["None"] + folder_paths.get_filename_list("loras")
        return {
            "required": {
                "model": ("MODEL",),
                "clip": ("CLIP",),
                "high_lora": (lora_options,),
                "high_strength": ("FLOAT", {"default": 1.0, "min": -10.0, "max": 10.0, "step": 0.05}),
                "low_lora": (lora_options,),
                "low_strength": ("FLOAT", {"default": 1.0, "min": -10.0, "max": 10.0, "step": 0.05}),
                "label": ("STRING", {"default": "", "multiline": False}),
                "positive": ("STRING", {"default": "", "multiline": True, "dynamicPrompts": False}),
                "negative": ("STRING", {"default": "", "multiline": True, "dynamicPrompts": False}),
            }
        }

    def select_preset(self, model, clip, high_lora, high_strength,
                      low_lora, low_strength, label, positive, negative):
        high_model = lora_utils.apply_single_lora(model, clip, high_lora, high_strength)
        low_model = lora_utils.apply_single_lora(model, clip, low_lora, low_strength)
        positive_cond = lora_utils.encode_text(clip, positive)
        negative_cond = lora_utils.encode_text(clip, negative)
        return (high_model, low_model, positive_cond, negative_cond, str(label))


NODE_CLASS_MAPPINGS = {
    "PresetLibrarySelector": PresetLibrarySelector,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "PresetLibrarySelector": "Preset Library Selector",
}
```

- [ ] **Step 4: Update `__init__.py` to merge mappings and expose `WEB_DIRECTORY`**

```python
from .preset_selector import (
    NODE_CLASS_MAPPINGS as _selector_class,
    NODE_DISPLAY_NAME_MAPPINGS as _selector_display,
)
from .preset_library import (
    NODE_CLASS_MAPPINGS as _library_class,
    NODE_DISPLAY_NAME_MAPPINGS as _library_display,
)

WEB_DIRECTORY = "./web"

NODE_CLASS_MAPPINGS = {**_selector_class, **_library_class}
NODE_DISPLAY_NAME_MAPPINGS = {**_selector_display, **_library_display}

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `python3 -m unittest discover -s test -p "test_preset_library.py" -v`
Expected: PASS — `Ran 5 tests ... OK`.

- [ ] **Step 6: Run the whole Python suite (no regressions)**

Run: `python3 -m unittest discover -s test -p "test_*.py" -v`
Expected: PASS — all tests from Tasks 2–4 green (`OK`).

- [ ] **Step 7: Commit**

```bash
git add preset_library.py __init__.py test/test_preset_library.py
git commit -m "feat: PresetLibrarySelector node + WEB_DIRECTORY registration"
```

---

### Task 5: Frontend extension — readiness-guarded auto-fill + Save button

**Files:**
- Create: `web/preset_library.js`

**Interfaces:**
- Consumes: `find`, `upsert` from `./library_core.js` (Task 1); ComfyUI `app` and `api`; the node id `"PresetLibrarySelector"` and widget names from Task 4; the library filename `preset_selector_library.json`.
- Produces: browser behavior only (no automated unit test; verified by the manual checklist below).

- [ ] **Step 1: Implement `web/preset_library.js`**

```javascript
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { find, upsert } from "./library_core.js";

const NODE = "PresetLibrarySelector";
const LIB = "preset_selector_library.json";
const FILL_KEYS = ["label", "positive", "negative", "high_strength", "low_strength"];

async function loadLibrary() {
  try {
    const resp = await api.getUserData(LIB);
    if (resp.status === 404) return { version: 1, entries: [] };
    if (!resp.ok) {
      console.warn(`[PresetLibrary] load failed: HTTP ${resp.status}`);
      return { version: 1, entries: [] };
    }
    const data = await resp.json();
    if (!data || !Array.isArray(data.entries)) return { version: 1, entries: [] };
    return data;
  } catch (e) {
    console.warn("[PresetLibrary] load error; using empty library", e);
    return { version: 1, entries: [] };
  }
}

async function saveLibrary(doc) {
  try {
    const resp = await api.storeUserData(LIB, doc, { overwrite: true, throwOnError: false });
    return !!(resp && resp.ok);
  } catch (e) {
    console.warn("[PresetLibrary] save error", e);
    return false;
  }
}

function widget(node, name) {
  return node.widgets && node.widgets.find((w) => w.name === name);
}

async function autofill(node) {
  const high = widget(node, "high_lora");
  const low = widget(node, "low_lora");
  if (!high || !low) return;
  const doc = await loadLibrary();
  const entry = find(doc.entries, high.value, low.value);
  if (!entry) return; // no match -> never clobber current edits
  for (const key of FILL_KEYS) {
    const w = widget(node, key);
    if (w && entry[key] !== undefined && entry[key] !== null) w.value = entry[key];
  }
  node.setDirtyCanvas && node.setDirtyCanvas(true, true);
}

async function saveCurrent(node) {
  const val = (name, fallback) => {
    const w = widget(node, name);
    return w ? w.value : fallback;
  };
  const entry = {
    high_lora: val("high_lora", "None"),
    high_strength: val("high_strength", 1.0),
    low_lora: val("low_lora", "None"),
    low_strength: val("low_strength", 1.0),
    label: val("label", ""),
    positive: val("positive", ""),
    negative: val("negative", ""),
  };
  const doc = await loadLibrary();
  const ok = await saveLibrary({ version: 1, entries: upsert(doc.entries, entry) });
  console.log(ok
    ? `[PresetLibrary] saved (${entry.high_lora} + ${entry.low_lora})`
    : "[PresetLibrary] save FAILED — check console/network");
}

function hookComboAutofill(node, name) {
  const w = widget(node, name);
  if (!w) return;
  const prev = w.callback;
  w.callback = function (v) {
    const r = prev ? prev.apply(this, arguments) : undefined;
    if (node._presetReady) autofill(node); // user-initiated only
    return r;
  };
}

app.registerExtension({
  name: "presetselector.PresetLibrary",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== NODE) return;

    const onNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
      this._presetReady = false;
      this.addWidget("button", "💾 Save to library", null, () => saveCurrent(this));
      hookComboAutofill(this, "high_lora");
      hookComboAutofill(this, "low_lora");
      // Become ready after the current setup tick so fresh-node creation does not autofill,
      // and (see onConfigure) graph-load value restoration does not autofill either.
      requestAnimationFrame(() => { this._presetReady = true; });
      return r;
    };

    const onConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function (info) {
      this._presetReady = false; // block autofill while a saved workflow restores widget values
      const r = onConfigure ? onConfigure.apply(this, arguments) : undefined;
      requestAnimationFrame(() => { this._presetReady = true; });
      return r;
    };
  },
});
```

- [ ] **Step 2: Restart ComfyUI so the Python node + `WEB_DIRECTORY` JS load**

On MimicPC: restart the ComfyUI app. Confirm the browser console shows no import errors from `preset_library.js` (a base-path/import mistake would surface here).

- [ ] **Step 3: Manual E2E verification checklist**

Run through these in the ComfyUI canvas and confirm each:

1. Add **Preset Library Selector**; connect a `MODEL` and `CLIP`. The node shows `high_lora`, `high_strength`, `low_lora`, `low_strength`, `label`, `positive`, `negative`, and a **💾 Save to library** button.
2. Pick `high_lora` = X, `low_lora` = Y (a pair not yet saved). Widgets stay as-is (no match → no clobber). Type a `positive`, `negative`, `label`; click **💾**. Console logs `saved (X + Y)`.
3. Change `high_lora` to something else, then back to X (with `low_lora` = Y). The saved `positive`/`negative`/`label`/strengths **auto-fill** into the widgets.
4. Edit the auto-filled `positive`; **queue a prompt**. The generation uses the edited text (what you see is what runs).
5. Edit again and **💾** to update the entry; change away and back → the updated text loads.
6. **Save the workflow, reload the page, reopen the workflow.** The node's prompts are exactly what the workflow saved — **not** overwritten by the library (readiness guard working).
7. **MimicPC persistence:** stop and restart the MimicPC instance; reopen ComfyUI; select the X+Y pair → the saved preset still auto-fills (confirms the userdata file persisted).

- [ ] **Step 4: Commit**

```bash
git add web/preset_library.js
git commit -m "feat: preset_library.js reactive auto-fill + Save (userdata API, load-guard)"
```

---

### Task 6: Documentation — promote the node from "Planned" to shipped

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: the shipped node from Tasks 4–5.

- [ ] **Step 1: Update `README.md`**

In the `## Nodes` list, replace the planned bullet:

```markdown
- **Preset Library Selector** — pick a HIGH+LOW LoRA pair; the matching prompt (and strengths) auto-loads from a persistent per-user library, editable in place, with a 💾 Save button. See [Preset Library Selector](#preset-library-selector) below.
```

Replace the entire `## Planned: Preset Library Selector` section with:

```markdown
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
```

- [ ] **Step 2: Verify the full test suite is still green**

Run: `python3 -m unittest discover -s test -p "test_*.py" -v && node --test test/library_core.test.js`
Expected: both PASS.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document shipped Preset Library Selector node"
```

---

## Self-Review

**Spec coverage:**
- Reactive JS auto-fill into editable widgets → Task 5 (`autofill`, combo callbacks).
- `(high_lora, low_lora)` exact-pair key incl. `None` → Task 1 (`find`) + tests.
- New node, existing node untouched → Task 4 (new) + Task 3 (refactor preserves behavior).
- Persistence via userdata API under user dir, flat filename, no `.gitignore` → Task 5 (`LIB`, `api.*`).
- Python node no file I/O → Task 4 (`select_preset` uses only widget args).
- Save = upsert by pair → Task 1 (`upsert`) + Task 5 (`saveCurrent`).
- Readiness guard (no clobber on load) → Task 5 (`onNodeCreated`/`onConfigure` + `_presetReady`); verified by checklist item 6.
- `api.*` helpers + relative imports (MimicPC proxy) → Task 5 imports + Global Constraints.
- Strengths saved/auto-loaded → Task 1 entry shape + Task 5 `FILL_KEYS`/`saveCurrent`.
- `selected_label` echoes label → Task 4 `select_preset` + test.
- Testing: JS core unit tests (Task 1), Python helper tests (Task 2), node smoke tests (Tasks 3–4), manual E2E incl. MimicPC restart (Task 5).
- No batch cycling / no library GUI / no configurable path → out of scope, not implemented (correct).

**Placeholder scan:** No TBD/TODO; every code step contains full code; every run step has an exact command + expected result.

**Type/name consistency:** `find(entries, high, low)` / `upsert(entries, entry)` identical across Tasks 1 and 5. Widget names (`high_lora`, `high_strength`, `low_lora`, `low_strength`, `label`, `positive`, `negative`) identical across Tasks 4 and 5. `LIB = "preset_selector_library.json"` matches the spec. `RETURN_NAMES` identical across Task 4 code and its test. `lora_utils` function names identical across Tasks 2, 3, 4.
