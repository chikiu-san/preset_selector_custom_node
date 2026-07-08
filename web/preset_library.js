import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { find } from "./library_core.js";
import { loadLibrary, upsertEntry } from "./library_io.js";

const NODE = "PresetLibrarySelector";
const FILL_KEYS = ["label", "positive", "negative", "high_strength", "low_strength"];

function widget(node, name) {
  return node.widgets && node.widgets.find((w) => w.name === name);
}

async function autofill(node) {
  const high = widget(node, "high_lora");
  const low = widget(node, "low_lora");
  if (!high || !low) return;
  const doc = await loadLibrary(api);
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
  const { ok, aborted } = await upsertEntry(api, entry);
  if (aborted) return; // upsertEntry already warned; do not overwrite on an uncertain read
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
    if (node._presetReady) autofill(node);
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
