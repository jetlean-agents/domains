import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/unit/**/*.test.ts"],
    environment: "node",
    poolOptions: {
      forks: { minForks: 1 },
    },
  },
});
