// Node でブラウザの localStorage / sessionStorage の代わりをする。
// store.js は globalThis の localStorage / sessionStorage を、呼ばれるたびに読むので、
// テストごとに installStorage() で空の入れ物に差し替えられる。

class MemoryStorage {
  #items = new Map();

  get length() {
    return this.#items.size;
  }

  key(index) {
    return [...this.#items.keys()][index] ?? null;
  }

  getItem(key) {
    return this.#items.has(key) ? this.#items.get(key) : null;
  }

  setItem(key, value) {
    this.#items.set(key, String(value));
  }

  removeItem(key) {
    this.#items.delete(key);
  }

  clear() {
    this.#items.clear();
  }
}

// 保存できないブラウザ（プライベートブラウズ、容量不足など）の代わり
class BrokenStorage extends MemoryStorage {
  setItem() {
    throw new Error('QuotaExceededError');
  }
}

export function installStorage({ broken = false } = {}) {
  const Storage = broken ? BrokenStorage : MemoryStorage;
  globalThis.localStorage = new Storage();
  globalThis.sessionStorage = new Storage();
}

installStorage();
