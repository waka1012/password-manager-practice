// ブラウザでのテスト（Playwright）の設定
// wrangler で public を本番に近い形（_headers の設定も反映）で配信し、ヘッドレスの Chromium で開く。
// 手元で試すときの 8788 番とぶつからないように、8789 番を使う。

import { defineConfig, devices } from '@playwright/test';

const PORT = 8789;

export default defineConfig({
  testDir: './e2e',
  // ハッシュ化に時間がかかるので、余裕を持たせる
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'ja-JP',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'スマホ',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'パソコン',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    command: `npx wrangler pages dev ../public --port ${PORT} --ip 127.0.0.1`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
