// Mất mạng: dòng ghi lúc không có mạng không được mất, và app phải mở được khi không có mạng.
// Mất mạng thật (context.setOffline), không giả lập lệnh ghi.
// Service worker chỉ chạy trên https; trên emulator thì mở với ?sw=1 để bật nó (xem cuối app.js).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect, devices } from '@playwright/test';
import { clearAll, addAccount, givePeople, putDoc, getDocs, OWNER, WORKER, WORKER2 } from './helpers.js';

const CUST = { id: 'k-t8', name: 'Khách Thử' };
const ALL = [OWNER, WORKER, WORKER2];
const UNSENT_KEY = 'so-cong-dau.v1.cho-gui';
const REMOTE_KEY = 'so-cong-dau.v1.chung';
const APP_JS = fileURLToPath(new URL('../../app/app.js', import.meta.url));

test.beforeEach(async ({ page }) => {
  await clearAll();
  await addAccount(OWNER);
  await addAccount(WORKER);
  await addAccount(WORKER2);
  await givePeople(page, ALL);
  await putDoc('customers', CUST.id, { id: CUST.id, name: CUST.name, phone: '', address: '', by: 'Excel', void: false });
});

const ready = (page) => expect(page.locator('.sync.live')).toBeVisible({ timeout: 20000 });
const stale = (page) => expect(page.locator('.sync.stale')).toBeVisible({ timeout: 20000 });
const unsentTotal = (page) => page.evaluate((k) => Object.values(JSON.parse(localStorage.getItem(k) || '{}')).reduce((n, l) => n + l.length, 0), UNSENT_KEY);

async function openAs(page, person, url = '/') {
  await page.goto(url);
  await page.getByRole('button', { name: person.name }).click();
  await page.getByLabel('Mã PIN').fill(person.pin);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await ready(page);
}
// Chờ service worker giữ trang và lưu xong các file của app (lần mở đầu chưa được nó giữ)
async function withWorker(page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await expect.poll(() => page.evaluate(async () => {
    const names = await caches.keys();
    return names.length ? (await (await caches.open(names[0])).keys()).length : 0;
  })).toBeGreaterThan(5);
}
async function recordCash(page, amount = '500000') {
  await page.evaluate((h) => { location.hash = h; }, `#/tien/ghi/${CUST.id}`);  // đổi trang trong app, không tải lại
  await page.locator('#pay-amount').fill(amount);
  await page.getByRole('button', { name: 'Tiền mặt', exact: true }).click();
}
const save = (page) => page.getByRole('button', { name: 'Lưu', exact: true }).click();
const PAY = { id: 'p-chua', date: '2026-10-30', customerId: CUST.id, customer: CUST.name, amount: 700000, method: 'TM', holder: 'Chưa ghi', handed: false, handedDate: null, by: 'Excel', void: false };
const roleNote = (page, person) => page.getByText(person.role === 'owner' ? 'Chạm từng dòng để ghi ai đang cầm khoản' : 'Bạn đang cầm khoản nào thì chạm vào để ghi');

// Một máy thứ hai (người thứ hai, điện thoại khác)
async function otherPhone(browser, baseURL, person) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], baseURL });
  const page = await ctx.newPage();
  await givePeople(page, ALL);
  await openAs(page, person);
  return { ctx, page };
}

test('signed in, offline reload: the app opens from the phone with data, no localStorage copy, IndexedDB really used', async ({ page, context }) => {
  await putDoc('payments', PAY.id, PAY);
  await openAs(page, WORKER, '/?sw=1');
  await withWorker(page);
  await page.goto('/?sw=1#/tien/thu');
  await expect(page.getByText('Chưa rõ ai cầm')).toBeVisible();
  // Bản sổ trong localStorage bỏ đi: dữ liệu hiện ra chỉ có thể từ bộ nhớ của Firestore
  await page.evaluate((k) => localStorage.removeItem(k), REMOTE_KEY);
  const dbs = await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name));
  expect(dbs.some((n) => /firestore/i.test(n)), `IndexedDB databases: ${dbs}`).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('Chưa rõ ai cầm')).toBeVisible({ timeout: 20000 });
  await expect(page.getByLabel('Mã PIN')).toHaveCount(0);
  await stale(page);
});

