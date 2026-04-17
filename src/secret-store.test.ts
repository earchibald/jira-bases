import { describe, it, expect } from "vitest";
import { createSecretStore } from "./secret-store";

function makeFakeSafeStorage(available = true) {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (s: string) => Buffer.from(`enc:${s}`),
    decryptString: (b: Buffer) => b.toString("utf8").replace(/^enc:/, ""),
  };
}

function makeStore(initial: Record<string, string> = {}, available = true) {
  const state = { tokens: { ...initial } };
  const deps = {
    safeStorage: makeFakeSafeStorage(available),
    load: async () => ({ ...state.tokens }),
    save: async (t: Record<string, string>) => {
      state.tokens = { ...t };
    },
  };
  return { store: createSecretStore(deps), state };
}

describe("SecretStore", () => {
  it("set encrypts and stores base64 under the baseUrl key", async () => {
    const { store, state } = makeStore();
    await store.set("https://jira.me.com", "tok-abc");
    expect(state.tokens["https://jira.me.com"]).toBe(
      Buffer.from("enc:tok-abc").toString("base64"),
    );
  });

  it("get returns decrypted token when present", async () => {
    const { store } = makeStore({
      "https://jira.me.com": Buffer.from("enc:tok-abc").toString("base64"),
    });
    expect(await store.get("https://jira.me.com")).toBe("tok-abc");
  });

  it("get returns null when absent", async () => {
    const { store } = makeStore();
    expect(await store.get("https://jira.me.com")).toBeNull();
  });

  it("delete removes the entry, leaving other entries alone", async () => {
    const { store, state } = makeStore({
      a: Buffer.from("enc:x").toString("base64"),
      b: Buffer.from("enc:y").toString("base64"),
    });
    await store.delete("a");
    expect(state.tokens).toEqual({ b: Buffer.from("enc:y").toString("base64") });
  });

  it("set throws when encryption is unavailable", async () => {
    const { store } = makeStore({}, false);
    await expect(store.set("u", "t")).rejects.toThrow(/encryption unavailable/i);
  });
});
