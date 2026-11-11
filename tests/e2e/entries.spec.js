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

// Cho trang giả lập một lần ghi lên kho treo mãi (window.__writes = 'hold'), để dòng nằm yên ở trạng thái chưa gửi.
// Từ chối vì thiếu quyền thì dùng emulator thật.
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
            d.set = (data) => (window.__writes === 'hold' ? new Promise(() => {}) : set(data));
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
async function recordCash(page, { amount = '500000', method = 'TM' } = {}) {
  await page.goto(`/#/tien/ghi/${CUST.id}`);
  await page.locator('#pay-amount').fill(amount);
  await page.getByRole('button', { name: method === 'CK' ? 'Chuyển khoản' : 'Tiền mặt', exact: true }).click();
}
const save = (page) => page.getByRole('button', { name: 'Lưu', exact: true }).click();
const payments = async (n) => {
  await expect.poll(async () => (await getDocs('payments')).length, { timeout: 15000 }).toBe(n);
  return getDocs('payments');
};
const stored = (page, key) => page.evaluate((k) => localStorage.getItem(k), key);
const unsentTotal = (page) => page.evaluate((k) => Object.values(JSON.parse(localStorage.getItem(k) || '{}')).reduce((n, l) => n + l.length, 0), UNSENT_KEY);
async function openMenu(page) { await page.goto('/#/'); await page.locator('button.who').click(); }

test('worker records cash: he holds it, not yet received, until Mẹ confirms', async ({ page, browser, baseURL }) => {
  await openAs(page, WORKER);
  await recordCash(page);
  await save(page);
  const [p] = await payments(1);
  expect(p.handed).toBe(false);
  expect(p.holder).toBe('Bác Khang');
  expect(p.by).toBe('Bác Khang');
  await page.goto('/#/tien/thu');
  await expect(page.getByText('Bác Khang đang cầm')).toBeVisible();
  await expect(page.locator('.total', { hasText: 'Chưa về tay' })).toContainText('500');

  // Mẹ thấy khoản này và bấm đã nhận
  const mom = await otherPhone(browser, baseURL, OWNER);
  await mom.page.goto('/#/tien/thu');
  await expect(mom.page.getByText('Bác Khang đang cầm')).toBeVisible();
  await mom.page.getByRole('button', { name: /Khách Thử/ }).click();
  await mom.page.getByRole('button', { name: 'Liên đã nhận khoản này', exact: true }).click();
  await expect.poll(async () => (await getDocs('payments'))[0].handed).toBe(true);
  expect((await getDocs('payments'))[0].handedBy).toBe('Mẹ Liên');
  await mom.ctx.close();
});

test('owner records cash held by Mẹ: received at once', async ({ page }) => {
  await openAs(page, OWNER);
  await recordCash(page);
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
  // Bảng báo nằm lại cho tới khi bấm "Đã hiểu", nói rõ dòng nào bị bỏ
  const note = page.locator('#sheet');
  await expect(note.getByText('Sổ chung không nhận dòng này: bạn chưa có quyền. Dòng đã được bỏ.')).toBeVisible();
  await expect(note).toContainText('Khách Thử');
  await expect(note).toContainText('500.000');
  await page.waitForTimeout(5000);
  await expect(note).toBeVisible();
  await page.reload();
  await expect(page.locator('#sheet')).toContainText('Khách Thử');
  expect(await stored(page, 'so-cong-dau.v1.bi-tu-choi')).not.toBeNull();
  await page.getByRole('button', { name: 'Đã hiểu' }).click();
  await expect(page.locator('#sheet')).toHaveCount(0);
  expect(await stored(page, 'so-cong-dau.v1.bi-tu-choi')).toBeNull();
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
  await expect(page.getByText('Sổ chung không nhận thay đổi này: bạn chưa có quyền. Dòng được giữ như trên sổ chung.')).toBeVisible();
  await expect(page.locator('#sheet')).toHaveCount(0);
  await expect(page.getByText('Chưa rõ ai cầm')).toBeVisible();
  await expect(page.locator('.sync')).toHaveText('Sổ chung');
  await page.waitForTimeout(1500);
  expect((await getDocs('payments'))[0].holder).toBe('Chưa ghi');
  await expect(page.getByText('Chưa rõ ai cầm')).toBeVisible();
});

