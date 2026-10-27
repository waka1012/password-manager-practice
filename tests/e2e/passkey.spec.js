// パスキーのテスト（構成案の P1〜P4）
// 仮想の認証器を、パスワード管理ツールの代わりに使う。管理ツールの画面（保存の確認、候補の出方）は、実機で確かめる。

import {
  test, expect, pageUrl, signUp, logOut, addVirtualAuthenticator, recordSignals, recordedSignals,
  disablePasskeyAutofill, createPasskey, logInWithPasskey,
} from './fixtures.js';

const passkeyNotice = (page) => page.locator('#passkey-notice');
const notice = (page) => page.locator('#notice');

// 仮想の認証器の値（base64）を、練習サイトが使う base64url にそろえる
const base64url = (text) => text.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

test.describe('「パスキーでログイン」ボタン', () => {
  test.beforeEach(async ({ page }) => {
    await recordSignals(page);
    await disablePasskeyAutofill(page);
  });

  test('P1・P2: パスキーを作成して、パスキーでログインする', async ({ page }) => {
    const authenticator = await addVirtualAuthenticator(page);
    await signUp(page, 'renshu-01');
    await expect(page.locator('#passkey-empty')).toBeVisible();

    await createPasskey(page);
    await expect(passkeyNotice(page)).toContainText('パスワード管理ツールに、パスキーが保存されたかを確かめましょう。');
    await expect(page.locator('#passkey-list li')).toHaveCount(1);
    await expect(page.locator('#passkey-list')).toContainText('まだ使っていません');
    await expect(page.locator('#passkey-list')).toContainText('ほかの端末と同期されるパスキーです');
    // 管理ツール（の代わり）には、ユーザー名を付けて保存される
    const [credential] = await authenticator.credentials();
    expect(credential.userName).toBe('renshu-01');
    expect(credential.rpId).toBe('localhost');

    await logOut(page);
    await logInWithPasskey(page);
    await expect(page).toHaveURL(pageUrl('mypage'));
    await expect(page.locator('#message')).toHaveText('ログインしました。');
    await expect(notice(page)).toContainText('パスキーでログインできました。');
    await expect(notice(page)).toContainText('本人確認（顔・指紋・画面ロック）: あり');
    await expect(page.locator('#guide-passkey')).toBeVisible();
    await expect(page.locator('#passkey-list')).not.toContainText('まだ使っていません');
  });

  test('同じ管理ツールに、同じアカウントのパスキーを重ねて作らない', async ({ page }) => {
    const authenticator = await addVirtualAuthenticator(page);
    await signUp(page, 'renshu-01');
    await createPasskey(page);

    await page.getByRole('button', { name: 'パスキーを作成する' }).click();
    await expect(page.locator('#passkey-message')).toHaveText('このアカウントのパスキーは、この管理ツールにすでにあります。');
    await expect(page.locator('#passkey-list li')).toHaveCount(1);
    expect(await authenticator.credentials()).toHaveLength(1);
  });

  test('P3: アカウントごとのパスキーで、それぞれのアカウントにログインする', async ({ page }) => {
    await addVirtualAuthenticator(page);
    await signUp(page, 'renshu-01');
    await createPasskey(page);
    await logOut(page);
    await signUp(page, 'renshu-02');
    await createPasskey(page);
    await logOut(page);

    // 仮想の認証器では、どちらかのパスキーが選ばれる（実際には、管理ツールの画面で選ぶ）
    await logInWithPasskey(page);
    await expect(page).toHaveURL(pageUrl('mypage'));
    await expect(page.locator('#guide-passkey-multi')).toBeVisible();
    await expect(notice(page)).toContainText(/ログインしたアカウント: 「renshu-0[12]」（この端末の練習用アカウントは2つ）/);
  });

  test('P4: 削除したパスキーではログインできず、管理ツールに知らせる', async ({ page }) => {
    const authenticator = await addVirtualAuthenticator(page);
    await signUp(page, 'renshu-01');
    await createPasskey(page);
    const [credential] = await authenticator.credentials();

    // 削除は確認の手順を1つ挟む
    const list = page.locator('#passkey-list');
    await list.getByRole('button', { name: 'このパスキーを削除する' }).click();
    await list.getByRole('button', { name: 'やめる' }).click();
    await expect(list.locator('li')).toHaveCount(1);
    await list.getByRole('button', { name: 'このパスキーを削除する' }).click();
    await list.getByRole('button', { name: '削除する', exact: true }).click();
    await expect(page.locator('#passkey-message')).toHaveText('パスキーを削除しました。');
    await expect(page.locator('#passkey-empty')).toBeVisible();
    await expect(passkeyNotice(page)).toContainText('パスキーを削除したことを知らせました');

    // 管理ツールには、このアカウントで使えるパスキーの一覧（空）を知らせる
    const [accepted] = await recordedSignals(page);
    expect(accepted.name).toBe('signalAllAcceptedCredentials');
    expect(accepted.options.rpId).toBe('localhost');
    expect(accepted.options.userId).toBe(base64url(credential.userHandle));
    expect(accepted.options.allAcceptedCredentialIds).toEqual([]);

    // 管理ツール（の代わり）には残っているので、そのパスキーでログインしようとして失敗する
    await logOut(page);
    await logInWithPasskey(page);
    await expect(page).toHaveURL(pageUrl('login'));
    await expect(page.locator('#message')).toHaveText('パスキーでログインできませんでした。');
    await expect(notice(page)).toContainText('選んだのは、練習用アカウント「renshu-01」のパスキーですが、この練習サイトには登録されていません。');
    await expect(notice(page)).toContainText('「このパスキーはもう使えない」と知らせました');

    const signals = await recordedSignals(page);
    expect(signals.at(-1).name).toBe('signalUnknownCredential');
    expect(signals.at(-1).options.credentialId).toBe(base64url(credential.credentialId));
  });

  test('アカウントを削除すると、パスキーの記録も消し、管理ツールに知らせる', async ({ page }) => {
    await addVirtualAuthenticator(page);
    await signUp(page, 'renshu-01');
    await createPasskey(page);

    await page.getByRole('button', { name: 'アカウントを削除する' }).click();
    await page.locator('#delete-do').click();
    await expect(page).toHaveURL(pageUrl(''));
    await expect(page.locator('#message')).toContainText('パスキーは、管理ツールによっては、自動で消えたり隠れたりします。');
    const signals = await recordedSignals(page);
    expect(signals.map((signal) => signal.name)).toEqual(['signalAllAcceptedCredentials']);
    expect(signals[0].options.allAcceptedCredentialIds).toEqual([]);

    await logInWithPasskey(page);
    await expect(notice(page)).toContainText('選んだパスキーは、この練習サイトには登録されていません。');
  });

  test('全部リセットのときも、パスキーを作ったアカウントについて管理ツールに知らせる', async ({ page }) => {
    await addVirtualAuthenticator(page);
    await signUp(page, 'renshu-01');
    await createPasskey(page);
    await logOut(page);
    // パスキーを作っていないアカウントは、知らせる対象にならない
    await signUp(page, 'renshu-02');

    await page.goto('/');
    await expect(page.locator('#data-summary')).toContainText('renshu-01（パスキー: 1件）');
    await page.getByRole('button', { name: '全部リセットする' }).click();
    await page.getByRole('button', { name: 'すべて消す' }).click();
    await expect(page.locator('#reset-result')).toContainText('練習データをすべて消しました。');

    const signals = await recordedSignals(page);
    expect(signals).toHaveLength(1);
    expect(signals[0].options.allAcceptedCredentialIds).toEqual([]);

    await logInWithPasskey(page);
    await expect(notice(page)).toContainText('選んだパスキーは、この練習サイトには登録されていません。');
  });

  test('パスキーを選ぶ画面を閉じたときは、そのことを伝える', async ({ page }) => {
    await signUp(page, 'renshu-01');
    await logOut(page);
    // 閉じたときと同じ失敗（NotAllowedError）を返すようにする
    await page.evaluate(() => {
      navigator.credentials.get = () => Promise.reject(new DOMException('closed', 'NotAllowedError'));
    });
    await page.getByRole('button', { name: 'パスキーでログイン' }).click();
    await expect(page.locator('#message')).toHaveText('パスキーでのログインを、やめました。');
    await expect(notice(page)).toContainText('パスキーを選ぶ画面が閉じられたか、時間切れになりました。');
  });

  test('パスキーを使えないブラウザでは、ボタンを出さない', async ({ page }) => {
    await page.addInitScript(() => {
      delete window.PublicKeyCredential;
    });
    await page.goto('/login.html');
    await expect(page.getByRole('button', { name: 'パスキーでログイン' })).toBeHidden();
    await expect(page.locator('#guide-passkey')).toBeHidden();

    await signUp(page, 'renshu-01');
    await expect(page.getByRole('button', { name: 'パスキーを作成する' })).toBeDisabled();
    await expect(passkeyNotice(page)).toContainText('パスキーを使えません');
  });
});

test.describe('自動入力の候補から選ぶ', () => {
  test.beforeEach(async ({ page }) => {
    await recordSignals(page);
  });

  test('ログインの画面を開くと、自動入力用の呼び出しで、パスキーでログインできる', async ({ page }) => {
    await addVirtualAuthenticator(page);
    await signUp(page, 'renshu-01');
    await createPasskey(page);
    // 仮想の認証器では、ログインの画面を開いたとたんに、候補のパスキーが自動で選ばれる
    await page.getByRole('button', { name: 'ログアウト' }).click();
    await expect(page).toHaveURL(pageUrl('mypage'));
    await expect(notice(page)).toContainText('パスキーでログインできました。');
  });
});