for (const person of [WORKER, OWNER]) {
  test(`${person.role} reloading offline opens the app with their role, not the sign-in screen`, async ({ page, context }) => {
    await putDoc('payments', PAY.id, PAY);
    await openAs(page, person, '/?sw=1');
    await withWorker(page);
    await page.goto('/?sw=1#/tien/thu');
    await expect(roleNote(page, person)).toBeVisible();
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('button.who')).toContainText(person.name, { timeout: 20000 });
    await expect(page.getByLabel('Mã PIN')).toHaveCount(0);
    await expect(roleNote(page, person)).toBeVisible();
  });
}

test('offline entry: shows 1 waiting, survives closing the page and reopening offline, then arrives once on a second phone', async ({ page, context, browser, baseURL }) => {
  await openAs(page, WORKER, '/?sw=1');
  await withWorker(page);
  await context.setOffline(true);
  await stale(page);
  await recordCash(page);
  await save(page);
  await expect(page.locator('.sync.stale')).toHaveText('Chưa có mạng · 1 dòng chờ gửi');
  expect(await unsentTotal(page)).toBe(1);
  await page.waitForTimeout(1000);
  await page.close();

  const again = await context.newPage();
  await givePeople(again, ALL);
  await again.goto('/?sw=1#/tien/thu');
  await expect(again.locator('.sync.stale')).toHaveText('Chưa có mạng · 1 dòng chờ gửi', { timeout: 20000 });
  await expect(again.locator('h3.grp small')).toHaveText('1 khoản');
  expect(await unsentTotal(again)).toBe(1);

  await context.setOffline(false);
  await expect.poll(() => unsentTotal(again), { timeout: 40000 }).toBe(0);
  await ready(again);
  expect(await getDocs('payments')).toHaveLength(1);

  const mom = await otherPhone(browser, baseURL, OWNER);
  await mom.page.goto('/#/tien/thu');
  await expect(mom.page.locator('h3.grp small')).toHaveText('1 khoản');
  await expect(mom.page.locator('.sync.live')).toHaveText('Sổ chung');
  await mom.ctx.close();
});

test('a row recorded offline, app closed, reopened online: sent by both queues, exactly once, count goes to 0', async ({ page, context, browser, baseURL }) => {
  await openAs(page, WORKER);
  await context.setOffline(true);
  await stale(page);
  await recordCash(page);
  await save(page);
  await expect(page.locator('.sync.stale')).toHaveText('Chưa có mạng · 1 dòng chờ gửi');
  await page.waitForTimeout(1000);
  await page.close();
  await context.setOffline(false);

  const again = await context.newPage();
  await givePeople(again, ALL);
  await again.goto('/#/tien/thu');
  await expect.poll(() => unsentTotal(again), { timeout: 40000 }).toBe(0);
  await ready(again);
  await expect.poll(async () => (await getDocs('payments')).length).toBe(1);
  await expect(again.locator('h3.grp small')).toHaveText('1 khoản');

  const mom = await otherPhone(browser, baseURL, OWNER);
  await mom.page.goto('/#/tien/thu');
  await expect(mom.page.locator('h3.grp small')).toHaveText('1 khoản');
  await mom.page.waitForTimeout(2000);
  await expect(mom.page.locator('h3.grp small')).toHaveText('1 khoản');
  expect(await getDocs('payments')).toHaveLength(1);
  await mom.ctx.close();
});

