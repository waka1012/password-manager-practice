// 練習データの保存・読み出し
// - アカウント、以前のパスワードの記録、パスキーの記録: localStorage（この端末のこのブラウザの中だけ）
// - ログイン状態と、画面をまたぐ一度きりの表示: sessionStorage（タブを閉じると消える）
// キーにはすべて接頭辞 "pp." を付ける。

const PREFIX = 'pp.';
const KEYS = {
  accounts: PREFIX + 'accounts',
  history: PREFIX + 'history',
  passkeys: PREFIX + 'passkeys',
  session: PREFIX + 'session',
  flash: PREFIX + 'flash',
};

function storage(kind) {
  return kind === 'session' ? globalThis.sessionStorage : globalThis.localStorage;
}

function readJson(kind, key, fallback) {
  try {
    const raw = storage(kind).getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

// 保存できないとき（プライベートブラウズ、容量不足など）は例外をそのまま投げる
function writeJson(kind, key, value) {
  storage(kind).setItem(key, JSON.stringify(value));
}

function readList(key) {
  const list = readJson('local', key, []);
  return Array.isArray(list) ? list.filter((item) => item && typeof item.username === 'string') : [];
}

export function isStorageAvailable() {
  try {
    const key = PREFIX + 'check';
    storage('local').setItem(key, '1');
    storage('local').removeItem(key);
    return true;
  } catch {
    return false;
  }
}

// アカウント（ユーザー名、ソルト、ハッシュ値、反復回数、登録日時）
// ユーザー名をキーにしたオブジェクトではなく配列で持つ（"__proto__" などの名前でも壊れないように）

export function listAccounts() {
  return readList(KEYS.accounts);
}

export function findAccount(username) {
  return listAccounts().find((account) => account.username === username) || null;
}

// 同じユーザー名があれば置き換える（並び順は変えない）
export function saveAccount(record) {
  const list = listAccounts();
  const index = list.findIndex((account) => account.username === record.username);
  if (index === -1) list.push(record);
  else list[index] = record;
  writeJson('local', KEYS.accounts, list);
}

export function removeAccount(username) {
  writeJson('local', KEYS.accounts, listAccounts().filter((account) => account.username !== username));
}

// 以前のパスワードの記録（答え合わせ用。パスワードを変更したときと、アカウントを削除したときに、古いハッシュ値を残す）

export function listHistory() {
  return readList(KEYS.history);
}

// 新しいものから順に返す
export function historyFor(username) {
  return listHistory().filter((entry) => entry.username === username).reverse();
}

// ユーザー名ごとに、新しいものから limitPerUser 件までを残す
export function addHistory(entry, limitPerUser) {
  const list = listHistory();
  list.push(entry);
  const counts = new Map();
  const kept = [];
  for (let i = list.length - 1; i >= 0; i--) {
    const count = counts.get(list[i].username) || 0;
    if (count < limitPerUser) {
      kept.unshift(list[i]);
      counts.set(list[i].username, count + 1);
    }
  }
  writeJson('local', KEYS.history, kept);
}

// パスキーの記録（認証情報ID、どのアカウントのものか、公開鍵など）。
// 秘密鍵はパスワード管理ツールの中にあり、ここには来ない。

export function listPasskeys() {
  return readList(KEYS.passkeys).filter((passkey) => typeof passkey.id === 'string');
}

export function findPasskey(id) {
  return listPasskeys().find((passkey) => passkey.id === id) || null;
}

export function passkeysFor(username) {
  return listPasskeys().filter((passkey) => passkey.username === username);
}

// 同じ認証情報IDがあれば置き換える（最後に使った日時の更新など。並び順は変えない）
export function savePasskey(record) {
  const list = listPasskeys();
  const index = list.findIndex((passkey) => passkey.id === record.id);
  if (index === -1) list.push(record);
  else list[index] = record;
  writeJson('local', KEYS.passkeys, list);
}

export function removePasskey(id) {
  writeJson('local', KEYS.passkeys, listPasskeys().filter((passkey) => passkey.id !== id));
}

export function removePasskeysFor(username) {
  writeJson('local', KEYS.passkeys, listPasskeys().filter((passkey) => passkey.username !== username));
}

export function hasAnyData() {
  return listAccounts().length > 0 || listHistory().length > 0 || listPasskeys().length > 0;
}

// 全部リセット: 接頭辞 "pp." の付いたデータを、localStorage と sessionStorage の両方から消す
export function resetAll() {
  for (const kind of ['local', 'session']) {
    const target = storage(kind);
    const keys = [];
    for (let i = 0; i < target.length; i++) {
      const key = target.key(i);
      if (key && key.startsWith(PREFIX)) keys.push(key);
    }
    keys.forEach((key) => target.removeItem(key));
  }
}

// ログイン状態

export function getSession() {
  const session = readJson('session', KEYS.session, null);
  return session && typeof session.username === 'string' ? session : null;
}

export function setSession(session) {
  writeJson('session', KEYS.session, session);
}

export function clearSession() {
  try {
    storage('session').removeItem(KEYS.session);
  } catch {
    // 消せなくても、次の画面でログイン状態がないものとして扱われる
  }
}

// 画面をまたいで一度だけ出す表示（例: アカウントを削除したあと）。
// URL のパラメータは使わない（パラメータの内容を画面に出さないため）。

export function setFlash(name) {
  try {
    writeJson('session', KEYS.flash, name);
  } catch {
    // 表示できないだけなので無視する
  }
}

export function takeFlash() {
  const name = readJson('session', KEYS.flash, null);
  try {
    storage('session').removeItem(KEYS.flash);
  } catch {
    // 無視する
  }
  return typeof name === 'string' ? name : null;
}
