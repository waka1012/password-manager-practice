// ログイン後の画面（マイページ）: 答え合わせの表示、ログアウト、パスワードの変更へのリンク、パスキー、アカウント削除
// ログインしていないときは、実際のサイトと同じくログインの画面へ移動する。

import {
  getSession, clearSession, listAccounts, findAccount, passkeysFor, removePasskey, setFlash,
} from './store.js';
import { deleteAccount, suggestUsername, ACCOUNT_LIMIT } from './auth.js';
import { methodLabel } from './input-check.js';
import { isPasskeyAvailable, createPasskey, providerName, signalAcceptedPasskeys } from './passkey.js';
import {
  h, showMessage, hideMessage, showNotice, hideNotice, setBusy, formatNames,
} from './ui.js';

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

// パスキーでログインしたときの答え合わせ。info はログインの画面で記録したもの（保存先、同期、本人確認）
function passkeyCheckNotice(info, accountCount) {
  const details = info && typeof info === 'object' ? info : {};
  const blocks = [
    h('p', { class: 'small' }, '答え合わせ'),
    h('p', { class: 'lead' }, 'パスキーでログインできました。'),
  ];
  if (accountCount > 1) {
    blocks.push(h('p', {}, `ログインしたアカウント: 「${account.username}」（この端末の練習用アカウントは${accountCount}つ）`));
  }
  blocks.push(h('details', {},
    h('summary', {}, '判定の材料'),
    h('ul', {},
      h('li', {}, `保存先の管理ツール: ${typeof details.provider === 'string' ? details.provider : 'わかりませんでした'}`),
      h('li', {}, `ほかの端末との同期: ${details.synced ? 'される' : 'されない'}`),
      h('li', {}, `本人確認（顔・指紋・画面ロック）: ${details.userVerified ? 'あり' : 'なし'}`))));
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
  } else if (session.via === 'passkey') {
    showMessage(message, 'ログインしました。', 'info');
    showNotice(document.getElementById('notice'), ...passkeyCheckNotice(session.passkey, usernames.length));
    document.getElementById('guide-passkey-multi').hidden = usernames.length < 2;
    document.getElementById('guide-passkey').hidden = false;
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

  setUpPasskeys();

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

  document.getElementById('delete-do').addEventListener('click', (event) => {
    const { userId } = findAccount(account.username) || account;
    try {
      deleteAccount(account.username);
    } catch {
      showMessage(document.getElementById('delete-error'), 'アカウントを削除できませんでした。');
      return;
    }
    event.currentTarget.disabled = true;
    clearSession();
    setFlash('deleted');
    // パスキーがあったアカウントは、管理ツールに知らせる。知らせが届くのを少し待ってから移動する（最大1秒）
    Promise.resolve(signalAcceptedPasskeys(userId, [])).then(() => location.assign('./'));
  });
}

// パスキー（一覧、作成、削除）

