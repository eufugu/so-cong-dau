import { describe, test, expect, beforeAll, beforeEach } from 'vitest';
import { initializeApp, setLogLevel } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { createBackend, signInKind, errorKind } from '../src/backend.js';

setLogLevel('silent');
const CONFIG = { apiKey: 'fake', projectId: 'demo-so-cong-dau', authDomain: 'demo-so-cong-dau.firebaseapp.com' };
const EMAIL = 'mother@so-cong-dau.test';
const PIN = '123456';
const NGUOI = 'so-cong-dau.v1.nguoi';
const FS = 'http://127.0.0.1:8080';

let be;
beforeAll(async () => {
  const auth = getAuth(initializeApp(CONFIG, 'admin'));
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  await createUserWithEmailAndPassword(auth, EMAIL, PIN);
  await auth.signOut();
});
beforeEach(async () => {
  await fetch(`${FS}/emulator/v1/projects/demo-so-cong-dau/databases/(default)/documents`, { method: 'DELETE' });
  be = createBackend(CONFIG, { emulator: true });
});

const until = (check, ms = 5000) => new Promise((res, rej) => {
  const t = Date.now();
  const tick = () => {
    const v = check();
    if (v) res(v);
    else if (Date.now() - t > ms) rej(new Error('timeout'));
    else setTimeout(tick, 25);
  };
  tick();
});

const uidOf = () => new Promise((res) => { const stop = be.onUser((u) => { if (u) { stop(); res(u.uid); } }); });
async function seedPerson(uid, name, role) {
  const r = await fetch(`${FS}/v1/projects/demo-so-cong-dau/databases/(default)/documents/people/${uid}`, {
    method: "PATCH",
    headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
    body: JSON.stringify({ fields: { name: { stringValue: name }, role: { stringValue: role } } }),
  });
  expect(r.ok).toBe(true);
}
// Sign in and make the user a known person, since the rules only let known people read.
async function login() {
  await be.signIn(EMAIL, PIN);
  const uid = await uidOf();
  await seedPerson(uid, "Mẹ Liên", "owner");
  return uid;
}

function mem(init) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

describe('store', () => {
  test('first server result has fromCache false; set then delete round-trips a row with its id', async () => {
    await login();
    const snaps = [];
    const stop = be.store.collection('orders').onSnapshot((s) => snaps.push(s), (e) => { throw e; });
    await until(() => snaps.some((s) => s.metadata.fromCache === false));
    expect(snaps.find((s) => !s.metadata.fromCache).docs).toEqual([]);

    await be.store.collection('orders').doc('o1').set({ id: 'o1', qty: 3 });
    const withRow = await until(() => snaps.find((s) => !s.metadata.fromCache && s.docs.length === 1));
    expect(withRow.docs[0].id).toBe('o1');
    expect(withRow.docs[0].data()).toEqual({ id: 'o1', qty: 3 });

    await be.store.collection('orders').doc('o1').delete();
    await until(() => {
      const last = snaps[snaps.length - 1];
      return last.docs.length === 0 && !last.metadata.fromCache;
    });
    stop();
  });

  test('set rejects as refused when the server refuses (signed out)', async () => {
    const err = await be.store.collection('orders').doc('x').set({ id: 'x' }).then(() => null, (e) => e);
    expect(err).not.toBeNull();
    expect(be.errorKind(err)).toBe('refused');
  });
});

describe('auth', () => {
  test('signIn succeeds and onUser reports { uid }, then null after signOut', async () => {
    const seen = [];
    const stop = be.onUser((u) => seen.push(u));
    await login();
    const user = await until(() => seen.find((u) => u && u.uid));
    expect(Object.keys(user)).toEqual(['uid']);
    await be.signOut();
    await until(() => seen[seen.length - 1] === null);
    stop();
  });

  test('wrong pin rejects with wrong-pin', async () => {
    await expect(be.signIn(EMAIL, '000000')).rejects.toEqual({ code: 'wrong-pin' });
  });

  test.each([
    ['auth/invalid-credential', 'wrong-pin'],
    ['auth/wrong-password', 'wrong-pin'],
    ['auth/network-request-failed', 'offline'],
    ['auth/too-many-requests', 'too-many-tries'],
    ['auth/something-else', 'other'],
    [undefined, 'other'],
  ])('signInKind(%s) is %s', (code, kind) => {
    expect(signInKind(code)).toBe(kind);
  });
});

describe('errorKind', () => {
  test.each([
    ['permission-denied', 'refused'],
    ['unavailable', 'offline'],
    ['invalid-argument', 'other'],
  ])('%s is %s', (code, kind) => {
    expect(errorKind({ code })).toBe(kind);
    expect(be.errorKind({ code })).toBe(kind);
  });
  test('non-error values are other', () => {
    expect(errorKind(null)).toBe('other');
    expect(errorKind(undefined)).toBe('other');
  });
});

describe('profile', () => {
  test('returns null for a missing row and clears the cached copy', async () => {
    await login();
    globalThis.localStorage = mem({ [NGUOI]: JSON.stringify({ uid: 'nobody', name: 'Old', role: 'owner' }) });
    try {
      expect(await be.profile('nobody')).toBeNull();
      expect(localStorage.getItem(NGUOI)).toBeNull();
    } finally { delete globalThis.localStorage; }
  });

  test('returns name and role, and caches them', async () => {
    const uid = await login();
    globalThis.localStorage = mem({});
    try {
      expect(await be.profile(uid)).toEqual({ name: 'Mẹ Liên', role: 'owner' });
      expect(JSON.parse(localStorage.getItem(NGUOI))).toEqual({ uid, name: 'Mẹ Liên', role: 'owner' });
    } finally { delete globalThis.localStorage; }
  });

  test('works when localStorage does not exist', async () => {
    await login();
    expect(await be.profile('nobody')).toBeNull();
  });
});
