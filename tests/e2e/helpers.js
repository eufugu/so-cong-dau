// Trợ giúp cho các bài thử trên trình duyệt: dựng tài khoản thử trong emulator.
// Mã PIN ở đây là PIN giả, chỉ dùng với emulator.
import { emailFor } from '../../admin/lib/names.js';

const PROJECT = 'demo-so-cong-dau';
const AUTH = 'http://127.0.0.1:9099';
const STORE = 'http://127.0.0.1:8080';

export const OWNER = { name: 'Mẹ Liên', pin: '482915', role: 'owner' };
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
  await page.getByRole('button', { name: person.name }).click();
  await page.getByLabel('Mã PIN').fill(person.pin);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
}
