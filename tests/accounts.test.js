import { describe, test, expect, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initializeApp, getApps, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { emailFor, validPin, cleanName } from '../admin/lib/names.js';
import { addPerson, resetPin, renamePerson, removePerson, listPeople, parseArgs } from '../admin/lib/people.js';

process.env.METADATA_SERVER_DETECTION = 'none'; // no cloud lookup in tests
const app = getApps()[0] || initializeApp({ projectId: 'demo-so-cong-dau' });
const auth = getAuth(app);
const db = getFirestore(app);
const FAKE_PIN = '000111';
const dir = mkdtempSync(join(tmpdir(), 'accounts-'));
const peopleListPath = join(dir, 'people-list.js');
const ctx = (pin = FAKE_PIN) => ({ auth, db, peopleListPath, askPin: async () => pin });
const read = () => {
  const src = readFileSync(peopleListPath, 'utf8');
  return JSON.parse(src.slice(src.indexOf('['), src.lastIndexOf(']') + 1));
};

beforeEach(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST
    || (process.env.GCLOUD_PROJECT || app.options.projectId) !== 'demo-so-cong-dau') {
    throw new Error('Refusing to wipe data: not running against the emulators for demo-so-cong-dau.');
  }
  const all = await auth.listUsers(1000);
  await auth.deleteUsers(all.users.map((u) => u.uid));
  for (const c of ['people', 'orders']) {
    const s = await db.collection(c).get();
    await Promise.all(s.docs.map((d) => d.ref.delete()));
  }
  writeFileSync(peopleListPath, '');
});
afterAll(async () => { rmSync(dir, { recursive: true, force: true }); await deleteApp(app); });

describe('names', () => {
  test('emailFor strips marks and is stable for NFC and NFD', () => {
    expect(emailFor('Bác Khang')).toBe('bac-khang@so-cong-dau.invalid');
    expect(emailFor('Mẹ Liên')).toBe('me-lien@so-cong-dau.invalid');
    expect(emailFor('Đức Đạt')).toBe('duc-dat@so-cong-dau.invalid');
    expect(emailFor('Bác Khang'.normalize('NFD'))).toBe(emailFor('Bác Khang'.normalize('NFC')));
  });
  test('validPin keeps leading zero and refuses bad pins', () => {
    expect(validPin('012345')).toBe(true);
    for (const bad of ['12345', '1234567', '12a456', '', '123456\n']) expect(validPin(bad)).toBe(false);
  });
  test('cleanName trims and uses NFC', () => {
    expect(cleanName('  Bác Khang '.normalize('NFD'))).toBe('Bác Khang'.normalize('NFC'));
  });
});

describe('parseArgs', () => {
  test('reads name and flags, refuses unknown flags', () => {
    expect(parseArgs(['add', 'Bác Khang', '--owner'])).toMatchObject({ command: 'add', name: 'Bác Khang', owner: true });
    expect(() => parseArgs(['add', 'A', '--pin=123456'])).toThrow(/không hiểu/i);
  });
  test('rename takes an old and a new name, other commands only one', () => {
    expect(parseArgs(['rename', 'Thử nghiệm', 'Khang'])).toMatchObject({ command: 'rename', name: 'Thử nghiệm', newName: 'Khang' });
    expect(() => parseArgs(['add', 'Bác', 'Khang'])).toThrow(/ngoặc kép/);
  });
});

