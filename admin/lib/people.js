// Account logic. Kept apart from the command line so tests can call it.
// Nothing in this file ever prints or stores a PIN.
import { writeFileSync } from 'node:fs';
import { cleanName, emailFor, validPin, OWNER_NAME } from './names.js';
import { COLLECTIONS } from './book.js';

export class PlainError extends Error {}

const sortKey = (a, b) =>
  (b.name === OWNER_NAME) - (a.name === OWNER_NAME) || a.name.localeCompare(b.name, 'vi');

export function parseArgs(argv) {
  const [command, ...rest] = argv;
  const out = { command, name: '', newName: '', owner: false, confirmOwner: false };
  const names = [];
  for (const a of rest) {
    if (a === '--owner') out.owner = true;
    else if (a === '--confirm-owner') out.confirmOwner = true;
    else if (a.startsWith('--')) throw new PlainError(`Không hiểu lựa chọn "${a.split('=')[0]}".`);
    else names.push(a);
  }
  if (names.length > (command === 'rename' ? 2 : 1)) throw new PlainError('Hãy đặt tên trong dấu ngoặc kép, ví dụ "Bác Khang".');
  out.name = cleanName(names[0]);
  out.newName = cleanName(names[1]);
  return out;
}

async function allPeople(db) {
  const snap = await db.collection('people').get();
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
}

async function findByName(db, name) {
  return (await allPeople(db)).find((p) => cleanName(p.name) === name) || null;
}

export async function writePeopleList(db, peopleListPath) {
  const list = (await allPeople(db))
    .map((p) => ({ name: cleanName(p.name), email: emailFor(p.name) }))
    .sort(sortKey);
  const text =
    '// File này do công cụ tài khoản tạo ra. Đừng sửa tay.\n' +
    `window.SO_PEOPLE = ${JSON.stringify(list, null, 2)};\n`;
  writeFileSync(peopleListPath, text, 'utf8');
}

async function askNewPin({ askPin }) {
  const pin = await askPin('Nhập mã PIN 6 chữ số: ');
  if (!validPin(pin)) throw new PlainError('Mã PIN phải đúng 6 chữ số.');
  const again = await askPin('Nhập lại mã PIN: ');
  if (again !== pin) throw new PlainError('Hai lần nhập không giống nhau. Chưa có gì được thay đổi.');
  return pin;
}

export async function addPerson(ctx, rawName, { owner = false } = {}) {
  const { auth, db, peopleListPath } = ctx;
  const name = cleanName(rawName);
  if (!name) throw new PlainError('Thiếu tên. Ví dụ: add "Bác Khang"');
  const email = emailFor(name);
  if (!/^[a-z0-9-]+@/.test(email) || email.startsWith('@')) {
    throw new PlainError('Tên này không dùng được. Hãy dùng chữ cái hoặc số.');
  }
  const people = await allPeople(db);
  if (people.some((p) => cleanName(p.name) === name)) throw new PlainError(`"${name}" đã có rồi.`);
  if (people.some((p) => emailFor(p.name) === email)) {
    throw new PlainError(`Tên này trùng đăng nhập với một người khác. Hãy đổi tên một chút.`);
  }
  const pin = await askNewPin(ctx);
  let user;
  try {
    user = await auth.createUser({ email, password: pin });
  } catch (e) {
    if (e.code === 'auth/email-already-exists') {
      throw new PlainError('Tên này trùng đăng nhập với một người khác. Hãy đổi tên một chút.');
    }
    throw e;
  }
  try {
    await db.doc(`people/${user.uid}`).set({ name, role: owner ? 'owner' : 'worker' });
  } catch (e) {
    try { await auth.deleteUser(user.uid); } catch { /* best effort */ }
    throw new PlainError('Không tạo được tài khoản. Chưa có gì được lưu, hãy thử lại.');
  }
  await writePeopleList(db, peopleListPath);
}

export async function resetPin(ctx, rawName) {
  const { auth, db } = ctx;
  const name = cleanName(rawName);
  const person = await findByName(db, name);
  if (!person) throw new PlainError(`Không có người tên "${name}".`);
  const pin = await askNewPin(ctx);
  // Firebase itself revokes refresh tokens when a password changes, so the person's other devices must sign in again with the new PIN.
  await auth.updateUser(person.uid, { password: pin });
}

// Đổi tên: đổi cả tên đăng nhập, giữ nguyên người đó và mã PIN.
// Các dòng đã ghi trong sổ vẫn mang tên cũ; trả về số dòng như vậy để báo cho người chạy lệnh.
export async function renamePerson(ctx, rawFrom, rawTo) {
  const { auth, db, peopleListPath } = ctx;
  const from = cleanName(rawFrom), to = cleanName(rawTo);
  if (!from || !to) throw new PlainError('Thiếu tên. Ví dụ: rename "Thử nghiệm" "Khang"');
  if (from === OWNER_NAME) throw new PlainError(`Không đổi được tên "${OWNER_NAME}": sổ tiền so theo đúng tên này.`);
  const people = await allPeople(db);
  const person = people.find((p) => cleanName(p.name) === from);
  if (!person) throw new PlainError(`Không có người tên "${from}".`);
  const email = emailFor(to);
  if (!/^[a-z0-9-]+@/.test(email)) throw new PlainError('Tên mới không dùng được. Hãy dùng chữ cái hoặc số.');
  if (people.some((p) => cleanName(p.name) === to)) throw new PlainError(`"${to}" đã có rồi.`);
  if (people.some((p) => p.uid !== person.uid && emailFor(p.name) === email)) {
    throw new PlainError('Tên mới trùng đăng nhập với một người khác. Hãy đổi tên một chút.');
  }
  const oldEmail = (await auth.getUser(person.uid)).email;
  try {
    await auth.updateUser(person.uid, { email });
  } catch (e) {
    if (e.code === 'auth/email-already-exists') throw new PlainError('Tên mới trùng đăng nhập với một người khác. Hãy đổi tên một chút.');
    throw e;
  }
  try {
    await db.doc(`people/${person.uid}`).update({ name: to });
  } catch (e) {
    try { await auth.updateUser(person.uid, { email: oldEmail }); } catch { /* best effort */ }
    throw new PlainError('Không đổi được tên. Chưa có gì thay đổi, hãy thử lại.');
  }
  await writePeopleList(db, peopleListPath);
  const old = new Set();
  for (const c of COLLECTIONS) {
    for (const field of c === 'payments' ? ['by', 'holder'] : ['by']) {
      (await db.collection(c).where(field, '==', from).get()).docs.forEach((d) => old.add(`${c}/${d.id}`));
    }
  }
  return { rows: old.size };
}

export async function removePerson(ctx, rawName, { confirmOwner = false } = {}) {
  const { auth, db, peopleListPath } = ctx;
  const name = cleanName(rawName);
  const person = await findByName(db, name);
  if (!person) throw new PlainError(`Không có người tên "${name}".`);
  if (person.role === 'owner' && !confirmOwner) {
    throw new PlainError(`"${name}" là chủ. Nếu thật sự muốn xoá, thêm --confirm-owner vào cuối lệnh.`);
  }
  try {
    await auth.deleteUser(person.uid);
  } catch (e) {
    if (e.code !== 'auth/user-not-found') throw e;
  }
  await db.doc(`people/${person.uid}`).delete();
  await writePeopleList(db, peopleListPath);
}

export async function listPeople({ db }) {
  return (await allPeople(db))
    .map((p) => ({ name: cleanName(p.name), role: p.role }))
    .sort(sortKey);
}
