// パスキー（WebAuthn）の作成と確認
// 本来はサーバが行う処理（チャレンジの作成、公開鍵の保存、署名の確認）を、ブラウザの中で代わりに行う。
// 秘密鍵はパスワード管理ツールの中にあり、練習サイトには来ない。保存するのは公開鍵だけ。
// 確認するのは、WebAuthn の仕様の確認手順のうち、この練習サイトに必要なもの
// （種類、チャレンジ、オリジン、RP ID、フラグ、署名）に絞っている。

import {
  findAccount, saveAccount, listAccounts, findPasskey, passkeysFor, savePasskey, hasAnyData,
} from './store.js';

const RP_NAME = 'パスワード管理ツール練習サイト';
const CHALLENGE_BYTES = 32;
const USER_ID_BYTES = 16;
const ES256 = -7;
const RS256 = -257;
// Signal API の結果を待つ時間の上限（画面を移動する前だけ待つ）
const SIGNAL_WAIT_MS = 1000;

// 署名の方式ごとの、Web Crypto での扱い。ES256 の署名は DER 形式で届くので、r と s を並べた形に変える。
const ALGORITHMS = new Map([
  [ES256, {
    importParams: { name: 'ECDSA', namedCurve: 'P-256' },
    verifyParams: { name: 'ECDSA', hash: 'SHA-256' },
    convertSignature: (signature) => derToRaw(signature),
  }],
  [RS256, {
    importParams: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    verifyParams: { name: 'RSASSA-PKCS1-v1_5' },
    convertSignature: (signature) => signature,
  }],
]);

// 管理ツールの種類（AAGUID）と、画面に出す名前。知られている少数だけを持つ（外部から一覧を読み込まない）。
// 出典: passkey-authenticator-aaguids（コミュニティによる一覧）
const PROVIDERS = new Map([
  ['ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4', 'Google パスワード マネージャー'],
  ['fbfc3007-154e-4ecc-8c0b-6e020557d7bd', 'アップルの「パスワード」'],
  ['dd4ec289-e01d-41c9-bb89-70fa845d4bf2', 'アップルの「パスワード」'],
  ['53414d53-554e-4700-0000-000000000000', 'Samsung Pass'],
]);

// パスキーは、HTTPS か localhost で開いたときにしか使えない
export function isPasskeyAvailable() {
  return globalThis.isSecureContext !== false
    && typeof globalThis.PublicKeyCredential === 'function'
    && Boolean(globalThis.navigator && navigator.credentials);
}

// 自動入力の候補にパスキーを出せるか（conditional mediation）
export async function isAutofillAvailable() {
  if (!isPasskeyAvailable() || typeof PublicKeyCredential.isConditionalMediationAvailable !== 'function') return false;
  try {
    return await PublicKeyCredential.isConditionalMediationAvailable();
  } catch {
    return false;
  }
}

export function providerName(aaguid) {
  return PROVIDERS.get(aaguid) || null;
}

// --- バイト列の扱い ---

function bytesOf(data) {
  if (data instanceof Uint8Array) return data;
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return new Uint8Array(data);
}

function concat(...parts) {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function sameBytes(a, b) {
  return a.length === b.length && a.every((byte, i) => byte === b[i]);
}

function randomBytes(length) {
  return crypto.getRandomValues(new Uint8Array(length));
}

async function sha256(data) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', data));
}