describe('accounts', () => {
  test('add creates a login, a people row and the list file', async () => {
    await addPerson(ctx(), 'Bác Khang');
    const u = await auth.getUserByEmail('bac-khang@so-cong-dau.invalid');
    const row = (await db.doc(`people/${u.uid}`).get()).data();
    expect(row).toEqual({ name: 'Bác Khang', role: 'worker' });
    expect(read()).toEqual([{ name: 'Bác Khang', email: 'bac-khang@so-cong-dau.invalid' }]);
    const src = readFileSync(peopleListPath, 'utf8');
    expect(src).not.toContain(FAKE_PIN);
    expect(src).not.toContain(u.uid);
  });

  test('list file puts Mẹ Liên first and uses NFC', async () => {
    await addPerson(ctx(), 'Bác Khang'.normalize('NFD'));
    await addPerson(ctx(), 'Mẹ Liên', { owner: true });
    expect(read().map((p) => p.name)).toEqual(['Mẹ Liên', 'Bác Khang']);
    expect((await db.collection('people').where('role', '==', 'owner').get()).size).toBe(1);
  });

  test('a second person can have the same rights as Mẹ Liên with --owner', async () => {
    await addPerson(ctx(), 'Mẹ Liên', { owner: true });
    await addPerson(ctx(), 'Dũng', { owner: true });
    await addPerson(ctx(), 'Ngân');
    expect(await listPeople(ctx())).toEqual([
      { name: 'Mẹ Liên', role: 'owner' }, { name: 'Dũng', role: 'owner' }, { name: 'Ngân', role: 'worker' }]);
    await expect(addPerson(ctx(), 'Mẹ Liên'.normalize('NFD'), { owner: true })).rejects.toThrow(/đã có/);
    expect((await auth.listUsers()).users.length).toBe(3);
  });

  test('rename moves the login to the new name, keeps the person, pin and their old rows', async () => {
    await addPerson(ctx(), 'Mẹ Liên', { owner: true });
    await addPerson(ctx(), 'Thử nghiệm');
    const before = await auth.getUserByEmail('thu-nghiem@so-cong-dau.invalid');
    await db.doc('orders/o1').set({ by: 'Thử nghiệm', total: 5 });
    expect(await renamePerson(ctx(), 'Thử nghiệm', 'Khang')).toEqual({ rows: 1 });
    const after = await auth.getUserByEmail('khang@so-cong-dau.invalid');
    expect(after.uid).toBe(before.uid);
    expect(after.passwordHash).toBe(before.passwordHash);
    expect((await db.doc(`people/${after.uid}`).get()).data()).toEqual({ name: 'Khang', role: 'worker' });
    expect(read()).toEqual([
      { name: 'Mẹ Liên', email: 'me-lien@so-cong-dau.invalid' }, { name: 'Khang', email: 'khang@so-cong-dau.invalid' }]);
    expect((await db.doc('orders/o1').get()).data().by).toBe('Thử nghiệm');
  });

  test('rename refuses Mẹ Liên, an unknown name and a name already taken', async () => {
    await addPerson(ctx(), 'Mẹ Liên', { owner: true });
    await addPerson(ctx(), 'Ngân');
    await addPerson(ctx(), 'Thử nghiệm');
    await expect(renamePerson(ctx(), 'Mẹ Liên', 'Liên')).rejects.toThrow(/Không đổi được/);
    await expect(renamePerson(ctx(), 'Ai Đó', 'Khang')).rejects.toThrow(/không có/i);
    await expect(renamePerson(ctx(), 'Thử nghiệm', 'Ngân')).rejects.toThrow(/đã có/);
    await expect(renamePerson(ctx(), 'Thử nghiệm', 'Ngan')).rejects.toThrow(/trùng/);
    expect((await auth.getUserByEmail('thu-nghiem@so-cong-dau.invalid')).email).toBe('thu-nghiem@so-cong-dau.invalid');
  });

  test('existing name is refused, and a clashing email too', async () => {
    await addPerson(ctx(), 'Bác Khang');
    await expect(addPerson(ctx(), 'Bác Khang')).rejects.toThrow(/đã có/);
    await expect(addPerson(ctx(), 'Bac Khang')).rejects.toThrow(/trùng/);
    expect((await auth.listUsers()).users.length).toBe(1);
  });

  test('bad pin or mismatched pins make nothing', async () => {
    await expect(addPerson(ctx('12345'), 'Bác Khang')).rejects.toThrow(/6 chữ số/);
    let n = 0;
    const askPin = async () => (n++ ? '735061' : '482915');
    await expect(addPerson({ ...ctx(), askPin }, 'Bác Khang')).rejects.toThrow(/không giống/);
    expect((await auth.listUsers()).users.length).toBe(0);
  });

  test('add undoes the login if the people row cannot be written', async () => {
    const broken = new Proxy(db, { get: (t, k) => (k === 'doc' ? () => ({ set: async () => { throw new Error('boom'); } }) : Reflect.get(t, k)) });
    let created = 0;
    const authSpy = new Proxy(auth, { get: (t, k) => (k === 'createUser' ? async (...a) => { created++; return t.createUser(...a); } : Reflect.get(t, k).bind?.(t) ?? Reflect.get(t, k)) });
    await expect(addPerson({ ...ctx(), auth: authSpy, db: broken }, 'Bác Khang')).rejects.toThrow(/Không tạo được/);
    expect(created).toBe(1);
    expect((await auth.listUsers()).users.length).toBe(0);
  });

  test('reset changes the pin and keeps the account', async () => {
    await addPerson(ctx(), 'Bác Khang');
    const before = await auth.getUserByEmail('bac-khang@so-cong-dau.invalid');
    await resetPin(ctx('999000'), 'Bác Khang');
    const after = await auth.getUserByEmail('bac-khang@so-cong-dau.invalid');
    expect(after.uid).toBe(before.uid);
    expect(after.passwordHash).not.toBe(before.passwordHash);
    await expect(resetPin(ctx(), 'Ai Đó')).rejects.toThrow(/không có/i);
  });

  test('remove deletes login and row but keeps their rows of work', async () => {
    await addPerson(ctx(), 'Bác Khang');
    await db.doc('orders/o1').set({ by: 'Bác Khang', total: 5 });
    await removePerson(ctx(), 'Bác Khang');
    expect((await auth.listUsers()).users.length).toBe(0);
    expect((await db.collection('people').get()).size).toBe(0);
    expect((await db.doc('orders/o1').get()).exists).toBe(true);
    expect(read()).toEqual([]);
  });

  test('remove still finishes when the login is already gone', async () => {
    await addPerson(ctx(), 'Bác Khang');
    const u = await auth.getUserByEmail('bac-khang@so-cong-dau.invalid');
    await auth.deleteUser(u.uid);
    await removePerson(ctx(), 'Bác Khang');
    expect((await db.collection('people').get()).size).toBe(0);
  });

  test('remove keeps the people row if the login cannot be deleted', async () => {
    await addPerson(ctx(), 'Bác Khang');
    const failing = new Proxy(auth, { get: (t, k) => (k === 'deleteUser' ? async () => { throw new Error('boom'); } : Reflect.get(t, k).bind(t)) });
    await expect(removePerson({ ...ctx(), auth: failing }, 'Bác Khang')).rejects.toThrow();
    expect((await db.collection('people').get()).size).toBe(1);
  });

  test('remove of the owner needs confirm', async () => {
    await addPerson(ctx(), 'Mẹ Liên', { owner: true });
    await expect(removePerson(ctx(), 'Mẹ Liên')).rejects.toThrow(/--confirm-owner/);
    expect((await auth.listUsers()).users.length).toBe(1);
    await removePerson(ctx(), 'Mẹ Liên', { confirmOwner: true });
    expect((await auth.listUsers()).users.length).toBe(0);
  });

  test('list gives names and roles only', async () => {
    await addPerson(ctx(), 'Mẹ Liên', { owner: true });
    await addPerson(ctx(), 'Bác Khang');
    const out = await listPeople(ctx());
    expect(out).toEqual([{ name: 'Mẹ Liên', role: 'owner' }, { name: 'Bác Khang', role: 'worker' }]);
  });
});
