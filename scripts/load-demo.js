// Loads the demo book into the local Firebase emulators, so the app can be tried without a real project.
// Start the emulators first (npm run demo), then in a second terminal: npm run demo:load
// Only talks to 127.0.0.1. It never touches a real Firebase project.
import { readFileSync } from 'node:fs';
import { emailFor, OWNER_NAME } from '../admin/lib/names.js';

const PROJECT = 'demo-so-cong-dau';
const AUTH = 'http://127.0.0.1:9099';
const DOCS = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const ADMIN = { 'content-type': 'application/json', authorization: 'Bearer owner' };
const PINS = { owner: '264803', worker: '917452' };

const load = (file, name) => { const window = {}; new Function('window', readFileSync(file, 'utf8'))(window); return window[name]; };
const SEED = load('app/seed.js', 'SEED');
const PEOPLE = load('app/people-list.js', 'SO_PEOPLE');
const PRODUCER = 'Khang'; // the demo's producer: logs production and collects cash on delivery

// Move every date so the seed's last day becomes today: the demo always looks in use
const day = (d) => d.toISOString().slice(0, 10);
const today = new Date(day(new Date()) + 'T00:00:00Z');
const last = new Date(SEED.orders.map((o) => o.date).sort().pop() + 'T00:00:00Z');
const shiftDays = Math.round((today - last) / 86400000);
const shift = (d) => { if (!d) return d; const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + shiftDays); return day(t); };
const daysAgo = (n) => { const t = new Date(today); t.setUTCDate(t.getUTCDate() - n); return day(t); };

function enc(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
}
async function put(coll, id, data) {
  const res = await fetch(`${DOCS}/${coll}/${encodeURIComponent(id)}`, {
    method: 'PATCH', headers: ADMIN, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, enc(v)])) }),
  });
  if (!res.ok) throw new Error(`${coll}/${id}: ${res.status} ${await res.text()}`);
}

async function main() {
  try { await fetch(`${AUTH}/`); } catch { throw new Error('The emulators are not running. Start them first with: npm run demo'); }
  await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
  await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });

  for (const p of PEOPLE) {
    const role = p.name === OWNER_NAME ? 'owner' : 'worker';
    const res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: emailFor(p.name), password: PINS[role], returnSecureToken: false }),
    });
    const { localId } = await res.json();
    await put('people', localId, { name: p.name, role });
  }

  const isCandle = (code) => (SEED.products.find((p) => p.code === code) || {}).group === 'Nến';
  const customers = SEED.customers.map((c, i) => ({ id: 'k-' + (i + 1), ...c, by: 'Excel', void: false }));
  const idOf = (name) => customers.find((c) => c.name === name).id;
  for (const c of customers) await put('customers', c.id, c);

  for (const [i, o] of SEED.orders.entries()) {
    await put('orders', 'x-ord-' + (i + 1), { ...o, id: 'x-ord-' + (i + 1), date: shift(o.date), deliver: shift(o.deliver), customerId: idOf(o.customer), color: isCandle(o.product) ? '' : o.color, by: OWNER_NAME, void: false });
  }

  const pays = SEED.cash.filter((c) => c.type === 'Thu tiền khách').map((c) => {
    const ck = /chuyển khoản/i.test(c.note);
    return { date: shift(c.date), customer: c.name, amount: c.inAmt, method: ck ? 'CK' : 'TM', holder: ck ? 'Tài khoản Mẹ' : OWNER_NAME, handed: true, handedDate: shift(c.date), note: c.note, by: OWNER_NAME };
  });
  // Cash the producer collected on delivery and has not handed over yet
  pays.push({ date: daysAgo(1), customer: 'Hà Cầu Mới', amount: 6000000, method: 'TM', holder: PRODUCER, handed: false, handedDate: null, note: '', by: PRODUCER });
  pays.push({ date: daysAgo(0), customer: 'Em Mai', amount: 2500000, method: 'TM', holder: PRODUCER, handed: false, handedDate: null, note: '', by: PRODUCER });
  for (const [i, p] of pays.entries()) await put('payments', 'x-pay-' + (i + 1), { ...p, id: 'x-pay-' + (i + 1), customerId: idOf(p.customer), void: false });

  for (const [i, c] of SEED.cash.filter((c) => c.type === 'Trả nhà phân phối').entries()) {
    await put('supplierPays', 'x-tra-' + (i + 1), { id: 'x-tra-' + (i + 1), date: shift(c.date), supplier: c.name, amount: c.outAmt, method: 'CK', note: c.note, by: OWNER_NAME, void: false });
  }
  for (const [i, p] of SEED.production.entries()) {
    await put('production', 'x-sx-' + (i + 1), { ...p, id: 'x-sx-' + (i + 1), date: shift(p.date), color: isCandle(p.product) ? '' : p.color, by: PRODUCER, void: false });
  }
  await put('production', 'x-sx-today', { id: 'x-sx-today', date: daysAgo(0), product: 'DAU-0.8', color: 'Vàng', cartons: 24, note: '', by: PRODUCER, void: false });
  for (const [i, x] of SEED.purchases.entries()) await put('purchases', 'x-nhap-' + (i + 1), { ...x, id: 'x-nhap-' + (i + 1), date: shift(x.date) });
  for (const b of SEED.batches) await put('batches', b.code, { ...b, id: b.code, date: shift(b.date) });

  console.log('Demo book loaded. Open http://127.0.0.1:5000');
  for (const p of PEOPLE) console.log(`  ${p.name.padEnd(10)} PIN ${p.name === OWNER_NAME ? PINS.owner : PINS.worker}${p.name === OWNER_NAME ? '  (owner)' : ''}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
