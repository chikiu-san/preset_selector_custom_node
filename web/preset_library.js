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
