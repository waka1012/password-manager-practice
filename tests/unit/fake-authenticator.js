// テスト用の「管理ツール」（認証器）の代わり
// Web Crypto で鍵の組を作り、ブラウザの navigator.credentials.create() / get() が返すものと同じ形の結果を組み立てる。

const encoder = new TextEncoder();

export const FLAGS = { UP: 0x01, UV: 0x04, BE: 0x08, BS: 0x10, AT: 0x40 };

const ALGORITHMS = {
  [-7]: {
    generate: { name: 'ECDSA', namedCurve: 'P-256' },
    sign: { name: 'ECDSA', hash: 'SHA-256' },
    der: true,
  },
  [-257]: {
    generate: { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    sign: { name: 'RSASSA-PKCS1-v1_5' },
    der: false,
  },
};

function concat(...parts) {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

// ブラウザは ArrayBuffer で返すので、それに合わせる
function buffer(bytes) {
  return bytes.slice().buffer;
}

async function sha256(data) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', data));
}

function clientData(type, challenge, origin) {
  return encoder.encode(JSON.stringify({ type, challenge: Buffer.from(challenge).toString('base64url'), origin, crossOrigin: false }));
}

// Web Crypto の ECDSA の署名（r と s を並べた形）を、WebAuthn の署名と同じ DER 形式に変える
export function rawToDer(raw) {
  const integer = (bytes) => {
    let start = 0;
    while (start < bytes.length - 1 && bytes[start] === 0) start++;
    let value = bytes.slice(start);
    if (value[0] & 0x80) value = concat(new Uint8Array([0]), value);
    return concat(new Uint8Array([0x02, value.length]), value);
  };
  const body = concat(integer(raw.slice(0, 32)), integer(raw.slice(32)));
  return concat(new Uint8Array([0x30, body.length]), body);
}

export async function createFakeAuthenticator({
  algorithm = -7,
  aaguid = new Uint8Array(16),
  flags = FLAGS.UP | FLAGS.UV | FLAGS.BE | FLAGS.BS,
} = {}) {
  const spec = ALGORITHMS[algorithm];
  const keys = await crypto.subtle.generateKey(spec.generate, true, ['sign', 'verify']);
  const publicKey = new Uint8Array(await crypto.subtle.exportKey('spki', keys.publicKey));
  const credentialId = crypto.getRandomValues(new Uint8Array(16));

  async function authenticatorData(rpId, flagByte) {
    const head = concat(await sha256(encoder.encode(rpId)), new Uint8Array([flagByte]), new Uint8Array(4));
    // 作成のときは、AAGUID と認証情報IDを続ける（公開鍵の COSE 形式は、練習サイトが読まないので省く）
    if (!(flagByte & FLAGS.AT)) return head;
    return concat(head, aaguid, new Uint8Array([0, credentialId.length]), credentialId);
  }

  return {
    credentialId,

    // navigator.credentials.create() の結果と同じ形
    async create(challenge, { origin, rpId, type = 'webauthn.create', withPublicKey = true }) {
      const authData = await authenticatorData(rpId, flags | FLAGS.AT);
      return {
        rawId: buffer(credentialId),
        response: {
          clientDataJSON: buffer(clientData(type, challenge, origin)),
          getPublicKey: () => (withPublicKey ? buffer(publicKey) : null),
          getPublicKeyAlgorithm: () => algorithm,
          getAuthenticatorData: () => buffer(authData),
        },
      };
    },

    // navigator.credentials.get() の結果と同じ形。tamper を付けると、署名を1ビット書き換える。
    // getFlags で、ログインのときだけフラグを変えられる。
    async get(challenge, { origin, rpId, userHandle = null, type = 'webauthn.get', tamper = false, getFlags = flags }) {
      const clientDataJSON = clientData(type, challenge, origin);
      const authData = await authenticatorData(rpId, getFlags);
      const signed = concat(authData, await sha256(clientDataJSON));
      let signature = new Uint8Array(await crypto.subtle.sign(spec.sign, keys.privateKey, signed));
      if (spec.der) signature = rawToDer(signature);
      if (tamper) signature[signature.length - 1] ^= 0x01;
      return {
        rawId: buffer(credentialId),
        response: {
          clientDataJSON: buffer(clientDataJSON),
          authenticatorData: buffer(authData),
          signature: buffer(signature),
          userHandle: userHandle ? buffer(userHandle) : null,
        },
      };
    },
  };
}
