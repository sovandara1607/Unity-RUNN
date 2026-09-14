import assert from "node:assert/strict";
import { test } from "node:test";
import { formatDateValue, parseDateValue } from "../components/dateValue";

test("birth dates survive round trips in time zones on either side of UTC", () => {
  const originalTimezone = process.env.TZ;
  try {
    for (const timezone of [
      "Asia/Phnom_Penh",
      "Pacific/Kiritimati",
      "America/Los_Angeles",
    ]) {
      process.env.TZ = timezone;
      for (const value of [
        "2000-02-29",
        "1998-04-21",
        "2024-03-10",
        "1900-01-01",
      ]) {
        const date = parseDateValue(value);
        assert.ok(date);
        assert.equal(formatDateValue(date), value, `${timezone}: ${value}`);
      }
    }
  } finally {
    if (originalTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimezone;
  }
});

test("invalid calendar values are not silently rolled into another month", () => {
  for (const value of [
    "",
    "1998-02-29",
    "2000-02-30",
    "2020-13-01",
    "2020-00-01",
    "2020-01-00",
    "21/04/1998",
  ]) {
    assert.equal(parseDateValue(value), null, value);
  }
});
