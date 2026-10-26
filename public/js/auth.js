// 登録・照合（ハッシュ化）
// 本来はサーバが行う処理を、ブラウザの中で行う。パスワードはどこにも送らない。
// パスワードそのものは保存せず、PBKDF2（HMAC-SHA-256、ソルト付き）のハッシュ値だけを保存する。

import {
  listAccounts, findAccount, saveAccount, removeAccount, addHistory, historyFor, hasAnyData,
} from './store.js';

// OWASP の推奨（PBKDF2-HMAC-SHA-256 では60万回以上）。iPhone での速さを見て見直す。
export const ITERATIONS = 600000;
const SALT_BYTES = 16;
const HISTORY_LIMIT_PER_USER = 5;
// ログインに失敗したときは、答え合わせのために、ほかのアカウントのパスワードとも照合する。
// 照合の回数（待ち時間）が増えすぎないように、アカウントの数に上限を設ける。
export const ACCOUNT_LIMIT = 5;

export const USERNAME_PATTERN = /^[A-Za-z0-9._@-]{3,32}$/;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 64;

// Web Crypto は、HTTPS か localhost で開いたときにしか使えない
export function isCryptoAvailable() {
  return globalThis.isSecureContext !== false && Boolean(globalThis.crypto && globalThis.crypto.subtle);
}

function toHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return toHex(new Uint8Array(bits));
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  return { salt: toHex(salt), hash: await pbkdf2(password, salt, ITERATIONS), iterations: ITERATIONS };
}

function isValidRecord(record) {
  return typeof record.salt === 'string' && /^[0-9a-f]+$/.test(record.salt) && record.salt.length % 2 === 0
    && typeof record.hash === 'string'
    && Number.isInteger(record.iterations) && record.iterations > 0 && record.iterations <= 10000000;
}

async function matches(record, password) {
  if (!isValidRecord(record)) return false;
  return (await pbkdf2(password, fromHex(record.salt), record.iterations)) === record.hash;
}

// 古いハッシュ値を、答え合わせ用に「以前のパスワードの記録」へ移す（reason: changed = 変更した / deleted = 削除した）
function retire(account, reason) {
  addHistory({ ...account, reason, retiredAt: new Date().toISOString() }, HISTORY_LIMIT_PER_USER);
}

// 練習用の名前の例（renshu-01, renshu-02, …）のうち、まだ使っていないもの
export function suggestUsername() {
  for (let i = 1; ; i++) {
    const name = `renshu-${String(i).padStart(2, '0')}`;
    if (!findAccount(name)) return name;
  }
}

// 同じユーザー名がすでにあるとき、またはアカウントの数が上限に達しているときは false を返す
export async function register(username, password) {
  if (findAccount(username) || listAccounts().length >= ACCOUNT_LIMIT) return false;
  const hashed = await hashPassword(password);
  saveAccount({ username, ...hashed, createdAt: new Date().toISOString() });
  return true;
}

// ログインの判定。答え合わせのために、実際のサイトより詳しい結果を返す。
//   ok                       登録したときのパスワードと一致
//   no-data                  この端末のこのブラウザに、練習データが1件もない
//   unknown-user             このユーザー名は登録されていない
//   wrong-password           ユーザー名はあるが、パスワードが違う
//   old-password             以前のパスワード（変更する前、または削除する前のもの）と一致
//   deleted-account-password アカウントは削除済みで、削除する前に使っていたパスワードと一致
//   deleted-account          アカウントは削除済みで、削除する前のパスワードとも違う
// 以前のパスワードと一致したときは reason（changed / deleted）を付ける。
// 別の練習用アカウントのいまのパスワードと一致したときは otherUsername を付ける（取り違えや上書きの答え合わせ用）。
export async function checkLogin(username, password) {
  if (!hasAnyData()) return { status: 'no-data' };
  const account = findAccount(username);
  if (account && await matches(account, password)) return { status: 'ok' };
  return diagnoseMismatch(username, password, account);
}

async function diagnoseMismatch(username, password, account) {
  const past = historyFor(username);
  for (const entry of past) {
    if (await matches(entry, password)) {
      return {
        status: account ? 'old-password' : 'deleted-account-password',
        reason: entry.reason === 'changed' ? 'changed' : 'deleted',
      };
    }
  }
  let status = 'unknown-user';
  if (account) status = 'wrong-password';
  else if (past.length > 0) status = 'deleted-account';
  for (const other of listAccounts()) {
    if (other.username !== username && await matches(other, password)) {
      return { status, otherUsername: other.username };
    }
  }
  return { status };
}

// パスワードの変更。いまのパスワードが合っているときだけ変える。
// 結果は ok、no-account（アカウントがない）、またはログインの判定と同じもの（答え合わせ用）。
export async function changePassword(username, currentPassword, newPassword) {
  const account = findAccount(username);
  if (!account) return { status: 'no-account' };
  if (!(await matches(account, currentPassword))) return diagnoseMismatch(username, currentPassword, account);
  const hashed = await hashPassword(newPassword);
  retire(account, 'changed');
  saveAccount({ ...account, ...hashed, passwordChangedAt: new Date().toISOString() });
  return { status: 'ok' };
}

// アカウントを削除する。ハッシュ値は、答え合わせ用に「以前のパスワードの記録」へ移す。
export function deleteAccount(username) {
  const account = findAccount(username);
  if (!account) return false;
  retire(account, 'deleted');
  removeAccount(username);
  return true;
}
