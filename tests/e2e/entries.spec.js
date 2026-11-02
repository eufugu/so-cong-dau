import { test, expect, devices } from '@playwright/test';
import { clearAll, addAccount, givePeople, signInAs, putDoc, getDocs, OWNER, WORKER, WORKER2 } from './helpers.js';

const CUST = { id: 'k-t7', name: 'Khách Thử' };
const ALL = [OWNER, WORKER, WORKER2];
const UNSENT_KEY = 'so-cong-dau.v1.cho-gui';
const REMOTE_KEY = 'so-cong-dau.v1.chung';
const LAST_KEY = 'so-cong-dau.v1.nguoi-cuoi';
let ids;

test.beforeEach(async ({ page }) => {
  await clearAll();
  ids = {
    owner: await addAccount(OWNER),
    worker: await addAccount(WORKER),
    worker2: await addAccount(WORKER2),
  };
  await givePeople(page, ALL);
  await putDoc('customers', CUST.id, { id: CUST.id, name: CUST.name, phone: '', address: '', by: 'Excel', void: false });
});

// Mở một máy thứ hai (người thứ hai, điện thoại khác)
async function otherPhone(browser, baseURL, person) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], baseURL });
  const page = await ctx.newPage();
  await givePeople(page, ALL);
  await signInAs(page, person);
  await ready(page);
  return { ctx, page };
}

// Cho trang giả lập một lần ghi lên kho: 'hold' = treo mãi (chưa gửi được), 'exhaust' = kho báo hết lượt ghi.
// Chỉ dùng cho hai tình huống không dựng được bằng emulator thật; từ chối vì thiếu quyền thì dùng emulator thật.
async function switchWrites(page) {
  await page.addInitScript(() => {
    let real;
    Object.defineProperty(window, 'soBackend', {
      configurable: true,
      get: () => real,
      set: (b) => {
        const col = b.store.collection.bind(b.store);
        b.store.collection = (name) => {
          const c = col(name);
          const doc = c.doc.bind(c);
          c.doc = (id) => {
            const d = doc(id), set = d.set;
            d.set = (data) => (window.__writes === 'hold' ? new Promise(() => {}) : window.__writes === 'exhaust' ? Promise.reject({ code: 'resource-exhausted' }) : set(data));
            return d;
          };
          return c;
        };
        real = b;
      },
    });
  });
}

const ready = (page) => expect(page.locator('.sync.live')).toBeVisible({ timeout: 20000 });
async function openAs(page, person) {
  await signInAs(page, person);
  await ready(page);
}
async function recordCash(page, { amount = '500000', method = 'TM', holder = null } = {}) {
  await page.goto(`/#/tien/ghi/${CUST.id}`);
  await page.locator('#pay-amount').fill(amount);
  await page.getByRole('button', { name: method === 'CK' ? 'Chuyển khoản' : 'Tiền mặt', exact: true }).click();
  if (holder) await page.getByRole('button', { name: holder, exact: true }).click();
}
const save = (page) => page.getByRole('button', { name: 'Lưu tiền đã nhận' }).click();
const payments = async (n) => {
  await expect.poll(async () => (await getDocs('payments')).length, { timeout: 15000 }).toBe(n);
  return getDocs('payments');
};
const stored = (page, key) => page.evaluate((k) => localStorage.getItem(k), key);
const unsentTotal = (page) => page.evaluate((k) => Object.values(JSON.parse(localStorage.getItem(k) || '{}')).reduce((n, l) => n + l.length, 0), UNSENT_KEY);
async function openMenu(page) { await page.goto('/#/'); await page.locator('button.who').click(); }

