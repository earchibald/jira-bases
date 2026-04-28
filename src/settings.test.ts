import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  JiraBasesSettingTab,
  URL_VALIDATION_DEBOUNCE_MS,
  formatMsAsSeconds,
  parseSecondsToMs,
  splitProjectPrefixes,
} from "./settings";

interface MockPluginShape {
  settings: {
    baseUrl: string;
    encryptedTokens: Record<string, string>;
    linkTemplate: string;
    stubsFolder: string;
    projectPrefixes: string[];
    autoLookupEnabled: boolean;
    autoLookupIdleMs: number;
    autoLookupMode: "minimal";
    autoLookupTemplate: string;
  };
  saveSettings: () => Promise<void>;
  secrets: Record<string, never>;
}

function makeMockPlugin(initialBaseUrl = ""): MockPluginShape {
  return {
    settings: {
      baseUrl: initialBaseUrl,
      encryptedTokens: {},
      linkTemplate: "",
      stubsFolder: "",
      projectPrefixes: [],
      autoLookupEnabled: false,
      autoLookupIdleMs: 2000,
      autoLookupMode: "minimal" as const,
      autoLookupTemplate: "",
    },
    saveSettings: async () => {},
    secrets: {},
  };
}

// Create a minimal mock to access the private validateUrl method
function makeSettingTab() {
  const mockApp = {} as any;
  const tab = new JiraBasesSettingTab(mockApp, makeMockPlugin() as any);
  // Access the private method via type assertion
  return (tab as any).validateUrl.bind(tab);
}

interface FakeText {
  value: string;
  setValueCalls: string[];
  getValue(): string;
  setValue(v: string): void;
}

function makeFakeText(initial: string): FakeText {
  return {
    value: initial,
    setValueCalls: [],
    getValue() {
      return this.value;
    },
    setValue(v: string) {
      this.value = v;
      this.setValueCalls.push(v);
    },
  };
}

describe("URL Validation", () => {
  const validateUrl = makeSettingTab();

  it("rejects empty string", () => {
    const result = validateUrl("");
    expect(result.valid).toBe(false);
    expect(result.message).toBe("URL is required");
    expect(result.fixed).toBeUndefined();
  });

  it("rejects whitespace-only string", () => {
    const result = validateUrl("   ");
    expect(result.valid).toBe(false);
    expect(result.message).toBe("URL is required");
    expect(result.fixed).toBeUndefined();
  });

  it("auto-fixes URL missing protocol", () => {
    const result = validateUrl("jira.example.com");
    expect(result.valid).toBe(false);
    expect(result.message).toBe("⚠️ Missing protocol. Auto-fixed to use https://");
    expect(result.fixed).toBe("https://jira.example.com");
  });

  it("auto-fixes URL with leading slashes but no protocol", () => {
    const result = validateUrl("//jira.example.com");
    expect(result.valid).toBe(false);
    expect(result.message).toBe("⚠️ Missing protocol. Auto-fixed to use https://");
    expect(result.fixed).toBe("https://jira.example.com");
  });

  it("auto-fixes URL with single trailing slash", () => {
    const result = validateUrl("https://jira.example.com/");
    expect(result.valid).toBe(false);
    expect(result.message).toBe("⚠️ Trailing slash detected. Auto-fixed.");
    expect(result.fixed).toBe("https://jira.example.com");
  });

  it("auto-fixes URL with multiple trailing slashes", () => {
    const result = validateUrl("https://jira.example.com///");
    expect(result.valid).toBe(false);
    expect(result.message).toBe("⚠️ Trailing slash detected. Auto-fixed.");
    expect(result.fixed).toBe("https://jira.example.com");
  });

  it("accepts valid https URL", () => {
    const result = validateUrl("https://jira.example.com");
    expect(result.valid).toBe(true);
    expect(result.message).toBe("✓ Valid URL");
    expect(result.fixed).toBeUndefined();
  });

  it("accepts valid http URL", () => {
    const result = validateUrl("http://jira.example.com");
    expect(result.valid).toBe(true);
    expect(result.message).toBe("✓ Valid URL");
    expect(result.fixed).toBeUndefined();
  });

  it("accepts valid URL with port", () => {
    const result = validateUrl("https://jira.example.com:8080");
    expect(result.valid).toBe(true);
    expect(result.message).toBe("✓ Valid URL");
    expect(result.fixed).toBeUndefined();
  });

  it("accepts valid URL with path", () => {
    const result = validateUrl("https://jira.example.com/jira");
    expect(result.valid).toBe(true);
    expect(result.message).toBe("✓ Valid URL");
    expect(result.fixed).toBeUndefined();
  });

  it("accepts valid URL with subdomain", () => {
    const result = validateUrl("https://my.jira.example.com");
    expect(result.valid).toBe(true);
    expect(result.message).toBe("✓ Valid URL");
    expect(result.fixed).toBeUndefined();
  });

  it("rejects invalid URL format", () => {
    const result = validateUrl("https://not a valid url");
    expect(result.valid).toBe(false);
    expect(result.message).toBe("❌ Invalid URL format");
    expect(result.fixed).toBeUndefined();
  });

  it("rejects URL with invalid characters", () => {
    const result = validateUrl("https://jira example.com");
    expect(result.valid).toBe(false);
    expect(result.message).toBe("❌ Invalid URL format");
    expect(result.fixed).toBeUndefined();
  });

  it("trims whitespace from URL before validation", () => {
    const result = validateUrl("  https://jira.example.com  ");
    expect(result.valid).toBe(true);
    expect(result.message).toBe("✓ Valid URL");
    expect(result.fixed).toBeUndefined();
  });

  it("handles mixed case protocols", () => {
    const result = validateUrl("HTTPS://jira.example.com");
    expect(result.valid).toBe(true);
    expect(result.message).toBe("✓ Valid URL");
    expect(result.fixed).toBeUndefined();
  });

  it("accepts localhost URLs", () => {
    const result = validateUrl("http://localhost:8080");
    expect(result.valid).toBe(true);
    expect(result.message).toBe("✓ Valid URL");
    expect(result.fixed).toBeUndefined();
  });

  it("accepts IP address URLs", () => {
    const result = validateUrl("http://192.168.1.1:8080");
    expect(result.valid).toBe(true);
    expect(result.message).toBe("✓ Valid URL");
    expect(result.fixed).toBeUndefined();
  });

  // Partial-protocol guards (JB-15 follow-up).
  // Reproduces the user-reported case: typing "https://" then deleting one
  // slash leaves "https:/", which the old code would "auto-fix" to
  // "https://https:/" by naive prepend. The fix detects partial protocols
  // and waits for the user to finish.
  it.each([
    ["http"],
    ["https"],
    ["http:"],
    ["https:"],
    ["http:/"],
    ["https:/"],
    ["http://"],
    ["https://"],
    ["HTTPS:/"],
  ])("does not auto-prepend https:// to partial protocol %s", (input) => {
    const result = validateUrl(input);
    expect(result.valid).toBe(false);
    expect(result.fixed).toBeUndefined();
    expect(result.message).toBe("Continue typing — URL incomplete.");
  });

  it("does not auto-prepend https:// to a half-edited URL like 'https:/jira.com'", () => {
    const result = validateUrl("https:/jira.com");
    expect(result.valid).toBe(false);
    expect(result.fixed).toBeUndefined();
    expect(result.message).toBe(
      "⚠️ Incomplete URL. Finish typing the protocol (https://...).",
    );
  });

  it("does not strip the trailing slash off a bare 'https://'", () => {
    // The strip would otherwise produce "https:" — a partial protocol —
    // and the next debounced run would then try to prepend again.
    const result = validateUrl("https://");
    expect(result.fixed).toBeUndefined();
    expect(result.message).toBe("Continue typing — URL incomplete.");
  });
});

