import "./helpers.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

test("tests run in a fixed UTC-3 zone", () => {
  assert.equal(new Date(2026, 9, 12).getTimezoneOffset(), 180);
});
