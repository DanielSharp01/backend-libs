import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "@danielsharp/auth",
    include: ["test/**/*.test.ts"],
  },
});
