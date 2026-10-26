// ログインの画面
// 失敗したときは、実際のサイトと同じく「ユーザー名またはパスワードが正しくありません」とだけ表示し、
// 詳しい答え合わせは「練習サイトからのお知らせ」に分けて表示する。

import { setSession, takeFlash, isStorageAvailable } from './store.js';
import { checkLogin, isCryptoAvailable } from './auth.js';
import { trackInput, methodLabel } from './input-check.js';
import {
  h, showMessage, hideMessage, showNotice, hideNotice, setBusy,
  insecureContextNotice, storageUnavailableNotice, otherDeviceNote,
} from './ui.js';

const form = document.getElementById('login-form');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const submitButton = form.querySelector('button[type="submit"]');
const message = document.getElementById('message');
const notice = document.getElementById('notice');
const tracker = trackInput(passwordInput);

if (takeFlash() === 'logged-out') {
  showMessage(message, ['ログアウトしました。', '次は、パスワード管理ツールの自動入力でログインしてみましょう。'], 'info');
}

if (!isCryptoAvailable()) {
  showNotice(notice, ...insecureContextNotice());
  submitButton.disabled = true;
} else if (!isStorageAvailable()) {
  showNotice(notice, ...storageUnavailableNotice());
  submitButton.disabled = true;
}

const RESET_HINT = 'いまのパスワードが管理ツールのどこにも保存されていないときは、「はじめに」の画面の「全部リセット」で、最初からやり直せます。';

// 手で入力して失敗したときは、管理ツールが間違ったパスワードで「更新」を提案することがある
function updateCaution(inputMethod) {
  if (!['typed', 'mixed', 'paste'].includes(inputMethod.method)) return null;
  return h('p', {},
    '手で入力（または貼り付け）してログインに失敗したあとで、パスワード管理ツールが「パスワードを更新しますか？」と聞いてきても、「更新」は選ばないでください。間違ったパスワードで、項目が上書きされてしまいます。');
}

// 別の練習用アカウントのパスワードが入力されたとき（アカウントの取り違えや、項目の上書き）
function explainMixUp(result, username, inputMethod) {
  const other = `「${result.otherUsername}」`;
  switch (result.status) {
    case 'wrong-password':
      return [
        h('p', { class: 'lead' }, `入力されたパスワードは、別の練習用アカウント${other}のものです。`),
        h('p', {}, 'ユーザー名とパスワードの組み合わせが、ずれています。考えられる理由:'),
        h('ul', {},
          h('li', {}, `${other}の項目から、パスワードを入力した（コピーして貼り付けた、など）`),
          h('li', {}, `パスワード管理ツールの「${username}」の項目が、${other}のパスワードで上書きされた（保存や更新の確認で、ほかのアカウントの項目を選んだ、など）`)),
        h('p', {}, `管理ツールを開いて、「${username}」と${other}の項目のパスワードが同じになっていないか、確かめましょう。同じなら、上書きされています。` + RESET_HINT),
        updateCaution(inputMethod),
      ];
    case 'unknown-user':
      return [
        h('p', { class: 'lead' }, 'このユーザー名は、この端末のこのブラウザには登録されていません。'),
        h('p', {}, `ただし、入力されたパスワードは、練習用アカウント${other}のものです。考えられる理由:`),
        h('ul', {},
          h('li', {}, 'ユーザー名を打ち間違えた'),
          h('li', {}, 'パスワード管理ツールの項目のユーザー名が、違うものになっている（保存の確認で、ユーザー名を書き換えた、など）')),
        h('p', {}, `このパスワードのユーザー名は${other}です。管理ツールで、項目のユーザー名を確かめましょう。`),
      ];
    default: // deleted-account
      return [
        h('p', { class: 'lead' }, 'このユーザー名のアカウントは、削除されています。'),
        h('p', {}, `入力されたパスワードは、練習用アカウント${other}のものです。ほかのアカウントの項目から入力したか、削除したアカウントの項目が上書きされた可能性があります。`),
      ];
  }
}

