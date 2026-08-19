import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "@danielsharp/redis",
    include: ["test/**/*.test.ts"],
  },
});