export function toBase64url(data) {
  let binary = '';
  for (const byte of bytesOf(data)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64url(text) {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

// --- 確認に使う部品 ---

// 認証器のデータ（authenticatorData）を読む
//   先頭32バイト: RP ID（ホスト名）の SHA-256
//   次の1バイト: フラグ（UP: 操作した、UV: 本人確認をした、BE: 同期できる、BS: 同期されている、AT: 鍵の情報を含む）
//   次の4バイト: 署名の回数
//   作成のとき（AT）だけ、続く16バイト: AAGUID（管理ツールの種類）
export function parseAuthenticatorData(data) {
  const bytes = bytesOf(data);
  if (bytes.length < 37) throw new Error('authenticatorData is too short');
  const flags = bytes[32];
  return {
    rpIdHash: bytes.slice(0, 32),
    userPresent: Boolean(flags & 0x01),
    userVerified: Boolean(flags & 0x04),
    backupEligible: Boolean(flags & 0x08),
    backupState: Boolean(flags & 0x10),
    signCount: new DataView(bytes.buffer, bytes.byteOffset + 33, 4).getUint32(0),
    aaguid: flags & 0x40 && bytes.length >= 53 ? formatAaguid(bytes.slice(37, 53)) : null,
  };
}

function formatAaguid(bytes) {
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
}

// ES256 の署名（DER 形式の SEQUENCE { INTEGER r, INTEGER s }）を、r と s を32バイトずつ並べた形に変える。
// 署名は72バイト以下なので、長さが1バイトで表される形だけを受け付ける。
export function derToRaw(der) {
  const bytes = bytesOf(der);
  let offset = 0;
  // タグと長さを読み、中身の長さを返す
  const header = (tag) => {
    const length = bytes[offset + 1];
    if (bytes[offset] !== tag || length & 0x80 || offset + 2 + length > bytes.length) throw new Error('invalid signature');
    offset += 2;
    return length;
  };
  if (header(0x30) !== bytes.length - 2) throw new Error('invalid signature');
  const raw = new Uint8Array(64);
  for (const start of [0, 32]) {
    const length = header(0x02);
    let value = bytes.slice(offset, offset + length);
    offset += length;
    // 先頭の 0（正の数を表すために付く）を取り除く
    while (value.length > 32 && value[0] === 0) value = value.slice(1);
    if (value.length > 32) throw new Error('invalid signature');
    raw.set(value, start + 32 - value.length);
  }
  if (offset !== bytes.length) throw new Error('invalid signature');
  return raw;
}

// clientDataJSON（ブラウザが作る、呼び出しの記録）を確かめる。問題があれば理由を、なければ null を返す。
function checkClientData(clientDataJSON, type, challenge, origin) {
  let data;
  try {
    data = JSON.parse(new TextDecoder().decode(clientDataJSON));
  } catch {
    return 'client-data';
  }
  if (data.type !== type) return 'type';
  if (data.challenge !== toBase64url(challenge)) return 'challenge';
  if (data.origin !== origin) return 'origin';
  return null;
}

// RP ID（ホスト名）の SHA-256 と、操作したこと（UP）を確かめる
async function checkAuthenticatorData(authData, rpId) {
  return sameBytes(authData.rpIdHash, await sha256(new TextEncoder().encode(rpId))) && authData.userPresent;
}

async function verifySignature(passkey, authenticatorData, clientDataJSON, signature) {
  const algorithm = ALGORITHMS.get(passkey.algorithm);
  if (!algorithm) return false;
  try {
    const key = await crypto.subtle.importKey('spki', fromBase64url(passkey.publicKey), algorithm.importParams, false, ['verify']);
    const signed = concat(authenticatorData, await sha256(clientDataJSON));
    return await crypto.subtle.verify(algorithm.verifyParams, key, algorithm.convertSignature(signature), signed);
  } catch {
    return false;
  }
}

// 呼び出しの失敗を、答え合わせ用の結果にする
function errorStatus(error) {
  switch (error && error.name) {
    case 'NotAllowedError': return 'cancelled'; // 閉じた、時間切れ（どちらかは区別できない）
    case 'InvalidStateError': return 'exists'; // 同じ管理ツールに、このアカウントのパスキーがすでにある
    case 'AbortError': return 'aborted';
    case 'NotSupportedError': return 'unsupported';
    default: return 'error';
  }
}

function currentSite() {
  return { origin: location.origin, rpId: location.hostname };
}

// --- 作成（P1） ---

// アカウントの user.id（管理ツールが、どのアカウントのパスキーかを見分けるための値）。
// 実際のサイトと同じく、ユーザー名とは別の値にする。パスキーを初めて作るときに決める。
function ensureUserId(account) {
  if (typeof account.userId === 'string' && account.userId) return account;
  const updated = { ...account, userId: toBase64url(randomBytes(USER_ID_BYTES)) };
  saveAccount(updated);
  return updated;
}

export function creationOptions(account, challenge) {
  return {
    challenge,
    // id を省略すると、開いているページのホスト名になる
    rp: { name: RP_NAME },
    user: { id: fromBase64url(account.userId), name: account.username, displayName: account.username },
    pubKeyCredParams: [{ type: 'public-key', alg: ES256 }, { type: 'public-key', alg: RS256 }],
    // 同じ管理ツールに、同じアカウントのパスキーを重ねて作らない（実際のサイトと同じ）
    excludeCredentials: passkeysFor(account.username).map((passkey) => ({ type: 'public-key', id: fromBase64url(passkey.id) })),
    // 端末の管理ツールに作る（ほかの端末や QR コードは、この練習では扱わない）
    authenticatorSelection: {
      authenticatorAttachment: 'platform', residentKey: 'required', requireResidentKey: true, userVerification: 'preferred',
    },
    attestation: 'none',
  };
}

// 作成の結果を確かめて、公開鍵を保存する（本来はサーバが行う）。
//   ok               保存した（passkey を付ける）
//   unsupported-key  公開鍵を取り出せない方式（Safari は ES256 だけ）
//   invalid          確認に失敗した（ふつうは起きない）
export async function completeRegistration(account, credential, challenge, { origin, rpId }) {
  const { response } = credential;
  const publicKey = typeof response.getPublicKey === 'function' ? response.getPublicKey() : null;
  const algorithm = typeof response.getPublicKeyAlgorithm === 'function' ? response.getPublicKeyAlgorithm() : null;
  if (!publicKey || !ALGORITHMS.has(algorithm)) return { status: 'unsupported-key' };

  if (checkClientData(bytesOf(response.clientDataJSON), 'webauthn.create', challenge, origin)) return { status: 'invalid' };
  const authData = parseAuthenticatorData(response.getAuthenticatorData());
  if (!(await checkAuthenticatorData(authData, rpId))) return { status: 'invalid' };

  const passkey = {
    id: toBase64url(credential.rawId),
    username: account.username,
    userId: account.userId,
    publicKey: toBase64url(publicKey),
    algorithm,
    aaguid: authData.aaguid,
    backupEligible: authData.backupEligible,
    backupState: authData.backupState,
    signCount: authData.signCount,
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
  };
  savePasskey(passkey);
  return { status: 'ok', passkey };
}

// パスキーを作る。Safari では、ボタンを押した処理の中で、待ち時間を挟まずに呼び出す必要があるため、
// navigator.credentials.create() の前には await を置かない。
// 結果は completeRegistration の結果か、exists / cancelled / unsupported / error / no-account。
export function createPasskey(username) {
  const found = findAccount(username);
  if (!found) return Promise.resolve({ status: 'no-account' });
  let account;
  try {
    account = ensureUserId(found);
  } catch {
    return Promise.resolve({ status: 'error' });
  }
  const challenge = randomBytes(CHALLENGE_BYTES);
  return navigator.credentials.create({ publicKey: creationOptions(account, challenge) })
    .then((credential) => completeRegistration(account, credential, challenge, currentSite()))
    .catch((error) => ({ status: errorStatus(error) }));
}

// --- ログイン（P2） ---

function accountByUserHandle(userHandle) {
  if (!userHandle || bytesOf(userHandle).length === 0) return null;
  const userId = toBase64url(userHandle);
  return listAccounts().find((account) => account.userId === userId) || null;
}

// ログインの判定（本来はサーバが行う）。答え合わせのために、実際のサイトより詳しい結果を返す。
//   ok       署名を確かめられた（username、passkey、userVerified を付ける）
//   no-data  この端末のこのブラウザに、練習データが1件もない
//   unknown  練習サイトに記録のないパスキー（削除した、全部リセットした、など）。
//            user.id が練習用アカウントと一致したときは、username を付ける
//   invalid  確認に失敗した（ふつうは起きない）
// no-data と unknown には、管理ツールに知らせるための認証情報ID（id）を付ける。
export async function checkPasskeyLogin(credential, challenge, { origin, rpId }) {
  const id = toBase64url(credential.rawId);
  const { response } = credential;
  const passkey = findPasskey(id);
  if (!passkey || !findAccount(passkey.username)) {
    if (!hasAnyData()) return { status: 'no-data', id };
    const owner = accountByUserHandle(response.userHandle);
    return owner ? { status: 'unknown', id, username: owner.username } : { status: 'unknown', id };
  }

  const clientDataJSON = bytesOf(response.clientDataJSON);
  const authenticatorData = bytesOf(response.authenticatorData);
  if (checkClientData(clientDataJSON, 'webauthn.get', challenge, origin)) return { status: 'invalid' };
  const authData = parseAuthenticatorData(authenticatorData);
  if (!(await checkAuthenticatorData(authData, rpId))) return { status: 'invalid' };
  if (response.userHandle && toBase64url(response.userHandle) !== passkey.userId) return { status: 'invalid' };
  if (!(await verifySignature(passkey, authenticatorData, clientDataJSON, bytesOf(response.signature)))) {
    return { status: 'invalid' };
  }

  const updated = {
    ...passkey,
    backupState: authData.backupState,
    signCount: authData.signCount,
    lastUsedAt: new Date().toISOString(),
  };
  savePasskey(updated);
  return { status: 'ok', username: passkey.username, passkey: updated, userVerified: authData.userVerified };
}

// パスキーでログインする。conditional のときは、自動入力の候補から選ばれるまで待つ（ページを開いたときに呼び出す）。
// 結果は checkPasskeyLogin の結果か、cancelled / aborted / unsupported / error。
export function getPasskey({ conditional = false, signal } = {}) {
  const challenge = randomBytes(CHALLENGE_BYTES);
  const request = { publicKey: { challenge, userVerification: 'preferred' } };
  if (conditional) request.mediation = 'conditional';
  if (signal) request.signal = signal;
  return navigator.credentials.get(request)
    .then((credential) => checkPasskeyLogin(credential, challenge, currentSite()))
    .catch((error) => ({ status: errorStatus(error) }));
}

// --- Signal API（管理ツールに、使えなくなったパスキーを知らせる。Chrome 132 以降、Safari 26 以降） ---
// どう扱うか（削除するか、隠すか）は、管理ツールが決める。
// 対応していないときは false を返す。対応しているときは、知らせ終わる（または1秒たつ）と解決する Promise を返す。
// 失敗しても、練習の流れは止めない。

function signal(method, options) {
  const send = globalThis.PublicKeyCredential && PublicKeyCredential[method];
  if (typeof send !== 'function') return false;
  try {
    return Promise.race([
      Promise.resolve(send.call(PublicKeyCredential, options)).then(() => true, () => false),
      new Promise((resolve) => { setTimeout(() => resolve(false), SIGNAL_WAIT_MS); }),
    ]);
  } catch {
    return false;
  }
}

// 練習サイトに記録のないパスキーで、ログインしようとしたとき
export function signalUnknownPasskey(id) {
  return signal('signalUnknownCredential', { rpId: location.hostname, credentialId: id });
}

// パスキーやアカウントを削除したとき、全部リセットのとき。ids は、そのアカウントでまだ使えるパスキーの一覧。
export function signalAcceptedPasskeys(userId, ids) {
  if (!userId) return false;
  return signal('signalAllAcceptedCredentials', { rpId: location.hostname, userId, allAcceptedCredentialIds: ids });
}
