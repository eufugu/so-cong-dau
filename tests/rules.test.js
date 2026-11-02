import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, test } from 'vitest';

const OWNER = 'Mẹ Liên';
const THANH = 'Bác Khang';
const LAN = 'Lan';
const DATA = ['customers', 'orders', 'payments', 'production', 'purchases', 'batches', 'losses', 'supplierPays'];
const OWN_ROW = ['orders', 'production', 'purchases', 'batches', 'losses'];

let env;
const as = (uid) => env.authenticatedContext(uid).firestore();
const owner = () => as('me');
const khang = () => as('khang');
const lan = () => as('lan');
const ghost = () => as('ghost');
const anon = () => env.unauthenticatedContext().firestore();

async function seed(path, data) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data);
  });
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-so-cong-dau',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await seed('people/me', { name: OWNER, role: 'owner' });
  await seed('people/khang', { name: THANH, role: 'worker' });
  await seed('people/lan', { name: LAN, role: 'worker' });
});

const row = (by, extra = {}) => ({ id: 'r1', by, void: false, createdAt: 1, ...extra });
const pay = (by, extra = {}) => ({
  id: 'p1', amount: 100, customer: 'A', customerId: 'c1', date: '2026-11-02', method: 'cash',
  holder: 'Chưa ghi', handed: false, handedDate: '', handedBy: '', alloc: [], note: '',
  by, void: false, voidBy: '', createdAt: 1, ...extra,
});

describe('signed out and unknown users', () => {
  test.each([...DATA, 'people', 'settings'])('not signed in cannot read or write %s', async (c) => {
    await seed(`${c}/x`, row(THANH));
    await assertFails(getDoc(doc(anon(), `${c}/x`)));
    await assertFails(setDoc(doc(anon(), `${c}/y`), row(THANH)));
    await assertFails(deleteDoc(doc(anon(), `${c}/x`)));
  });

  test('a signed-in user with no people row cannot read or write', async () => {
    await seed('orders/x', row(THANH));
    await assertFails(getDoc(doc(ghost(), 'orders/x')));
    await assertFails(getDoc(doc(ghost(), 'people/me')));
    await assertFails(setDoc(doc(ghost(), 'orders/y'), row('ghost')));
  });
});

describe('reading and people', () => {
  test.each([...DATA, 'people'])('worker can read %s', async (c) => {
    await seed(`${c}/x`, row(LAN));
    await assertSucceeds(getDoc(doc(khang(), `${c}/x`)));
  });

  test('owner can read people', async () => {
    await assertSucceeds(getDoc(doc(owner(), 'people/khang')));
  });

  test('worker cannot write people, including own role', async () => {
    await assertFails(updateDoc(doc(khang(), 'people/khang'), { role: 'owner' }));
    await assertFails(setDoc(doc(khang(), 'people/new'), { name: 'X', role: 'worker' }));
    await assertFails(deleteDoc(doc(khang(), 'people/khang')));
  });

  test('owner cannot write people', async () => {
    await assertFails(setDoc(doc(owner(), 'people/new'), { name: 'X', role: 'worker' }));
    await assertFails(updateDoc(doc(owner(), 'people/khang'), { role: 'owner' }));
    await assertFails(deleteDoc(doc(owner(), 'people/khang')));
  });

  test('settings is denied to everyone, even the owner', async () => {
    await assertFails(setDoc(doc(owner(), 'settings/x'), { a: 1 }));
    await assertFails(getDoc(doc(owner(), 'settings/x')));
    await assertFails(getDoc(doc(khang(), 'settings/x')));
  });

  test('an unknown collection is denied', async () => {
    await assertFails(setDoc(doc(owner(), 'other/x'), { a: 1 }));
  });
});

