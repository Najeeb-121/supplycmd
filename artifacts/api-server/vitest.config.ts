import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/__tests__/**/*.test.ts", "src/routes/__tests__/**/*.test.ts", "src/simulation/**/*.test.ts"],
    // Suppress pino HTTP logs during tests
    silent: false,
  },
});
