declare module "electron" {
  export const safeStorage: {
    isEncryptionAvailable(): boolean;
    encryptString(plain: string): Buffer;
    decryptString(enc: Buffer): string;
  };
}
