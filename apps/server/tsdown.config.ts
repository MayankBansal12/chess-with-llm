import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  deps: {
    alwaysBundle: [/@chess-with-llm\/.*/],
    neverBundle: ["bun:sqlite"],
  },
  entry: "./src/index.ts",
  format: "esm",
  outDir: "./dist",
});
