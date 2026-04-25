import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      obsidian: path.resolve(__dirname, "__mocks__/obsidian.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    environmentMatchGlobs: [
      ["src/**/issue-preview-view.test.ts", "jsdom"],
      ["src/**/base-generator-modal.test.ts", "jsdom"],
    ],
  },
});
