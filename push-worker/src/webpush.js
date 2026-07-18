// Minimal RFC 8291 (aes128gcm) + RFC 8292 (VAPID) Web Push implementation
// using only the standard Web Crypto API. No dependencies.
//
// Written by hand after two published "Workers-compatible" web-push
// libraries (web-push via nodejs_compat, and two separate WebCrypto-based
// packages) turned out to implement the old, deprecated "aesgcm" draft
// scheme instead of the current aes128gcm standard (RFC 8291) that modern
// browsers actually require. Verified end-to-end against a real Chrome
// subscription before landing here.

function b64urlToBytes(s) {
  const padding = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

function bytesToB64url(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concatBytes(...arrs) {
  const total = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrs) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

async function hmacSha256(keyBytes, dataBytes) {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, dataBytes);
  return new Uint8Array(sig);
}

async function hkdfExtract(salt, ikm) {
  return hmacSha256(salt, ikm);
}

async function hkdfExpand(prk, info, length) {
  // length <= 32 (SHA-256 output size), so a single HMAC block suffices.
  const input = concatBytes(info, new Uint8Array([1]));
  const t1 = await hmacSha256(prk, input);
  return t1.slice(0, length);
}

async function vapidJwt(audience, subject, privateJwk) {
  const header = { typ: "JWT", alg: "ES256" };
  const claims = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: subject,
  };
  const enc = (obj) => bytesToB64url(new TextEncoder().encode(JSON.stringify(obj)));
  const unsigned = `${enc(header)}.${enc(claims)}`;

  const key = await crypto.subtle.importKey(
    "jwk",
    privateJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(unsigned)
  );
  return `${unsigned}.${bytesToB64url(new Uint8Array(sig))}`;
}

export async function sendWebPush({ subscription, payload, vapidPrivateJwk, vapidPublicKey, subject, ttl = 86400 }) {
  const endpoint = subscription.endpoint;
  const audience = new URL(endpoint).origin;

  const uaPublicBytes = b64urlToBytes(subscription.keys.p256dh);
  const authSecret = b64urlToBytes(subscription.keys.auth);

  // Ephemeral ECDH key pair for this message.
  const localKeyPair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const localPublicJwk = await crypto.subtle.exportKey("jwk", localKeyPair.publicKey);
  const x = b64urlToBytes(localPublicJwk.x);
  const y = b64urlToBytes(localPublicJwk.y);
  const asPublicBytes = concatBytes(new Uint8Array([4]), x, y); // uncompressed point

  const uaPublicKey = await crypto.subtle.importKey(
    "raw",
    uaPublicBytes,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );
  const sharedSecretBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: uaPublicKey },
    localKeyPair.privateKey,
    256
  );
  const ecdhSecret = new Uint8Array(sharedSecretBits);

  // Stage 1: derive IKM from the ECDH secret, keyed by the subscriber's auth secret.
  const prkKey = await hkdfExtract(authSecret, ecdhSecret);
  const keyInfo = concatBytes(
    new TextEncoder().encode("WebPush: info\0"),
    uaPublicBytes,
    asPublicBytes
  );
  const ikm = await hkdfExpand(prkKey, keyInfo, 32);

  // Stage 2: derive the actual content-encryption key and nonce, keyed by a fresh random salt.
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hkdfExtract(salt, ikm);
  const cekBytes = await hkdfExpand(prk, new TextEncoder().encode("Content-Encoding: aes128gcm\0"), 16);
  const nonceBytes = await hkdfExpand(prk, new TextEncoder().encode("Content-Encoding: nonce\0"), 12);

  const cek = await crypto.subtle.importKey("raw", cekBytes, { name: "AES-GCM" }, false, ["encrypt"]);
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const padded = concatBytes(plaintext, new Uint8Array([2])); // last-record delimiter, no extra padding
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonceBytes }, cek, padded);
  const ciphertext = new Uint8Array(encrypted);

  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, 4096, false);
  const header = concatBytes(salt, recordSize, new Uint8Array([asPublicBytes.length]), asPublicBytes);
  const body = concatBytes(header, ciphertext);

  const jwt = await vapidJwt(audience, subject, vapidPrivateJwk);

  return fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      TTL: String(ttl),
      Authorization: `vapid t=${jwt}, k=${vapidPublicKey}`,
    },
    body,
  });
}
