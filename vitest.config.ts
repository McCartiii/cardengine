import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Keep agent worktrees/state out of the test run — stale copies of the
    // repo under .claude/worktrees would otherwise run (and can break) CI.
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      ".claude/**",
      ".omc/**",
    ],
  },
});
