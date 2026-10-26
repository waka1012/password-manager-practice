// 画面の流れのテスト
// パスワード管理ツールの動き（保存の提案、自動入力）は、この方法では確かめられない。実機で確かめる。

import {
  test, expect, pageUrl, signUp, logIn, logOut, PASSWORD, OTHER_PASSWORD, NEW_PASSWORD,
} from './fixtures.js';

const notice = (page) => page.locator('#notice');

test('会員登録 → ログアウト → ログイン → アカウント削除', async ({ page }) => {
  await signUp(page, 'renshu-01');
  await expect(page.locator('#user-name')).toHaveText('renshu-01');
  await expect(page.locator('#guide-signup')).toBeVisible();
  await expect(page.locator('#site-host')).toHaveText('localhost');

  await logOut(page);
  await expect(page.locator('#message')).toContainText('ログアウトしました。');

  await logIn(page, 'renshu-01');
  await expect(page).toHaveURL(pageUrl('mypage'));
  await expect(page.locator('#message')).toHaveText('ログインしました。');
  await expect(notice(page)).toContainText('登録したときと同じパスワードで、ログインできました。');

  // 削除は確認の手順を1つ挟む。「やめる」で戻れる
  await page.getByRole('button', { name: 'アカウントを削除する' }).click();
  await page.getByRole('button', { name: 'やめる' }).click();
  await expect(page.getByRole('button', { name: 'アカウントを削除する' })).toBeVisible();
  await page.getByRole('button', { name: 'アカウントを削除する' }).click();
  await page.getByRole('button', { name: '削除する', exact: true }).click();

  await expect(page).toHaveURL(pageUrl(''));
  await expect(page.locator('#message')).toContainText('アカウントを削除しました。');
  await expect(page.locator('#data-summary')).toContainText('練習用アカウントは、まだありません。');
  await expect(page.locator('#data-summary')).toContainText('以前のパスワードの記録: 1件');
});

test('会員登録: 入力の誤りを伝える', async ({ page }) => {
  await page.goto('/signup.html');
  const submit = page.getByRole('button', { name: '登録する' });
  const message = page.locator('#message');

  await submit.click();
  await expect(message).toHaveText('ユーザー名を入力してください。');

  await page.locator('#username').fill('れんしゅう');
  await submit.click();
  await expect(message).toContainText('半角の英字・数字と記号');

  await page.locator('#username').fill('renshu-01');
  await page.locator('#password').fill('short');
  await submit.click();
  await expect(message).toHaveText('パスワードは8文字以上にしてください。');

  await page.locator('#password').fill(PASSWORD);
  await page.locator('#password-confirm').fill(OTHER_PASSWORD);
  await submit.click();
  await expect(message).toHaveText('確認用のパスワードが一致しません。');
  await expect(page).toHaveURL(pageUrl('signup'));
});

test('会員登録: 同じユーザー名は登録できない', async ({ page }) => {
  await signUp(page, 'renshu-01');
  await page.goto('/signup.html');
  // 2つ目の登録では、まだ使っていない名前を例に出す
  await expect(page.locator('#guide-multi')).toBeVisible();
  await expect(page.locator('#example-name')).toHaveText('renshu-02');

  await page.locator('#username').fill('renshu-01');
  await page.locator('#password').fill(PASSWORD);
  await page.locator('#password-confirm').fill(PASSWORD);
  await page.getByRole('button', { name: '登録する' }).click();
  await expect(page.locator('#message')).toContainText('このユーザー名は、すでに登録されています。');
});

test('ログインの失敗: 実際のサイトと同じ表示と、答え合わせを分けて出す', async ({ page }) => {
  await logIn(page, 'renshu-01');
  await expect(page.locator('#message')).toHaveText('ユーザー名またはパスワードが正しくありません。');
  await expect(notice(page)).toContainText('練習用アカウントの記録がありません。');

  await signUp(page, 'renshu-01');
  await logOut(page);

  await page.locator('#username').fill('renshu-01');
  await page.locator('#password').pressSequentially('wrong-password');
  await page.getByRole('button', { name: 'ログイン' }).click();
  await expect(page.locator('#message')).toHaveText('ユーザー名またはパスワードが正しくありません。');
  await expect(notice(page)).toContainText('パスワードが、登録したときのものと違います。');
  await expect(notice(page)).toContainText('入力のしかた（目安）: 手入力');
  await expect(notice(page)).toContainText('「更新」は選ばないでください。');
  // 実際のサイトと同じく、パスワードの欄は空にする
  await expect(page.locator('#password')).toHaveValue('');

  await logIn(page, 'renshu-99');
  await expect(notice(page)).toContainText('このユーザー名は、この端末のこのブラウザには登録されていません。');
  await expect(notice(page)).toContainText('「renshu-01」');
});

