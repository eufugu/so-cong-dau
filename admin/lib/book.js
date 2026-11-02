// Thay toàn bộ dòng của sổ chung. Tách khỏi dòng lệnh để bài thử gọi được.
// Chỉ đụng tới các mục dưới đây: tài khoản (people) không bao giờ bị xoá.
import { PlainError } from './people.js';

export const COLLECTIONS = ['customers', 'orders', 'payments', 'production', 'purchases', 'batches', 'losses', 'supplierPays'];
const BATCH = 400;

export function checkBook(book) {
  const rows = book && book.rows;
  if (!rows || typeof rows !== 'object') throw new PlainError('File này không phải file sổ: thiếu phần "rows".');
  const extra = Object.keys(rows).filter((c) => !COLLECTIONS.includes(c));
  if (extra.length) throw new PlainError(`File có mục lạ, không nạp: ${extra.join(', ')}.`);
  for (const c of COLLECTIONS) {
    if (!Array.isArray(rows[c])) throw new PlainError(`File thiếu mục "${c}".`);
    const ids = rows[c].map((r) => r.id);
    if (ids.some((id) => typeof id !== 'string' || !id)) throw new PlainError(`Mục "${c}" có dòng không có mã.`);
    if (new Set(ids).size !== ids.length) throw new PlainError(`Mục "${c}" có hai dòng trùng mã.`);
  }
  return rows;
}

export async function readBook(db) {
  const rows = {};
  for (const c of COLLECTIONS) {
    const snap = await db.collection(c).get();
    rows[c] = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
  }
  return rows;
}

export const counts = (rows) => Object.fromEntries(COLLECTIONS.map((c) => [c, rows[c].length]));

async function inBatches(db, items, apply) {
  for (let i = 0; i < items.length; i += BATCH) {
    const batch = db.batch();
    items.slice(i, i + BATCH).forEach((item) => apply(batch, item));
    await batch.commit();
  }
}

// So sánh không phụ thuộc thứ tự cột hay thứ tự dòng
const stable = (v) => (Array.isArray(v) ? v.map(stable)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, stable(v[k])])) : v);
const fingerprint = (rows) => JSON.stringify(COLLECTIONS.map((c) => [c, [...rows[c]].sort((a, b) => a.id.localeCompare(b.id)).map(stable)]));

// Xoá các dòng cũ, ghi các dòng mới, rồi đọc lại để chắc chắn đúng từng dòng
export async function replaceBook(db, rows) {
  checkBook({ rows });
  for (const c of COLLECTIONS) {
    const snap = await db.collection(c).get();
    await inBatches(db, snap.docs, (b, d) => b.delete(d.ref));
  }
  for (const c of COLLECTIONS) {
    await inBatches(db, rows[c], (b, r) => b.set(db.collection(c).doc(r.id), r));
  }
  const back = await readBook(db);
  if (fingerprint(back) !== fingerprint(rows)) throw new PlainError('Đọc lại thấy sổ không khớp với file.');
  return back;
}
