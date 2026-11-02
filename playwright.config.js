import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60000,
  use: { baseURL: 'http://127.0.0.1:5000', ...devices['iPhone 13'] },
  webServer: {
    command: 'firebase emulators:start --project demo-so-cong-dau --only firestore,auth,hosting',
    url: 'http://127.0.0.1:5000',
    reuseExistingServer: true,
    timeout: 120000,
  },
});
