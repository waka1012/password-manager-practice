// ブラウザでのテストの共通部品
// - どのテストでも、コンソールのエラー（CSP の違反を含む）と、ページの例外が出ないことを確かめる
// - よく使う操作（会員登録、ログイン）をまとめる

import { test as base, expect } from '@playwright/test';

export const PASSWORD = 'practice-pass-1';
export const OTHER_PASSWORD = 'practice-pass-2';
export const NEW_PASSWORD = 'practice-pass-new';

export const test = base.extend({
  page: async ({ page }, use) => {
    const errors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`console: ${message.text()}`);
    });
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    await use(page);
    expect(errors, 'コンソールのエラーやページの例外が出ないこと').toEqual([]);
  },
});

export { expect };

// Cloudflare Pages（と wrangler）は、「signup.html」を「signup」へ転送する。どちらの形でも合うようにする。
// name を空にすると「はじめに」の画面（/）
export function pageUrl(name) {
  return name ? new RegExp(`/${name}(\\.html)?$`) : /\/(index(\.html)?)?$/;
}

export async function signUp(page, username, password = PASSWORD) {
  await page.goto('/signup.html');
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(password);
  await page.locator('#password-confirm').fill(password);
  await page.getByRole('button', { name: '登録する' }).click();
  await expect(page).toHaveURL(pageUrl('mypage'));
  await expect(page.locator('#message')).toHaveText('会員登録が完了しました。');
}

export async function logIn(page, username, password = PASSWORD) {
  await page.goto('/login.html');
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'ログイン' }).click();
}

export async function logOut(page) {
  await page.getByRole('button', { name: 'ログアウト' }).click();
  await expect(page).toHaveURL(pageUrl('login'));
}
