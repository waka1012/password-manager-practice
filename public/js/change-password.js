// パスワードの変更の画面
// 実際のサイトと同じく、いまのパスワードを確かめてから、新しいパスワードに変える。
// 管理ツールが、どのアカウントの項目を更新するかを判断できるように、ユーザー名の欄（読み取り専用）を置く。
// ログインしていないときは、ログインの画面へ移動する。

import { getSession, setSession, clearSession, findAccount, isStorageAvailable } from './store.js';
import { changePassword, isCryptoAvailable, PASSWORD_MIN, PASSWORD_MAX } from './auth.js';
import {
  h, showMessage, hideMessage, showNotice, hideNotice, setBusy,
  insecureContextNotice, storageUnavailableNotice,
} from './ui.js';

const session = getSession();
const account = session ? findAccount(session.username) : null;

if (!session || !account) {
  clearSession();
  location.replace('login.html');
} else {
  init();
}

function validate(current, next, confirmation) {
  if (!current) return 'いまのパスワードを入力してください。';
  if (!next) return '新しいパスワードを入力してください。';
  if (next.length < PASSWORD_MIN) return `新しいパスワードは${PASSWORD_MIN}文字以上にしてください。`;
  if (next.length > PASSWORD_MAX) return `新しいパスワードは${PASSWORD_MAX}文字以内にしてください。`;
  if (next === current) return '新しいパスワードが、いまのパスワードと同じです。別のパスワードにしてください。';
  if (next !== confirmation) return '確認用のパスワードが一致しません。';
  return null;
}

// いまのパスワードが違ったときの答え合わせ
function explainMismatch(result) {
  const self = `「${account.username}」`;
  if (result.otherUsername) {
    return [
      h('p', { class: 'lead' }, `入力されたのは、別の練習用アカウント「${result.otherUsername}」のパスワードです。`),
      h('p', {}, `パスワード管理ツールの候補から、ユーザー名が${self}の項目を選び直しましょう。`),
    ];
  }
  if (result.status === 'old-password') {
    return [
      h('p', { class: 'lead' }, result.reason === 'changed'
        ? '入力されたのは、パスワードを変更する前のものです。'
        : '入力されたのは、以前のパスワード（削除する前のアカウントのもの）です。'),
      h('p', {}, `パスワード管理ツールの${self}の項目が、古いままになっている可能性があります。`),
    ];
  }
  return [
    h('p', { class: 'lead' }, 'いまのパスワードと違います。'),
    h('p', {}, `パスワード管理ツールの候補から、ユーザー名が${self}の項目を選んだかを確かめましょう。`),
  ];
}

function init() {
  document.getElementById('content').hidden = false;

  const form = document.getElementById('change-password-form');
  const currentInput = document.getElementById('current-password');
  const newInput = document.getElementById('new-password');
  const confirmInput = document.getElementById('new-password-confirm');
  const submitButton = form.querySelector('button[type="submit"]');
  const message = document.getElementById('message');
  const notice = document.getElementById('notice');

  document.getElementById('username').value = account.username;
  document.querySelectorAll('.js-username').forEach((element) => { element.textContent = account.username; });

  if (!isCryptoAvailable()) {
    showNotice(notice, ...insecureContextNotice());
    submitButton.disabled = true;
  } else if (!isStorageAvailable()) {
    showNotice(notice, ...storageUnavailableNotice());
    submitButton.disabled = true;
  }

  // スマホでは送信ボタンの近くを見ているので、エラーが画面の外に出ないようにする
  function fail(lines) {
    showMessage(message, lines);
    message.scrollIntoView({ block: 'nearest' });
  }

  let busy = false;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    hideMessage(message);
    hideNotice(notice);

    const current = currentInput.value;
    const next = newInput.value;
    const error = validate(current, next, confirmInput.value);
    if (error) {
      fail(error);
      return;
    }

    busy = true;
    setBusy(submitButton, true, '変更しています…');
    let result;
    try {
      result = await changePassword(account.username, current, next);
      if (result.status === 'ok') {
        setSession({ username: account.username, via: 'password-change', at: new Date().toISOString() });
      }
    } catch {
      result = { status: 'error' };
    }
    if (result.status === 'ok') {
      location.assign('mypage.html');
      return;
    }

    busy = false;
    setBusy(submitButton, false);
    if (result.status === 'error' || result.status === 'no-account') {
      fail('パスワードを変更できませんでした。ログインし直してから、もう一度お試しください。');
      return;
    }
    // 実際のサイトと同じく、いまのパスワードの欄は空にする（新しいパスワードは残す）
    currentInput.value = '';
    showNotice(notice, h('p', { class: 'small' }, '答え合わせ'), ...explainMismatch(result));
    fail('いまのパスワードが正しくありません。');
  });
}
