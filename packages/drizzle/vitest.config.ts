import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "@danielsharp/drizzle",
    include: ["test/**/*.test.ts"],
  },
});
