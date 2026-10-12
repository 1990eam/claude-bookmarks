import { SESSION } from "./helpers.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Bookmark } from "../src/core/model.ts";
import {
  dayLabel, describeRange, inRange, msUntilNextMidnight, parseTimeRange, timeLabel,
} from "../src/core/range.ts";

const TODAY = new Date(2026, 9, 12, 15, 30);
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d);
const parse = (since: string, until?: string) => parseTimeRange(since, until, TODAY);

test("presets are calendar days including today", () => {
  assert.deepEqual(parse("today"), { since: day(2026, 10, 12), until: undefined });
  assert.deepEqual(parse("week"), { since: day(2026, 10, 6), until: undefined });
  assert.deepEqual(parse("month"), { since: day(2026, 9, 13), until: undefined });
  assert.deepEqual(parse("3d"), { since: day(2026, 10, 10), until: undefined });
});

test("yesterday is bounded on both sides", () => {
  assert.deepEqual(parse("yesterday"), { since: day(2026, 10, 11), until: day(2026, 10, 12) });
});

test("boundaries are local midnight", () => {
  assert.equal(parse("today").since?.getUTCHours(), 3);
});

test("dates and inclusive ranges", () => {
  assert.deepEqual(parse("2026-10-01"), { since: day(2026, 10, 1), until: undefined });
  assert.deepEqual(parse("2026-10-01", "2026-10-05"), { since: day(2026, 10, 1), until: day(2026, 10, 6) });
  assert.deepEqual(parse("2026-10-01..2026-10-05"), { since: day(2026, 10, 1), until: day(2026, 10, 6) });
});

test("all is unbounded", () => {
  assert.deepEqual(parse("all"), { until: undefined });
});

test("rejects bad input", () => {
  for (const [since, until] of [["lastweek"], ["0d"], ["2026-13-01"], ["2026-02-30"],
    ["2026-10-01..2026-10-05", "2026-10-09"], ["yesterday", "2026-10-09"], ["week", "oct 9"]] as const) {
    assert.throws(() => parse(since, until), RangeError, `${since} ${until}`);
  }
});

test("describeRange phrases each shape", () => {
  assert.equal(describeRange(parse("week")), "since 2026-10-06");
  assert.equal(describeRange(parse("yesterday")), "on 2026-10-11");
  assert.equal(describeRange(parse("2026-10-01..2026-10-05")), "from 2026-10-01 to 2026-10-05");
  assert.equal(describeRange(parse("all", "2026-10-05")), "until 2026-10-05");
  assert.equal(describeRange(parse("all")), "all time");
});

test("inRange filters on addedAt with an exclusive upper bound", () => {
  const since = day(2026, 10, 10), until = day(2026, 10, 12);
  const mark = (uuid: string, addedAt: number): Bookmark => ({ sessionId: SESSION, uuid, addedAt });
  const marks = [mark("before", since.getTime() - 1000), mark("start", since.getTime()),
    mark("inside", since.getTime() + 86_400_000), mark("end", until.getTime())];
  assert.deepEqual(inRange(marks, { since, until }).map((b) => b.uuid), ["start", "inside"]);
  assert.equal(inRange(marks, {}).length, 4);
});

test("labels are local and locale-independent", () => {
  assert.equal(dayLabel(day(2026, 10, 10).getTime()), "Sat 10 Oct 2026");
  assert.equal(timeLabel(new Date(2026, 9, 12, 9, 5).getTime()), "09:05");
  assert.equal(msUntilNextMidnight(new Date(2026, 9, 12, 23, 59)), 60_000);
});
