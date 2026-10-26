// 入力のしかた（自動入力か、手入力か）を推定する。
// ブラウザや管理ツールによって入力のしかたが違うため、結果はあくまで目安。
// どこまで見分けられるかは、実機で確かめる（構成案 12.7）。

const METHOD_LABELS = new Map([
  ['autofill', '自動入力（ブラウザが「自動入力された」という印を付けていました）'],
  ['probably-autofill', '自動入力の可能性が高い（まとめて入力されました。管理ツールの拡張機能による入力など）'],
  ['paste', '貼り付け'],
  ['typed', '手入力（キーボードで1文字ずつ入力されました）'],
  ['mixed', '自動入力と手入力が混ざっています（自動入力のあとで書き換えた、など）'],
]);

export function methodLabel(method) {
  return METHOD_LABELS.get(method) || '判定できませんでした';
}

function hasAutofillMark(input) {
  for (const selector of [':autofill', ':-webkit-autofill']) {
    try {
      if (input.matches(selector)) return true;
    } catch {
      // この書き方に対応していないブラウザでは、次の書き方を試す
    }
  }
  return false;
}

export function trackInput(input) {
  let counts;
  let lastLength;
  const reset = () => {
    counts = { typed: 0, bulk: 0, pasted: 0 };
    lastLength = input.value.length;
  };
  reset();

  input.addEventListener('input', (event) => {
    const length = input.value.length;
    const added = length - lastLength;
    lastLength = length;
    if (length === 0) {
      reset();
      return;
    }
    const type = event.inputType || '';
    if (type === 'insertFromPaste' || type === 'insertFromDrop') {
      counts.pasted++;
    } else if (type === 'insertText' || type === 'insertCompositionText') {
      if (added > 1) counts.bulk++;
      else counts.typed++;
    } else if (added > 1 || type === '' || type === 'insertReplacementText') {
      counts.bulk++;
    }
  });

  return {
    reset,
    describe() {
      const autofillMark = hasAutofillMark(input);
      const { typed, bulk, pasted } = counts;
      let method = 'unknown';
      if (autofillMark && typed === 0) method = 'autofill';
      else if (typed > 0 && (bulk > 0 || pasted > 0 || autofillMark)) method = 'mixed';
      else if (typed > 0) method = 'typed';
      else if (pasted > 0) method = 'paste';
      else if (bulk > 0) method = 'probably-autofill';
      return { method, autofillMark, typed, bulk, pasted };
    },
  };
}
