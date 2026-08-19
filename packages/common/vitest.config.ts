import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "@danielsharp/common",
    include: ["test/**/*.test.ts"],
  },
});
