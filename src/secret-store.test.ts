import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("keytar", () => ({
  default: {
    getPassword: vi.fn(),
    setPassword: vi.fn(),
    deletePassword: vi.fn(),
  },
}));

import keytar from "keytar";
import { createSecretStore, SERVICE_NAME } from "./secret-store";

describe("SecretStore", () => {
  beforeEach(() => {
    vi.mocked(keytar.getPassword).mockReset();
    vi.mocked(keytar.setPassword).mockReset();
    vi.mocked(keytar.deletePassword).mockReset();
  });

  it("get returns the token when keytar has one", async () => {
    vi.mocked(keytar.getPassword).mockResolvedValue("tok-abc");
    const store = createSecretStore();
    const result = await store.get("https://jira.me.com");
    expect(keytar.getPassword).toHaveBeenCalledWith(SERVICE_NAME, "https://jira.me.com");
    expect(result).toBe("tok-abc");
  });

  it("get returns null when keytar has nothing", async () => {
    vi.mocked(keytar.getPassword).mockResolvedValue(null);
    const store = createSecretStore();
    expect(await store.get("https://jira.me.com")).toBeNull();
  });

  it("set stores the token under the baseUrl account", async () => {
    vi.mocked(keytar.setPassword).mockResolvedValue(undefined);
    const store = createSecretStore();
    await store.set("https://jira.me.com", "tok-xyz");
    expect(keytar.setPassword).toHaveBeenCalledWith(SERVICE_NAME, "https://jira.me.com", "tok-xyz");
  });

  it("delete removes the token", async () => {
    vi.mocked(keytar.deletePassword).mockResolvedValue(true);
    const store = createSecretStore();
    await store.delete("https://jira.me.com");
    expect(keytar.deletePassword).toHaveBeenCalledWith(SERVICE_NAME, "https://jira.me.com");
  });
});
