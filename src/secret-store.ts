import keytar from "keytar";

export const SERVICE_NAME = "obsidian-jira-bases";

export interface SecretStore {
  get(baseUrl: string): Promise<string | null>;
  set(baseUrl: string, token: string): Promise<void>;
  delete(baseUrl: string): Promise<void>;
}

export function createSecretStore(): SecretStore {
  return {
    async get(baseUrl) {
      return keytar.getPassword(SERVICE_NAME, baseUrl);
    },
    async set(baseUrl, token) {
      await keytar.setPassword(SERVICE_NAME, baseUrl, token);
    },
    async delete(baseUrl) {
      await keytar.deletePassword(SERVICE_NAME, baseUrl);
    },
  };
}
