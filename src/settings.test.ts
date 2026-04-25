import { describe, it, expect } from "vitest";
import { JiraBasesSettingTab } from "./settings";

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