describe("formatMsAsSeconds", () => {
  it("renders whole seconds without decimals", () => {
    expect(formatMsAsSeconds(2000)).toBe("2");
    expect(formatMsAsSeconds(60000)).toBe("60");
    expect(formatMsAsSeconds(0)).toBe("0");
  });

  it("renders fractional seconds, trimming trailing zeros", () => {
    expect(formatMsAsSeconds(1500)).toBe("1.5");
    expect(formatMsAsSeconds(100)).toBe("0.1");
    expect(formatMsAsSeconds(2500)).toBe("2.5");
  });

  it("returns empty string for non-finite input", () => {
    expect(formatMsAsSeconds(Number.NaN)).toBe("");
    expect(formatMsAsSeconds(Number.POSITIVE_INFINITY)).toBe("");
  });
});

describe("parseSecondsToMs", () => {
  it("parses integer seconds", () => {
    expect(parseSecondsToMs("2")).toBe(2000);
    expect(parseSecondsToMs("60")).toBe(60000);
  });

  it("parses fractional seconds", () => {
    expect(parseSecondsToMs("1.5")).toBe(1500);
    expect(parseSecondsToMs("0.1")).toBe(100);
  });

  it("trims whitespace", () => {
    expect(parseSecondsToMs("  2  ")).toBe(2000);
  });

  it("returns null for invalid input", () => {
    expect(parseSecondsToMs("")).toBeNull();
    expect(parseSecondsToMs("   ")).toBeNull();
    expect(parseSecondsToMs("abc")).toBeNull();
    expect(parseSecondsToMs("-1")).toBeNull();
  });
});

