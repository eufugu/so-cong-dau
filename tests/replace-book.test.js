import { test, expect, beforeEach, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initializeApp, getApps, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { COLLECTIONS, checkBook, readBook, replaceBook } from '../admin/lib/book.js';

process.env.METADATA_SERVER_DETECTION = 'none'; // no cloud lookup in tests
const app = getApps()[0] || initializeApp({ projectId: 'demo-so-cong-dau' });
const db = getFirestore(app);
const dir = mkdtempSync(join(tmpdir(), 'book-'));
const empty = () => Object.fromEntries(COLLECTIONS.map((c) => [c, []]));
const book = () => ({ ...empty(), customers: [{ id: 'k-1', name: 'Cậu Minh', phone: '', address: '', note: '' }], orders: [{ id: 'x-ord-1', customer: 'Cậu Minh', customerId: 'k-1', cartons: 2, price: 360000, by: 'Excel', void: false }] });

beforeEach(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST || (process.env.GCLOUD_PROJECT || app.options.projectId) !== 'demo-so-cong-dau') {
    throw new Error('Refusing to wipe data: not running against the emulators for demo-so-cong-dau.');
  }
  for (const c of [...COLLECTIONS, 'people']) {
    const s = await db.collection(c).get();
    await Promise.all(s.docs.map((d) => d.ref.delete()));
  }
});
afterAll(async () => { rmSync(dir, { recursive: true, force: true }); await deleteApp(app); });

test('old rows go, new rows arrive, accounts stay', async () => {
  await db.collection('orders').doc('cu').set({ customer: 'Cũ', cartons: 9 });
  await db.collection('payments').doc('cu').set({ amount: 1 });
  await db.collection('people').doc('me').set({ name: 'Mẹ Liên', role: 'owner' });
  await replaceBook(db, book());
  const after = await readBook(db);
  expect(after.orders.map((o) => o.id)).toEqual(['x-ord-1']);
  expect(after.payments).toEqual([]);
  expect(after.customers[0].name).toBe('Cậu Minh');
  expect((await db.collection('people').doc('me').get()).data().role).toBe('owner');
});

test('a backup of the book restores it exactly', async () => {
  await replaceBook(db, book());
  const saved = await readBook(db);
  await replaceBook(db, empty());
  expect((await readBook(db)).orders).toEqual([]);
  await replaceBook(db, saved);
  expect(await readBook(db)).toEqual(saved);
});

test('a bad file is refused before anything is touched', async () => {
  await db.collection('orders').doc('cu').set({ cartons: 9 });
  await expect(replaceBook(db, { ...empty(), orders: [{ cartons: 1 }] })).rejects.toThrow('không có mã');
  await expect(replaceBook(db, { ...empty(), orders: [{ id: 'a' }, { id: 'a' }] })).rejects.toThrow('trùng mã');
  expect(() => checkBook({ rows: { ...empty(), people: [] } })).toThrow('mục lạ');
  expect(() => checkBook({})).toThrow('rows');
  expect((await readBook(db)).orders.map((o) => o.id)).toEqual(['cu']);
});

test('the live book cannot be replaced without someone typing in a real terminal', () => {
  const file = join(dir, 'book.json');
  writeFileSync(file, JSON.stringify({ rows: book() }));
  const env = { ...process.env };
  delete env.FIRESTORE_EMULATOR_HOST;
  const run = spawnSync(process.execPath, ['admin/replace-book.js', file], { env, input: 'THAY SO\n', encoding: 'utf8' });
  expect(run.status).toBe(1);
  expect(run.stderr).toContain('Sổ chưa bị đụng tới');
});