function explainFailure(result, username, inputMethod) {
  if (result.otherUsername) return explainMixUp(result, username, inputMethod);
  switch (result.status) {
    case 'no-data':
      return [
        h('p', { class: 'lead' }, 'この端末のこのブラウザには、練習用アカウントの記録がありません。'),
        h('p', {}, '考えられる理由:'),
        h('ul', {},
          h('li', {}, 'しばらく使わなかったため、自動で消えた（Safari では、使った日で数えて7日間）'),
          h('li', {}, '別のURLやブラウザ、ほかの端末で登録した'),
          h('li', {}, '「全部リセット」で消した')),
        h('p', {}, '会員登録からやり直しましょう。パスワード管理ツールには、前の項目が残っています。'),
        otherDeviceNote(),
      ];
    case 'unknown-user':
      return [
        h('p', { class: 'lead' }, 'このユーザー名は、この端末のこのブラウザには登録されていません。'),
        h('p', {}, '確かめること:'),
        h('ul', {},
          h('li', {}, 'ユーザー名を打ち間違えていないか'),
          h('li', {}, 'パスワード管理ツールの候補から、別のユーザー名を選んでいないか')),
        otherDeviceNote(),
      ];
    case 'wrong-password':
      return [
        h('p', { class: 'lead' }, 'パスワードが、登録したときのものと違います。'),
        h('p', {}, '考えられる理由:'),
        h('ul', {},
          h('li', {}, '登録したときに、パスワード管理ツールに保存しなかった（または別のパスワードで保存した）'),
          h('li', {}, '手で入力したときに、打ち間違えた')),
        h('p', {}, 'パスワード管理ツールを開いて、保存されている項目を確かめましょう。' + RESET_HINT),
        updateCaution(inputMethod),
      ];
    case 'old-password':
      if (result.reason === 'changed') {
        return [
          h('p', { class: 'lead' }, '入力されたのは、パスワードを変更する前のものです。'),
          h('p', {}, 'パスワード管理ツールの項目が、古いままになっています。パスワードを変更したときに「更新」を選ばなかったか、別のアカウントの項目を更新してしまった可能性があります。'),
          h('p', {}, '管理ツールで、このサイトの項目を見直しましょう。' + RESET_HINT),
        ];
      }
      return [
        h('p', { class: 'lead' }, '入力されたのは、以前のパスワード（削除する前のアカウントのもの）です。'),
        h('p', {}, 'パスワード管理ツールの保存内容が、古いままになっています。管理ツールの項目を、いまのパスワードに更新しましょう。' + RESET_HINT),
      ];
    case 'deleted-account-password':
      return [
        h('p', { class: 'lead' }, 'このユーザー名のアカウントは、削除されています。入力されたのは、削除する前に使っていたパスワードです。'),
        h('p', {}, '練習サイトでアカウントを削除しても、パスワード管理ツールの項目は残ります。管理ツールの古い項目を削除するか、同じユーザー名で登録し直して、「パスワードを更新しますか？」の動きを試しましょう。'),
      ];
    case 'deleted-account':
      return [
        h('p', { class: 'lead' }, 'このユーザー名のアカウントは、削除されています。'),
        h('p', {}, '入力されたパスワードは、削除する前のものとも違います。会員登録からやり直しましょう。'),
      ];
    default:
      return [h('p', {}, 'ログインできませんでした。')];
  }
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
  if (!username || !password) {
    fail('ユーザー名とパスワードを入力してください。');
    return;
  }

  const inputMethod = tracker.describe();
  busy = true;
  setBusy(submitButton, true, '確認しています…');
  let result;
  try {
    result = await checkLogin(username, password);
    if (result.status === 'ok') {
      setSession({ username, via: 'login', at: new Date().toISOString(), inputMethod });
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
  if (result.status === 'error') {
    fail('ログインできませんでした。もう一度お試しください。');
    return;
  }
  // 実際のサイトと同じく、パスワードの欄は空にする
  passwordInput.value = '';
  tracker.reset();
  showNotice(notice,
    h('p', { class: 'small' }, '答え合わせ'),
    ...explainFailure(result, username, inputMethod),
    h('p', { class: 'small' }, `入力のしかた（目安）: ${methodLabel(inputMethod.method)}`));
  fail('ユーザー名またはパスワードが正しくありません。');
});
