import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "@danielsharp/http-auth",
    include: ["test/**/*.test.ts"],
  },
});