function setUpPasskeys() {
  const list = document.getElementById('passkey-list');
  const empty = document.getElementById('passkey-empty');
  const createButton = document.getElementById('passkey-create');
  const passkeyMessage = document.getElementById('passkey-message');
  const passkeyNotice = document.getElementById('passkey-notice');
  // 削除の確認を出しているパスキー
  let confirmingId = null;
  let busy = false;

  function actionButton(label, className, onClick) {
    const button = h('button', { type: 'button', class: className }, label);
    button.addEventListener('click', onClick);
    return button;
  }

  function passkeyItem(passkey) {
    const provider = providerName(passkey.aaguid);
    const item = h('li', {},
      h('p', { class: 'passkey-name' }, provider ? `パスキー（${provider}）` : 'パスキー'),
      h('p', { class: 'passkey-meta' }, `作成: ${formatDate(passkey.createdAt)}`),
      h('p', { class: 'passkey-meta' }, `最後に使った日時: ${passkey.lastUsedAt ? formatDate(passkey.lastUsedAt) : 'まだ使っていません'}`),
      h('p', { class: 'passkey-meta' }, passkey.backupEligible ? 'ほかの端末と同期されるパスキーです' : 'この端末だけで使えるパスキーです'));
    if (confirmingId === passkey.id) {
      item.append(h('div', { class: 'confirm' },
        h('p', {}, h('strong', {}, 'このパスキーを削除しますか？')),
        h('p', {}, '削除すると、このパスキーではログインできなくなります。'),
        h('div', { class: 'actions' },
          actionButton('削除する', 'button danger js-passkey-delete', () => deletePasskey(passkey)),
          actionButton('やめる', 'button', () => {
            confirmingId = null;
            renderList();
          }))));
    } else {
      item.append(h('div', { class: 'actions' },
        actionButton('このパスキーを削除する', 'button danger-outline', () => {
          confirmingId = passkey.id;
          renderList();
          list.querySelector('.js-passkey-delete').focus();
        })));
    }
    return item;
  }

  function renderList() {
    const passkeys = passkeysFor(account.username);
    list.replaceChildren(...passkeys.map(passkeyItem));
    list.hidden = passkeys.length === 0;
    empty.hidden = passkeys.length > 0;
  }

  function deletePasskey(passkey) {
    hideMessage(passkeyMessage);
    hideNotice(passkeyNotice);
    try {
      removePasskey(passkey.id);
    } catch {
      showMessage(passkeyMessage, 'パスキーを削除できませんでした。');
      return;
    }
    confirmingId = null;
    renderList();
    // 管理ツールに、このアカウントでまだ使えるパスキーの一覧を知らせる（一覧にないものは、隠されたり削除されたりする）
    const { userId } = findAccount(account.username) || account;
    const signaled = Boolean(signalAcceptedPasskeys(userId, passkeysFor(account.username).map((item) => item.id)));
    showMessage(passkeyMessage, 'パスキーを削除しました。', 'info');
    showNotice(passkeyNotice,
      h('p', {}, signaled
        ? 'この練習サイトから、パスワード管理ツールに、パスキーを削除したことを知らせました。管理ツールによっては、このパスキーが自動で消えたり、候補に出なくなったりします。'
        : 'このブラウザは、パスワード管理ツールに知らせる仕組みに対応していません。管理ツールのパスキーは、そのまま残っています。'),
      h('p', {}, '試してみましょう: 「ログアウト」を押して、パスキーでログインしようとすると、どうなるでしょうか。管理ツールにパスキーが残っていても、練習サイトで削除したパスキーではログインできません。'),
      h('p', {}, '最後に、パスワード管理ツールを開いて、このサイトのパスキーが残っていたら削除しましょう。'));
    createButton.focus();
  }

  function showCreateResult(result) {
    switch (result.status) {
      case 'ok': {
        const provider = providerName(result.passkey.aaguid);
        showMessage(passkeyMessage, 'パスキーを作成しました。', 'info');
        showNotice(passkeyNotice,
          h('p', { class: 'lead' }, 'パスワード管理ツールに、パスキーが保存されたかを確かめましょう。'),
          h('ul', {},
            h('li', {}, `iPhone: 「パスワード」アプリで「${location.hostname}」を検索します。`),
            h('li', {}, `Android: Google パスワード マネージャーで「${location.hostname}」を検索します。`)),
          provider ? h('p', {}, `保存先の管理ツール: ${provider}`) : null,
          h('p', {}, 'パスキーがあったら、「ログアウト」を押して、パスキーでログインしてみましょう。'));
        break;
      }
      case 'exists':
        showMessage(passkeyMessage, 'このアカウントのパスキーは、この管理ツールにすでにあります。');
        showNotice(passkeyNotice,
          h('p', {}, 'このサイトでは、1つの管理ツールに、1つのアカウントのパスキーを1つだけ作れます（実際のサイトでも、よくある作りです）。'),
          h('p', {}, 'すでにあるパスキーで、ログインできます。作り直すときは、上の一覧からパスキーを削除してから、作成します。'));
        break;
      case 'cancelled':
        showMessage(passkeyMessage, 'パスキーを作成できませんでした。');
        showNotice(passkeyNotice,
          h('p', {}, '保存の確認を閉じたか、時間切れになりました。もう一度「パスキーを作成する」を押してください。'),
          h('p', {}, '同じアカウントのパスキーが、すでに管理ツールにあるときも、このように表示されることがあります。'));
        break;
      case 'unsupported-key':
        showMessage(passkeyMessage, 'この管理ツールのパスキーには対応していません。');
        break;
      default:
        showMessage(passkeyMessage, 'パスキーを作成できませんでした。もう一度お試しください。');
    }
  }

  renderList();

  if (!isPasskeyAvailable()) {
    createButton.disabled = true;
    showNotice(passkeyNotice, h('p', {},
      'このブラウザ（または、いまの開き方）では、パスキーを使えません。「https://」で始まるURLか、パソコンの「http://localhost」で開いてください。'));
    return;
  }

  createButton.addEventListener('click', () => {
    if (busy) return;
    busy = true;
    hideMessage(passkeyMessage);
    hideNotice(passkeyNotice);
    setBusy(createButton, true, '作成しています…');
    // Safari では、ボタンを押した処理の中で、待ち時間を挟まずに呼び出す必要がある（createPasskey の中で、すぐに呼び出す）
    createPasskey(account.username).then((result) => {
      busy = false;
      setBusy(createButton, false);
      renderList();
      showCreateResult(result);
    });
  });
}
