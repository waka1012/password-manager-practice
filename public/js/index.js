// 「はじめに」の画面: この端末の練習データの表示と、全部リセット

import { listAccounts, listHistory, resetAll, isStorageAvailable, takeFlash } from './store.js';
import { ACCOUNT_LIMIT } from './auth.js';
import { h, showMessage, showNotice, storageUnavailableNotice } from './ui.js';

const message = document.getElementById('message');
const notice = document.getElementById('notice');
const summary = document.getElementById('data-summary');

const FLASH_MESSAGES = new Map([
  ['deleted', [
    'アカウントを削除しました。',
    'パスワード管理ツールに保存した項目は、自動では消えません。最初からやり直すときは、管理ツールの項目も削除しましょう。'
      + '項目を残したまま同じユーザー名で登録すると、「パスワードを更新しますか？」と聞かれる動きも試せます。',
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
    parts.push(h('ul', { class: 'names' }, accounts.map((account) => h('li', {}, account.username))));
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
  try {
    resetAll();
  } catch {
    showMessage(resetResult, '練習データを消せませんでした。', 'error');
    return;
  }
  resetConfirm.hidden = true;
  resetOpen.hidden = false;
  message.hidden = true;
  renderSummary();
  showMessage(resetResult, [
    '練習データをすべて消しました。',
    'パスワード管理ツールに保存した項目は、残っています。必要に応じて、管理ツールから削除してください。',
  ], 'info');
});
