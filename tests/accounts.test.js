import { describe, test, expect, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initializeApp, getApps, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { emailFor, validPin, cleanName } from '../admin/lib/names.js';
import { addPerson, resetPin, removePerson, listPeople, parseArgs } from '../admin/lib/people.js';

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

  test('owner must be Mẹ Liên, and only one owner', async () => {
    await expect(addPerson(ctx(), 'Bác Khang', { owner: true })).rejects.toThrow(/Mẹ Liên/);
    await addPerson(ctx(), 'Mẹ Liên', { owner: true });
    await expect(addPerson(ctx(), 'Mẹ Liên'.normalize('NFD'), { owner: true })).rejects.toThrow(/đã có/);
    expect((await auth.listUsers()).users.length).toBe(1);
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
    const broken = { ...db, doc: () => ({ set: async () => { throw new Error('boom'); } }) };
    await expect(addPerson({ ...ctx(), db: broken }, 'Bác Khang')).rejects.toThrow();
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
