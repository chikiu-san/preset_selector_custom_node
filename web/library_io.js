// Browser-free library persistence over ComfyUI's userdata API.
// `api` is injected (not imported) so this module is unit-testable without a browser.
import { upsert } from "./library_core.js";

export const LIB = "preset_selector_library.json";

// Returns {version, entries}. In `strict` mode, throws on an *uncertain* failure
// (network error or non-ok HTTP) so callers that overwrite the whole file don't
// clobber a library they could not actually read. A 404 (no file yet) and a
// corrupt/unparseable body both resolve to an empty library (safe to (re)create).
export async function loadLibrary(api, { strict = false } = {}) {
  let resp;
  try {
    resp = await api.getUserData(LIB);
  } catch (e) {
    if (strict) throw e;
    console.warn("[PresetLibrary] load error; using empty library", e);
    return { version: 1, entries: [] };
  }
  if (resp.status === 404) return { version: 1, entries: [] };
  if (!resp.ok) {
    if (strict) throw new Error(`load failed: HTTP ${resp.status}`);
    console.warn(`[PresetLibrary] load failed: HTTP ${resp.status}`);
    return { version: 1, entries: [] };
  }
  try {
    const data = await resp.json();
    if (!data || !Array.isArray(data.entries)) return { version: 1, entries: [] };
    return data;
  } catch (e) {
    console.warn("[PresetLibrary] parse error; treating as empty (will overwrite on save)", e);
    return { version: 1, entries: [] };
  }
}

// Persists doc as JSON. Explicit `stringify: true` is REQUIRED: ComfyUI's
// storeUserData only serializes when options.stringify is truthy, and default
// parameters do not merge when a partial options object is passed — omitting it
// writes the literal "[object Object]".
export async function saveLibrary(api, doc) {
  try {
    const resp = await api.storeUserData(LIB, doc, { overwrite: true, stringify: true, throwOnError: false });
    return !!(resp && resp.ok);
  } catch (e) {
    console.warn("[PresetLibrary] save error", e);
    return false;
  }
}

// Upserts `entry` (keyed by its (high_lora, low_lora) pair) into the library.
// Loads in strict mode so a failed read can't wipe existing presets.
// Returns {ok, aborted}.
export async function upsertEntry(api, entry) {
  let doc;
  try {
    doc = await loadLibrary(api, { strict: true });
  } catch (e) {
    console.warn("[PresetLibrary] save aborted — could not read existing library (not overwriting)", e);
    return { ok: false, aborted: true };
  }
  const ok = await saveLibrary(api, { version: 1, entries: upsert(doc.entries, entry) });
  return { ok, aborted: false };
}

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
