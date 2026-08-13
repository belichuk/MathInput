import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Node by default; files needing a DOM opt in with a `@vitest-environment jsdom` docblock.
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