test('複数のアカウント: 別のアカウントのパスワードが入力されたことを伝える', async ({ page }) => {
  await signUp(page, 'renshu-01', PASSWORD);
  await logOut(page);
  await signUp(page, 'renshu-02', OTHER_PASSWORD);
  await expect(page.locator('#guide-signup-multi')).toBeVisible();
  await expect(page.locator('#guide-signup-multi')).toContainText('「renshu-01」、「renshu-02」');
  await logOut(page);

  await logIn(page, 'renshu-01', OTHER_PASSWORD);
  await expect(page.locator('#message')).toHaveText('ユーザー名またはパスワードが正しくありません。');
  await expect(notice(page)).toContainText('入力されたパスワードは、別の練習用アカウント「renshu-02」のものです。');

  await logIn(page, 'renshu-02', OTHER_PASSWORD);
  await expect(page).toHaveURL(pageUrl('mypage'));
  await expect(page.locator('#guide-login-multi')).toBeVisible();
  await expect(notice(page)).toContainText('ログインしたアカウント: 「renshu-02」（この端末の練習用アカウントは2つ）');
});

test('パスワードの変更: 変更する前のパスワードでのログインを見分ける', async ({ page }) => {
  await signUp(page, 'renshu-01');
  await page.getByRole('link', { name: 'パスワードを変更する' }).click();
  await expect(page).toHaveURL(pageUrl('change-password'));
  // 管理ツールが、どのアカウントの項目を更新するか判断できるように、ユーザー名の欄がある
  await expect(page.locator('#username')).toHaveValue('renshu-01');

  const submit = page.getByRole('button', { name: '変更する' });
  await page.locator('#current-password').fill('wrong-password');
  await page.locator('#new-password').fill(NEW_PASSWORD);
  await page.locator('#new-password-confirm').fill(NEW_PASSWORD);
  await submit.click();
  await expect(page.locator('#message')).toHaveText('いまのパスワードが正しくありません。');
  await expect(page.locator('#current-password')).toHaveValue('');

  await page.locator('#current-password').fill(PASSWORD);
  await page.locator('#new-password').fill(PASSWORD);
  await page.locator('#new-password-confirm').fill(PASSWORD);
  await submit.click();
  await expect(page.locator('#message')).toContainText('いまのパスワードと同じです。');

  await page.locator('#new-password').fill(NEW_PASSWORD);
  await page.locator('#new-password-confirm').fill(NEW_PASSWORD);
  await submit.click();
  await expect(page).toHaveURL(pageUrl('mypage'));
  await expect(page.locator('#message')).toHaveText('パスワードを変更しました。');
  await expect(page.locator('#info-changed')).toBeVisible();

  await logOut(page);
  await logIn(page, 'renshu-01', PASSWORD);
  await expect(notice(page)).toContainText('入力されたのは、パスワードを変更する前のものです。');
  await logIn(page, 'renshu-01', NEW_PASSWORD);
  await expect(page).toHaveURL(pageUrl('mypage'));
});

test('全部リセット: 練習データをすべて消す', async ({ page }) => {
  await signUp(page, 'renshu-01');
  await page.goto('/');
  await expect(page.locator('#data-summary')).toContainText('練習用アカウント: 1件');

  await page.getByRole('button', { name: '全部リセットする' }).click();
  await page.getByRole('button', { name: 'すべて消す' }).click();
  await expect(page.locator('#reset-result')).toContainText('練習データをすべて消しました。');
  await expect(page.locator('#data-summary')).toContainText('練習用アカウントは、まだありません。');

  // ログイン状態も消えている
  await page.goto('/mypage.html');
  await expect(page).toHaveURL(pageUrl('login'));
});

test('ログインしていないときは、ログインの画面へ移動する', async ({ page }) => {
  for (const path of ['/mypage.html', '/change-password.html']) {
    await page.goto(path);
    await expect(page).toHaveURL(pageUrl('login'));
  }
});
