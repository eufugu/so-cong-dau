// Trợ giúp cho các bài thử trên trình duyệt: dựng tài khoản thử trong emulator.
// Mã PIN ở đây là PIN giả, chỉ dùng với emulator.
import { emailFor } from '../../admin/lib/names.js';

const PROJECT = 'demo-so-cong-dau';
const AUTH = 'http://127.0.0.1:9099';
const STORE = 'http://127.0.0.1:8080';

export const OWNER = { name: 'Mẹ Liên', shown: 'Liên', pin: '482915', role: 'owner' };
export const WORKER = { name: 'Bác Khang', pin: '735061', role: 'worker' };

export async function clearAll() {
  await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
  await fetch(`${STORE}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
}

// Tạo tài khoản đăng nhập; có role thì tạo cả dòng people (chưa có role = chưa được cấp quyền)
export async function addAccount({ name, pin, role }) {
  const res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: emailFor(name), password: pin, returnSecureToken: false }),
  });
  const { localId } = await res.json();
  if (role) {
    await fetch(`${STORE}/v1/projects/${PROJECT}/databases/(default)/documents/people/${localId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: 'Bearer owner' },
      body: JSON.stringify({ fields: { name: { stringValue: name }, role: { stringValue: role } } }),
    });
  }
  return localId;
}

// Cho trang nhận danh sách tên này thay vì file people-list.js đã lưu
export async function givePeople(page, people) {
  const list = people.map((p) => ({ name: p.name, email: emailFor(p.name) }));
  await page.route('**/people-list.js', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: `window.SO_PEOPLE = ${JSON.stringify(list)};` }));
}

export async function signInAs(page, person) {
  await page.goto('/');
  await page.getByRole('button', { name: person.shown || person.name }).click();
  await page.getByLabel('Mã PIN').fill(person.pin);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
}

export const WORKER2 = { name: 'Chú Tư', pin: '619248', role: 'worker' };

// Đổi giá trị JS thành dạng của Firestore REST
function enc(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
}
function dec(f) {
  if ('stringValue' in f) return f.stringValue;
  if ('booleanValue' in f) return f.booleanValue;
  if ('integerValue' in f) return Number(f.integerValue);
  if ('doubleValue' in f) return f.doubleValue;
  if ('arrayValue' in f) return (f.arrayValue.values || []).map(dec);
  if ('mapValue' in f) return Object.fromEntries(Object.entries(f.mapValue.fields || {}).map(([k, x]) => [k, dec(x)]));
  return null;
}

const DOCS = `${STORE}/v1/projects/${PROJECT}/databases/(default)/documents`;
const ADMIN = { 'content-type': 'application/json', authorization: 'Bearer owner' };

// Ghi thẳng một dòng vào emulator (bỏ qua luật), để dựng dữ liệu có sẵn
export async function putDoc(coll, id, data) {
  const res = await fetch(`${DOCS}/${coll}/${id}`, {
    method: 'PATCH', headers: ADMIN, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, enc(v)])) }),
  });
  if (!res.ok) throw new Error(`putDoc ${coll}/${id}: ${res.status}`);
}

// Đọc các dòng đang có trên "máy chủ" emulator
export async function getDocs(coll) {
  const res = await fetch(`${DOCS}/${coll}?pageSize=300`, { headers: ADMIN });
  const j = await res.json();
  return (j.documents || []).map((d) => ({ id: d.name.split('/').pop(), ...Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, dec(v)])) }));
}
