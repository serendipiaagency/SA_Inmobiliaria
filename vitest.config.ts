import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Playwright owns tests/e2e/**/*.spec.ts — keep it out of Vitest's default
    // *.spec.ts glob so `npm test` doesn't try to run it as a unit test.
    include: ['test/unit/**/*.test.ts'],
  },
})
