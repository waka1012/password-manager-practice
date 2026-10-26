// ログイン後の画面（マイページ）: 答え合わせの表示、ログアウト、パスワードの変更へのリンク、アカウント削除
// ログインしていないときは、実際のサイトと同じくログインの画面へ移動する。

import { getSession, clearSession, listAccounts, findAccount, setFlash } from './store.js';
import { deleteAccount, suggestUsername, ACCOUNT_LIMIT } from './auth.js';
import { methodLabel } from './input-check.js';
import { h, showMessage, showNotice, formatNames } from './ui.js';

const session = getSession();
const account = session ? findAccount(session.username) : null;

if (!session || !account) {
  clearSession();
  location.replace('login.html');
} else {
  render();
}

function formatDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '不明';
  return date.toLocaleString('ja-JP', { dateStyle: 'medium', timeStyle: 'short' });
}

function loginCheckNotice(inputMethod, accountCount) {
  const blocks = [
    h('p', { class: 'small' }, '答え合わせ'),
    h('p', { class: 'lead' }, '登録したときと同じパスワードで、ログインできました。'),
  ];
  if (accountCount > 1) {
    blocks.push(h('p', {}, `ログインしたアカウント: 「${account.username}」（この端末の練習用アカウントは${accountCount}つ）`));
  }
  if (!inputMethod) return blocks;
  blocks.push(h('p', {}, `入力のしかた（目安）: ${methodLabel(inputMethod.method)}`));
  if (inputMethod.method === 'typed') {
    blocks.push(h('p', {}, '手入力でもログインできますが、この練習では、パスワード管理ツールの自動入力でログインしてみましょう。'));
  }
  blocks.push(h('details', {},
    h('summary', {}, '判定の材料'),
    h('ul', {},
      h('li', {}, `自動入力の印: ${inputMethod.autofillMark ? 'あり' : 'なし'}`),
      h('li', {}, `キーボードでの入力: ${Number(inputMethod.typed) || 0}回`),
      h('li', {}, `まとめての入力: ${Number(inputMethod.bulk) || 0}回`),
      h('li', {}, `貼り付け: ${Number(inputMethod.pasted) || 0}回`))));
  return blocks;
}

function fillText(selector, value) {
  document.querySelectorAll(selector).forEach((element) => { element.textContent = value; });
}

function render() {
  document.getElementById('content').hidden = false;
  document.getElementById('user-name').textContent = account.username;
  document.getElementById('info-username').textContent = account.username;
  document.getElementById('info-created').textContent = formatDate(account.createdAt);
  if (account.passwordChangedAt) {
    document.getElementById('info-changed').textContent = formatDate(account.passwordChangedAt);
    document.getElementById('info-changed-label').hidden = false;
    document.getElementById('info-changed').hidden = false;
  }

  const usernames = listAccounts().map((item) => item.username);
  fillText('.js-username', account.username);
  fillText('.js-account-names', formatNames(usernames));
  fillText('.js-next-name', suggestUsername());
  document.getElementById('next-add-account').hidden = usernames.length >= ACCOUNT_LIMIT;

  const message = document.getElementById('message');
  if (session.via === 'signup') {
    showMessage(message, '会員登録が完了しました。', 'info');
    document.getElementById('site-host').textContent = location.hostname;
    document.getElementById('guide-signup-multi').hidden = usernames.length < 2;
    document.getElementById('guide-signup').hidden = false;
  } else if (session.via === 'password-change') {
    showMessage(message, 'パスワードを変更しました。', 'info');
    document.getElementById('guide-password').hidden = false;
  } else {
    showMessage(message, 'ログインしました。', 'info');
    showNotice(document.getElementById('notice'), ...loginCheckNotice(session.inputMethod, usernames.length));
    document.getElementById('guide-login-multi').hidden = usernames.length < 2;
    document.getElementById('guide-login').hidden = false;
  }

  document.getElementById('logout').addEventListener('click', () => {
    clearSession();
    setFlash('logged-out');
    location.assign('login.html');
  });

  // アカウント削除（確認の手順を1つ挟む）
  const deleteOpen = document.getElementById('delete-open');
  const deleteConfirm = document.getElementById('delete-confirm');

  deleteOpen.addEventListener('click', () => {
    deleteOpen.hidden = true;
    deleteConfirm.hidden = false;
    document.getElementById('delete-do').focus();
  });

  document.getElementById('delete-cancel').addEventListener('click', () => {
    deleteConfirm.hidden = true;
    deleteOpen.hidden = false;
    deleteOpen.focus();
  });

  document.getElementById('delete-do').addEventListener('click', () => {
    try {
      deleteAccount(account.username);
    } catch {
      showMessage(document.getElementById('delete-error'), 'アカウントを削除できませんでした。');
      return;
    }
    clearSession();
    setFlash('deleted');
    location.assign('./');
  });
}
