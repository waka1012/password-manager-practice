// passkey.js（パスキーの作成と確認）のテスト

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installStorage } from './helpers.js';
import { createFakeAuthenticator, rawToDer, FLAGS } from './fake-authenticator.js';
import {
  toBase64url, fromBase64url, parseAuthenticatorData, derToRaw, providerName,
  creationOptions, completeRegistration, checkPasskeyLogin,
} from '../../public/js/passkey.js';
import { saveAccount, findAccount, listPasskeys, findPasskey, removePasskey } from '../../public/js/store.js';
import { deleteAccount } from '../../public/js/auth.js';

const SITE = { origin: 'http://localhost:8789', rpId: 'localhost' };
const GOOGLE = 'ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4';

function challenge() {
  return crypto.getRandomValues(new Uint8Array(32));
}

function account(username = 'renshu-01') {
  const record = { username, userId: toBase64url(crypto.getRandomValues(new Uint8Array(16))) };
  saveAccount(record);
  return record;
}

// パスキーを作って保存し、その管理ツール（の代わり）を返す
async function register(owner, options) {
  const authenticator = await createFakeAuthenticator(options);
  const created = challenge();
  const result = await completeRegistration(owner, await authenticator.create(created, SITE), created, SITE);
  assert.equal(result.status, 'ok');
  return authenticator;
}

async function logIn(authenticator, owner, options = {}) {
  const requested = challenge();
  const credential = await authenticator.get(options.challenge || requested, {
    ...SITE, userHandle: owner ? fromBase64url(owner.userId) : null, ...options,
  });
  return checkPasskeyLogin(credential, requested, options.site || SITE);
}

beforeEach(() => installStorage());

test('base64url の変換（+ / = を使わない）', () => {
  const bytes = new Uint8Array([0xfb, 0xff, 0xfe, 0x00, 0x3e, 0x3f]);
  assert.equal(toBase64url(bytes), '-__-AD4_');
  assert.deepEqual(fromBase64url('-__-AD4_'), bytes);
  assert.deepEqual(fromBase64url(toBase64url(new Uint8Array([1]))), new Uint8Array([1]));
});

test('認証器のデータから、フラグ・署名の回数・AAGUID を読む', () => {
  const data = new Uint8Array(53);
  data[32] = FLAGS.UP | FLAGS.UV | FLAGS.BE | FLAGS.AT;
  data[36] = 5;
  data.set(Uint8Array.from(Buffer.from(GOOGLE.replaceAll('-', ''), 'hex')), 37);
  const parsed = parseAuthenticatorData(data.buffer);
  assert.equal(parsed.userPresent, true);
  assert.equal(parsed.userVerified, true);
  assert.equal(parsed.backupEligible, true);
  assert.equal(parsed.backupState, false);
  assert.equal(parsed.signCount, 5);
  assert.equal(parsed.aaguid, GOOGLE);
  assert.equal(providerName(parsed.aaguid), 'Google パスワード マネージャー');
  assert.equal(providerName('00000000-0000-0000-0000-000000000000'), null);
  assert.throws(() => parseAuthenticatorData(new Uint8Array(36)));
});

test('DER 形式の署名を、r と s を並べた形に戻せる', () => {
  for (let i = 0; i < 50; i++) {
    const raw = crypto.getRandomValues(new Uint8Array(64));
    // 先頭が 0 のものや、最上位ビットが立っているものも試す
    if (i % 5 === 0) raw[0] = 0;
    if (i % 7 === 0) raw[32] = 0x80;
    assert.deepEqual(derToRaw(rawToDer(raw)), raw);
  }
  assert.throws(() => derToRaw(new Uint8Array([0x30, 0x02, 0x02, 0x00])));
});

test('作成の設定: user.id、重ねて作らないための一覧、端末の管理ツール', async () => {
  const owner = account();
  const authenticator = await register(owner);
  const options = creationOptions(owner, challenge());
  assert.equal(options.rp.id, undefined);
  assert.deepEqual(options.user.id, fromBase64url(owner.userId));
  assert.equal(options.user.name, 'renshu-01');
  assert.deepEqual(options.pubKeyCredParams.map((param) => param.alg), [-7, -257]);
  assert.deepEqual(options.excludeCredentials.map((item) => toBase64url(item.id)), [toBase64url(authenticator.credentialId)]);
  assert.equal(options.authenticatorSelection.authenticatorAttachment, 'platform');
  assert.equal(options.authenticatorSelection.residentKey, 'required');
  assert.equal(options.attestation, 'none');
});

