import { describe, it, expect } from "vitest";
import {
  JiraBasesSettingTab,
  formatMsAsSeconds,
  parseSecondsToMs,
  splitProjectPrefixes,
} from "./settings";

// Create a minimal mock to access the private validateUrl method
function makeSettingTab() {
  const mockApp = {} as any;
  const mockPlugin = {
    settings: {
      baseUrl: "",
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
  } as any;

  const tab = new JiraBasesSettingTab(mockApp, mockPlugin);
  // Access the private method via type assertion
  return (tab as any).validateUrl.bind(tab);
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
