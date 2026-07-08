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
