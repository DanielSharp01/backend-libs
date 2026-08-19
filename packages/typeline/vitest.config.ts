import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "@danielsharp/typeline",
    include: ["test/**/*.test.ts"],
  },
});
