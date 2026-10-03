import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { dec, dubaiDate, dubaiTime, int, one, pct, plural, usd } from "./format.ts";

/** ru-RU groups digits with a no-break space; compare with plain spaces. */
const plain = (s: string) => s.replace(/\s/g, " ");

describe("number formatters", () => {
  test("format numbers the Russian way", () => {
    assert.equal(plain(int(12345)), "12 345");
    assert.equal(plain(usd(1234.5)), "$1 234,50");
    assert.equal(dec(2.5), "2,50");
    assert.equal(one(7.24), "7,2");
    assert.equal(pct(12.5), "12,5%");
    assert.equal(pct(25.04), "25%");
  });

  test("show a dash for a missing value, but not for zero", () => {
    for (const fmt of [int, usd, pct, dec, one]) {
      assert.equal(fmt(null), "—");
      assert.equal(fmt(undefined), "—");
    }
    assert.equal(int(0), "0");
    assert.equal(usd(0), "$0,00");
  });
});

describe("dubaiDate / dubaiTime", () => {
  test("read Meta's +0000 offset and show the Dubai calendar day", () => {
    // 21:30 UTC on the 27th is already 01:30 on the 28th in Dubai.
    assert.equal(dubaiDate("2026-09-27T21:30:00+0000"), "28 сентября");
    const withTime = dubaiDate("2026-09-27T21:30:00+0000", true);
    assert.match(withTime, /28 сентября/);
    assert.match(withTime, /01:30/);
  });

  test("show a dash when there is no date", () => {
    assert.equal(dubaiDate(null), "—");
    assert.equal(dubaiDate(""), "—");
  });

  test("dubaiTime converts to Dubai hours", () => {
    assert.equal(dubaiTime("2026-09-27T21:30:00Z"), "01:30");
  });
});

describe("plural", () => {
  const word = (n: number) => plural(n, "показ", "показа", "показов");

  test("1, 21, 101 take the singular form", () => {
    for (const n of [1, 21, 101]) assert.equal(word(n), "показ");
  });

  test("2–4, 22–24 take the 'few' form", () => {
    for (const n of [2, 3, 4, 22, 24]) assert.equal(word(n), "показа");
  });

  test("0, 5–20, 11–14, 111 take the 'many' form", () => {
    for (const n of [0, 5, 11, 12, 14, 19, 20, 25, 111, 112]) assert.equal(word(n), "показов");
  });
});
