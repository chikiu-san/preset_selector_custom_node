import { test } from "node:test";
import assert from "node:assert/strict";
import { loadLibrary, saveLibrary, upsertEntry, upsertMany, LIB } from "../web/library_io.js";

// Fake ComfyUI userdata api backed by a Map, faithfully honoring options.stringify
// EXACTLY like ComfyUI: the body is JSON.stringify(data) only when stringify is
// truthy, else the raw value (which, for an object, coerces to "[object Object]").
function makeApi() {
  const store = new Map();
  return {
    store,
    async getUserData(file) {
      if (!store.has(file)) return new Response(null, { status: 404 });
      return new Response(store.get(file), { status: 200 });
    },
    async storeUserData(file, data, options = {}) {
      const body = options.stringify ? JSON.stringify(data) : String(data);
      store.set(file, body);
      return new Response(null, { status: 200 });
    },
  };
}

test("saveLibrary serializes as JSON so it round-trips (guards the stringify bug)", async () => {
  const api = makeApi();
  const doc = { version: 1, entries: [{ high_lora: "h", low_lora: "l", positive: "p" }] };
  assert.equal(await saveLibrary(api, doc), true);
  assert.notEqual(api.store.get(LIB), "[object Object]"); // the omitted-stringify bug would store this
  assert.deepEqual(await loadLibrary(api), doc);
});

test("upsertEntry adds then updates by (high_lora, low_lora) pair, persisted", async () => {
  const api = makeApi();
  await upsertEntry(api, { high_lora: "h", low_lora: "l", positive: "one" });
  await upsertEntry(api, { high_lora: "h", low_lora: "l", positive: "two" });
  const loaded = await loadLibrary(api);
  assert.equal(loaded.entries.length, 1);
  assert.equal(loaded.entries[0].positive, "two");
});

test("upsertEntry aborts (does not wipe) when the existing library can't be read", async () => {
  const api = makeApi();
  await upsertEntry(api, { high_lora: "h", low_lora: "l", positive: "keep" });
  api.getUserData = async () => new Response(null, { status: 503 }); // transient server error
  const res = await upsertEntry(api, { high_lora: "h2", low_lora: "l2", positive: "new" });
  assert.equal(res.aborted, true);
  assert.equal(res.ok, false);
  const doc = JSON.parse(api.store.get(LIB)); // original entry must remain intact
  assert.equal(doc.entries.length, 1);
  assert.equal(doc.entries[0].positive, "keep");
});

test("loadLibrary returns empty on 404", async () => {
  const api = makeApi();
  assert.deepEqual(await loadLibrary(api), { version: 1, entries: [] });
});

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
