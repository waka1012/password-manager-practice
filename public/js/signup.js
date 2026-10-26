// 会員登録の画面
// 送信は JavaScript で受け止め、ブラウザの中で登録してから次の画面へ移動する。
// この作りで管理ツールが保存を提案するかは、実機で確かめる（構成案 第10章）。

import { listAccounts, findAccount, setSession, isStorageAvailable } from './store.js';
import {
  register, suggestUsername, isCryptoAvailable, USERNAME_PATTERN, PASSWORD_MIN, PASSWORD_MAX, ACCOUNT_LIMIT,
} from './auth.js';
import {
  h, showMessage, hideMessage, showNotice, hideNotice, setBusy, formatNames,
  insecureContextNotice, storageUnavailableNotice,
} from './ui.js';

const form = document.getElementById('signup-form');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const confirmInput = document.getElementById('password-confirm');
const submitButton = form.querySelector('button[type="submit"]');
const message = document.getElementById('message');
const notice = document.getElementById('notice');

function limitNotice() {
  return [
    h('p', { class: 'lead' }, `練習用アカウントは、この端末で${ACCOUNT_LIMIT}つまで登録できます。`),
    h('p', {}, '使わないアカウントにログインして削除するか、「はじめに」の画面の「全部リセット」で、最初からやり直してください。'),
  ];
}

if (!isCryptoAvailable()) {
  showNotice(notice, ...insecureContextNotice());
  submitButton.disabled = true;
} else if (!isStorageAvailable()) {
  showNotice(notice, ...storageUnavailableNotice());
  submitButton.disabled = true;
} else if (listAccounts().length >= ACCOUNT_LIMIT) {
  showNotice(notice, ...limitNotice());
  submitButton.disabled = true;
}

// すでにアカウントがあるときは、2つ目以降の登録の注意を出し、まだ使っていない名前を例に出す
const existing = listAccounts().map((account) => account.username);
if (existing.length > 0) {
  document.getElementById('existing-names').textContent = formatNames(existing);
  document.getElementById('example-name').textContent = suggestUsername();
  document.getElementById('guide-multi').hidden = false;
}

function validate(username, password, confirmation) {
  if (!username) return 'ユーザー名を入力してください。';
  if (!USERNAME_PATTERN.test(username)) return 'ユーザー名は、半角の英字・数字と記号（- _ . @）で、3〜32文字にしてください。';
  if (!password) return 'パスワードを入力してください。';
  if (password.length < PASSWORD_MIN) return `パスワードは${PASSWORD_MIN}文字以上にしてください。`;
  if (password.length > PASSWORD_MAX) return `パスワードは${PASSWORD_MAX}文字以内にしてください。`;
  if (password !== confirmation) return '確認用のパスワードが一致しません。';
  return null;
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

  const username = usernameInput.value.trim();
  const password = passwordInput.value;
  const error = validate(username, password, confirmInput.value);
  if (error) {
    fail(error);
    return;
  }
  if (findAccount(username)) {
    showNotice(notice, h('p', {},
      'この端末に、同じユーザー名の練習用アカウントがあります。同じユーザー名で登録し直すときは、ログインしてアカウントを削除してから、もう一度登録してください。'));
    fail('このユーザー名は、すでに登録されています。別のユーザー名にするか、ログインしてください。');
    return;
  }
  // ほかのタブで登録した場合に備えて、送信のときにも確かめる
  if (listAccounts().length >= ACCOUNT_LIMIT) {
    showNotice(notice, ...limitNotice());
    fail('これ以上は登録できません。');
    return;
  }

  busy = true;
  setBusy(submitButton, true, '登録しています…');
  try {
    if (!(await register(username, password))) throw new Error('not registered');
    setSession({ username, via: 'signup', at: new Date().toISOString() });
  } catch {
    busy = false;
    setBusy(submitButton, false);
    fail('登録できませんでした。もう一度お試しください。');
    return;
  }
  location.assign('mypage.html');
});
