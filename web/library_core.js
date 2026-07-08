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
