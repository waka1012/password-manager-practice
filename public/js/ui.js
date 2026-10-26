// 画面表示の共通処理
// 入力値などを画面に出すときは、文字として扱う（textContent / テキストノード）。innerHTML は使わない。

export function h(tag, attributes = {}, ...children) {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (name === 'class') element.className = value;
    else element.setAttribute(name, value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    element.append(child instanceof Node ? child : String(child));
  }
  return element;
}

// 実際のサイトと同じ種類の表示（エラーや完了のお知らせ）。lines は文字列か、文字列の配列。
export function showMessage(element, lines, kind = 'error') {
  const list = Array.isArray(lines) ? lines : [lines];
  element.replaceChildren(...list.map((line, i) => h('p', i === 0 ? { class: 'lead' } : {}, line)));
  element.className = `message ${kind}`;
  element.hidden = false;
}

export function hideMessage(element) {
  element.hidden = true;
  element.replaceChildren();
}

// この練習サイトだけの表示（答え合わせ、制約の説明など）。「練習サイトからのお知らせ」の枠に出す。
// blocks のうち null は飛ばす（条件によって出さない段落があるため）
export function showNotice(container, ...blocks) {
  container.querySelector('.notice-body').replaceChildren(...blocks.filter(Boolean));
  container.hidden = false;
}

// ユーザー名の一覧を、「renshu-01」、「renshu-02」の形にする
export function formatNames(names) {
  return names.map((name) => `「${name}」`).join('、');
}

export function hideNotice(container) {
  container.hidden = true;
  container.querySelector('.notice-body').replaceChildren();
}

export function setBusy(button, busy, busyLabel) {
  if (busy) {
    button.dataset.label = button.textContent;
    button.textContent = busyLabel;
    button.disabled = true;
  } else {
    if (button.dataset.label) button.textContent = button.dataset.label;
    button.disabled = false;
  }
}

export function insecureContextNotice() {
  return [
    h('p', { class: 'lead' }, 'この開き方では、パスワードの処理（ハッシュ化）ができないため、登録やログインを試せません。'),
    h('p', {}, '「https://」で始まるURLか、パソコンの「http://localhost」で開いてください。'),
  ];
}

export function storageUnavailableNotice() {
  return [
    h('p', { class: 'lead' }, 'このブラウザの設定では、練習データを保存できません。'),
    h('p', {}, 'プライベートブラウズを使っている場合は、ふつうのタブで開いてください。'),
  ];
}

export function otherDeviceNote() {
  return h('p', {},
    'ほかの端末（パソコンなど）で登録した場合: この練習サイトでは、練習データは登録した端末の中にしかないため、ほかの端末からはログインできません。'
    + '実際のサイトでは、パスワード管理ツールが入力したパスワードで、そのままログインできます。');
}
