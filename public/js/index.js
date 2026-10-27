// 「はじめに」の画面: この端末の練習データの表示と、全部リセット

import {
  listAccounts, listHistory, passkeysFor, resetAll, isStorageAvailable, takeFlash,
} from './store.js';
import { ACCOUNT_LIMIT } from './auth.js';
import { signalAcceptedPasskeys } from './passkey.js';
import { h, showMessage, showNotice, storageUnavailableNotice } from './ui.js';

const message = document.getElementById('message');
const notice = document.getElementById('notice');
const summary = document.getElementById('data-summary');

const FLASH_MESSAGES = new Map([
  ['deleted', [
    'アカウントを削除しました。',
    'パスワード管理ツールに保存したパスワードは、自動では消えません。パスキーは、管理ツールによっては、自動で消えたり隠れたりします。'
      + '最初からやり直すときは、管理ツールに残った項目も削除しましょう。'
      + 'パスワードを残したまま同じユーザー名で登録すると、「パスワードを更新しますか？」と聞かれる動きも試せます。',
  ]],
]);

const flash = takeFlash();
if (FLASH_MESSAGES.has(flash)) showMessage(message, FLASH_MESSAGES.get(flash), 'info');

if (!isStorageAvailable()) showNotice(notice, ...storageUnavailableNotice());

renderSummary();

function renderSummary() {
  const accounts = listAccounts();
  const history = listHistory();
  const parts = [];
  if (accounts.length === 0) {
    parts.push(h('p', {}, '練習用アカウントは、まだありません。'));
  } else {
    parts.push(h('p', {}, `練習用アカウント: ${accounts.length}件（${ACCOUNT_LIMIT}件まで登録できます）`));
    parts.push(h('ul', { class: 'names' }, accounts.map((account) => {
      const passkeys = passkeysFor(account.username).length;
      return h('li', {}, passkeys > 0 ? `${account.username}（パスキー: ${passkeys}件）` : account.username);
    })));
  }
  if (history.length > 0) {
    parts.push(h('p', { class: 'small' },
      `答え合わせ用に残している、以前のパスワードの記録: ${history.length}件（元に戻せない形で保存しています）`));
  }
  summary.replaceChildren(...parts);
}

// 全部リセット（確認の手順を1つ挟む）

const resetOpen = document.getElementById('reset-open');
const resetConfirm = document.getElementById('reset-confirm');
const resetResult = document.getElementById('reset-result');

resetOpen.addEventListener('click', () => {
  resetResult.hidden = true;
  resetOpen.hidden = true;
  resetConfirm.hidden = false;
  document.getElementById('reset-do').focus();
});

document.getElementById('reset-cancel').addEventListener('click', () => {
  resetConfirm.hidden = true;
  resetOpen.hidden = false;
  resetOpen.focus();
});

document.getElementById('reset-do').addEventListener('click', () => {
  // パスキーを作ったことのあるアカウント（user.id があるもの）
  const userIds = listAccounts().map((account) => account.userId).filter(Boolean);
  try {
    resetAll();
  } catch {
    showMessage(resetResult, '練習データを消せませんでした。', 'error');
    return;
  }
  // 管理ツールに、どのパスキーも使えなくなったことを知らせる（結果は待たない）
  userIds.forEach((userId) => signalAcceptedPasskeys(userId, []));
  resetConfirm.hidden = true;
  resetOpen.hidden = false;
  message.hidden = true;
  renderSummary();
  showMessage(resetResult, [
    '練習データをすべて消しました。',
    'パスワード管理ツールに保存したパスワードは、残っています。パスキーは、管理ツールによっては、自動で消えたり隠れたりします。'
      + '残っている項目は、必要に応じて、管理ツールから削除してください。',
  ], 'info');
});