describe('worker creates', () => {
  test.each([...OWN_ROW, 'payments'])('worker can create %s with by = own name', async (c) => {
    const data = c === 'payments' ? pay(THANH) : row(THANH);
    await assertSucceeds(setDoc(doc(khang(), `${c}/n`), data));
  });

  test.each([...OWN_ROW, 'payments'])('worker cannot create %s with by = the owner', async (c) => {
    const data = c === 'payments' ? pay(OWNER) : row(OWNER);
    await assertFails(setDoc(doc(khang(), `${c}/n`), data));
  });

  test('worker cannot create with another worker as by', async () => {
    await assertFails(setDoc(doc(khang(), 'orders/n'), row(LAN)));
  });

  test('worker cannot create with no by', async () => {
    await assertFails(setDoc(doc(khang(), 'orders/n'), { id: 'n', void: false }));
  });

  test('worker cannot create with by in NFD form', async () => {
    await assertFails(setDoc(doc(khang(), 'orders/n'), row(THANH.normalize('NFD'))));
  });

  test('worker create into supplierPays is refused', async () => {
    await assertFails(setDoc(doc(khang(), 'supplierPays/n'), row(THANH)));
  });
});

describe('worker void and delete on own rows', () => {
  test('worker can void own production row and undo it', async () => {
    await seed('production/r', row(LAN, { cartons: 5 }));
    await assertSucceeds(updateDoc(doc(lan(), 'production/r'), { void: true, voidBy: LAN }));
    await assertSucceeds(updateDoc(doc(lan(), 'production/r'), { void: false }));
  });

  test('worker cannot change cartons on own production row', async () => {
    await seed('production/r', row(LAN, { cartons: 5 }));
    await assertFails(updateDoc(doc(lan(), 'production/r'), { cartons: 6 }));
    await assertFails(updateDoc(doc(lan(), 'production/r'), { void: true, cartons: 6 }));
  });

  test.each(OWN_ROW)('worker can void and delete own %s row', async (c) => {
    await seed(`${c}/r`, row(LAN));
    await assertSucceeds(updateDoc(doc(lan(), `${c}/r`), { void: true, voidBy: LAN }));
    await assertSucceeds(deleteDoc(doc(lan(), `${c}/r`)));
  });

  test.each(OWN_ROW)('worker cannot void or delete another worker row in %s', async (c) => {
    await seed(`${c}/r`, row(THANH));
    await assertFails(updateDoc(doc(lan(), `${c}/r`), { void: true, voidBy: LAN }));
    await assertFails(deleteDoc(doc(lan(), `${c}/r`)));
  });

  test('worker cannot void or delete an Excel row', async () => {
    await seed('orders/r', row('Excel'));
    await assertFails(updateDoc(doc(lan(), 'orders/r'), { void: true }));
    await assertFails(deleteDoc(doc(lan(), 'orders/r')));
  });

  test('worker cannot void or delete a row that has no by', async () => {
    await seed('orders/r', { id: 'r', void: false });
    await assertFails(updateDoc(doc(lan(), 'orders/r'), { void: true }));
    await assertFails(deleteDoc(doc(lan(), 'orders/r')));
  });

  test('worker can delete own orders row', async () => {
    await seed('orders/r', row(LAN));
    await assertSucceeds(deleteDoc(doc(lan(), 'orders/r')));
  });

  test('worker cannot change status on any order', async () => {
    await seed('orders/r', row(LAN, { status: 'ok' }));
    await assertFails(updateDoc(doc(lan(), 'orders/r'), { status: 'cancelled' }));
    await seed('orders/o', row(THANH, { status: 'ok' }));
    await assertFails(updateDoc(doc(lan(), 'orders/o'), { status: 'cancelled' }));
  });
});