test('作成: 公開鍵などを保存する（秘密鍵は来ない）', async () => {
  const owner = account();
  const authenticator = await register(owner, { aaguid: Uint8Array.from(Buffer.from(GOOGLE.replaceAll('-', ''), 'hex')) });
  const [passkey] = listPasskeys();
  assert.equal(passkey.id, toBase64url(authenticator.credentialId));
  assert.equal(passkey.username, 'renshu-01');
  assert.equal(passkey.userId, owner.userId);
  assert.equal(passkey.algorithm, -7);
  assert.equal(passkey.aaguid, GOOGLE);
  assert.equal(passkey.backupEligible, true);
  assert.equal(passkey.lastUsedAt, null);
  assert.ok(passkey.publicKey.length > 80);
});

test('作成: チャレンジ・オリジン・RP ID・種類が違うものや、公開鍵を取り出せないものは保存しない', async () => {
  const owner = account();
  const authenticator = await createFakeAuthenticator();
  const created = challenge();
  const cases = [
    [await authenticator.create(challenge(), SITE), SITE, 'invalid'],
    [await authenticator.create(created, { ...SITE, origin: 'https://evil.example' }), SITE, 'invalid'],
    [await authenticator.create(created, { ...SITE, rpId: 'evil.example' }), SITE, 'invalid'],
    [await authenticator.create(created, { ...SITE, type: 'webauthn.get' }), SITE, 'invalid'],
    [await authenticator.create(created, { ...SITE, withPublicKey: false }), SITE, 'unsupported-key'],
  ];
  for (const [credential, site, status] of cases) {
    assert.equal((await completeRegistration(owner, credential, created, site)).status, status);
  }
  assert.equal(listPasskeys().length, 0);
});

test('ログイン: 署名を確かめ、最後に使った日時を記録する', async () => {
  const owner = account();
  const authenticator = await register(owner);
  const result = await logIn(authenticator, owner);
  assert.equal(result.status, 'ok');
  assert.equal(result.username, 'renshu-01');
  assert.equal(result.userVerified, true);
  assert.ok(findPasskey(toBase64url(authenticator.credentialId)).lastUsedAt);
});

test('ログイン: RS256 のパスキーも確かめられる', async () => {
  const owner = account();
  const authenticator = await register(owner, { algorithm: -257 });
  assert.equal(listPasskeys()[0].algorithm, -257);
  assert.equal((await logIn(authenticator, owner)).status, 'ok');
});

test('ログイン: 書き換えられたもの、ほかの呼び出しのもの、ほかのサイトのものは通さない', async () => {
  const owner = account();
  const authenticator = await register(owner);
  const other = account('renshu-02');
  const cases = [
    { tamper: true },
    { challenge: challenge() },
    { origin: 'https://evil.example' },
    { rpId: 'evil.example' },
    { type: 'webauthn.create' },
    { site: { ...SITE, origin: 'https://evil.example' } },
    { userHandle: fromBase64url(other.userId) },
  ];
  for (const options of cases) {
    assert.equal((await logIn(authenticator, owner, options)).status, 'invalid', JSON.stringify(Object.keys(options)));
  }
});

test('操作した印（UP）がないものは、作成でもログインでも通さない', async () => {
  const owner = account();
  const withoutUp = await createFakeAuthenticator({ flags: FLAGS.UV });
  const created = challenge();
  assert.equal((await completeRegistration(owner, await withoutUp.create(created, SITE), created, SITE)).status, 'invalid');
  assert.equal(listPasskeys().length, 0);

  const authenticator = await register(owner);
  assert.equal((await logIn(authenticator, owner, { getFlags: FLAGS.UV })).status, 'invalid');
});

test('ログイン: 練習サイトに記録のないパスキー（答え合わせ用に、知らせる ID と、わかればアカウントを返す）', async () => {
  const owner = account();
  const authenticator = await register(owner);
  const id = toBase64url(authenticator.credentialId);

  // パスキーだけを削除した（アカウントは残っている）
  removePasskey(id);
  assert.deepEqual(await logIn(authenticator, owner), { status: 'unknown', id, username: 'renshu-01' });

  // アカウントごと削除した（以前のパスワードの記録は残る）
  saveAccount({ ...findAccount('renshu-01'), salt: '00', hash: '00', iterations: 1 });
  deleteAccount('renshu-01');
  assert.deepEqual(await logIn(authenticator, owner), { status: 'unknown', id });

  // 練習データが1件もない
  installStorage();
  assert.deepEqual(await logIn(authenticator, owner), { status: 'no-data', id });
});

test('アカウントを削除すると、パスキーの記録も消える', async () => {
  const owner = account();
  await register(owner);
  const other = account('renshu-02');
  await register(other);
  deleteAccount('renshu-01');
  assert.deepEqual(listPasskeys().map((passkey) => passkey.username), ['renshu-02']);
});
