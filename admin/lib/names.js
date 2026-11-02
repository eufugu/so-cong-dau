// Name, email and PIN helpers shared by the account tool.
export const EMAIL_DOMAIN = 'so-cong-dau.invalid';
export const OWNER_NAME = 'Mẹ Liên';

export function cleanName(s) {
  return String(s ?? '').trim().normalize('NFC');
}

export function emailFor(name) {
  const slug = cleanName(name)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug}@${EMAIL_DOMAIN}`;
}

export function validPin(s) {
  return typeof s === 'string' && /^\d{6}$/.test(s);
}