describe('worker payments', () => {
  test('create with Tài khoản Mẹ and handed true is allowed', async () => {
    await assertSucceeds(setDoc(doc(khang(), 'payments/n'), pay(THANH, { holder: 'Tài khoản Mẹ', handed: true })));
  });

  test('create with Mẹ Liên and handed true is refused', async () => {
    await assertFails(setDoc(doc(khang(), 'payments/n'), pay(THANH, { holder: OWNER, handed: true })));
  });

  test('create with Mẹ Liên and handed false is allowed', async () => {
    await assertSucceeds(setDoc(doc(khang(), 'payments/n'), pay(THANH, { holder: OWNER, handed: false })));
  });

  test('create without a handed field is allowed', async () => {
    const { handed, ...rest } = pay(THANH);
    await assertSucceeds(setDoc(doc(khang(), 'payments/n'), rest));
  });

  test('create that sets handedBy or alloc is refused', async () => {
    await assertFails(setDoc(doc(khang(), 'payments/n'), pay(THANH, { handedBy: OWNER })));
    await assertFails(setDoc(doc(khang(), 'payments/n'), pay(THANH, { alloc: [{ date: 'd', amount: 1 }] })));
  });

  test('create with void true is refused', async () => {
    await assertFails(setDoc(doc(khang(), 'payments/n'), pay(THANH, { void: true })));
  });

  test('cannot set handed true on an existing payment', async () => {
    await seed('payments/p', pay(THANH));
    await assertFails(updateDoc(doc(khang(), 'payments/p'), { handed: true }));
    await assertFails(updateDoc(doc(lan(), 'payments/p'), { handed: true, handedBy: LAN }));
  });

  test('claim and undo on another persons unhanded payment', async () => {
    await seed('payments/p', pay(THANH));
    await assertSucceeds(updateDoc(doc(lan(), 'payments/p'), { holder: LAN }));
    await assertSucceeds(updateDoc(doc(lan(), 'payments/p'), { holder: 'Chưa ghi' }));
  });

  test('claim is refused when the payment is handed', async () => {
    await seed('payments/p', pay(THANH, { handed: true }));
    await assertFails(updateDoc(doc(lan(), 'payments/p'), { holder: LAN }));
  });

  test('cannot change holder to another persons name', async () => {
    await seed('payments/p', pay(THANH));
    await assertFails(updateDoc(doc(lan(), 'payments/p'), { holder: THANH }));
  });

  test('cannot change holder when it is neither Chưa ghi nor own name', async () => {
    await seed('payments/p', pay(THANH, { holder: THANH }));
    await assertFails(updateDoc(doc(lan(), 'payments/p'), { holder: LAN }));
    await assertFails(updateDoc(doc(lan(), 'payments/p'), { holder: 'Chưa ghi' }));
    await seed('payments/q', pay(THANH, { holder: OWNER }));
    await assertFails(updateDoc(doc(lan(), 'payments/q'), { holder: 'Chưa ghi' }));
  });

  test('claim cannot carry another field', async () => {
    await seed('payments/p', pay(THANH));
    await assertFails(updateDoc(doc(lan(), 'payments/p'), { holder: LAN, amount: 1 }));
  });

  test('can delete own payment with no handedBy', async () => {
    await seed('payments/p', pay(LAN));
    await assertSucceeds(deleteDoc(doc(lan(), 'payments/p')));
  });

  test('can delete own payment when handedBy is absent', async () => {
    const { handedBy, ...rest } = pay(LAN);
    await seed('payments/p', rest);
    await assertSucceeds(deleteDoc(doc(lan(), 'payments/p')));
  });

  test('cannot delete own payment with handedBy set', async () => {
    await seed('payments/p', pay(LAN, { handed: true, handedBy: OWNER }));
    await assertFails(deleteDoc(doc(lan(), 'payments/p')));
  });

  test('cannot delete another persons payment', async () => {
    await seed('payments/p', pay(THANH));
    await assertFails(deleteDoc(doc(lan(), 'payments/p')));
  });

  test('cannot delete an Excel payment', async () => {
    await seed('payments/p', pay('Excel'));
    await assertFails(deleteDoc(doc(lan(), 'payments/p')));
  });

  test('cannot set void or alloc on any payment, even own', async () => {
    await seed('payments/p', pay(LAN));
    await assertFails(updateDoc(doc(lan(), 'payments/p'), { void: true, voidBy: LAN }));
    await assertFails(updateDoc(doc(lan(), 'payments/p'), { alloc: [{ date: 'd', amount: 1 }] }));
  });
});

