import { describe, it, expect, vi } from "vitest";
import {
  findBareKeysInLine,
  findBareKeysInText,
  createIdleScheduler,
} from "./auto-lookup";

describe("findBareKeysInLine", () => {
  it("detects bare keys for configured prefixes", () => {
    const hits = findBareKeysInLine("see JB-2 and ABC-14", ["JB", "ABC"], -1);
    expect(hits.map((h) => h.key)).toEqual(["JB-2", "ABC-14"]);
  });

  it("ignores keys whose prefix is not configured", () => {
    expect(findBareKeysInLine("XYZ-1 and JB-2", ["JB"], -1).map((h) => h.key))
      .toEqual(["JB-2"]);
  });

  it("skips keys inside markdown links", () => {
    const line = "[JB-2](https://j.example.com/browse/JB-2) and JB-3";
    const hits = findBareKeysInLine(line, ["JB"], -1);
    expect(hits.map((h) => h.key)).toEqual(["JB-3"]);
  });

  it("skips keys inside wikilinks", () => {
    const hits = findBareKeysInLine("[[JB-2]] and JB-3", ["JB"], -1);
    expect(hits.map((h) => h.key)).toEqual(["JB-3"]);
  });

  it("skips a key overlapping the cursor", () => {
    // "JB-2" at col 0..4; cursor at col 3 (inside) → skipped
    const hits = findBareKeysInLine("JB-2 and JB-3", ["JB"], 3);
    expect(hits.map((h) => h.key)).toEqual(["JB-3"]);
  });

  it("skips a key when cursor sits just after it (still typing)", () => {
    const hits = findBareKeysInLine("JB-2 and JB-3", ["JB"], 4);
    expect(hits.map((h) => h.key)).toEqual(["JB-3"]);
  });

  it("returns no hits when no prefixes are configured", () => {
    expect(findBareKeysInLine("JB-2", [], -1)).toEqual([]);
  });
});

describe("findBareKeysInText", () => {
  it("scans multiple lines and carries line numbers", () => {
    const text = "first JB-1\nsecond JB-2\n[JB-3](x) JB-4";
    const hits = findBareKeysInText(text, ["JB"], -1, -1);
    expect(hits).toEqual([
      { key: "JB-1", lineStart: 0, start: 6, end: 10 },
      { key: "JB-2", lineStart: 1, start: 7, end: 11 },
      { key: "JB-4", lineStart: 2, start: 10, end: 14 },
    ]);
  });

  it("only skips cursor overlap on the cursor's line", () => {
    const text = "JB-1 here\nJB-2 here";
    const hits = findBareKeysInText(text, ["JB"], 0, 2);
    expect(hits.map((h) => `${h.key}@${h.lineStart}`)).toEqual(["JB-2@1"]);
  });
});

describe("createIdleScheduler", () => {
  function fakeTimers() {
    let now = 0;
    const pending = new Map<number, { at: number; fn: () => void }>();
    let id = 0;
    return {
      deps: {
        setTimeout: (fn: () => void, ms: number) => {
          const handle = ++id;
          pending.set(handle, { at: now + ms, fn });
          return handle as unknown as ReturnType<typeof setTimeout>;
        },
        clearTimeout: (t: ReturnType<typeof setTimeout>) => {
          pending.delete(t as unknown as number);
        },
      },
      advance(ms: number) {
        now += ms;
        for (const [k, v] of [...pending]) {
          if (v.at <= now) {
            pending.delete(k);
            v.fn();
          }
        }
      },
    };
  }

  it("fires flush once after the idle window elapses", () => {
    const flush = vi.fn();
    const ft = fakeTimers();
    const s = createIdleScheduler(100, flush, ft.deps);
    s.bump();
    ft.advance(99);
    expect(flush).not.toHaveBeenCalled();
    ft.advance(1);
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("resets the window on repeated bumps", () => {
    const flush = vi.fn();
    const ft = fakeTimers();
    const s = createIdleScheduler(100, flush, ft.deps);
    s.bump();
    ft.advance(80);
    s.bump();
    ft.advance(80);
    expect(flush).not.toHaveBeenCalled();
    ft.advance(20);
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("cancel prevents a pending flush", () => {
    const flush = vi.fn();
    const ft = fakeTimers();
    const s = createIdleScheduler(100, flush, ft.deps);
    s.bump();
    s.cancel();
    ft.advance(1000);
    expect(flush).not.toHaveBeenCalled();
  });
});
