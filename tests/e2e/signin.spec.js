import { test, expect } from '@playwright/test';
import { clearAll, addAccount, givePeople, signInAs, OWNER, WORKER } from './helpers.js';

const BOOK = { name: 'Sổ chung', exact: true };

test.beforeEach(async ({ page }) => {
  await clearAll();
  await addAccount(OWNER);
  await addAccount(WORKER);
  await givePeople(page, [OWNER, WORKER]);
});

test('signed out: names and a PIN box, no book data, no tabs', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Liên', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Bác Khang' })).toBeVisible();
  const pin = page.getByLabel('Mã PIN');
  await expect(pin).toBeVisible();
  await expect(pin).toHaveAttribute('inputmode', 'numeric');
  await expect(pin).toHaveAttribute('autocomplete', 'current-password');
  await expect(pin).toHaveAttribute('maxlength', '6');
  await expect(page.locator('nav.tabs')).toBeHidden();
  await expect(page.getByText('Hôm nay đã làm được')).toHaveCount(0);
});

test('right PIN opens the home screen and reload stays signed in', async ({ page }) => {
  await signInAs(page, OWNER);
  await expect(page.getByText(BOOK.name, { exact: true })).toBeVisible({ timeout: 20000 });
  await expect(page.locator('nav.tabs')).toBeVisible();
  await page.reload();
  await expect(page.getByText(BOOK.name, { exact: true })).toBeVisible({ timeout: 20000 });
  await expect(page.getByLabel('Mã PIN')).toHaveCount(0);
});

test('wrong PIN shows a message and clears the box', async ({ page }) => {
  await signInAs(page, { ...OWNER, pin: '999999' });
  await expect(page.getByText('Sai mã PIN. Thử lại nhé.')).toBeVisible();
  await expect(page.getByLabel('Mã PIN')).toHaveValue('');
});

test('offline first sign-in shows the offline message', async ({ page, context }) => {
  await page.goto('/');
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Liên', exact: true }).click();
  await page.getByLabel('Mã PIN').fill(OWNER.pin);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page.getByText('Chưa có mạng. Cần có mạng để đăng nhập lần đầu.')).toBeVisible();
});

test('too many tries shows the wait message', async ({ page }) => {
  await page.route('**/accounts:signInWithPassword*', (route) =>
    route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { code: 400, message: 'TOO_MANY_ATTEMPTS_TRY_LATER' } }) }));
  await signInAs(page, OWNER);
  await expect(page.getByText('Nhập sai nhiều lần. Đợi vài phút rồi thử lại.')).toBeVisible();
});

test('other sign-in failure shows the generic message', async ({ page }) => {
  await page.route('**/accounts:signInWithPassword*', (route) =>
    route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { code: 400, message: 'USER_DISABLED' } }) }));
  await signInAs(page, OWNER);
  await expect(page.getByText('Chưa đăng nhập được. Thử lại sau một lát.')).toBeVisible();
});

test('empty people list says so', async ({ page }) => {
  await givePeople(page, []);
  await page.goto('/');
  await expect(page.getByText('Chưa có tài khoản nào. Báo người quản lý.')).toBeVisible();
});

test('a login with no people row is told it has no permission, with sign-out', async ({ page }) => {
  const ghost = { name: 'Chú Ba', pin: '908172' };
  await addAccount(ghost); // không có role: không có dòng people
  await givePeople(page, [ghost]);
  await signInAs(page, ghost);
  await expect(page.getByText('Tài khoản này chưa được cấp quyền. Báo Liên hoặc người quản lý.')).toBeVisible();
  await expect(page.locator('nav.tabs')).toBeHidden();
  await page.getByRole('button', { name: 'Đăng xuất' }).click();
  await expect(page.getByLabel('Mã PIN')).toBeVisible();
});

test('worker sees no Báo cáo page, owner does', async ({ page }) => {
  await signInAs(page, WORKER);
  await expect(page.getByText(BOOK.name, { exact: true })).toBeVisible({ timeout: 20000 });
  await page.goto('/#/baocao');
  await expect(page.getByText('Chỉ Liên xem được trang này.')).toBeVisible();
  await page.getByRole('link', { name: 'Quay lại' }).click();
  await page.getByRole('button', { name: /Bác Khang/ }).click();
  await page.getByRole('button', { name: 'Đăng xuất' }).click();
  await expect(page.getByLabel('Mã PIN')).toBeVisible();
  await page.getByRole('button', { name: 'Liên', exact: true }).click();
  await page.getByLabel('Mã PIN').fill(OWNER.pin);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page.getByText(BOOK.name, { exact: true })).toBeVisible({ timeout: 20000 });
  await page.goto('/#/baocao');
  await expect(page.getByRole('heading', { name: 'Báo cáo' })).toBeVisible();
});

test('menu has text size and sign-out, and no account picker', async ({ page }) => {
  await signInAs(page, WORKER);
  await expect(page.getByText(BOOK.name, { exact: true })).toBeVisible({ timeout: 20000 });
  await expect(page.getByText('Ai đang dùng máy này?')).toHaveCount(0);
  await page.getByRole('button', { name: /Bác Khang/ }).click();
  await expect(page.getByText('Cỡ chữ')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Đăng xuất' })).toBeVisible();
  await expect(page.getByText('Ai đang dùng máy này?')).toHaveCount(0);
  await expect(page.getByText('Chọn người')).toHaveCount(0);
});

test('local mode (no backend) still shows the old picker, for the totals tool', async ({ page }) => {
  await page.route('**/backend.js', (route) => route.fulfill({ contentType: 'text/javascript', body: '' }));
  await page.goto('/');
  await expect(page.getByText('Ai đang dùng máy này?')).toBeVisible();
  await expect(page.getByLabel('Mã PIN')).toHaveCount(0);
  await page.getByRole('button', { name: 'Bác Khang' }).click();
  await expect(page.locator('nav.tabs')).toBeVisible();
  await expect(page.getByText('Chỉ lưu trên máy này')).toBeVisible();
});

test('signed in but the profile cannot be read and is not cached: offline message, then retry opens the app', async ({ page }) => {
  await signInAs(page, WORKER);
  await expect(page.getByText(BOOK.name, { exact: true })).toBeVisible({ timeout: 20000 });
  // Quên bản đã lưu của dòng people (cả bản của app lẫn bản trong bộ nhớ Firestore), rồi chặn đường tới kho
  await page.evaluate(async () => {
    localStorage.removeItem('so-cong-dau.v1.nguoi');
    for (const d of await indexedDB.databases()) if (/firestore/.test(d.name)) indexedDB.deleteDatabase(d.name);
  });
  await page.route('**://127.0.0.1:8080/**', (route) => route.abort());
  await page.reload();
  await expect(page.getByText('Chưa có mạng. Có mạng lại rồi bấm Thử lại.')).toBeVisible({ timeout: 40000 });
  await expect(page.getByText('chưa được cấp quyền')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Đăng xuất' })).toBeVisible();
  await expect(page.locator('nav.tabs')).toBeHidden();
  await page.unroute('**://127.0.0.1:8080/**');
  await page.getByRole('button', { name: 'Thử lại' }).click();
  await expect(page.getByText(BOOK.name, { exact: true })).toBeVisible({ timeout: 20000 });
  await expect(page.locator('nav.tabs')).toBeVisible();
});
