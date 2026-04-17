export interface SecretStore {
  get(baseUrl: string): Promise<string | null>;
  set(baseUrl: string, token: string): Promise<void>;
  delete(baseUrl: string): Promise<void>;
}

export interface SecretStoreDeps {
  safeStorage: {
    isEncryptionAvailable(): boolean;
    encryptString(plain: string): Buffer;
    decryptString(enc: Buffer): string;
  };
  load: () => Promise<Record<string, string>>;
  save: (tokens: Record<string, string>) => Promise<void>;
}

export function createSecretStore(deps: SecretStoreDeps): SecretStore {
  return {
    async get(baseUrl) {
      const tokens = await deps.load();
      const b64 = tokens[baseUrl];
      if (!b64) return null;
      const buf = Buffer.from(b64, "base64");
      return deps.safeStorage.decryptString(buf);
    },
    async set(baseUrl, token) {
      if (!deps.safeStorage.isEncryptionAvailable()) {
        throw new Error("OS encryption unavailable; cannot store token.");
      }
      const enc = deps.safeStorage.encryptString(token);
      const b64 = enc.toString("base64");
      const tokens = await deps.load();
      await deps.save({ ...tokens, [baseUrl]: b64 });
    },
    async delete(baseUrl) {
      const tokens = await deps.load();
      const copy = { ...tokens };
      delete copy[baseUrl];
      await deps.save(copy);
    },
  };
}
