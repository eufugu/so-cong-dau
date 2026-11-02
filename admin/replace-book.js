// Thay toàn bộ sổ chung bằng một file sổ: node admin/replace-book.js <file.json>
// Chạy trên máy của chủ, trong cửa sổ PowerShell. Luôn lưu bản dự phòng vào backups/ trước khi xoá.
// File dự phòng cũng là một file sổ: chạy lại lệnh này với file đó là trả sổ về như cũ.
// Tài khoản đăng nhập (people) không bị đụng tới.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { PlainError } from './lib/people.js';
import { COLLECTIONS, checkBook, readBook, counts, replaceBook } from './lib/book.js';

const KEY_PATH = join(homedir(), '.so-cong-dau', 'service-account.json');
const BACKUPS = join(dirname(fileURLToPath(import.meta.url)), '..', 'backups');
const CONFIRM = 'THAY SO';
const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;

function connect() {
  if (emulator) {
    initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-so-cong-dau' });
    return { db: getFirestore(), project: `emulator (${process.env.GCLOUD_PROJECT || 'demo-so-cong-dau'})` };
  }
  if (!existsSync(KEY_PATH)) throw new PlainError(`Chưa có file khoá. Hãy đặt file service-account.json vào:\n  ${KEY_PATH}`);
  const key = JSON.parse(readFileSync(KEY_PATH, 'utf8'));
  initializeApp({ credential: cert(key) });
  return { db: getFirestore(), project: key.project_id };
}

const ask = (q) => new Promise((resolve) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question(q, (a) => { rl.close(); resolve(a.trim()); });
});

async function main() {
  const file = process.argv[2];
  if (!file) { console.log('Cách dùng: node admin/replace-book.js <file.json>'); return 1; }
  if (!existsSync(file)) throw new PlainError(`Không thấy file: ${file}`);
  const rows = checkBook(JSON.parse(readFileSync(file, 'utf8')));
  // Sổ thật: phải do chính người dùng gõ xác nhận. Kiểm tra trước khi nối tới sổ.
  if (!emulator && !(process.stdin.isTTY && process.stdout.isTTY)) {
    throw new PlainError('Hãy chạy lệnh này trực tiếp trong cửa sổ PowerShell, để tự gõ xác nhận. Sổ chưa bị đụng tới.');
  }
  const { db, project } = connect();
  const now = await readBook(db);
  mkdirSync(BACKUPS, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const backup = join(BACKUPS, `book-${stamp}.json`);
  writeFileSync(backup, JSON.stringify({ source: `backup of ${project}`, rows: now }, null, 1));
  console.log(`Đã lưu bản dự phòng: ${backup}\n`);
  console.log(`Sổ: ${project}`);
  console.log('Mục'.padEnd(16) + 'Đang có'.padStart(9) + 'Sau khi thay'.padStart(14));
  const a = counts(now), b = counts(rows);
  COLLECTIONS.forEach((c) => console.log(c.padEnd(16) + String(a[c]).padStart(9) + String(b[c]).padStart(14)));
  console.log('\nMọi dòng "Đang có" sẽ bị xoá và thay bằng file này. Tài khoản đăng nhập giữ nguyên.');
  if (!emulator) {
    const typed = await ask(`Nhờ mọi người ngừng ghi sổ. Gõ đúng ${CONFIRM} để làm, gõ khác để thôi: `);
    if (typed !== CONFIRM) { console.log('Đã thôi. Sổ chưa bị đụng tới.'); return 0; }
  }
  try {
    const back = await replaceBook(db, rows);
    console.log(`\nXong, đã đọc lại và khớp từng dòng: ${Object.entries(counts(back)).map(([c, n]) => `${c} ${n}`).join(', ')}.`);
    return 0;
  } catch (e) {
    console.error(`\nChưa xong, sổ có thể đang dở dang. Lấy lại sổ cũ bằng lệnh:\n  node admin/replace-book.js "${backup}"`);
    throw e;
  }
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(e instanceof PlainError ? e.message : `Có lỗi không mong muốn: ${e && e.message}`);
    process.exit(1);
  },
);
