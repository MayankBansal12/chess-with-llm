import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  deps: {
    alwaysBundle: [/@chess-with-llm\/.*/],
  },
  entry: "./src/index.ts",
  format: "esm",
  outDir: "./dist",
});
