// store.js（練習データの保存・読み出し）のテスト

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installStorage } from './helpers.js';
import {
  listAccounts, findAccount, saveAccount, removeAccount, historyFor, addHistory, listHistory,
  hasAnyData, resetAll, getSession, setSession, clearSession, setFlash, takeFlash, isStorageAvailable,
  listPasskeys, findPasskey, passkeysFor, savePasskey, removePasskey, removePasskeysFor,
} from '../../public/js/store.js';

beforeEach(() => installStorage());

test('アカウントを保存して、ユーザー名で探せる', () => {
  saveAccount({ username: 'renshu-01', hash: 'a' });
  saveAccount({ username: 'renshu-02', hash: 'b' });
  assert.deepEqual(listAccounts().map((a) => a.username), ['renshu-01', 'renshu-02']);
  assert.equal(findAccount('renshu-02').hash, 'b');
  assert.equal(findAccount('renshu-03'), null);
});

test('同じユーザー名で保存すると、並び順を変えずに置き換える', () => {
  saveAccount({ username: 'renshu-01', hash: 'a' });
  saveAccount({ username: 'renshu-02', hash: 'b' });
  saveAccount({ username: 'renshu-01', hash: 'c' });
  assert.deepEqual(listAccounts().map((a) => `${a.username}:${a.hash}`), ['renshu-01:c', 'renshu-02:b']);
});

test('"__proto__" のようなユーザー名でも壊れない', () => {
  saveAccount({ username: '__proto__', hash: 'a' });
  assert.equal(findAccount('__proto__').hash, 'a');
  assert.equal(findAccount('constructor'), null);
});

test('アカウントを削除できる', () => {
  saveAccount({ username: 'renshu-01' });
  saveAccount({ username: 'renshu-02' });
  removeAccount('renshu-01');
  assert.deepEqual(listAccounts().map((a) => a.username), ['renshu-02']);
});

test('壊れたデータは空として扱う', () => {
  localStorage.setItem('pp.accounts', '{壊れた JSON');
  assert.deepEqual(listAccounts(), []);
  localStorage.setItem('pp.accounts', JSON.stringify({ username: 'x' }));
  assert.deepEqual(listAccounts(), []);
  localStorage.setItem('pp.accounts', JSON.stringify([null, { username: 1 }, { username: 'ok' }]));
  assert.deepEqual(listAccounts().map((a) => a.username), ['ok']);
});

test('以前のパスワードの記録は、ユーザー名ごとに新しいものから上限まで残す', () => {
  for (let i = 1; i <= 4; i++) addHistory({ username: 'renshu-01', n: i }, 3);
  addHistory({ username: 'renshu-02', n: 1 }, 3);
  assert.deepEqual(historyFor('renshu-01').map((e) => e.n), [4, 3, 2]);
  assert.deepEqual(historyFor('renshu-02').map((e) => e.n), [1]);
  assert.equal(listHistory().length, 4);
});

test('全部リセットは、接頭辞 "pp." のデータだけを消す', () => {
  saveAccount({ username: 'renshu-01' });
  addHistory({ username: 'renshu-01' }, 5);
  setSession({ username: 'renshu-01' });
  localStorage.setItem('other', 'keep');
  sessionStorage.setItem('other', 'keep');
  assert.equal(hasAnyData(), true);

  resetAll();

  assert.equal(hasAnyData(), false);
  assert.equal(getSession(), null);
  assert.equal(localStorage.getItem('other'), 'keep');
  assert.equal(sessionStorage.getItem('other'), 'keep');
});

test('パスキーの記録: 保存・置き換え・削除。全部リセットで消える', () => {
  savePasskey({ id: 'a', username: 'renshu-01', lastUsedAt: null });
  savePasskey({ id: 'b', username: 'renshu-02', lastUsedAt: null });
  savePasskey({ id: 'a', username: 'renshu-01', lastUsedAt: 'now' });
  assert.deepEqual(listPasskeys().map((p) => `${p.id}:${p.lastUsedAt}`), ['a:now', 'b:null']);
  assert.deepEqual(passkeysFor('renshu-02').map((p) => p.id), ['b']);
  assert.equal(findPasskey('c'), null);
  assert.equal(hasAnyData(), true);

  removePasskey('a');
  assert.deepEqual(listPasskeys().map((p) => p.id), ['b']);
  removePasskeysFor('renshu-02');
  assert.equal(hasAnyData(), false);

  savePasskey({ id: 'c', username: 'renshu-01' });
  resetAll();
  assert.deepEqual(listPasskeys(), []);
});

test('ログイン状態を保存・消去できる', () => {
  assert.equal(getSession(), null);
  setSession({ username: 'renshu-01', via: 'login' });
  assert.equal(getSession().username, 'renshu-01');
  clearSession();
  assert.equal(getSession(), null);
});

test('画面をまたぐ表示は一度だけ取り出せる', () => {
  setFlash('deleted');
  assert.equal(takeFlash(), 'deleted');
  assert.equal(takeFlash(), null);
});

test('保存できないブラウザを見分ける', () => {
  assert.equal(isStorageAvailable(), true);
  installStorage({ broken: true });
  assert.equal(isStorageAvailable(), false);
  assert.throws(() => saveAccount({ username: 'renshu-01' }));
  // 表示だけのものは、保存できなくても例外を出さない
  assert.doesNotThrow(() => setFlash('deleted'));
  assert.doesNotThrow(() => clearSession());
});