test('worker records cash held by Mẹ: not yet received, and the hint says Mẹ must confirm', async ({ page, browser, baseURL }) => {
  await openAs(page, WORKER);
  await recordCash(page, { holder: 'Mẹ Liên' });
  await expect(page.getByText('Mẹ sẽ bấm đã nhận khi nhận đủ tiền.')).toBeVisible();
  await expect(page.getByText('Tiền đã ở chỗ Mẹ.')).toHaveCount(0);
  await save(page);
  const [p] = await payments(1);
  expect(p.handed).toBe(false);
  expect(p.holder).toBe('Mẹ Liên');
  expect(p.by).toBe('Bác Khang');
  await page.goto('/#/tien/thu');
  await expect(page.getByText('Mẹ Liên đang cầm')).toBeVisible();
  await expect(page.locator('.total', { hasText: 'Chưa về tay Mẹ' })).toContainText('500');

  // Mẹ thấy khoản này và bấm "Mẹ đã nhận"
  const mom = await otherPhone(browser, baseURL, OWNER);
  await mom.page.goto('/#/tien/thu');
  await expect(mom.page.getByText('Mẹ Liên đang cầm')).toBeVisible();
  await mom.page.getByRole('button', { name: /Khách Thử/ }).click();
  await mom.page.getByRole('button', { name: 'Mẹ đã nhận khoản này', exact: true }).click();
  await expect.poll(async () => (await getDocs('payments'))[0].handed).toBe(true);
  expect((await getDocs('payments'))[0].handedBy).toBe('Mẹ Liên');
  await mom.ctx.close();
});

test('owner records cash held by Mẹ: received at once', async ({ page }) => {
  await openAs(page, OWNER);
  await recordCash(page, { holder: 'Mẹ Liên' });
  await expect(page.getByText('Tiền đã ở chỗ Mẹ.')).toBeVisible();
  await save(page);
  const [p] = await payments(1);
  expect(p.handed).toBe(true);
  expect(p.holder).toBe('Mẹ Liên');
});

test('worker records a transfer to Tài khoản Mẹ: counted as received', async ({ page }) => {
  await openAs(page, WORKER);
  await recordCash(page, { method: 'CK' });
  await save(page);
  const [p] = await payments(1);
  expect(p.holder).toBe('Tài khoản Mẹ');
  expect(p.handed).toBe(true);
});