describe('customerId backfill', () => {
  test.each(['orders', 'payments'])('worker can add a missing customerId to %s', async (c) => {
    const { customerId, ...rest } = pay(THANH);
    await seed(`${c}/r`, rest);
    await assertSucceeds(updateDoc(doc(lan(), `${c}/r`), { customerId: 'c9' }));
  });

  test('worker can fill a null customerId on an Excel row', async () => {
    await seed('orders/r', row('Excel', { customerId: null }));
    await assertSucceeds(updateDoc(doc(lan(), 'orders/r'), { customerId: 'c9' }));
  });

  test.each(['orders', 'payments'])('worker cannot change an existing customerId on %s', async (c) => {
    await seed(`${c}/r`, pay(THANH, { customerId: 'c1' }));
    await assertFails(updateDoc(doc(lan(), `${c}/r`), { customerId: 'c9' }));
  });

  test.each(['orders', 'payments'])('worker cannot add customerId together with another field on %s', async (c) => {
    const { customerId, ...rest } = pay(THANH);
    await seed(`${c}/r`, rest);
    await assertFails(updateDoc(doc(lan(), `${c}/r`), { customerId: 'c9', amount: 5 }));
  });

  test('backfill is not allowed on other collections', async () => {
    await seed('production/r', row(THANH));
    await assertFails(updateDoc(doc(lan(), 'production/r'), { customerId: 'c9' }));
  });
});

describe('customers and supplierPays', () => {
  test('worker can create and update customers', async () => {
    await assertSucceeds(setDoc(doc(khang(), 'customers/c1'), { id: 'c1', name: 'A', phone: '1' }));
    await assertSucceeds(updateDoc(doc(lan(), 'customers/c1'), { name: 'B', phone: '2', address: 'x' }));
  });

  test('worker can update a customer that has no by', async () => {
    await seed('customers/c2', { id: 'c2', name: 'A' });
    await assertSucceeds(updateDoc(doc(lan(), 'customers/c2'), { phone: '3' }));
  });

  test('worker cannot delete customers', async () => {
    await seed('customers/c1', { id: 'c1', name: 'A' });
    await assertFails(deleteDoc(doc(khang(), 'customers/c1')));
  });

  test('worker cannot write supplierPays', async () => {
    await assertFails(setDoc(doc(khang(), 'supplierPays/s'), { id: 's', amount: 1, by: THANH }));
    await seed('supplierPays/t', { id: 't', amount: 1, by: THANH });
    await assertFails(updateDoc(doc(khang(), 'supplierPays/t'), { amount: 2 }));
    await assertFails(deleteDoc(doc(khang(), 'supplierPays/t')));
  });
});

describe('owner', () => {
  test('owner can confirm money, set alloc, void a payment', async () => {
    await seed('payments/p', pay(THANH));
    await assertSucceeds(updateDoc(doc(owner(), 'payments/p'), { handed: true, handedDate: 'd', handedBy: OWNER }));
    await assertSucceeds(updateDoc(doc(owner(), 'payments/p'), { alloc: [{ date: 'd', amount: 1 }] }));
    await assertSucceeds(updateDoc(doc(owner(), 'payments/p'), { void: true, voidBy: OWNER }));
  });

  test('owner can cancel a bill', async () => {
    await seed('orders/o', row(THANH, { status: 'ok' }));
    await assertSucceeds(updateDoc(doc(owner(), 'orders/o'), { status: 'cancelled' }));
  });

  test('owner can write supplierPays', async () => {
    await assertSucceeds(setDoc(doc(owner(), 'supplierPays/s'), { id: 's', amount: 1 }));
  });

  test.each(DATA)('owner can create, edit and delete any row in %s', async (c) => {
    await seed(`${c}/x`, row('Excel'));
    await assertSucceeds(updateDoc(doc(owner(), `${c}/x`), { note: 'edited' }));
    await assertSucceeds(setDoc(doc(owner(), `${c}/y`), row(THANH)));
    await assertSucceeds(deleteDoc(doc(owner(), `${c}/x`)));
  });

  test('owner can delete a payment confirmed earlier', async () => {
    await seed('payments/p', pay(THANH, { handed: true, handedBy: OWNER }));
    await assertSucceeds(deleteDoc(doc(owner(), 'payments/p')));
  });
});
