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
  if (high.value === "None" && low.value === "None") return; // empty pair -> no lookup
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