test('the row id stays waiting after the SDK own pending write shows in a snapshot: status line and sign-out warning both show it', async ({ page, context }) => {
  await openAs(page, WORKER);
  await context.setOffline(true);
  await stale(page);
  await recordCash(page);
  await save(page);
  await page.goto('/#/tien/thu');
  // Cho các bản chụp của Firestore (có dòng chờ ghi) đi qua, rồi mới xem
  await page.waitForTimeout(1500);
  expect(await unsentTotal(page)).toBe(1);
  await expect(page.locator('.sync.stale')).toHaveText('Chưa có mạng · 1 dòng chờ gửi');
  await page.locator('button.who').click();
  await page.getByRole('button', { name: 'Đăng xuất' }).click();
  await expect(page.getByText('Còn 1 dòng chưa gửi. Đăng xuất bây giờ có thể mất các dòng này.')).toBeVisible();
});

test('sign-in survives a reload and a page close; editing an old row offline shows the existing message', async ({ page, context }) => {
  await putDoc('payments', PAY.id, PAY);
  await openAs(page, WORKER);
  await page.reload();
  await ready(page);
  await expect(page.getByLabel('Mã PIN')).toHaveCount(0);
  await page.close();
  const again = await context.newPage();
  await givePeople(again, ALL);
  await again.goto('/#/tien/thu');
  await ready(again);
  await expect(again.locator('button.who')).toContainText(WORKER.name);
  await expect(again.getByLabel('Mã PIN')).toHaveCount(0);

  await context.setOffline(true);
  await stale(again);
  await again.getByRole('button', { name: /Khách Thử/ }).click();
  await expect(again.getByText('Sửa hay hủy dòng cũ cần có mạng.')).toBeVisible();
});

test('warm cache reload goes from cached to server data, reaches Sổ chung, and edits work (server data identical)', async ({ page }) => {
  await putDoc('payments', PAY.id, PAY);
  await openAs(page, WORKER);
  await page.goto('/#/tien/thu');
  await expect(page.getByText('Chưa rõ ai cầm')).toBeVisible();
  await page.reload();
  await expect(page.locator('.sync.live')).toHaveText('Sổ chung', { timeout: 20000 });
  await page.getByRole('button', { name: /Khách Thử/ }).click();
  await page.getByRole('button', { name: 'Tôi đang cầm khoản này' }).click();
  await expect.poll(async () => (await getDocs('payments'))[0].holder).toBe('Bác Khang');
});

test('warm cache reload when the server changed while the phone was away: new data arrives, edits work', async ({ page }) => {
  await putDoc('payments', PAY.id, PAY);
  await openAs(page, WORKER);
  await page.goto('/#/tien/thu');
  await expect(page.getByText('Chưa rõ ai cầm')).toBeVisible();
  await page.goto('about:blank');
  await putDoc('payments', 'p-moi', { ...PAY, id: 'p-moi', amount: 123000 });
  await page.goto('/#/tien/thu');
  await expect(page.locator('.sync.live')).toHaveText('Sổ chung', { timeout: 20000 });
  await expect(page.locator('h3.grp small')).toHaveText('2 khoản');
  await page.getByRole('button', { name: /Khách Thử/ }).first().click();
  await page.getByRole('button', { name: 'Tôi đang cầm khoản này' }).click();
  await expect.poll(async () => (await getDocs('payments')).filter((p) => p.holder === 'Bác Khang').length).toBe(1);
});

test('a new app.js deployed while online is what loads next time (also offline afterwards)', async ({ page, context }) => {
  const original = readFileSync(APP_JS, 'utf8');
  try {
    await openAs(page, WORKER, '/?sw=1');
    await withWorker(page);
    expect(await page.evaluate(() => window.__appMarker)).toBeUndefined();
    writeFileSync(APP_JS, original + '\nwindow.__appMarker = "v2";\n');
    await page.reload();
    await expect.poll(() => page.evaluate(() => window.__appMarker)).toBe('v2');
    await ready(page);
    // Máy thấy bản mới rồi thì lần mở sau, kể cả mất mạng, cũng là bản mới
    await context.setOffline(true);
    await page.reload();
    await expect.poll(() => page.evaluate(() => window.__appMarker)).toBe('v2');
    await expect(page.getByLabel('Mã PIN')).toHaveCount(0);
  } finally {
    writeFileSync(APP_JS, original);
  }
});
