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
  await page.getByRole('button', { name: 'ログイン', exact: true }).click();
}

export async function logOut(page) {
  await page.getByRole('button', { name: 'ログアウト' }).click();
  await expect(page).toHaveURL(pageUrl('login'));
}

// パスキーのテスト用に、仮想の認証器（パスワード管理ツールの代わり）を用意する（Chrome DevTools Protocol）。
// 本人確認（顔・指紋の代わり）と、保存の確認の操作は、自動で済んだものとして扱われる。
export async function addVirtualAuthenticator(page) {
  const client = await page.context().newCDPSession(page);
  await client.send('WebAuthn.enable');
  const { authenticatorId } = await client.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      ctap2Version: 'ctap2_1',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
      defaultBackupEligibility: true,
      defaultBackupState: true,
    },
  });
  return {
    async credentials() {
      return (await client.send('WebAuthn.getCredentials', { authenticatorId })).credentials;
    },
  };
}

// Signal API の呼び出しを、実際には呼び出さずに記録する。
// 仮想の認証器からパスキーが消えないようにして、そのパスキーでの失敗の答え合わせも確かめるため。
const SIGNALS_KEY = 'test.signals';

export async function recordSignals(page) {
  await page.addInitScript((key) => {
    for (const name of ['signalUnknownCredential', 'signalAllAcceptedCredentials']) {
      Object.defineProperty(PublicKeyCredential, name, {
        configurable: true,
        value: (options) => {
          const list = JSON.parse(sessionStorage.getItem(key) || '[]');
          list.push({ name, options });
          sessionStorage.setItem(key, JSON.stringify(list));
          return Promise.resolve();
        },
      });
    }
  }, SIGNALS_KEY);
}

export async function recordedSignals(page) {
  return page.evaluate((key) => JSON.parse(sessionStorage.getItem(key) || '[]'), SIGNALS_KEY);
}

// 自動入力の候補にパスキーを出す呼び出し（conditional）を、使えないものとして扱う。
// 仮想の認証器では、この呼び出しが、ログインの画面を開いたとたんにパスキーを自動で選んでしまうため
// （実際には、練習する人が候補から選ぶまで待つ）。「パスキーでログイン」ボタンを確かめるテストで使う。
export async function disablePasskeyAutofill(page) {
  await page.addInitScript(() => {
    Object.defineProperty(PublicKeyCredential, 'isConditionalMediationAvailable', {
      configurable: true,
      value: () => Promise.resolve(false),
    });
  });
}

// マイページで、パスキーを作成する
export async function createPasskey(page) {
  await page.getByRole('button', { name: 'パスキーを作成する' }).click();
  await expect(page.locator('#passkey-message')).toHaveText('パスキーを作成しました。');
}

// ログインの画面で、「パスキーでログイン」を押す
export async function logInWithPasskey(page) {
  await page.goto('/login.html');
  await page.getByRole('button', { name: 'パスキーでログイン' }).click();
}
