// auth.js（登録・照合・パスワードの変更・削除）のテスト
// ハッシュ化は本番と同じ回数（60万回）で行うため、1回の照合に0.2秒ほどかかる。

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installStorage } from './helpers.js';
import {
  register, checkLogin, changePassword, deleteAccount, suggestUsername, isCryptoAvailable,
  ACCOUNT_LIMIT, ITERATIONS, USERNAME_PATTERN,
} from '../../public/js/auth.js';
import { findAccount, listAccounts, historyFor, saveAccount } from '../../public/js/store.js';

const PASSWORD = 'practice-pass-1';
const OTHER_PASSWORD = 'practice-pass-2';
const NEW_PASSWORD = 'practice-pass-new';

beforeEach(() => installStorage());

test('Node では Web Crypto が使える', () => {
  assert.equal(isCryptoAvailable(), true);
});

test('登録すると、パスワードそのものではなくハッシュ値を保存する', async () => {
  assert.equal(await register('renshu-01', PASSWORD), true);
  const account = findAccount('renshu-01');
  assert.equal(account.iterations, ITERATIONS);
  assert.match(account.salt, /^[0-9a-f]{32}$/);
  assert.match(account.hash, /^[0-9a-f]{64}$/);
  assert.equal(JSON.stringify(account).includes(PASSWORD), false);
  assert.equal(localStorage.getItem('pp.accounts').includes(PASSWORD), false);
});

test('同じパスワードでも、アカウントごとにソルトとハッシュ値が違う', async () => {
  await register('renshu-01', PASSWORD);
  await register('renshu-02', PASSWORD);
  const [a, b] = listAccounts();
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.hash, b.hash);
});

test('同じユーザー名では登録できない', async () => {
  await register('renshu-01', PASSWORD);
  assert.equal(await register('renshu-01', OTHER_PASSWORD), false);
  assert.equal(listAccounts().length, 1);
});

test(`アカウントは${ACCOUNT_LIMIT}つまで`, async () => {
  // 上限の確かめには、ハッシュ値の中身は使わないので、直接保存して時間を節約する
  for (let i = 1; i <= ACCOUNT_LIMIT; i++) saveAccount({ username: `renshu-0${i}` });
  assert.equal(await register('renshu-99', PASSWORD), false);
});

test('練習用の名前の例は、まだ使っていないものを出す', async () => {
  assert.equal(suggestUsername(), 'renshu-01');
  saveAccount({ username: 'renshu-01' });
  saveAccount({ username: 'renshu-03' });
  assert.equal(suggestUsername(), 'renshu-02');
});

test('ユーザー名の形式', () => {
  for (const ok of ['renshu-01', 'abc', 'a.b_c@d-e', 'x'.repeat(32)]) assert.match(ok, USERNAME_PATTERN);
  for (const ng of ['ab', 'x'.repeat(33), 'れんしゅう', 'a b', 'a/b', '']) assert.doesNotMatch(ng, USERNAME_PATTERN);
});

test('ログインの判定: 正しいパスワード / 違うパスワード / 未登録 / データなし', async () => {
  assert.deepEqual(await checkLogin('renshu-01', PASSWORD), { status: 'no-data' });
  await register('renshu-01', PASSWORD);
  assert.deepEqual(await checkLogin('renshu-01', PASSWORD), { status: 'ok' });
  assert.deepEqual(await checkLogin('renshu-01', 'wrong-password'), { status: 'wrong-password' });
  assert.deepEqual(await checkLogin('renshu-02', PASSWORD), { status: 'unknown-user', otherUsername: 'renshu-01' });
  assert.deepEqual(await checkLogin('renshu-02', 'wrong-password'), { status: 'unknown-user' });
});

test('別のアカウントのパスワードが入力されたことを見分ける', async () => {
  await register('renshu-01', PASSWORD);
  await register('renshu-02', OTHER_PASSWORD);
  assert.deepEqual(await checkLogin('renshu-01', OTHER_PASSWORD), { status: 'wrong-password', otherUsername: 'renshu-02' });
});

test('パスワードの変更: いまのパスワードが合っているときだけ変え、古いものを記録する', async () => {
  await register('renshu-01', PASSWORD);
  assert.deepEqual(await changePassword('renshu-01', 'wrong-password', NEW_PASSWORD), { status: 'wrong-password' });
  assert.deepEqual(await changePassword('renshu-01', PASSWORD, NEW_PASSWORD), { status: 'ok' });

  assert.ok(findAccount('renshu-01').passwordChangedAt);
  assert.equal(historyFor('renshu-01')[0].reason, 'changed');
  assert.deepEqual(await checkLogin('renshu-01', NEW_PASSWORD), { status: 'ok' });
  assert.deepEqual(await checkLogin('renshu-01', PASSWORD), { status: 'old-password', reason: 'changed' });
});

test('パスワードの変更: アカウントがないとき', async () => {
  assert.deepEqual(await changePassword('renshu-01', PASSWORD, NEW_PASSWORD), { status: 'no-account' });
});

test('アカウントの削除: 削除したアカウントと、削除する前のパスワードを見分ける', async () => {
  await register('renshu-01', PASSWORD);
  assert.equal(deleteAccount('renshu-01'), true);
  assert.equal(deleteAccount('renshu-01'), false);
  assert.equal(findAccount('renshu-01'), null);

  assert.deepEqual(await checkLogin('renshu-01', PASSWORD), { status: 'deleted-account-password', reason: 'deleted' });
  assert.deepEqual(await checkLogin('renshu-01', 'wrong-password'), { status: 'deleted-account' });
});

test('削除してから同じユーザー名で登録し直すと、前のパスワードは「以前のパスワード」になる', async () => {
  await register('renshu-01', PASSWORD);
  deleteAccount('renshu-01');
  assert.equal(await register('renshu-01', NEW_PASSWORD), true);
  assert.deepEqual(await checkLogin('renshu-01', NEW_PASSWORD), { status: 'ok' });
  assert.deepEqual(await checkLogin('renshu-01', PASSWORD), { status: 'old-password', reason: 'deleted' });
});

test('保存されたデータが壊れていても、照合は失敗として扱う', async () => {
  saveAccount({ username: 'renshu-01', salt: 'zz', hash: 'x', iterations: 1 });
  saveAccount({ username: 'renshu-02', salt: 'ab', hash: 'x', iterations: 1e9 });
  assert.deepEqual(await checkLogin('renshu-01', PASSWORD), { status: 'wrong-password' });
  assert.deepEqual(await checkLogin('renshu-02', PASSWORD), { status: 'wrong-password' });
});