test('worker claims a Chưa ghi row, and Ghi nhầm gives it back', async ({ page }) => {
  await putDoc('payments', 'p-chua', { id: 'p-chua', date: '2026-10-30', customerId: CUST.id, customer: CUST.name, amount: 700000, method: 'TM', holder: 'Chưa ghi', handed: false, handedDate: null, by: 'Excel', void: false });
  await openAs(page, WORKER);
  await page.goto('/#/tien/thu');
  await page.getByRole('button', { name: /Khách Thử/ }).click();
  await page.getByRole('button', { name: 'Tôi đang cầm khoản này' }).click();
  await expect.poll(async () => (await getDocs('payments'))[0].holder).toBe('Bác Khang');
  await expect(page.getByText('Bác Khang đang cầm', { exact: false }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Ghi nhầm' }).click();
  await expect.poll(async () => (await getDocs('payments'))[0].holder).toBe('Chưa ghi');
});

test('a refused new row: message, leaves the waiting list, nothing resent, other entries still work', async ({ page }) => {
  await openAs(page, WORKER);
  // Quyền bị thu hồi lúc đang dùng: máy chủ sẽ từ chối mọi dòng ghi
  await putDoc('people', ids.worker, { name: WORKER.name, role: 'none' });
  await recordCash(page);
  await save(page);
  await expect(page.getByText('Sổ chung không nhận dòng này: bạn chưa có quyền. Dòng đã được bỏ.')).toBeVisible();
  await expect.poll(() => unsentTotal(page)).toBe(0);
  await expect(page.locator('.sync')).toHaveText('Sổ chung');
  await page.waitForTimeout(1500);
  expect(await getDocs('payments')).toHaveLength(0);
  expect(JSON.parse(await stored(page, REMOTE_KEY)).payments).toHaveLength(0);
  // Cấp lại quyền: dòng khác vẫn ghi được
  await putDoc('people', ids.worker, { name: WORKER.name, role: 'worker' });
  await recordCash(page, { amount: '300000' });
  await save(page);
  const [p] = await payments(1);
  expect(p.amount).toBe(300000);
});

test('a refused change to a row already on the server puts the server copy back', async ({ page }) => {
  await putDoc('payments', 'p-chua', { id: 'p-chua', date: '2026-10-30', customerId: CUST.id, customer: CUST.name, amount: 700000, method: 'TM', holder: 'Chưa ghi', handed: false, handedDate: null, by: 'Excel', void: false });
  await openAs(page, WORKER);
  await putDoc('people', ids.worker, { name: WORKER.name, role: 'none' });
  await page.goto('/#/tien/thu');
  await page.getByRole('button', { name: /Khách Thử/ }).click();
  await page.getByRole('button', { name: 'Tôi đang cầm khoản này' }).click();
  await expect(page.getByText('Sổ chung không nhận dòng này: bạn chưa có quyền. Dòng đã được bỏ.')).toBeVisible();
  await expect(page.getByText('Chưa rõ ai cầm')).toBeVisible();
  await expect(page.locator('.sync')).toHaveText('Sổ chung');
  await page.waitForTimeout(1500);
  expect((await getDocs('payments'))[0].holder).toBe('Chưa ghi');
  await expect(page.getByText('Chưa rõ ai cầm')).toBeVisible();
});

test('a full or rate-limited server keeps the row waiting and says it will resend', async ({ page }) => {
  await switchWrites(page);
  await openAs(page, WORKER);
  await page.evaluate(() => { window.__writes = 'exhaust'; });
  await recordCash(page);
  await save(page);
  await expect(page.getByText('Sổ chung đã hết lượt ghi hôm nay. Dòng này sẽ tự gửi lại sau.')).toBeVisible();
  expect(await unsentTotal(page)).toBe(1);
  await expect(page.getByText('Sổ chung không nhận dòng này')).toHaveCount(0);
});

test("entries from a second worker appear on the first worker's screen", async ({ page, browser, baseURL }) => {
  await openAs(page, WORKER);
  await page.goto('/#/tien/thu');
  const other = await otherPhone(browser, baseURL, WORKER2);
  await recordCash(other.page, { holder: 'Chú Tư' });
  await save(other.page);
  await expect(page.getByText('Chú Tư đang cầm')).toBeVisible({ timeout: 20000 });
  await other.ctx.close();
});

test('sign out with a waiting entry warns, staying keeps it, leaving clears the phone', async ({ page }) => {
  await switchWrites(page);
  await openAs(page, WORKER);
  await page.evaluate(() => { window.__writes = 'hold'; });
  await recordCash(page);
  await save(page);
  expect(await unsentTotal(page)).toBe(1);
  await openMenu(page);
  await page.getByRole('button', { name: 'Đăng xuất' }).click();
  await expect(page.getByText('Còn 1 dòng chưa gửi. Đăng xuất bây giờ có thể mất các dòng này.')).toBeVisible();
  await page.getByRole('button', { name: 'Ở lại' }).click();
  await expect(page.getByText('Còn 1 dòng chưa gửi.')).toHaveCount(0);
  await expect(page.locator('nav.tabs')).toBeVisible();
  expect(await unsentTotal(page)).toBe(1);
  // Đăng xuất vẫn được: máy sạch dòng của người trước
  await page.locator('button.who').click();
  await page.getByRole('button', { name: 'Đăng xuất' }).click();
  await page.getByRole('button', { name: 'Vẫn đăng xuất' }).click();
  await expect(page.getByLabel('Mã PIN')).toBeVisible();
  expect(await stored(page, REMOTE_KEY)).toBeNull();
  expect(await stored(page, UNSENT_KEY)).toBeNull();
  // Người khác đăng nhập trên máy này: không thấy dòng của người trước
  await page.getByRole('button', { name: 'Mẹ Liên' }).click();
  await page.getByLabel('Mã PIN').fill(OWNER.pin);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await ready(page);
  expect(await unsentTotal(page)).toBe(0);
  expect(await stored(page, LAST_KEY)).toBe(ids.owner);
});

test('a different person signing in on the same phone does not inherit the last person rows', async ({ page }) => {
  await switchWrites(page);
  await openAs(page, WORKER);
  await page.evaluate(() => { window.__writes = 'hold'; });
  await recordCash(page);
  await save(page);
  expect(await unsentTotal(page)).toBe(1);
  expect(await stored(page, LAST_KEY)).toBe(ids.worker);
  // Làm như máy nhớ người cuối cùng là người khác (không qua nút Đăng xuất)
  await page.evaluate((k) => localStorage.setItem(k, 'nguoi-truoc'), LAST_KEY);
  await page.goto('/');
  await expect(page.locator('nav.tabs')).toBeVisible({ timeout: 20000 });
  await expect.poll(() => stored(page, LAST_KEY)).toBe(ids.worker);
  expect(await unsentTotal(page)).toBe(0);
});

test('worker holder list shows real names; Người khác is only a typed holder, never an identity', async ({ page }) => {
  await openAs(page, WORKER);
  await page.goto('/#/');
  await expect(page.locator('button.who')).toContainText('Bác Khang');
  await page.locator('button.who').click();
  await expect(page.getByRole('button', { name: 'Người khác' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Đóng' }).click();

  await recordCash(page);
  const group = page.getByRole('group', { name: 'Ai đang cầm tiền này?' });
  for (const n of ['Mẹ Liên', 'Bác Khang', 'Chú Tư']) await expect(group.getByRole('button', { name: n, exact: true })).toBeVisible();
  // Tiền đang ở chỗ người không có tài khoản: gõ tên
  await group.getByRole('button', { name: 'Người khác', exact: true }).click();
  await page.locator('#pay-other').fill('Cô Lan');
  await save(page);
  const [p] = await payments(1);
  expect(p.holder).toBe('Cô Lan');
  expect(p.handed).toBe(false);
});

test('a login whose name is written in NFD still gets rows the server accepts, with by in NFC', async ({ page }) => {
  const nfd = { name: 'Bác Khang'.normalize('NFD'), pin: '444444', role: 'worker' };
  await clearAll();
  await addAccount(OWNER);
  // Danh sách tên trên máy ghi kiểu NFD; hồ sơ trên máy chủ ghi kiểu NFC như công cụ tài khoản vẫn làm
  await addAccount({ ...nfd, name: 'Bác Khang'.normalize('NFC') });
  await putDoc('customers', CUST.id, { id: CUST.id, name: CUST.name, phone: '', address: '', by: 'Excel', void: false });
  await givePeople(page, [OWNER, nfd]);
  await page.goto('/');
  await page.locator('button[data-action="signin-pick"]').nth(1).click();
  await page.getByLabel('Mã PIN').fill(nfd.pin);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await ready(page);
  await recordCash(page);
  await save(page);
  const [p] = await payments(1);
  expect(p.by).toBe('Bác Khang'.normalize('NFC'));
  expect(p.by).not.toBe('Bác Khang'.normalize('NFD'));
});

test('a worker never sees "Tự chọn chuyến"; Mẹ does', async ({ page, browser, baseURL }) => {
  for (const [i, d] of ['2026-10-01', '2026-10-05'].entries()) {
    await putDoc('orders', `o-${i}`, { id: `o-${i}`, date: d, deliver: d, customerId: CUST.id, customer: CUST.name, product: 'DAU-0.5', color: 'Đỏ', cartons: 2, price: 360000, status: 'Đã giao', by: 'Excel', void: false });
  }
  await openAs(page, WORKER);
  await recordCash(page);
  await expect(page.getByRole('button', { name: 'Chuyến cũ trước' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Tự chọn chuyến' })).toHaveCount(0);
  await save(page);
  const [p] = await payments(1);
  expect(p.alloc ?? null).toBeNull();

  const mom = await otherPhone(browser, baseURL, OWNER);
  await recordCash(mom.page);
  await expect(mom.page.getByRole('button', { name: 'Tự chọn chuyến' })).toBeVisible();
  await mom.ctx.close();
});

test('local mode keeps the old picker with Người khác', async ({ page }) => {
  await page.route('**/backend.js', (route) => route.fulfill({ contentType: 'text/javascript', body: '' }));
  await page.goto('/');
  await expect(page.getByText('Ai đang dùng máy này?')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Người khác' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Bác Khang' })).toBeVisible();
});
