// Account logic. Kept apart from the command line so tests can call it.
// Nothing in this file ever prints or stores a PIN.
import { writeFileSync } from 'node:fs';
import { cleanName, emailFor, validPin, OWNER_NAME } from './names.js';

export class PlainError extends Error {}

const sortKey = (a, b) =>
  (b.name === OWNER_NAME) - (a.name === OWNER_NAME) || a.name.localeCompare(b.name, 'vi');

export function parseArgs(argv) {
  const [command, ...rest] = argv;
  const out = { command, name: '', owner: false, confirmOwner: false };
  const names = [];
  for (const a of rest) {
    if (a === '--owner') out.owner = true;
    else if (a === '--confirm-owner') out.confirmOwner = true;
    else if (a.startsWith('--')) throw new PlainError(`Không hiểu lựa chọn "${a.split('=')[0]}".`);
    else names.push(a);
  }
  if (names.length > 1) throw new PlainError('Hãy đặt tên trong dấu ngoặc kép, ví dụ "Bác Khang".');
  out.name = cleanName(names[0]);
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
  if (owner && name !== OWNER_NAME) {
    throw new PlainError(`Chỉ ${OWNER_NAME} mới là chủ. Tên phải đúng là "${OWNER_NAME}".`);
  }
  const people = await allPeople(db);
  if (people.some((p) => cleanName(p.name) === name)) throw new PlainError(`"${name}" đã có rồi.`);
  if (owner && people.some((p) => p.role === 'owner')) throw new PlainError('Đã có chủ rồi. Chỉ được có một chủ.');
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
  // Tokens are not revoked: that could sign people out and break offline use.
  await auth.updateUser(person.uid, { password: pin });
}

export async function removePerson(ctx, rawName, { confirmOwner = false } = {}) {
  const { auth, db, peopleListPath } = ctx;
  const name = cleanName(rawName);
  const person = await findByName(db, name);
  if (!person) throw new PlainError(`Không có người tên "${name}".`);
  if (person.role === 'owner' && !confirmOwner) {
    throw new PlainError(`"${name}" là chủ. Nếu thật sự muốn xoá, thêm --confirm-owner vào cuối lệnh.`);
  }
  await db.doc(`people/${person.uid}`).delete();
  try {
    await auth.deleteUser(person.uid);
  } catch (e) {
    if (e.code !== 'auth/user-not-found') throw e;
  }
  await writePeopleList(db, peopleListPath);
}

export async function listPeople({ db }) {
  return (await allPeople(db))
    .map((p) => ({ name: cleanName(p.name), role: p.role }))
    .sort(sortKey);
}
