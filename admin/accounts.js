// Account tool: node admin/accounts.js add|reset|remove|list
// Run on the owner's own computer. Never takes a PIN or key path as an argument.
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';
import { Writable } from 'node:stream';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { addPerson, resetPin, renamePerson, removePerson, listPeople, parseArgs, PlainError } from './lib/people.js';

const KEY_PATH = join(homedir(), '.so-cong-dau', 'service-account.json');
const PEOPLE_LIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'app', 'people-list.js');

const HELP = `Cách dùng:
  node admin/accounts.js add "Tên" [--owner]       tạo tài khoản mới (--owner: có đủ quyền như Liên)
  node admin/accounts.js reset "Tên"               đặt lại mã PIN
  node admin/accounts.js rename "Tên cũ" "Tên mới" đổi tên (giữ mã PIN)
  node admin/accounts.js remove "Tên"              xoá tài khoản (giữ lại các dòng đã ghi)
  node admin/accounts.js list                      xem danh sách tên và vai trò`;

function connect() {
  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-so-cong-dau' });
  } else {
    if (!existsSync(KEY_PATH)) {
      throw new PlainError(`Chưa có file khoá. Hãy đặt file service-account.json vào:\n  ${KEY_PATH}`);
    }
    let key;
    try { key = JSON.parse(readFileSync(KEY_PATH, 'utf8')); }
    catch { throw new PlainError(`File khoá không đọc được. Hãy tải lại file và đặt vào:\n  ${KEY_PATH}`); }
    try { initializeApp({ credential: cert(key) }); }
    catch { throw new PlainError(`File khoá không đúng. Hãy tải lại file và đặt vào:\n  ${KEY_PATH}`); }
  }
  return { auth: getAuth(), db: getFirestore() };
}

// Hidden prompt: typed characters are not shown. Refuses when stdin is not a real terminal.
function askPinHidden(prompt) {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    const mute = new Writable({ write(_c, _e, cb) { cb(); } });
    const rl = readline.createInterface({ input: process.stdin, output: mute, terminal: true });
    rl.question('', (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!['add', 'reset', 'rename', 'remove', 'list'].includes(args.command)) {
    console.log(HELP);
    return args.command ? 1 : 0;
  }
  if (args.command !== 'list' && !args.name) throw new PlainError('Thiếu tên. Ví dụ: add "Bác Khang"');
  if (args.command === 'rename' && !args.newName) throw new PlainError('Thiếu tên mới. Ví dụ: rename "Thử nghiệm" "Khang"');
  if (['add', 'reset'].includes(args.command) && !(process.stdin.isTTY && process.stdout.isTTY)) {
    throw new PlainError('Hãy chạy lệnh này trực tiếp trong cửa sổ PowerShell, không qua ống dẫn hay file, để nhập PIN kín.');
  }
  const ctx = { ...connect(), peopleListPath: PEOPLE_LIST, askPin: askPinHidden };
  if (args.command === 'add') {
    await addPerson(ctx, args.name, { owner: args.owner });
    console.log(`Đã tạo tài khoản cho "${args.name}".`);
  } else if (args.command === 'reset') {
    await resetPin(ctx, args.name);
    console.log(`Đã đặt lại mã PIN cho "${args.name}".`);
  } else if (args.command === 'rename') {
    const { rows } = await renamePerson(ctx, args.name, args.newName);
    console.log(`Đã đổi tên "${args.name}" thành "${args.newName}". Mã PIN giữ nguyên.`);
    if (rows) console.log(`Còn ${rows} dòng trong sổ mang tên cũ "${args.name}"; các dòng đó giữ nguyên.`);
  } else if (args.command === 'remove') {
    await removePerson(ctx, args.name, { confirmOwner: args.confirmOwner });
    console.log(`Đã xoá tài khoản "${args.name}". Các dòng họ đã ghi vẫn còn.`);
  } else {
    const rows = await listPeople(ctx);
    if (!rows.length) console.log('Chưa có ai.');
    for (const p of rows) console.log(`${p.name} (${p.role === 'owner' ? 'chủ' : 'thợ'})`);
  }
  return 0;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(e instanceof PlainError ? e.message : 'Có lỗi không mong muốn. Chưa chắc việc đã xong, hãy chạy "list" để kiểm tra.');
    process.exit(1);
  },
);