describe("scheduleUrlValidation (JB-15 debounce)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not run validation synchronously during typing", async () => {
    const plugin = makeMockPlugin();
    const tab = new JiraBasesSettingTab({} as any, plugin as any);
    const text = makeFakeText("jira.example.com");

    (tab as any).scheduleUrlValidation(text);

    // Before debounce window elapses, no auto-fix should be applied.
    expect(text.setValueCalls).toEqual([]);
    expect(plugin.settings.baseUrl).toBe("");
  });

  it("applies the https:// auto-fix exactly once after the debounce window", async () => {
    const plugin = makeMockPlugin("jira.example.com");
    const tab = new JiraBasesSettingTab({} as any, plugin as any);
    const text = makeFakeText("jira.example.com");

    (tab as any).scheduleUrlValidation(text);
    await vi.advanceTimersByTimeAsync(URL_VALIDATION_DEBOUNCE_MS + 10);

    expect(text.setValueCalls).toEqual(["https://jira.example.com"]);
    expect(plugin.settings.baseUrl).toBe("https://jira.example.com");
  });

  it("coalesces rapid keystrokes — only the last value is validated", async () => {
    const plugin = makeMockPlugin();
    const tab = new JiraBasesSettingTab({} as any, plugin as any);
    const text = makeFakeText("");

    // Simulate the user typing "jira.example.com" one char at a time, each
    // call resetting the debounce timer.
    const target = "jira.example.com";
    for (let i = 1; i <= target.length; i++) {
      text.value = target.slice(0, i);
      (tab as any).scheduleUrlValidation(text);
      await vi.advanceTimersByTimeAsync(50);
    }

    // Mid-stream nothing has fired yet.
    expect(text.setValueCalls).toEqual([]);

    await vi.advanceTimersByTimeAsync(URL_VALIDATION_DEBOUNCE_MS + 10);

    expect(text.setValueCalls).toEqual(["https://jira.example.com"]);
  });

  it("never produces https://https:// — re-firing the debounce on an already-fixed value is a no-op", async () => {
    // The JB-15 bug report calls out values like "https://https://jira.com"
    // showing up after rapid typing. With debounce + fix-only-when-different
    // semantics, a second validation pass on an already-fixed value must
    // not re-issue setValue.
    const plugin = makeMockPlugin("jira.example.com");
    const tab = new JiraBasesSettingTab({} as any, plugin as any);
    const text = makeFakeText("jira.example.com");

    (tab as any).scheduleUrlValidation(text);
    await vi.advanceTimersByTimeAsync(URL_VALIDATION_DEBOUNCE_MS + 10);
    expect(text.value).toBe("https://jira.example.com");

    // Second debounce on the now-fixed value: validator says valid, fix
    // is undefined, no setValue. Value stays clean (no nested prefix).
    (tab as any).scheduleUrlValidation(text);
    await vi.advanceTimersByTimeAsync(URL_VALIDATION_DEBOUNCE_MS + 10);

    expect(text.setValueCalls).toEqual(["https://jira.example.com"]);
    expect(text.value).toBe("https://jira.example.com");
    expect(text.value.match(/https:\/\//g)?.length).toBe(1);
  });

  it("hide() cancels a pending debounce timer", async () => {
    const plugin = makeMockPlugin();
    const tab = new JiraBasesSettingTab({} as any, plugin as any);
    const text = makeFakeText("jira.example.com");

    (tab as any).scheduleUrlValidation(text);
    tab.hide();

    await vi.advanceTimersByTimeAsync(URL_VALIDATION_DEBOUNCE_MS + 50);

    // The timer was cancelled, so no auto-fix was issued.
    expect(text.setValueCalls).toEqual([]);
  });
});

describe("splitProjectPrefixes", () => {
  it("accepts uppercase prefixes", () => {
    const r = splitProjectPrefixes("ABC, PROJ");
    expect(r.accepted).toEqual(["ABC", "PROJ"]);
    expect(r.rejected).toEqual([]);
  });

  it("uppercases lowercase entries", () => {
    const r = splitProjectPrefixes("abc, proj");
    expect(r.accepted).toEqual(["ABC", "PROJ"]);
    expect(r.rejected).toEqual([]);
  });

  it("rejects single-letter prefixes", () => {
    const r = splitProjectPrefixes("A, ABC");
    expect(r.accepted).toEqual(["ABC"]);
    expect(r.rejected).toEqual(["A"]);
  });

  it("rejects entries with punctuation", () => {
    const r = splitProjectPrefixes("AB-C, OK");
    expect(r.accepted).toEqual(["OK"]);
    expect(r.rejected).toEqual(["AB-C"]);
  });

  it("preserves the original casing of rejected entries for user display", () => {
    const r = splitProjectPrefixes("ab c");
    expect(r.accepted).toEqual([]);
    expect(r.rejected).toEqual(["ab c"]);
  });

  it("ignores empty entries", () => {
    const r = splitProjectPrefixes("ABC, , ,PROJ");
    expect(r.accepted).toEqual(["ABC", "PROJ"]);
    expect(r.rejected).toEqual([]);
  });

  it("returns empty arrays for empty input", () => {
    const r = splitProjectPrefixes("");
    expect(r.accepted).toEqual([]);
    expect(r.rejected).toEqual([]);
  });
});
