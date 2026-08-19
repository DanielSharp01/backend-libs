import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "@danielsharp/zod",
    include: ["test/**/*.test.ts"],
  },
});
