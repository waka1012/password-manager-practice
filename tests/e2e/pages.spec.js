// 各画面の作りのテスト（管理ツールが読み取る属性、セキュリティ設定、スマホとパソコンの表示）

import { test, expect } from './fixtures.js';

const PAGES = ['/', '/signup.html', '/login.html'];

test('セキュリティ設定（_headers）が反映されている', async ({ page }) => {
  for (const path of [...PAGES, '/mypage.html', '/change-password.html']) {
    const response = await page.request.get(path);
    expect(response.status(), path).toBe(200);
    const headers = response.headers();
    expect(headers['content-security-policy'], path).toContain("default-src 'self'");
    expect(headers['content-security-policy'], path).toContain("connect-src 'none'");
    expect(headers['content-security-policy'], path).toContain("frame-ancestors 'none'");
    expect(headers['referrer-policy'], path).toBe('no-referrer');
    expect(headers['x-content-type-options'], path).toBe('nosniff');
    expect(headers['x-robots-tag'], path).toBe('noindex');
  }
});

test('パスワード管理ツールが読み取る autocomplete 属性', async ({ page }) => {
  await page.goto('/signup.html');
  await expect(page.locator('#username')).toHaveAttribute('autocomplete', 'username');
  await expect(page.locator('#password')).toHaveAttribute('autocomplete', 'new-password');
  await expect(page.locator('#password-confirm')).toHaveAttribute('autocomplete', 'new-password');

  await page.goto('/login.html');
  await expect(page.locator('#username')).toHaveAttribute('autocomplete', 'username');
  await expect(page.locator('#password')).toHaveAttribute('autocomplete', 'current-password');
});

test('どの画面でも、サイト名を表示する', async ({ page }) => {
  for (const path of PAGES) {
    await page.goto(path);
    await expect(page).toHaveTitle(/パスワード管理ツール練習サイト$/);
    await expect(page.locator('.site-name')).toHaveText('パスワード管理ツール練習サイト');
  }
});

test('入力欄が先に見え、お知らせと手順はスマホでは下、パソコンでは右に置く', async ({ page, isMobile }) => {
  await page.goto('/login.html');
  const form = await page.locator('#login-form').boundingBox();
  // お知らせと手順の列
  const practice = await page.locator('.practice').boundingBox();
  const viewport = page.viewportSize();

  // 開いてすぐに、入力欄がすべて画面の中に見える
  expect(form.y + form.height).toBeLessThanOrEqual(viewport.height);
  if (isMobile) {
    expect(practice.y).toBeGreaterThan(form.y + form.height);
  } else {
    expect(practice.x).toBeGreaterThan(form.x + form.width);
  }
});

test('「タップ」と「クリック」を、操作のしかたに合わせて言い分ける', async ({ page, isMobile }) => {
  await page.goto('/signup.html');
  const touch = page.locator('.on-touch').first();
  const mouse = page.locator('.on-mouse').first();
  if (isMobile) {
    await expect(touch).toBeVisible();
    await expect(mouse).toBeHidden();
  } else {
    await expect(touch).toBeHidden();
    await expect(mouse).toBeVisible();
  }
});

test('横にはみ出さない', async ({ page }) => {
  for (const path of PAGES) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});