test("entries from a second worker appear on the first worker's screen", async ({ page, browser, baseURL }) => {
  await openAs(page, WORKER);
  await page.goto('/#/tien/thu');
  const other = await otherPhone(browser, baseURL, WORKER2);
  await recordCash(other.page);
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
  expect(JSON.parse((await stored(page, REMOTE_KEY)) || '{}').payments ?? []).toHaveLength(0);
  expect(await stored(page, UNSENT_KEY)).toBeNull();
  // Người khác đăng nhập trên máy này: không thấy dòng của người trước
  await page.getByRole('button', { name: 'Liên', exact: true }).click();
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

test('Người khác is never an identity, and the form never asks who holds the money', async ({ page }) => {
  await openAs(page, WORKER);
  await page.goto('/#/');
  await expect(page.locator('button.who')).toContainText('Bác Khang');
  await page.locator('button.who').click();
  await expect(page.getByRole('button', { name: 'Người khác' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Đóng' }).click();

  await recordCash(page);
  await expect(page.getByRole('group', { name: 'Ai đang cầm tiền này?' })).toHaveCount(0);
  await save(page);
  const [p] = await payments(1);
  expect(p.holder).toBe('Bác Khang');
});

test('Ghi tiền: search without diacritics, debt once with Trả hết, date behind Đổi ngày', async ({ page }) => {
  await putDoc('customers', 'k-m', { id: 'k-m', name: 'Cậu Minh', phone: '', address: '', by: 'Excel', void: false });
  await putDoc('orders', 'o-m', { id: 'o-m', date: '2026-10-01', deliver: '2026-10-01', customerId: 'k-m', customer: 'Cậu Minh', product: 'DAU-0.5', color: 'Đỏ', cartons: 2, price: 360000, status: 'Đã giao', by: 'Excel', void: false });
  await openAs(page, WORKER);
  await page.goto('/#/tien/ghi');
  await page.locator('#pay-q').fill('cau minh');
  await expect(page.getByRole('button', { name: 'Khách Thử' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Cậu Minh', exact: true }).click();
  await expect(page.locator('#pay-amount')).toBeFocused();
  await expect(page.locator('.pay-debt')).toContainText('Còn nợ 720.000');
  await expect(page.locator('form')).not.toContainText('Chuyến');
  await page.getByRole('button', { name: 'Trả hết' }).click();
  await expect(page.locator('#pay-amount')).toHaveValue('720.000');
  await expect(page.locator('.date-show')).toContainText('Hôm nay');
  await page.locator('#pay-date').fill('2026-10-05');
  await expect(page.locator('.date-show')).toContainText('Thứ Hai, 05/10');
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

test('nobody chooses trips on Ghi tiền; payments stay automatic', async ({ page, browser, baseURL }) => {
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
  await expect(mom.page.getByRole('button', { name: 'Tự chọn chuyến' })).toHaveCount(0);
  await mom.ctx.close();
});

test('local mode keeps the old picker with Người khác', async ({ page }) => {
  await page.route('**/backend.js', (route) => route.fulfill({ contentType: 'text/javascript', body: '' }));
  await page.goto('/');
  await expect(page.getByText('Ai đang dùng máy này?')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Người khác' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Bác Khang' })).toBeVisible();
});

test('editing an old row offline is blocked with a message; online it works', async ({ page, context }) => {
  await putDoc('payments', 'p-chua', { id: 'p-chua', date: '2026-10-30', customerId: CUST.id, customer: CUST.name, amount: 700000, method: 'TM', holder: 'Chưa ghi', handed: false, handedDate: null, by: 'Excel', void: false });
  await openAs(page, WORKER);
  await page.goto('/#/tien/thu');
  await expect(page.getByText('Chưa rõ ai cầm')).toBeVisible();
  await context.setOffline(true);
  await expect(page.locator('.sync.stale')).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: /Khách Thử/ }).click();
  await expect(page.getByText('Sửa hay hủy dòng cũ cần có mạng.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tôi đang cầm khoản này' })).toHaveCount(0);
  await context.setOffline(false);
  await expect(page.locator('.sync.live')).toBeVisible({ timeout: 40000 });
  await page.getByRole('button', { name: /Khách Thử/ }).click();
  await page.getByRole('button', { name: 'Tôi đang cầm khoản này' }).click();
  await expect.poll(async () => (await getDocs('payments'))[0].holder).toBe('Bác Khang');
});

test('Hôm nay: revenue instead of debt, a calm money row, tap opens the money page', async ({ page, browser, baseURL }) => {
  const day = new Date(), d =`${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
  await putDoc('orders', 'o-nay', { id: 'o-nay', date: d, deliver: d, customerId: CUST.id, customer: CUST.name, product: 'DAU-0.5', color: 'Đỏ', cartons: 2, price: 360000, status: 'Đã giao', by: 'Excel', void: false });
  await putDoc('payments', 'p-giu', { id: 'p-giu', date: d, customerId: CUST.id, customer: CUST.name, amount: 300000, method: 'TM', holder: WORKER.name, handed: false, handedDate: null, by: WORKER.name, void: false });
  const mom = await otherPhone(browser, baseURL, OWNER);
  await expect(mom.page.locator('.band .total')).toContainText(`Doanh thu tháng ${day.getMonth() + 1}`);
  await expect(mom.page.locator('.band .total')).not.toContainText('tới ngày');
  await expect(mom.page.locator('.band .total b')).toContainText('720nghìn');
  await expect(mom.page.locator('.rev svg rect')).toHaveCount(1);
  await expect(mom.page.locator('main')).not.toContainText(/nợ/i);
  await expect(mom.page.getByRole('link', { name: /Ghi sản xuất/ })).toBeVisible();
  await expect(mom.page.locator('.row.plain')).toContainText('Còn 1 khoản tiền chưa đưa Liên');
  await mom.ctx.close();

  await openAs(page, WORKER);
  await expect(page.locator('main')).not.toContainText(/nợ/i);
  await expect(page.getByRole('link', { name: /Ghi sản xuất/ })).toBeVisible();
  const row = page.locator('.row.plain');
  await expect(row).toContainText('Bạn đang giữ 1 khoản');
  await expect(row).toContainText('300.000');
  await row.click();
  await expect(page).toHaveURL(/#\/tien\/thu$/);
});

test('Sản xuất and Lên đơn show the same six kinds; the rest under Loại khác with 1L (Nhỡ)', async ({ page }) => {
  await openAs(page, WORKER);
  const six = ['1L', '9 can', '1.4L', '1.8L', '2L', 'Hoa sen'];
  await page.goto('/#/sx');
  const tiles = page.locator('.form > .choices .choice');
  await expect(tiles).toHaveCount(6);
  for (const [i, n] of six.entries()) await expect(tiles.nth(i)).toContainText(n);
  await expect(page.locator('details.more')).toContainText('1L (Nhỡ)');
  await page.goto('/#/don/moi');
  expect(await page.locator('.order-form > .field > .order-sheet .os-name strong').allInnerTexts()).toEqual(six);
  await expect(page.locator('details.more .os-name strong').first()).toHaveText('1L (Nhỡ)');
});

test('Lên đơn: find a customer without diacritics, pick any date, the order keeps that date', async ({ page }) => {
  await putDoc('customers', 'k-m', { id: 'k-m', name: 'Cậu Minh', phone: '', address: '', by: 'Excel', void: false });
  await openAs(page, WORKER);
  await page.goto('/#/don/moi');
  await expect(page.getByRole('button', { name: 'Giao hôm qua' })).toHaveCount(0);
  await expect(page.locator('.date-show')).toContainText('Hôm nay');
  // Danh sách đóng cho tới khi chạm vào ô tìm, rồi hiện đủ mọi khách khi chưa gõ
  await expect(page.locator('.cp-list')).toBeHidden();
  await page.locator('#od-q').click();
  await expect(page.locator('.cp-list')).toContainText('Khách Thử');
  await expect(page.locator('.cp-list')).toContainText('Cậu Minh');
  await expect(page.getByRole('link', { name: 'Khách mới' })).toBeVisible();
  await page.locator('#od-q').fill('CAU MINH');
  await expect(page.locator('.cp-item')).toHaveCount(1);
  // Enter khi chỉ còn một khách thì chọn luôn, không lưu đơn
  await page.locator('#od-q').press('Enter');
  await expect(page.locator('.picked button')).toContainText('Cậu Minh');
  await page.locator('#od-date').fill('2026-10-05');
  await expect(page.locator('.date-show')).toContainText('Thứ Hai, 05/10');
  await page.getByRole('textbox', { name: '1L Đỏ, số thùng', exact: true }).fill('2');
  await page.getByRole('button', { name: 'Lưu đơn' }).click();
  await expect(page).toHaveURL(/#\/hoadon\/k-m\/2026-10-05$/);
  await expect.poll(async () => (await getDocs('orders')).length, { timeout: 15000 }).toBe(1);
  const [o] = await getDocs('orders');
  expect(o.date).toBe('2026-10-05');
  expect(o.deliver).toBe('2026-10-05');
  expect(o.product).toBe('DAU-0.5');
});

test('Ghi tiền opens with only the customer step; amounts never sit on the names', async ({ page }) => {
  await putDoc('orders', 'o-1', { id: 'o-1', date: '2026-10-01', deliver: '2026-10-01', customerId: CUST.id, customer: CUST.name, product: 'DAU-0.5', color: 'Đỏ', cartons: 2, price: 360000, status: 'Đã giao', by: 'Excel', void: false });
  await openAs(page, WORKER);
  await page.goto('/#/tien/ghi');
  await expect(page.locator('#pay-amount')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Lưu', exact: true })).toHaveCount(0);
  await page.locator('#pay-q').click();
  await expect(page.locator('.cp-list')).not.toContainText('720.000');
  await page.getByRole('button', { name: CUST.name, exact: true }).click();
  await expect(page.locator('#pay-amount')).toBeFocused();
  await expect(page.getByRole('button', { name: 'Lưu', exact: true })).toBeVisible();
  await expect(page.locator('form')).toContainText('Còn nợ 720.000');
});

test('text size survives sign-out', async ({ page }) => {
  await openAs(page, WORKER);
  await page.locator('button.who').click();
  await page.getByRole('button', { name: 'To', exact: true }).click();
  await page.getByRole('button', { name: 'Đăng xuất' }).click();
  await expect(page.getByLabel('Mã PIN')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.style.fontSize)).toBe('125%');
});

test('only Mẹ sees revenue on Hôm nay', async ({ page, browser, baseURL }) => {
  await openAs(page, WORKER);
  await page.goto('/#/');
  await expect(page.getByRole('link', { name: /Ghi sản xuất hôm nay/ })).toBeVisible();
  await expect(page.getByText('Doanh thu', { exact: false })).toHaveCount(0);
  const mom = await otherPhone(browser, baseURL, OWNER);
  await mom.page.goto('/#/');
  await expect(mom.page.getByText(/Doanh thu tháng/)).toBeVisible();
  await expect(mom.page.getByRole('heading', { name: /Doanh thu 7 ngày/ })).toBeVisible();
});

test('owner shows as Liên on screen, while rows still store Mẹ Liên and Tài khoản Mẹ', async ({ page }) => {
  await openAs(page, OWNER);
  await expect(page.locator('button.who')).toHaveText('Liên');
  await recordCash(page);
  await save(page);
  const [p] = await payments(1);
  expect(p.holder).toBe('Mẹ Liên');
  expect(p.by).toBe('Mẹ Liên');
  await recordCash(page, { amount: '300000', method: 'CK' });
  await save(page);
  await expect.poll(async () => (await getDocs('payments')).map((x) => x.holder).sort()).toEqual(['Mẹ Liên', 'Tài khoản Mẹ']);
  await page.goto('/#/tien/thu');
  await expect(page.getByText('TÀI KHOẢN LIÊN')).toBeVisible();
  await expect(page.locator('main')).not.toContainText('ĐÃ NỘP');
  await expect(page.locator('main')).not.toContainText(/Mẹ|MẸ/);
});

test('customer picker: one alphabetical list, word starts first, add a name that is not found', async ({ page }) => {
  for (const [id, name] of [['k-a', 'Phượng Xóm Trên'], ['k-b', 'Hương Chợ Mới'], ['k-c', 'Bình']]) {
    await putDoc('customers', id, { id, name, phone: '', address: '', by: 'Excel', void: false });
  }
  await openAs(page, WORKER);
  await page.goto('/#/don/moi');
  await page.locator('#od-q').click();
  await expect(page.locator('.cp-item').first()).toHaveText('Bình');
  await expect(page.locator('main')).not.toContainText('Mua gần đây');
  await page.locator('#od-q').fill('huong');
  await expect(page.locator('.cp-item')).toHaveText(['Hương Chợ Mới', 'Phượng Xóm Trên']);
  await page.locator('#od-q').fill('Cô Mới');
  await expect(page.locator('.cp-item')).toHaveCount(0);
  await page.getByRole('button', { name: 'Thêm khách “Cô Mới”' }).click();
  await expect(page).toHaveURL(/khach-moi/);
  await expect(page.locator('#k-name')).toHaveValue('Cô Mới');
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(page.locator('.picked button')).toContainText('Cô Mới');
});

test('debt age: grey up to 14 days, red after, on the debtors list', async ({ page }) => {
  const ago = (n) => { const d = new Date(Date.now() - n * 864e5); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const order = (id, cust, day) => putDoc('orders', id, { id, date: day, deliver: day, customerId: cust.id, customer: cust.name, product: 'DAU-0.5', color: 'Đỏ', cartons: 1, price: 360000, status: 'Đã giao', by: 'Excel', void: false });
  const other = { id: 'k-m', name: 'Cậu Minh' };
  await putDoc('customers', other.id, { ...other, phone: '', address: '', by: 'Excel', void: false });
  await order('o-1', CUST, ago(14));
  await order('o-2', other, ago(15));
  await openAs(page, WORKER);
  await page.goto('/#/tien');
  const age = (name) => page.locator('a.row', { hasText: name }).locator('.age');
  await expect(age(CUST.name)).toHaveText('14 ngày');
  await expect(age(CUST.name)).not.toHaveClass(/late/);
  await expect(age(other.name)).toHaveText('15 ngày');
  await expect(age(other.name)).toHaveClass(/late/);
});

test('Nhập hàng: search materials without diacritics, add a new supplier, the row saves as before', async ({ page }) => {
  await openAs(page, WORKER);
  await page.goto('/#/nhap');
  await expect(page.locator('select#vt-m')).toHaveCount(0);
  await page.locator('#vt-m').fill('tem hoa');
  await page.getByRole('button', { name: 'Tem hoa sen', exact: true }).click();
  await page.locator('#vt-q').fill('100');
  await page.locator('#vt-s').fill('Nhà Mới');
  await page.getByRole('button', { name: 'Thêm “Nhà Mới”' }).click();
  await expect(page.locator('.picked button').nth(1)).toContainText('Nhà Mới');
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect.poll(async () => (await getDocs('purchases')).length, { timeout: 15000 }).toBe(1);
  const [x] = await getDocs('purchases');
  expect([x.material, x.qty, x.supplier]).toEqual(['TEM-HS', 100, 'Nhà Mới']);
});

test('Báo cáo: calendar icon with a narrow month list, tr cards, nothing in the hole, tap a slice, tap outside clears it', async ({ page }) => {
  const now = new Date(), key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const thisM = key(now), lastM = key(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const label = (m) => `${Number(m.slice(5))}/${m.slice(0, 4)}`;
  const line = (id, m, product, cartons, price) => putDoc('orders', id, { id, date: `${m}-01`, deliver: `${m}-01`, customerId: CUST.id, customer: CUST.name, product, color: 'Đỏ', cartons, price, status: 'Đã giao', by: 'Excel', void: false });
  await line('o-1', lastM, 'DAU-0.5', 3, 300000);
  await line('o-2', lastM, 'DAU-HS', 1, 100000);
  await openAs(page, OWNER);
  await page.goto('/#/baocao');
  await expect(page.locator('h1')).toHaveText(`Báo cáo tháng ${label(thisM)}`);
  await expect(page.locator('main .empty')).toContainText('chưa bán thùng nào');
  await expect(page.locator('#pie')).toHaveCount(0);
  // Danh sách tháng mở ngay dưới hình lịch, hẹp, chạm ra ngoài thì đóng
  await expect(page.locator('#month-list')).toBeHidden();
  await page.locator('#month-btn').click();
  const list = await page.locator('#month-list').boundingBox(), btn = await page.locator('#month-btn').boundingBox();
  expect(list.y).toBeGreaterThanOrEqual(btn.y + btn.height);
  expect(list.width).toBeLessThan(250);
  await page.locator('h1').click();
  await expect(page.locator('#month-list')).toBeHidden();
  await page.locator('#month-btn').click();
  await page.locator('#month-list').getByRole('button', { name: `Tháng ${label(lastM)}` }).click();
  await expect(page.locator('h1')).toHaveText(`Báo cáo tháng ${label(lastM)}`);
  await expect(page.locator('#month-list')).toBeHidden();
  await expect(page.locator('.total').first()).toContainText('1tr');
  await expect(page.locator('.total').nth(1)).toContainText('Lợi nhuận');
  // Doanh thu cao nhất trước; chưa chọn miếng nào thì giữa bánh ghi tổng; không còn số thứ tự
  await expect(page.locator('.pie-badge')).toHaveCount(0);
  await expect(page.locator('.pie-no')).toHaveCount(0);
  await expect(page.locator('.pie-key span:nth-child(2)')).toHaveText(['1L', 'Hoa sen']);
  await expect(page.locator('.pie-share')).toHaveText(['90%', '10%']);
  await expect(page.locator('.pie-key b')).toHaveText(['900.000', '100.000']);
  await expect(page.locator('#pie svg')).toHaveAttribute('data-on', '');
  await expect(page.locator('#pie')).not.toContainText('1tr');
  await expect(page.locator('.pie-shadow:not([display])')).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText('Lãi theo tháng');
  await expect(page.locator('main')).not.toContainText('Lãi mỗi thùng');
  await expect(page.locator('main')).not.toContainText('Giá vốn tính');
  // Chạm lên chính miếng bánh: miếng đó nhấc lên nguyên khối, giữa bánh chỉ ghi số tiền của nó
  const top = page.locator('.pie-part[data-v="DAU-HS"]').last();
  const spot = () => top.evaluate((n) => { const pts = n.getAttribute('points').trim().split(' ').map((q) => q.split(',').map(Number)); const m = n.getScreenCTM(); const x = pts.reduce((a, q) => a + q[0], 0) / pts.length, y = pts.reduce((a, q) => a + q[1], 0) / pts.length; return { x: x * m.a + m.e, y: y * m.d + m.f }; });
  const before = await spot();
  await page.mouse.click(before.x, before.y);
  await expect(page.locator('#pie svg')).toHaveAttribute('data-on', 'DAU-HS');
  await expect(page.locator('.pie-key', { hasText: 'Hoa sen' })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => before.y - (await spot()).y).toBeGreaterThan(15);
  await expect.poll(() => page.locator('.pie-shadow:not([display])').count()).toBe(1);
  // Hàng chú giải cũng chọn được, không cần chạm trúng miếng nhỏ
  await page.locator('.pie-key', { hasText: '1L' }).click();
  await expect(page.locator('#pie svg')).toHaveAttribute('data-on', 'DAU-0.5');
  // Chạm ra ngoài bánh: về số tổng ban đầu, không còn miếng nào nhấc
  await page.locator('h2.sec').first().click();
  await expect(page.locator('#pie svg')).toHaveAttribute('data-on', '');
  await expect.poll(() => page.locator('.pie-shadow:not([display])').count()).toBe(0);
});

test('one payment badge with three states on Đơn hàng, the customer page, Sổ tiền and the bill', async ({ page }) => {
  const paid = { id: 'k-p', name: 'Trả Đủ' }, part = { id: 'k-c', name: 'Trả Một Phần' };
  for (const c of [paid, part]) await putDoc('customers', c.id, { ...c, phone: '', address: '', by: 'Excel', void: false });
  const order = (id, c) => putDoc('orders', id, { id, date: '2026-10-05', deliver: '2026-10-05', customerId: c.id, customer: c.name, product: 'DAU-0.5', color: 'Đỏ', cartons: 2, price: 500000, status: 'Đã giao', by: 'Excel', void: false });
  const pay = (id, c, amount) => putDoc('payments', id, { id, date: '2026-10-06', customerId: c.id, customer: c.name, amount, method: 'TM', holder: 'Bác Khang', handed: false, handedDate: null, by: 'Bác Khang', void: false });
  await order('o-1', CUST); await order('o-2', paid); await order('o-3', part);
  await pay('p-1', paid, 1000000); await pay('p-2', part, 400000);
  await openAs(page, OWNER);
  await page.goto('/#/don');
  const status = (name) => page.locator('a.row', { hasText: name }).locator('.badge');
  await expect(status(CUST.name)).toHaveText('Chưa trả');
  await expect(status(CUST.name)).toHaveClass(/unpaid/);
  await expect(status(part.name)).toHaveText('Còn nợ');
  await expect(status(part.name)).toHaveClass(/part/);
  await expect(status(paid.name)).toHaveText('Đã trả');
  await expect(status(paid.name)).toHaveClass(/paid/);
  // Tiền chưa về tay Liên vẫn là Đã trả, và đầu ngày chỉ ghi số đơn
  await expect(page.locator('.day-head small').first()).toHaveText('3 đơn');
  await expect(page.locator('main')).not.toContainText('CHƯA VỀ LIÊN');
  await status(part.name).click();
  await expect(page.locator('.band .badge')).toHaveText('Còn nợ');
  await expect(page.locator('.band .total b')).toContainText('600nghìn');
  await page.goto('/#/tien');
  await expect(status(paid.name)).toHaveText('Đã trả');
  await expect(page.locator('main')).not.toContainText('ĐÃ TRẢ');
  await page.goto(`/#/khach/${part.id}`);
  await expect(page.locator('a.row', { hasText: 'Chuyến 05/10' }).locator('.badge')).toHaveText('Còn nợ');
  await expect(page.locator('a.row', { hasText: 'Chuyến 05/10' })).not.toContainText('ngày');
});

test('pickers: selected box is the name only, tapping it reopens, tapping outside closes', async ({ page }) => {
  await openAs(page, WORKER);
  await page.goto('/#/don/moi');
  await page.locator('#od-q').click();
  await expect(page.locator('.cp-list')).toBeVisible();
  await page.locator('h1').click();
  await expect(page.locator('.cp-list')).toBeHidden();
  await page.locator('#od-q').click();
  await page.getByRole('button', { name: CUST.name, exact: true }).click();
  const box = page.locator('.picked button');
  await expect(box).toHaveText(CUST.name);
  await box.click();
  await expect(page.locator('.cp-list')).toBeVisible();

  await page.goto('/#/sx');
  await page.getByRole('button', { name: /^1L/ }).first().click();
  await page.getByRole('button', { name: 'Đỏ', exact: true }).click();
  await expect(page.locator('.picked')).not.toContainText('chọn lại');
  await page.locator('#sx-n').fill('1');
  await expect(page.getByRole('button', { name: 'Lưu hàng', exact: true })).toBeEnabled();
  await page.locator('.picked button').first().click();
  await expect(page.locator('.form > .choices .choice')).toHaveCount(6);
});

test('Nhập hàng: supplier sits under Vật tư, + Thêm NCC adds one on the spot, date row on every tab', async ({ page }) => {
  await openAs(page, WORKER);
  await page.goto('/#/nhap');
  await expect(page.locator('form .field').nth(1)).toContainText('Mua của ai');
  await expect(page.locator('.date-show')).toContainText('Hôm nay');
  await page.locator('#vt-m').click();
  await page.locator('h1').click();
  await expect(page.locator('#vt-m-list')).toBeHidden();
  await page.getByRole('button', { name: 'Thêm NCC' }).click();
  await page.getByRole('button', { name: 'Thêm', exact: true }).click();
  await expect(page.locator('#ncc-err')).toBeVisible();
  await page.locator('#ncc-name').fill('Nhà Mới');
  await page.getByRole('button', { name: 'Thêm', exact: true }).click();
  await expect(page.locator('.picked button')).toHaveText('Nhà Mới');
  await page.locator('#vt-m').fill('tem hoa');
  await page.getByRole('button', { name: 'Tem hoa sen', exact: true }).click();
  await expect(page.locator('.picked button').first()).toHaveText('Tem hoa sen');
  await page.locator('#vt-q').fill('10');
  await page.locator('#vt-d').fill('2026-10-05');
  await expect(page.locator('.date-show')).toContainText('05/10');
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect.poll(async () => (await getDocs('purchases')).length, { timeout: 15000 }).toBe(1);
  const [x] = await getDocs('purchases');
  expect([x.material, x.supplier, x.date]).toEqual(['TEM-HS', 'Nhà Mới', '2026-10-05']);
  await page.goto('/#/nhap/dau');
  await expect(page.locator('.date-show')).toContainText('Hôm nay');
  await page.goto('/#/nhap/hh');
  await expect(page.locator('.date-show')).toContainText('Hôm nay');
});

test('Hoá đơn shows only the bill: colours with price on one line, cartons only in the total, back to where it opened', async ({ page }) => {
  const line = (id, color, cartons) => putDoc('orders', id, { id, date: '2026-10-05', deliver: '2026-10-05', customerId: CUST.id, customer: CUST.name, product: 'DAU-HS', color, cartons, price: 530000, status: 'Đã giao', by: 'Bác Khang', void: false });
  await line('o-1', 'Vàng', 3); await line('o-2', 'Đỏ', 2);
  await putDoc('payments', 'p-1', { id: 'p-1', date: '2026-10-06', customerId: CUST.id, customer: CUST.name, amount: 500000, method: 'TM', holder: 'Mẹ Liên', handed: true, handedDate: '2026-10-06', by: 'Mẹ Liên', void: false });
  await openAs(page, OWNER);
  await page.goto('/#/don');
  await page.locator('a.row', { hasText: CUST.name }).click();
  await expect(page.locator('.bill-line')).toHaveText(['2 đỏ × 530.000', '3 vàng × 530.000']);
  await expect(page.locator('.ledger.sum')).toContainText('5 thùng');
  await expect(page.locator('.ledger.bill').first()).not.toContainText('thùng');
  for (const gone of ['Tiền trả ngày', 'Sổ của khách', 'Ghi tiền trả', 'Người ghi']) await expect(page.locator('main')).not.toContainText(gone);
  await expect(page.getByRole('link', { name: 'Quay lại' })).toHaveAttribute('href', '#/don');
  // Từ Sổ tiền: sổ của khách chỉ ghi ngày chuyến, chuyến mới nhất trước, không có mô tả dài
  await page.goto(`/#/khach/${CUST.id}`);
  await expect(page.locator('main')).not.toContainText('trừ vào chuyến cũ nhất');
  await expect(page.locator('main')).not.toContainText('Khách đã trả');
  const trip = page.locator('a.row', { hasText: 'Chuyến 05/10' });
  await expect(trip.locator('.what small')).toHaveCount(0);
  await trip.click();
  await expect(page.locator('.bill-line')).toHaveCount(2);
  await expect(page.getByRole('link', { name: 'Quay lại' })).toHaveAttribute('href', `#/khach/${CUST.id}`);
});

test('Sản xuất: any past date from the same date box, and the row keeps that date', async ({ page }) => {
  await openAs(page, WORKER);
  await page.goto('/#/sx');
  await page.getByRole('button', { name: /^2L/ }).first().click();
  await page.getByRole('button', { name: 'Vàng', exact: true }).click();
  await expect(page.locator('.date-show')).toContainText('Hôm nay');
  await page.locator('#sx-date').fill('2026-10-05');
  await expect(page.locator('.date-show')).toContainText('Thứ Hai, 05/10');
  await page.locator('#sx-n').fill('3');
  await page.getByRole('button', { name: 'Lưu cho ngày 05/10' }).click();
  await expect.poll(async () => (await getDocs('production')).length, { timeout: 15000 }).toBe(1);
  const [x] = await getDocs('production');
  expect([x.date, x.cartons, x.color]).toEqual(['2026-10-05', 3, 'Vàng']);
});

test('owner deletes a mistaken bill outright, can undo it, and a worker never sees the button', async ({ page, browser, baseURL }) => {
  const line = (id, color, cartons, status = 'Đã giao') => putDoc('orders', id, { id, date: '2026-10-05', deliver: '2026-10-05', customerId: CUST.id, customer: CUST.name, product: 'DAU-HS', color, cartons, price: 530000, status, by: 'Bác Khang', void: false });
  await line('o-1', 'Vàng', 3); await line('o-2', 'Đỏ', 2);
  const wk = await otherPhone(browser, baseURL, WORKER);
  await wk.page.goto('/#/hoadon/k-t7/2026-10-05');
  await expect(wk.page.locator('.bill-line')).toHaveCount(2);
  await expect(wk.page.getByRole('button', { name: 'Xoá hẳn hoá đơn này' })).toHaveCount(0);
  await wk.ctx.close();

  await openAs(page, OWNER);
  await page.goto('/#/don');
  await page.locator('a.row', { hasText: CUST.name }).click();
  await page.getByRole('button', { name: 'Xoá hẳn hoá đơn này' }).click();
  await expect(page.locator('#sheet-title')).toHaveText('Xoá hẳn hoá đơn này?');
  await expect(page.locator('.sheet')).toContainText('5 thùng');
  await page.getByRole('button', { name: 'Giữ lại' }).click();
  expect((await getDocs('orders')).length).toBe(2);

  await page.getByRole('button', { name: 'Xoá hẳn hoá đơn này' }).click();
  await page.getByRole('button', { name: 'Xoá hẳn', exact: true }).click();
  await expect(page).toHaveURL(/#\/don$/);
  await expect.poll(async () => (await getDocs('orders')).length, { timeout: 15000 }).toBe(0);
  await expect(page.locator('#don-list')).not.toContainText(CUST.name);
  await page.getByRole('button', { name: 'Ghi nhầm' }).click();
  await expect.poll(async () => (await getDocs('orders')).length, { timeout: 15000 }).toBe(2);
  await expect(page.locator('#don-list')).toContainText(CUST.name);

  // Hoá đơn đã hủy cũng xoá hẳn được, để danh sách không còn dòng gạch
  await putDoc('orders', 'o-3', { id: 'o-3', date: '2026-10-07', deliver: '2026-10-07', customerId: CUST.id, customer: CUST.name, product: 'DAU-HS', color: 'Đỏ', cartons: 1, price: 530000, status: 'Hủy', by: 'Bác Khang', void: false });
  await page.goto('/#/hoadon/k-t7/2026-10-07/huy');
  await page.getByRole('button', { name: 'Xoá hẳn hoá đơn này' }).click();
  await expect(page.locator('.sheet')).not.toContainText('cộng lại vào kho');
  await page.getByRole('button', { name: 'Xoá hẳn', exact: true }).click();
  await expect.poll(async () => (await getDocs('orders')).map((o) => o.id).sort(), { timeout: 15000 }).toEqual(['o-1', 'o-2']);
});

test('Sổ sản xuất: every day with its cartons, who logged each line, cancelled lines struck through', async ({ page }) => {
  const sx = (id, date, product, color, cartons, by, v = false) => putDoc('production', id, { id, date, product, color, cartons, note: '', by, void: v });
  await sx('s-1', '2026-10-05', 'DAU-HS', 'Đỏ', 10, 'Bác Khang');
  await sx('s-2', '2026-10-05', 'DAU-HS', 'Vàng', 4, 'Excel');
  await sx('s-3', '2026-10-06', 'NEN-TL', '', 7, 'Bác Khang');
  await sx('s-4', '2026-10-06', 'DAU-HS', 'Trắng', 5, 'Bác Khang', true);
  await sx('s-5', '2026-10-05', 'DAU-CU', 'Đỏ', 2, 'Bác Khang'); // loại đã bỏ khỏi danh mục: vẫn mở được sổ
  await openAs(page, WORKER);
  await page.goto('/#/sx');
  await page.getByRole('link', { name: 'Xem sổ các ngày trước' }).click();
  await expect(page.locator('h1')).toHaveText('Sổ sản xuất');
  await expect(page.locator('.day-head')).toHaveText([/^Thứ Ba, 06\/10\s*7 thùng$/, /^Thứ Hai, 05\/10\s*16 thùng$/]);
  const oct5 = page.locator('section.day').nth(1);
  await expect(oct5.locator('.row')).toHaveCount(3);
  await expect(oct5).toContainText('DAU-CU Đỏ');
  await expect(oct5).toContainText('Bác Khang ghi');
  await expect(oct5).toContainText('Từ file Excel');
  await expect(page.locator('section.day').first().locator('.row.void')).toContainText('HỦY');
  await expect(page.locator('.tabs a[aria-current="page"]')).toHaveAttribute('data-tab', 'sx');
  await expect(page.getByRole('link', { name: 'Quay lại' })).toHaveAttribute('href', '#/sx');
});

test('the font comes from the app itself, never from another site', async ({ page }) => {
  const outside = [];
  page.on('request', (r) => { if (/font|\.woff/.test(r.url()) && !r.url().startsWith('http://127.0.0.1:5000/')) outside.push(r.url()); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await openAs(page, WORKER);
  await page.evaluate(() => document.fonts.ready);
  const loaded = await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, '')));
  expect(loaded.length).toBeGreaterThan(0);
  expect(new Set(loaded)).toEqual(new Set(['Be Vietnam Pro']));
  expect(outside).toEqual([]);
});
