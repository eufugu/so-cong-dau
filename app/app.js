// Sổ công dầu — sổ chung của cả nhà
(function () {
  "use strict";

  const KEY = "so-cong-dau.v1";
  const OWNER = "Mẹ Liên";
  // Có kết nối: tên lấy từ danh sách tài khoản (người có đăng nhập), thêm "Người khác" để ghi tiền đang ở chỗ người không có tài khoản.
  // Không có kết nối (máy thử): giữ danh sách cũ, trong đó "Người khác" vẫn là một người dùng máy.
  const PEOPLE = window.soBackend
    ? [...new Set((window.SO_PEOPLE || []).map((p) => String(p.name).normalize("NFC"))), "Người khác"]
    : [OWNER, "Bác Khang", "Người khác"];
  const COLORS = ["Đỏ", "Vàng", "Trắng"];
  const SWATCH = { "Đỏ": "do", "Vàng": "vang", "Trắng": "trang" };
  const WITH_OWNER = [OWNER, "Tài khoản Mẹ"];
  // Chuyển khoản thì ghi rõ vào tài khoản của ai
  const CK_HOLDERS = ["Tài khoản Mẹ", "Tài khoản Bác Khang", "Tài khoản người khác"];
  // Tên hiển thị: dòng đã lưu vẫn ghi "Mẹ Liên", "Tài khoản Mẹ" (đừng đổi, sổ và luật của kho chung so theo các tên này); trên màn hình gọi là Liên
  const SHOWN = { [OWNER]: "Liên", "Tài khoản Mẹ": "Tài khoản Liên" };
  const nameOf = (s) => SHOWN[String(s ?? "").normalize("NFC")] || s;

  // ---------- Lưu trữ ----------
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  function fromSeed(S) {
    const isCandle = (code) => (S.products.find((p) => p.code === code) || {}).group === "Nến";
    const customers = S.customers.map((c, i) => ({ id: "k-" + (i + 1), ...c }));
    const idOf = (name) => (customers.find((c) => c.name === name) || {}).id;
    const payments = [], supplierPays = [];
    S.cash.forEach((c) => {
      if (c.type === "Thu tiền khách") {
        const ck = /chuyển khoản/i.test(c.note), tm = /tiền mặt/i.test(c.note);
        payments.push({
          id: "x-pay-" + (payments.length + 1), date: c.date, customer: c.name, customerId: idOf(c.name), amount: c.inAmt,
          method: ck ? "CK" : tm ? "TM" : "",
          holder: ck ? "Tài khoản Mẹ" : "Chưa ghi",
          handed: ck, handedDate: ck ? c.date : null, note: c.note, by: "Excel", void: false,
        });
      } else if (c.type === "Trả nhà phân phối") {
        supplierPays.push({ id: "x-tra-" + (supplierPays.length + 1), date: c.date, supplier: c.name, amount: c.outAmt, method: "", note: c.note, by: "Excel", void: false });
      }
    });
    return {
      products: S.products,
      materials: S.materials.filter((m) => m.code !== "DAU"),
      bom: S.bom,
      customers,
      orders: S.orders.map((o, i) => ({ ...o, id: "x-ord-" + (i + 1), customerId: idOf(o.customer), color: isCandle(o.product) ? "" : o.color, by: "Excel", void: false })),
      payments,
      supplierPays,
      production: S.production.map((p, i) => ({ ...p, id: "x-sx-" + (i + 1), color: isCandle(p.product) ? "" : p.color, by: "Excel", void: false })),
      purchases: S.purchases.map((x, i) => ({ ...x, id: "x-nhap-" + (i + 1) })),
      batches: S.batches.map((b) => ({ ...b, id: b.code })),
      losses: S.losses.map((x, i) => ({ ...x, id: "x-hh-" + (i + 1) })),
      meta: { user: null, seededAt: new Date().toISOString() },
    };
  }

  // Bản lưu cũ trên điện thoại có thể thiếu các mục mới: bù từ dữ liệu gốc
  function upgrade(d) {
    const base = fromSeed(window.SEED);
    Object.keys(base).forEach((k) => { if (d[k] === undefined) d[k] = base[k]; });
    delete d.tanks; delete d.otherCash;
    d.customers = d.customers.map((c, i) => (c.id ? c : { id: "k-" + (i + 1), ...c }));
    return d;
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return upgrade(JSON.parse(raw));
    } catch (e) { /* bộ nhớ bị chặn: dùng dữ liệu gốc */ }
    return fromSeed(window.SEED);
  }

  // Sổ chung: khi có kết nối (window.soBackend), các dòng ghi nằm ở một kho dữ liệu chung cho cả nhà
  const SHARED = ["customers", "orders", "payments", "production", "purchases", "batches", "losses", "supplierPays"];
  const REMOTE_KEY = KEY + ".chung";
  const UNSENT_KEY = KEY + ".cho-gui";
  const LAST_UID_KEY = KEY + ".nguoi-cuoi";  // người cuối cùng dùng máy này, để người khác đăng nhập không nhận lại dòng của họ
  const canShare = !!window.soBackend;
  let remote = null;          // kho chung, khi đã kết nối
  let sync = canShare ? "loading" : "local";  // local | loading | live | stale
  const mirror = {};          // bản đã có trên kho chung: col -> Map(id -> json)
  const cachedCols = new Set();  // các mục mà lần nhận gần nhất chỉ là bản nhớ trong máy (mất mạng)
  const serverRows = {};      // bản kho chung đã xác nhận (không tính dòng đang chờ gửi): col -> Map(id -> dòng)
  const arrived = new Set();  // các mục đã nhận bản đầy đủ từ kho chung
  const shared = () => canShare && sync !== "local";

  // Dòng mới ghi khi chưa có mạng: giữ trong máy, có mạng thì tự gửi
  let unsent = {};
  try { unsent = JSON.parse(localStorage.getItem(UNSENT_KEY)) || {}; } catch (e) { unsent = {}; }
  const keepUnsent = () => { try { localStorage.setItem(UNSENT_KEY, JSON.stringify(unsent)); } catch (e) { /* chỉ là bản tạm */ } };
  const unsentCount = () => SHARED.reduce((n, c) => n + (unsent[c] || []).length, 0);
  function markUnsent(col, id) {
    const l = unsent[col] || (unsent[col] = []);
    if (!l.includes(id)) l.push(id);
    keepUnsent();
  }
  function addRec(col, rec) {
    db[col].push(rec);
    if (shared()) markUnsent(col, rec.id);
  }

  function loadShared() {
    const base = fromSeed(window.SEED);
    SHARED.forEach((c) => { base[c] = []; });
    try {
      const raw = localStorage.getItem(REMOTE_KEY);
      if (raw) { const cache = JSON.parse(raw); SHARED.forEach((c) => { if (Array.isArray(cache[c])) base[c] = cache[c]; }); if (cache.meta) base.meta = cache.meta; }
    } catch (e) { /* không có bản lưu tạm */ }
    return base;
  }

  let db = canShare ? loadShared() : load();
  let signingOut = false;  // đang đăng xuất: không ghi lại bản lưu tạm nữa
  function save() {
    if (signingOut) return;
    try { localStorage.setItem(remote || canShare ? REMOTE_KEY : KEY, JSON.stringify(db)); } catch (e) { if (!remote) toast("Điện thoại không lưu được. Vào trang Kho, bấm “Lưu dự phòng” ngay."); }
    if (remote) pushChanges();
  }

  // Gửi lên kho chung những dòng vừa thêm, sửa hoặc bỏ
  const chains = new Map();
  function queue(key, job) {
    const next = (chains.get(key) || Promise.resolve()).then(job, job);
    chains.set(key, next);
    return next;
  }
  const body = (rec) => JSON.parse(JSON.stringify(rec));
  function pushChanges() {
    SHARED.forEach((col) => {
      if (!arrived.has(col)) return;
      const seen = mirror[col] || new Map();
      const now = new Map(db[col].map((r) => [r.id, JSON.stringify(r)]));
      now.forEach((json, id) => {
        if (seen.get(id) === json) return;
        seen.set(id, json);
        queue(col + "/" + id, () => remote.collection(col).doc(id).set(body(JSON.parse(json))).catch((e) => writeFailed(e, col, id)));
      });
      [...seen.keys()].filter((id) => !now.has(id)).forEach((id) => {
        seen.delete(id);
        queue(col + "/" + id, () => remote.collection(col).doc(id).delete().catch((e) => writeFailed(e, col, id)));
      });
      mirror[col] = seen;
    });
  }
  // Dòng bị kho chung từ chối: nhớ lại (qua lần đóng máy) cho tới khi người dùng bấm "Đã hiểu"
  const REJECT_KEY = KEY + ".bi-tu-choi";
  let rejected = [];
  try { rejected = JSON.parse(localStorage.getItem(REJECT_KEY)) || []; } catch (e) { rejected = []; }
  const keepRejected = () => { try { if (rejected.length) localStorage.setItem(REJECT_KEY, JSON.stringify(rejected)); else localStorage.removeItem(REJECT_KEY); } catch (e) { /* chỉ là bản tạm */ } };
  function describeRow(col, r) {
    try {
      if (col === "payments") return `Tiền khách trả: ${cname(cidOf(r))}, ${money(r.amount)}`;
      if (col === "orders") return `Đơn hàng: ${cname(cidOf(r))}, ${num(r.cartons)} thùng`;
      if (col === "production") return `Sản xuất: ${sxLabel(product(r.product), r.color)}, ${num(r.cartons)} thùng`;
      if (col === "customers") return `Khách mới: ${r.name}`;
      if (col === "supplierPays") return `Tiền trả nhà cung cấp: ${r.supplier}, ${money(r.amount)}`;
    } catch (e) { /* dùng mô tả chung */ }
    return { purchases: "Một dòng nhập hàng", batches: "Một lần nhập dầu", losses: "Một dòng hao hụt" }[col] || "Một dòng vừa ghi";
  }
  function rejectedSheet() {
    if (!rejected.length || gate !== "ok") return;
    sheet(`<h2 id="sheet-title">Có dòng chưa được nhận</h2>
      <p>Sổ chung không nhận dòng này: bạn chưa có quyền. Dòng đã được bỏ.</p>
      <ul class="note">${rejected.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
      <button class="btn block primary" data-action="reject-ok">Đã hiểu</button>`);
  }
  function writeFailed(e, col, id) {
    if (mirror[col]) mirror[col].delete(id);  // lần lưu sau sẽ gửi lại
    const kind = window.soBackend.errorKind(e);
    if (kind === "refused") {
      // Kho chung từ chối dòng này (không đủ quyền): bỏ dòng, không gửi lại. Dòng đã có sẵn trên kho thì trả về bản của kho.
      const row = db[col].find((r) => r.id === id);
      const had = serverRows[col] && serverRows[col].get(id);
      if (!had && row) { rejected.push(describeRow(col, row)); keepRejected(); }
      db[col] = db[col].filter((r) => r.id !== id);
      unsent[col] = (unsent[col] || []).filter((x) => x !== id); keepUnsent();
      if (had) {
        db[col].push(JSON.parse(JSON.stringify(had)));
        (mirror[col] || (mirror[col] = new Map())).set(id, JSON.stringify(had));  // bản này đã nằm trên kho: không gửi lại
      }
      save(); render();
      if (had) toast("Sổ chung không nhận thay đổi này: bạn chưa có quyền. Dòng được giữ như trên sổ chung.");
      else rejectedSheet();
      return;
    }
    if (db[col].some((r) => r.id === id)) markUnsent(col, id);
    toast("Chưa gửi được lên sổ chung. Có mạng lại sẽ tự gửi.");
  }

  let renderLater = false;
  const editing = () => !!(document.activeElement && document.activeElement.closest && document.activeElement.closest("form, .form") && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName));
  const later = () => { if (editing()) renderLater = true; else render(); };
  function startShared(store) {
    remote = store;
    const timer = setTimeout(() => { if (sync === "loading") { sync = "stale"; render(); } }, 10000);
    SHARED.forEach((col) => {
      store.collection(col).onSnapshot((snap) => {
        // Giữ nguyên từng dòng đang có (để nút "Ghi nhầm" vẫn sửa đúng dòng), chỉ cập nhật nội dung
        const old = new Map(db[col].map((r) => [r.id, r]));
        const got = snap.docs.map((d) => {
          const data = { ...d.data(), id: d.id }, o = old.get(d.id);
          if (!o) return data;
          Object.keys(o).forEach((k) => { if (!(k in data)) delete o[k]; });
          return Object.assign(o, data);
        });
        // Dòng ghi lúc chưa có mạng mà kho chung chưa có: giữ lại để gửi
        const have = new Set(got.map((r) => r.id)), waiting = new Set(unsent[col] || []);
        const mine = db[col].filter((r) => waiting.has(r.id) && !have.has(r.id));
        db[col] = got.concat(mine);
        // Dòng đã nằm trong máy của kho chung nhưng chưa được kho xác nhận cũng còn là "chưa gửi"
        const pending = new Set(snap.docs.filter((d) => d.metadata.hasPendingWrites).map((d) => d.id));
        unsent[col] = mine.map((r) => r.id).concat([...waiting].filter((id) => pending.has(id))); keepUnsent();
        mirror[col] = new Map(got.map((r) => [r.id, JSON.stringify(r)]));
        const prev = serverRows[col] || new Map(), confirmed = new Map();
        snap.docs.forEach((d) => {
          if (!d.metadata.hasPendingWrites) confirmed.set(d.id, { ...d.data(), id: d.id });
          else if (prev.has(d.id)) confirmed.set(d.id, prev.get(d.id));  // đang sửa: vẫn nhớ bản của kho
        });
        serverRows[col] = confirmed;
        if (snap.metadata.fromCache) cachedCols.add(col); else cachedCols.delete(col);
        if (!snap.metadata.fromCache) {
          arrived.add(col);
          if (mine.length) pushChanges();
        }
        if (arrived.size === SHARED.length) {
          // Đã vào sổ rồi mà mất mạng (hoặc chỉ còn bản trong máy) thì coi như chưa kết nối, để sửa dòng cũ phải chờ có mạng
          const off = cachedCols.size > 0 || navigator.onLine === false;
          if (!off && (sync === "loading" || sync === "stale")) { sync = "live"; clearTimeout(timer); }
          else if (off && sync === "live") sync = "stale";
        }
        try { localStorage.setItem(REMOTE_KEY, JSON.stringify(db)); } catch (e) { /* chỉ là bản tạm */ }
        later();
      }, () => { sync = "stale"; render(); });
    });
  }
  window.addEventListener("offline", () => { if (sync === "live") { sync = "stale"; render(); } });
  window.addEventListener("online", () => { if (sync === "stale" && arrived.size === SHARED.length && cachedCols.size === 0) { sync = "live"; render(); } });
  // Vẽ lại bị hoãn lúc đang gõ thì vẽ khi rời ô gõ; nhưng đang bấm một nút thì đợi bấm xong, không thì nút bị thay mất giữa lúc bấm và lần bấm bị mất
  let pressing = false;
  const flushRender = () => { if (renderLater && !editing()) { renderLater = false; render(); } };
  document.addEventListener("pointerdown", () => { pressing = true; }, true);
  document.addEventListener("pointerup", () => { pressing = false; setTimeout(flushRender, 60); }, true);
  document.addEventListener("pointercancel", () => { pressing = false; setTimeout(flushRender, 60); }, true);
  document.addEventListener("focusout", () => setTimeout(() => { if (!pressing) flushRender(); }, 0));
  // Ghi dòng mới thì lúc nào cũng được (chưa có mạng thì để dành gửi sau).
  // Sửa hay hủy dòng cũ thì phải chờ nhận xong sổ chung, để không ghi đè lên số của người khác.
  function blocked(adding) {
    if (!adding && (sync === "loading" || sync === "stale")) { toast("Chưa kết nối sổ chung. Sửa hay hủy dòng cũ cần có mạng."); return true; }
    return false;
  }

  // ---------- Định dạng ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (n) => Math.round(n).toLocaleString("vi-VN");
  const money = (n) => num(n) + "\u00a0₫";
  function short(n) {
    const a = Math.abs(n);
    if (a >= 1e9) return (n / 1e9).toLocaleString("vi-VN", { maximumFractionDigits: 2 }) + '<span class="unit" aria-hidden="true">tỷ</span><span class="sr-only"> tỷ đồng</span>';
    if (a >= 1e6) return (n / 1e6).toLocaleString("vi-VN", { maximumFractionDigits: 1 }) + '<span class="unit" aria-hidden="true">tr</span><span class="sr-only"> triệu đồng</span>';
    if (a >= 1e3) return (n / 1e3).toLocaleString("vi-VN", { maximumFractionDigits: 0 }) + '<span class="unit">nghìn</span><span class="sr-only"> đồng</span>';
    return num(n);
  }
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const today = () => iso(new Date());
  const yday = () => iso(new Date(Date.now() - 864e5));
  const dm = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : "");
  const dmy = (s) => (s ? `${dm(s)}/${s.slice(0, 4)}` : "");
  const daysSince = (s) => Math.max(0, Math.round((new Date(today() + "T00:00:00") - new Date(s + "T00:00:00")) / 864e5));
  const WEEKDAY = ["Chủ nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
  // Giữa câu viết "thứ Hai", không viết "thứ hai" hay "Thứ Hai"
  const wdMid = (d) => WEEKDAY[d.getDay()].replace(/^Thứ/, "thứ");
  // Tháng này chưa có số thì lấy tháng trước, khỏi thấy một ô 0 to đùng đầu tháng
  const lastMonth = () => { const n = new Date(); return iso(new Date(n.getFullYear(), n.getMonth() - 1, 1)).slice(0, 7); };
  const monthPick = (f) => { const m = today().slice(0, 7), a = f(m); if (a) return [m, a]; const p = lastMonth(), b = f(p); return b ? [p, b] : [m, 0]; };
  const mo = (m) => Number(m.slice(5));
  const NONE = '<span class="none">Chưa có</span>';
  const enc = encodeURIComponent;
  const parseMoney = (s) => Number(String(s).replace(/[^\d]/g, "")) || 0;
  const parseQty = (s) => Number(String(s).replace(",", ".").replace(/[^\d.]/g, "")) || 0;

  // ---------- Tính toán (giống công thức trong file Excel) ----------
  const product = (code) => db.products.find((p) => p.code === code);
  const material = (code) => db.materials.find((m) => m.code === code);
  const colorsOf = (p) => (p.group === "Dầu" ? COLORS : [""]);
  // Tên gọi trong xưởng (chỉ đổi trong app, file Excel giữ tên theo kg)
  const CALLED = {
    "DAU-0.5": "1L", "DAU-0.6": "1L (Nhỡ)", "DAU-0.8": "9 can", "DAU-1": "1.4L",
    "DAU-1.1": "1.5L", "DAU-1.2": "1.6L", "DAU-1.3": "1.8L", "DAU-1.5": "2L",
  };
  // Số lẻ viết dấu phẩy như trong sổ: "0,5 kg"
  const vnDec = (s) => String(s).replace(/(\d)\.(\d)/g, "$1,$2");
  const shortName = (p) => vnDec(p.name.replace(/^Dầu /, ""));
  const label = (p, color) => (color ? `${sxName(p)} ${color}` : sxName(p));
  // Tên gọi trong xưởng dùng ở Sản xuất và Đơn hàng
  const sxName = (p) => CALLED[p.code] || shortName(p);
  const sxLabel = (p, color) => (color ? `${sxName(p)} ${color}` : sxName(p));
  // Can cũng gọi theo tên trong xưởng: "Can 1.5 kg" là "Can 2L"
  const matName = (m) => { if (!m) return ""; const k = String(m.code).match(/^CAN-(.+)$/); const n = k && CALLED["DAU-" + k[1]]; return !n ? vnDec(m.name) : / can$/.test(n) ? `${vnDec(m.name)} (thùng ${n})` : `Can ${n}`; };
  const live = (arr) => arr.filter((x) => !x.void);
  const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);
  const kgPerCarton = (p) => (p.group === "Dầu" ? p.kgPerCan * p.cansPerCarton : 0);

  function openOf(p, color) {
    if (p.group === "Nến") return color === "" ? p.open["Đỏ"] || 0 : 0;
    return p.open[color] || 0;
  }
  // Hao hụt thành phẩm ghi kèm màu; dòng cũ từ Excel không có màu thì trừ vào màu đầu như file Excel
  const lossHits = (l, color) => (l.color !== undefined ? l.color === color : color === "" || color === "Đỏ");
  function stock(code, color) {
    const p = product(code);
    const made = sum(live(db.production).filter((x) => x.product === code && x.color === color), (x) => x.cartons);
    const out = sum(live(db.orders).filter((o) => o.product === code && o.color === color && o.status === "Đã giao"), (o) => o.cartons);
    const lost = sum(live(db.losses).filter((l) => l.store === "Thành phẩm" && l.code === code && lossHits(l, color)), (l) => l.qty);
    return openOf(p, color) + made - out - lost;
  }
  const stockTotal = (p) => sum(colorsOf(p), (c) => stock(p.code, c));
  function productStatus(p) {
    if (!p.min) return "";
    const t = stockTotal(p);
    return t <= 0 ? "HẾT" : t <= p.min ? "CẦN LÀM THÊM" : "";
  }

  function materialStock(m) {
    const bought = sum(live(db.purchases).filter((x) => x.material === m.code), (x) => x.qty);
    const used = sum(live(db.production), (x) => x.cartons * ((db.bom[x.product] || {})[m.code] || 0));
    const lost = sum(live(db.losses).filter((l) => l.store === "NVL" && l.code === m.code), (l) => l.qty);
    return m.open + bought - used - lost;
  }
  function materialStatus(m) {
    const k = materialStock(m);
    // Vật tư chưa dùng tới (tồn 0, không mức tối thiểu, chưa nhập lần nào) thì không báo
    if (!m.min && k <= 0 && !db.purchases.some((x) => x.material === m.code)) return "CHƯA THEO DÕI";
    return k <= 0 ? "HẾT" : k <= m.min ? "CẦN ĐẶT" : "ĐỦ";
  }

  // Khách có mã riêng; dòng cũ chỉ có tên thì nhận theo tên
  const custById = (id) => db.customers.find((c) => c.id === id);
  function cidOf(rec) {
    if (rec.customerId && custById(rec.customerId)) return rec.customerId;
    const c = db.customers.find((x) => x.name === rec.customer);
    return c ? c.id : "n:" + rec.customer;
  }
  const cname = (id) => (custById(id) || {}).name || (String(id).startsWith("n:") ? id.slice(2) : "Khách");
  function customerIds() {
    const set = new Set(db.customers.map((c) => c.id));
    db.orders.forEach((o) => set.add(cidOf(o)));
    db.payments.forEach((p) => set.add(cidOf(p)));
    return [...set].filter((id) => id && id !== "n:" && id !== "n:undefined").sort((a, b) => cname(a).localeCompare(cname(b), "vi"));
  }
  const orderValue = (o) => o.cartons * o.price;

  function customer(id, skip) {
    if (typeof skip !== "string") skip = null;
    const delivered = live(db.orders).filter((o) => cidOf(o) === id && o.status === "Đã giao")
      .sort((a, b) => (a.deliver || a.date).localeCompare(b.deliver || b.date));
    const byDate = new Map();
    delivered.forEach((o) => {
      const d = o.deliver || o.date;
      if (!byDate.has(d)) byDate.set(d, { date: d, amount: 0, orders: [] });
      const t = byDate.get(d); t.amount += orderValue(o); t.orders.push(o);
    });
    const trips = [...byDate.values()];
    const pays = db.payments.filter((p) => cidOf(p) === id && p.id !== skip).sort((a, b) => a.date.localeCompare(b.date));
    const paid = sum(live(pays), (p) => p.amount);
    // Trả gối đầu: tiền trả trước tính cho chuyến cũ nhất, trừ phần đã chọn riêng cho một chuyến.
    // Chuyến nào được trả bằng tiền chưa về tay Mẹ thì ghi lại, để không đóng dấu "đã trả" quá sớm.
    const queue = live(pays).map((p) => ({ left: p.amount, handed: p.handed, date: p.date, holder: p.holder, alloc: p.alloc }));
    const take = (t, q, c) => {
      if (c <= 0) return;
      if (!q.handed) t.unhanded = true;
      t.paidFrom.push({ date: q.date, amount: c, handed: q.handed, holder: q.holder });
      t.owed -= c; q.left -= c;
    };
    trips.forEach((t) => { t.owed = t.amount; t.unhanded = false; t.paidFrom = []; });
    queue.forEach((q) => (q.alloc || []).forEach((a) => { const t = trips.find((x) => x.date === a.date); if (t) take(t, q, Math.min(a.amount, t.owed, q.left)); }));
    let qi = 0;
    trips.forEach((t) => {
      while (t.owed > 0 && qi < queue.length) {
        const q = queue[qi];
        take(t, q, Math.min(t.owed, q.left));
        if (q.left <= 0) qi++;
      }
    });
    const bought = sum(trips, (t) => t.amount);
    return { id, name: cname(id), trips, pays, paid, bought, debt: bought - paid, info: custById(id) || {} };
  }
  // Nợ bao lâu rồi: quá 14 ngày thì chữ đỏ, số tiền vẫn giữ màu cũ
  const ageTag = (d) => { const n = daysSince(d); return `<span class="age${n > 14 ? " late" : ""}">${n ? `${n} ngày` : "hôm nay"}</span>`; };
  const oldestOwed = (c) => (c.trips.find((x) => x.owed > 0) || {}).date;
  const owedText = (c) => { const o = c.trips.filter((x) => x.owed > 0); return o.length > 1 ? `${o.length} chuyến chưa trả, từ ${dm(o[0].date)} · ${ageTag(o[0].date)}` : o.length ? `Nợ chuyến ${dm(o[0].date)} · ${ageTag(o[0].date)}` : ""; };
  const debtors = () => customerIds().map(customer).filter((c) => c.debt > 0).sort((a, b) => b.debt - a.debt);

  function outsideMoney() {
    const groups = new Map();
    live(db.payments).filter((p) => !p.handed).forEach((p) => {
      if (!groups.has(p.holder)) groups.set(p.holder, { holder: p.holder, total: 0, items: [] });
      const g = groups.get(p.holder); g.total += p.amount; g.items.push(p);
    });
    return [...groups.values()].sort((a, b) => b.total - a.total);
  }

  // Dầu trong téc: cộng mọi công đã nhập, trừ dầu đã dùng từ công đầu tiên
  const batchesByDate = () => [...live(db.batches)].sort((a, b) => a.date.localeCompare(b.date));
  function tankInfo() {
    const bs = batchesByDate();
    if (!bs.length) return null;
    const batch = bs[bs.length - 1];
    const kgPerTank = batch.kg / (batch.tanks || 1);
    const inKg = sum(bs, (b) => b.kg);
    const usedKg = sum(live(db.production).filter((x) => x.date >= bs[0].date), (x) => x.cartons * kgPerCarton(product(x.product)));
    const leftKg = Math.max(0, inKg - usedKg);
    return { batch, kgPerTank, usedKg, leftKg, est: leftKg / kgPerTank, usedEst: usedKg / kgPerTank };
  }
  const nextBatchCode = () => "C" + String(Math.max(0, ...db.batches.map((b) => Number(String(b.code).replace(/\D/g, "")) || 0)) + 1).padStart(2, "0");

  // Số téc: làm tròn tới nửa téc cho dễ đọc
  const tanks = (n) => (Math.round(n * 2) / 2).toLocaleString("vi-VN");

  // Nhà cung cấp: tiền hàng (vật tư + dầu) trừ tiền đã trả; tên viết hoa thường khác nhau vẫn là một
  const skey = (s) => String(s || "").trim().toLowerCase();
  function suppliers() {
    const by = new Map();
    const get = (name) => {
      const k = skey(name);
      if (!by.has(k)) by.set(k, { key: k, name: String(name || "").trim() || "Chưa ghi", bought: 0, paid: 0, buys: [], pays: [] });
      return by.get(k);
    };
    live(db.purchases).forEach((x) => { const s = get(x.supplier); const v = x.qty * (x.price || 0); s.bought += v; s.buys.push({ date: x.date, what: matName(material(x.material)) || x.material, qty: x.qty, unit: (material(x.material) || {}).unit || "", value: v }); });
    live(db.batches).forEach((b) => { const s = get(b.supplier); const v = b.kg * (b.pricePerKg || 0) + (b.extra || 0); s.bought += v; s.buys.push({ date: b.date, what: `Dầu công ${b.code}`, qty: b.kg, unit: "kg", value: v }); });
    live(db.supplierPays).forEach((p) => { const s = get(p.supplier); s.paid += p.amount; s.pays.push(p); });
    return [...by.values()].map((s) => ({ ...s, owed: s.bought - s.paid })).sort((a, b) => b.owed - a.owed);
  }
  const supplierNames = () => [...new Set([...db.purchases, ...db.batches, ...db.supplierPays].map((x) => String(x.supplier || "").trim()).filter(Boolean))]
    .filter((n, i, all) => all.findIndex((m) => skey(m) === skey(n)) === i).sort((a, b) => a.localeCompare(b, "vi"));

  // Giá vốn một thùng: dầu theo giá công mới nhất + vật tư theo định mức, giá lần nhập gần nhất
  function matPrice(code) {
    const last = live(db.purchases).filter((x) => x.material === code && x.price).sort((a, b) => b.date.localeCompare(a.date))[0];
    return last ? last.price : (material(code) || {}).price || 0;
  }
  function unitCost(p) {
    const bs = batchesByDate(), oil = bs.length ? bs[bs.length - 1].pricePerKg || 0 : 0;
    const bom = db.bom[p.code] || {};
    const mats = sum(Object.keys(bom), (m) => bom[m] * matPrice(m));
    return { oil: kgPerCarton(p) * oil, mats, total: kgPerCarton(p) * oil + mats, hasBom: Object.keys(bom).length > 0 };
  }

  // "1.5 kg: 7 Trắng, 6 Vàng, 2 Đỏ · 1 kg: 2 Đỏ"
  function itemsText(orders) {
    const by = new Map();
    orders.forEach((o) => {
      if (!by.has(o.product)) by.set(o.product, new Map());
      const m = by.get(o.product); m.set(o.color, (m.get(o.color) || 0) + o.cartons);
    });
    return [...by].map(([code, m]) => {
      const p = product(code);
      const parts = [...m].map(([c, n]) => `<span class="nw">${c ? `${n} ${c}` : `${n} thùng`}</span>`);
      return `${esc(sxName(p)).replace(" ", " ")}: ${parts.join(", ")}`;
    }).join("<br>");
  }
  function trips(orders) {
    const by = new Map();
    orders.forEach((o) => {
      const id = cidOf(o), k = id + "|" + (o.deliver || o.date);
      if (!by.has(k)) by.set(k, { id, date: o.deliver || o.date, orders: [] });
      by.get(k).orders.push(o);
    });
    return [...by.values()];
  }
  const neverMade = (p) => !p.min && stockTotal(p) <= 0 && !db.production.some((x) => x.product === p.code);

  // Sáu loại làm hằng ngày luôn hiện ngay, ở Sản xuất cũng như Đơn hàng; mọi loại còn lại để trong "Loại khác" cho gọn
  const MAIN_KINDS = ["DAU-0.5", "DAU-0.8", "DAU-1", "DAU-1.3", "DAU-1.5", "DAU-HS"];
  const SX_RARE = ["DAU-0.6", "NEN-TL", "NEN-SH"];
  const isRareKind = (p) => !MAIN_KINDS.includes(p.code);
  function productChoices(tile, picked, labelledBy) {
    const usual = db.products.filter((p) => !isRareKind(p)), rare = db.products.filter(isRareKind);
    const group = (list) => `<div class="choices"${labelledBy ? ` role="group" aria-labelledby="${labelledBy}"` : ""}>${list.map(tile).join("")}</div>`;
    return group(usual) + (rare.length ? `<details class="more"${rare.some((p) => p.code === picked) ? " open" : ""}>
      <summary>Loại khác</summary>${group(rare)}</details>` : "");
  }

  // Dấu vừa đóng thì in xuống một lần cho dễ thấy
  const fresh = new Set();
  const fr = (id) => (fresh.has(id) ? " fresh" : "");

  const madeOn = (d) => live(db.production).filter((x) => x.date === d);

  // ---------- Người dùng ----------
  // Quyền của Mẹ (hủy hoá đơn, xác nhận nhận tiền, sửa giá, xem báo cáo) đi theo tài khoản đăng nhập của Mẹ,
  // không theo tên tự chọn.
  const SIZES = [{ label: "Vừa", pct: "112.5%" }, { label: "To", pct: "125%" }, { label: "Rất to", pct: "140%" }];
  const applySize = () => { const r = document.documentElement; r.style.fontSize = SIZES[db.meta.textSize || 0].pct; r.dataset.size = db.meta.textSize || 0; };
  // Có kết nối: người đang dùng là tài khoản đã đăng nhập, quyền lấy từ dòng people của họ.
  // Không có kết nối (máy thử): vẫn chọn tên như trước, lưu trong db.meta.user.
  let who = { known: false, uid: null, name: null, role: null };
  const isOwner = () => (canShare ? who.known && who.role === "owner" : db.meta.user === OWNER);
  const me = () => (canShare ? (who.known ? who.name : null) : db.meta.user === OWNER ? null : db.meta.user);
  const people = () => PEOPLE;

  // ---------- Đăng nhập ----------
  // gate: loading (chưa biết đã đăng nhập chưa: chỉ hiện chữ chờ, để người đã đăng nhập không thấy màn đăng nhập thoáng qua)
  //       signin (chưa đăng nhập) | denied (đăng nhập được nhưng chưa có quyền) | ok (vào sổ)
  let gate = canShare ? "loading" : "ok";
  const gateState = { email: "", err: "", busy: false };
  const SIGNIN_ERR = {
    "wrong-pin": "Sai mã PIN. Thử lại nhé.",
    "offline": "Chưa có mạng. Cần có mạng để đăng nhập lần đầu.",
    "too-many-tries": "Nhập sai nhiều lần. Đợi vài phút rồi thử lại.",
    "other": "Chưa đăng nhập được. Thử lại sau một lát.",
  };
  function viewGate() {
    const head = (sub) => `<header class="band"><div class="band-top"><div><h1>Sổ công dầu</h1>${sub ? `<p class="sub">${sub}</p>` : ""}</div></div></header>`;
    if (gate === "loading") return `<p class="gate-wait" role="status">Đang mở sổ…</p>`;
    if (gate === "offline") return head("") + `<div class="form">
      <p class="warn flush" role="alert">Chưa có mạng. Có mạng lại rồi bấm Thử lại.</p>
      <button class="btn primary block" data-action="retry-profile">Thử lại</button>
      <button class="btn block" data-action="sign-out">Đăng xuất</button></div>`;
    if (gate === "denied") return head("") + `<div class="form">
      <p class="warn flush" role="alert">Tài khoản này chưa được cấp quyền. Báo Liên hoặc người quản lý.</p>
      <button class="btn block" data-action="sign-out">Đăng xuất</button></div>`;
    const list = window.SO_PEOPLE || [];
    if (!list.length) return head("") + `<p class="empty">Chưa có tài khoản nào. Báo người quản lý.</p>`;
    return head("Chọn tên của bạn, rồi nhập mã PIN.") + `<form class="form" id="signin-form" novalidate>
      <div class="field">
        <span class="label" id="lbl-signin-who">Bạn là ai?</span>
        <div class="choices two" role="group" aria-labelledby="lbl-signin-who">
          ${list.map((p) => `<button type="button" class="choice" data-action="signin-pick" data-v="${esc(p.email)}" aria-pressed="${p.email === gateState.email}">${esc(nameOf(p.name))}</button>`).join("")}
        </div>
      </div>
      <div class="field">
        <label for="pin">Mã PIN</label>
        <input class="input pin" id="pin" type="password" inputmode="numeric" autocomplete="current-password" maxlength="6" placeholder="6 chữ số">
      </div>
      ${gateState.err ? `<p class="warn flush" id="signin-err" role="alert">${esc(gateState.err)}</p>` : ""}
      <button class="btn primary" type="submit" id="signin-btn">Đăng nhập</button>
    </form>`;
  }
  function renderGate() {
    document.body.classList.add("gated");
    document.getElementById("main").innerHTML = viewGate();
    document.title = "Sổ công dầu";
    const box = document.getElementById("pin");
    if (box && gateState.email && gateState.focusPin) { gateState.focusPin = false; box.focus(); }
  }
  async function trySignIn(pin) {
    if (gateState.busy) return;
    if (!gateState.email) { gateState.err = "Chạm vào tên của bạn trước."; return render(); }
    if (!/^\d{6}$/.test(pin)) { gateState.err = "Mã PIN gồm 6 chữ số."; gateState.focusPin = true; return render(); }
    gateState.busy = true; gateState.err = "";
    const btn = document.getElementById("signin-btn"); if (btn) { btn.disabled = true; btn.textContent = "Đang đăng nhập…"; }
    try {
      await window.soBackend.signIn(gateState.email, pin);  // đăng nhập xong thì onUser lo phần còn lại
    } catch (e) {
      gateState.err = SIGNIN_ERR[e && e.code] || SIGNIN_ERR.other;
      gateState.focusPin = true;
      render();  // vẽ lại thì ô PIN trống: PIN sai không nằm lại trên màn hình
    }
    gateState.busy = false;
  }
  // Đăng xuất: còn dòng chưa gửi thì nhắc trước; đã đăng xuất thì xoá sạch bản sổ và dòng chờ gửi trên máy,
  // để người khác dùng máy này không thấy hay nhận lại dòng của người trước.
  // Cỡ chữ là của chiếc máy, không phải của người dùng: giữ lại
  function forgetBook() {
    try {
      const size = db.meta && db.meta.textSize;
      if (size) localStorage.setItem(REMOTE_KEY, JSON.stringify({ meta: { textSize: size } })); else localStorage.removeItem(REMOTE_KEY);
      localStorage.removeItem(UNSENT_KEY);
    } catch (e) { /* không có bộ nhớ */ }
  }
  async function doSignOut(sure) {
    const n = unsentCount();
    if (n > 0 && !sure) {
      confirmSheet("Đăng xuất?", `Còn ${n} dòng chưa gửi. Đăng xuất bây giờ có thể mất các dòng này.`, "Vẫn đăng xuất", () => { setTimeout(() => doSignOut(true), 0); }, true, "Ở lại");
      return;
    }
    signingOut = true;
    forgetBook();
    try { await window.soBackend.signOut(); } catch (e) { /* vẫn tải lại để về màn đăng nhập */ }
    forgetBook();
    location.reload();
  }
  let pendingUser = null;
  async function onUser(u) {
    if (!u) { pendingUser = null; who = { known: false, uid: null, name: null, role: null }; gate = "signin"; render(); return; }
    if (who.known && who.uid === u.uid) return;
    pendingUser = u;
    gate = "loading"; render();
    let prof;
    try { prof = await window.soBackend.profile(u.uid); }
    catch (e) {
      // Chưa đọc được dòng people: mất mạng thì cho thử lại, lỗi khác thì báo chung
      if (e && e.code === "offline") { gate = "offline"; render(); return; }
      gate = "signin"; gateState.err = SIGNIN_ERR.other; render(); return;
    }
    if (!prof) { gate = "denied"; render(); return; }  // server xác nhận chưa có dòng people: không mở sổ
    // Người khác với người dùng máy lần trước: bỏ bản sổ và dòng chờ gửi của người đó trước khi nối sổ
    let last = null;
    try { last = localStorage.getItem(LAST_UID_KEY); localStorage.setItem(LAST_UID_KEY, u.uid); } catch (e) { /* không có bộ nhớ */ }
    if (last && last !== u.uid) { forgetBook(); unsent = {}; rejected = []; keepRejected(); db = loadShared(); }
    who = { known: true, uid: u.uid, name: String(prof.name).normalize("NFC"), role: prof.role };
    gate = "ok";
    startShared(window.soBackend.store);  // chỉ nối sổ sau khi đã đăng nhập, để không bị từ chối
    render();
    rejectedSheet();  // dòng bị từ chối lúc máy đang tắt: báo lại cho tới khi bấm "Đã hiểu"
  }

  // ---------- Thông báo + hoàn tác ----------
  let toastTimer, undoFn = null, undoEdit = false;
  const toastEl = document.getElementById("toast");
  // edit = true: hoàn tác này sửa một dòng đã có trên sổ chung, nên cần có mạng
  function toast(msg, undo, edit) {
    document.getElementById("toast-msg").textContent = msg;
    undoFn = undo || null; undoEdit = !!edit;
    document.getElementById("toast-undo").hidden = !undo;
    toastEl.style.transition = toastEl.style.transform = toastEl.style.opacity = "";
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    armToast(undo ? 8000 : 4000);
  }
  function armToast(ms) {
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.classList.remove("show"); undoFn = null; }, ms);
  }
  ["pointerenter", "focusin"].forEach((ev) => toastEl.addEventListener(ev, () => clearTimeout(toastTimer)));
  ["pointerleave", "focusout"].forEach((ev) => toastEl.addEventListener(ev, () => armToast(undoFn ? 8000 : 4000)));
  document.getElementById("toast-undo").addEventListener("click", () => {
    if (undoFn && undoEdit && blocked(false)) return;
    if (undoFn) { undoFn(); save(); render(); }
    undoFn = null; toastEl.classList.remove("show");
    toast("Đã bỏ, coi như chưa ghi.");
  });

  // Vuốt sang ngang hoặc xuống để cất thông báo đi
  function hideToast(dx = 0, dy = 0) {
    clearTimeout(toastTimer); undoFn = null;
    const far = Math.abs(dx) > dy ? `translateX(${dx > 0 ? 110 : -110}%)` : "translateY(150%)";
    toastEl.style.transition = ""; toastEl.style.transform = far; toastEl.style.opacity = "0";
    toastEl.classList.remove("show");
    setTimeout(() => { if (!toastEl.classList.contains("show")) { toastEl.style.transform = ""; toastEl.style.opacity = ""; } }, 350);
  }
  let drag = null;
  toastEl.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button") || !toastEl.classList.contains("show")) return;
    drag = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, id: e.pointerId };
    toastEl.setPointerCapture(e.pointerId);
    toastEl.style.transition = "none";
  });
  toastEl.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag.lx = e.clientX; drag.ly = e.clientY;
    const dx = e.clientX - drag.x, dy = Math.max(0, e.clientY - drag.y);
    const d = Math.abs(dx) > dy ? Math.abs(dx) : dy;
    toastEl.style.transform = Math.abs(dx) > dy ? `translateX(${dx}px)` : `translateY(${dy}px)`;
    toastEl.style.opacity = String(Math.max(0.3, 1 - d / 240));
  });
  function endDrag(e) {
    if (!drag || e.pointerId !== drag.id) return;
    // Khi bị huỷ giữa chừng, máy không báo vị trí ngón tay: dùng vị trí cuối cùng đã thấy
    const ex = e.type === "pointercancel" ? drag.lx : e.clientX, ey = e.type === "pointercancel" ? drag.ly : e.clientY;
    const dx = ex - drag.x, dy = Math.max(0, ey - drag.y);
    drag = null;
    if (Math.abs(dx) > 60 || dy > 40) hideToast(dx, dy);
    else { toastEl.style.transition = ""; toastEl.style.transform = ""; toastEl.style.opacity = ""; }
  }
  toastEl.addEventListener("pointerup", endDrag);
  toastEl.addEventListener("pointercancel", endDrag);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !document.getElementById("sheet") && toastEl.classList.contains("show")) hideToast();
  });

  // ---------- Khung giao diện ----------
  const ICON = {
    chev: '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5"/><path d="m11 6-6 6 6 6"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    minus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>',
    cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
  };

  function syncNote() {
    const n = unsentCount();
    const t = {
      loading: "Đang tải sổ chung…",
      stale: n ? `Chưa có mạng · ${n} dòng chờ gửi` : "Chưa kết nối được sổ chung. Số có thể chưa mới.",
      live: n ? `Sổ chung · đang gửi ${n} dòng` : "Sổ chung",
      local: "Chỉ lưu trên máy này",
    }[sync];
    return t ? `<p class="sync ${sync}" role="status">${t}</p>` : "";
  }
  function band({ title, sub = "", back = null, totals = "", exact = false, side = "" }) {
    return `<header class="band${back ? " compact" : ""}">
      ${back ? `<a class="btn back" href="${back}">${ICON.back}Quay lại</a>` : ""}
      <div class="band-top">
        <h1>${title}</h1>
        ${back ? side : `<button class="who" data-action="who" aria-label="Người đang dùng: ${esc(nameOf(me()) || "chưa chọn")}. Bấm để ${canShare ? "mở bảng chọn" : "đổi"}">${ICON.user}${esc(nameOf(me()) || "Chọn người")}</button>`}
      </div>
      ${sub ? `<p class="sub">${sub}</p>` : ""}${syncNote()}
      ${totals ? `<div class="totals${exact ? " exact" : ""}">${totals}</div>` : ""}
    </header>`;
  }
  const total = (lbl, val, href) =>
    `<a class="total" href="${href}"><span>${lbl}</span><b>${val}</b></a>`;

  function row({ href, what, sub = "", much, muchSub = "", cls = "", md = false, action = "" }) {
    const inner = `<span class="what"><strong>${what}</strong>${sub ? `<small>${sub}</small>` : ""}</span>
      <span class="much${md ? " md" : ""}"><span class="stack"><span>${much}</span>${muchSub ? `<small>${muchSub}</small>` : ""}</span>${href || action ? ICON.chev : '<span class="chev" aria-hidden="true"></span>'}</span>`;
    if (href) return `<li><a class="row ${cls}" href="${href}">${inner}</a></li>`;
    if (action) return `<li><button type="button" class="row ${cls}" ${action}>${inner}</button></li>`;
    return `<li><div class="row ${cls}">${inner}</div></li>`;
  }
  const seg = (items, cur) => `<div class="seg" role="group" aria-label="Xem">
    ${items.map(([go, lbl, key]) => `<button type="button" data-go="${go}" aria-pressed="${key === cur}">${lbl}</button>`).join("")}</div>`;

  // Bản nháp của các form nhập: giữ chữ đang gõ khi trang vẽ lại
  const drafts = {};
  const fv = (form, name, def = "") => (drafts[form] && drafts[form][name] !== undefined ? drafts[form][name] : def);
  const setDraft = (form, name, v) => { (drafts[form] || (drafts[form] = {}))[name] = v; };
  const errOf = (form) => (drafts[form] && drafts[form].error ? `<p class="warn" role="alert">${esc(drafts[form].error)}</p>` : "");
  function failForm(form, msg) { setDraft(form, "error", msg); render(); return false; }
  const moneyIn = (form, name, id, def) => `<input class="input money" id="${id}" name="${name}" data-money inputmode="numeric" autocomplete="off" placeholder="0" value="${fv(form, name, def) ? num(parseMoney(fv(form, name, def))) : ""}">`;
  const qtyIn = (form, name, id, def = "") => `<input class="input qty" id="${id}" name="${name}" inputmode="decimal" autocomplete="off" placeholder="0" value="${esc(fv(form, name, def))}">`;
  const dateIn = (form, name, id) => `<input class="input" type="date" id="${id}" name="${name}" value="${esc(fv(form, name, today()))}" max="${today()}">`;
  // Ô chọn ngày: ghi "Thứ Hai, 02/11" cho dễ đọc; ô lịch của máy nằm trong suốt phủ lên trên, chạm vào đâu cũng mở
  const dateText = (s) => `${WEEKDAY[new Date(s + "T00:00:00").getDay()]}, ${s.slice(0, 4) === today().slice(0, 4) ? dm(s) : dmy(s)}`;
  function dateNear(s) {
    const n = Math.round((new Date(s + "T00:00:00") - new Date(today() + "T00:00:00")) / 864e5);
    return n === 0 ? "Hôm nay" : n === -1 ? "Hôm qua" : n === 1 ? "Ngày mai" : n > 0 ? `Còn ${n} ngày nữa` : `${-n} ngày trước`;
  }
  const dateShow = (s) => `<b>${dateText(s)}</b><small>${dateNear(s)}</small>`;
  const dateField = (id, name, lbl, value, max) => `<div class="field">
      <label for="${id}">${lbl}</label>
      <div class="date-pick">
        <span class="date-show">${dateShow(value)}</span>${ICON.cal}
        <input class="date-in" type="date" id="${id}" name="${name}" value="${value}"${max ? ` max="${max}"` : ""}>
      </div>
    </div>`;
  // Ngày vừa chọn; bấm xoá trong lịch (hoặc gõ quá ngày cho phép) thì về hôm nay. Chỉ đổi chữ, không vẽ lại cả trang.
  function pickDate(t) {
    const v = t.value && !(t.max && t.value > t.max) ? t.value : today();
    t.value = v;
    t.closest(".date-pick").querySelector(".date-show").innerHTML = dateShow(v);
    return v;
  }

  // ---------- Trang: Hôm nay ----------
  const soldOrders = () => live(db.orders).filter((o) => o.status === "Đã giao");
  const soldDay = (o) => o.deliver || o.date;
  // Số trên cột, tính bằng triệu: 4,2 · 0,9 (cột hẹp, không đủ chỗ cho số đầy đủ)
  const barMillions = (n) => (n / 1e6).toLocaleString("vi-VN", { maximumFractionDigits: n >= 1e8 ? 0 : 1 });
  // Doanh thu 7 ngày qua, mỗi ngày một cột. Không có viewBox để chữ giữ đúng cỡ chữ người dùng đã chọn.
  function revenueChart() {
    const sold = soldOrders();
    const days = Array.from({ length: 7 }, (_, i) => iso(new Date(Date.now() - (6 - i) * 864e5)));
    const rev = days.map((d) => sum(sold.filter((o) => soldDay(o) === d), orderValue));
    const top = Math.max(...rev);
    if (!top) return `<h2 class="sec">Doanh thu 7 ngày</h2><p class="empty">7 ngày qua chưa bán thùng nào.</p>`;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    // Cỡ chữ Rất to: ngày/tháng không đủ chỗ trong cột, chỉ ghi thứ
    const dated = rem < 22;
    const barTop = Math.round(1.25 * rem), base = barTop + 96, h = base + Math.round((dated ? 2.6 : 1.5) * rem);
    const col = (i) => `${(i + 0.5) * (100 / 7)}%`, wide = `${(100 / 7) * 0.62}%`;
    const spoken = days.map((d, i) => { const w = new Date(d + "T00:00:00"); return `${WEEKDAY[w.getDay()]} ${dm(d)}: ${rev[i] ? `${num(rev[i])} đồng` : "chưa bán"}`; }).join("; ");
    return `<h2 class="sec">Doanh thu 7 ngày <small>Đơn vị: triệu đồng</small></h2>
    <a class="rev" href="#/don" aria-label="Doanh thu 7 ngày. ${spoken}. Chạm để xem đơn hàng.">
      <svg width="100%" height="${h}" aria-hidden="true" focusable="false">
        <svg width="100%" height="${base}">${days.map((d, i) => { const v = Math.max(3, Math.round((rev[i] / top) * 96));
          return rev[i] ? `<rect class="rev-bar${d === today() ? " now" : ""}" x="${(i + 0.19) * (100 / 7)}%" width="${wide}" y="${base - v}" height="${v + 6}" rx="4"/>` : ""; }).join("")}</svg>
        <line class="rev-base" x1="0" x2="100%" y1="${base}" y2="${base}"/>
        ${days.map((d, i) => { const now = d === today(), v = rev[i] ? Math.max(3, Math.round((rev[i] / top) * 96)) : 0, w = new Date(d + "T00:00:00").getDay();
          return `<g class="${now ? "now" : ""}">
            <text class="rev-num${rev[i] ? "" : " none"}" x="${col(i)}" y="${base - v - 6}">${rev[i] ? barMillions(rev[i]) : "—"}</text>
            <text class="rev-day" x="${col(i)}" y="${base + Math.round(1.15 * rem)}">${w ? `T${w + 1}` : "CN"}</text>
            ${dated ? `<text class="rev-date" x="${col(i)}" y="${base + Math.round(2.2 * rem)}">${dm(d)}</text>` : ""}
          </g>`; }).join("")}
      </svg>
    </a>`;
  }
  // Doanh thu tháng này; chạm vào mở Báo cáo đúng tháng này
  function revenueCard() {
    const month = today().slice(0, 7);
    const rev = sum(soldOrders().filter((o) => monthOf(soldDay(o)) === month), orderValue);
    return `<a class="total" href="#/baocao"><span>Doanh thu tháng ${mo(month)}</span><b>${rev ? num(rev) : NONE}</b></a>`;
  }

  function viewHome() {
    const now = new Date();
    const l = Lunar.toLunar(now);
    const holy = Lunar.nextHolyDay(now);
    const out = outsideMoney();
    const outTotal = sum(out, (g) => g.total), outCount = sum(out, (g) => g.items.length);
    const prods = db.products;
    const totalCartons = sum(prods, stockTotal);
    const mats = db.materials.filter((m) => ["HẾT", "CẦN ĐẶT"].includes(materialStatus(m)));
    const t = tankInfo();
    const todays = madeOn(today());
    const todayCartons = sum(todays, (x) => x.cartons);
    const late = now.getHours() >= 16 && now.getDay() !== 0 && !todays.length;
    const month = today().slice(0, 7);
    const soldMonth = isOwner() ? live(db.orders).filter((o) => o.status === "Đã giao" && monthOf(o.deliver || o.date) === month) : [];
    const revMonth = sum(soldMonth, orderValue), profitMonth = revMonth - sum(soldMonth, costOf);
    // Đầu tháng chưa bán gì thì cho xem lãi tháng trước, khỏi thấy một số trống
    const pm = new Date(now.getFullYear(), now.getMonth() - 1, 1), prevMonth = iso(pm).slice(0, 7);
    const soldPrev = isOwner() && !revMonth ? live(db.orders).filter((o) => o.status === "Đã giao" && monthOf(o.deliver || o.date) === prevMonth) : [];
    const profitPrev = sum(soldPrev, orderValue) - sum(soldPrev, costOf);
    // Nút chính duy nhất của trang là Ghi sản xuất; tiền chưa về Mẹ chỉ là một dòng thường trong sổ, nói nhẹ nhàng.
    // Tiền chưa rõ ai cầm thì chạm vào sẽ hỏi lần lượt từng khoản; còn lại thì mở trang Tiền đã thu.
    const unk = out.find((g) => g.holder === "Chưa ghi"), mine = out.find((g) => g.holder === me());
    const withMe = out.length === 1 && WITH_OWNER.includes(out[0].holder);
    const moneyRow = isOwner()
      ? outTotal > 0 ? row({ ...(unk ? { action: 'data-action="ask-next"' } : { href: "#/tien/thu" }), what: `Còn ${outCount} khoản tiền ${withMe ? "Liên chưa xác nhận" : "chưa đưa Liên"}`, much: num(outTotal), md: true, cls: "plain" }) : ""
      : mine ? row({ href: "#/tien/thu", what: `Bạn đang giữ ${mine.items.length} khoản`, much: num(mine.total), md: true, cls: "plain" }) : "";
    const holyText = holy ? (holy.days === 0 ? ` · hôm nay là ${holy.name}` : ` · ${holy.days} ngày nữa tới ${holy.name}`) : "";

    return `<div class="calm">` + band({
      title: `${WEEKDAY[now.getDay()]}, ${dm(today())}`,
      sub: `<span class="lunar">Âm lịch ${l.day}/${l.month}${l.leap ? " nhuận" : ""} ${Lunar.yearName(l.year)}</span>${holyText}`,
      // Doanh thu chỉ Mẹ xem
      totals: isOwner() ? revenueCard() : "",
    }) + `
    ${isOwner() ? revenueChart() : ""}
    <div class="actions"><a class="btn primary" href="#/sx">${ICON.plus}${isOwner() ? "Ghi sản xuất" : "Ghi sản xuất hôm nay"}</a></div>
    <h2 class="sec">Thông tin</h2>
    <ul class="ledger">
      ${moneyRow}
      ${row({ href: "#/kho", what: "Thùng trong kho", much: num(totalCartons), muchSub: "thùng" })}
      ${t ? row({ href: "#/kho#tec", what: "Téc còn dầu", much: tanks(t.est), muchSub: "téc", cls: t.est <= 3 ? "alert" : "" }) : ""}
      ${row({ href: "#/kho#vattu", what: "Vật tư cần đặt", much: String(mats.length), muchSub: "loại", cls: mats.length ? "alert" : "done" })}
      ${row({ href: "#/sx", what: "Hôm nay đã làm được", sub: todays.length ? "" : late && !isOwner() ? "Chiều rồi mà chưa ghi. Nhớ ghi nhé!" : "Chưa ghi thùng nào", much: todayCartons ? String(todayCartons) : '<span class="none">—</span>', muchSub: todayCartons ? "thùng" : "" })}
      ${isOwner() ? (revMonth || !soldPrev.length
        ? row({ href: "#/baocao", what: `Lãi tháng ${Number(month.slice(5))}`, sub: revMonth ? "" : "Tháng này chưa bán thùng nào", much: revMonth ? num(Math.round(profitMonth / 1000) * 1000) : "—", md: true })
        : row({ href: "#/baocao", what: `Lãi tháng ${Number(prevMonth.slice(5))}`, sub: `Tháng ${Number(month.slice(5))} chưa bán thùng nào`, much: num(Math.round(profitPrev / 1000) * 1000), md: true })) : ""}
    </ul></div>`;
  }

  // ---------- Trang: Kho ----------
  const ORDER = ["HẾT", "CẦN ĐẶT", "ĐỦ", "CHƯA THEO DÕI"];
  function viewKho() {
    const oils = db.products.filter((p) => p.group === "Dầu" && !neverMade(p));
    const candles = db.products.filter((p) => p.group === "Nến");
    const t = tankInfo();
    const unusedMats = db.materials.filter((m) => materialStatus(m) === "CHƯA THEO DÕI");
    const cell = (n) => `<td class="${n <= 0 ? "zero" : ""}">${n <= 0 ? "Hết" : num(n)}</td>`;
    return band({ title: "Kho hàng" }) + `
    <div class="actions"><a class="btn primary" href="#/nhap">${ICON.plus}Nhập hàng</a></div>
    <h2 class="sec" id="thanhpham">Dầu thành phẩm <small>đơn vị: thùng</small></h2>
    ${(db.meta.textSize || 0) > 0 ? `<ul class="ledger">${oils.map((p) => row({
      // Chữ to: bảng 5 cột không vừa, mỗi loại một dòng, các màu ghi bên dưới
      what: `${esc(sxName(p))}${CALLED[p.code] ? ` <small class="kg">${esc(shortName(p))}</small>` : ""}`,
      sub: `${productStatus(p) ? `<span class="stamp red">${productStatus(p)}</span><br>` : ""}<span class="clines">${COLORS.map((c) => { const n = stock(p.code, c); return `<span class="nw">${swatch(c, "sm")}${c} ${n <= 0 ? '<b class="zero">Hết</b>' : num(n)}</span>`; }).join('<span class="sr-only">, </span>')}</span>`,
      much: num(stockTotal(p)), muchSub: "thùng", md: true, cls: productStatus(p) ? "alert" : "",
    })).join("")}</ul>` : `<div class="table-wrap"><table class="stock"><caption class="sr-only">Số thùng dầu trong kho theo loại và màu</caption>
      <thead><tr><th scope="col">Loại</th>${COLORS.map((c) => `<th scope="col">${swatch(c, "sm")}${c}</th>`).join("")}<th scope="col">Tổng</th></tr></thead>
      <tbody>${oils.map((p) => `<tr><th scope="row">${esc(sxName(p))}${CALLED[p.code] ? `<small class="kg">${esc(shortName(p))}</small>` : ""}${productStatus(p) ? ` <span class="stamp red">${productStatus(p)}</span>` : ""}</th>${COLORS.map((c) => cell(stock(p.code, c))).join("")}<td class="tot">${num(stockTotal(p))}</td></tr>`).join("")}</tbody>
    </table></div>`}
    <h2 class="sec">Nến</h2>
    <ul class="ledger">${candles.map((p) => { const rare = SX_RARE.includes(p.code), st = rare ? "" : productStatus(p);
      return row({ what: esc(p.name), sub: st ? `<span class="stamp red">${st}</span>` : rare ? "Ít khi làm" : `${p.cansPerCarton} cái một thùng`, much: stockTotal(p) > 0 ? num(stockTotal(p)) : rare ? '<span class="none">—</span>' : '<span class="none">Hết</span>', muchSub: stockTotal(p) > 0 ? "thùng" : "", md: true, cls: st ? "alert" : rare ? "done" : "" }); }).join("")}</ul>
    ${t ? `<h2 class="sec" id="tec">Téc dầu · công ${esc(t.batch.code)} <small>nhập ${dm(t.batch.date)}</small></h2>
    <ul class="ledger">
      ${row({ what: "Còn", sub: `${num(t.leftKg)} kg dầu`, much: tanks(t.est), muchSub: "téc", cls: t.est <= 3 ? "alert" : "" })}
      ${row({ what: "Đã dùng", sub: `${num(t.usedKg)} kg dầu`, much: tanks(t.usedEst), muchSub: "téc", md: true })}
    </ul>` : ""}
    ${(() => {
      // Vật tư cần đặt lên đầu; loại còn đủ gấp lại cho gọn
      const tracked = db.materials.filter((m) => materialStatus(m) !== "CHƯA THEO DÕI").sort((a, b) => ORDER.indexOf(materialStatus(a)) - ORDER.indexOf(materialStatus(b)));
      const need = tracked.filter((m) => ["HẾT", "CẦN ĐẶT"].includes(materialStatus(m))), ok = tracked.filter((m) => materialStatus(m) === "ĐỦ");
      const matRow = (m, warn) => row({ what: esc(matName(m)), sub: warn ? `<span class="stamp red">${materialStatus(m)}</span><br>tối thiểu ${num(m.min)}` : "", much: num(materialStock(m)), muchSub: esc(m.unit), md: true, cls: warn ? "alert" : "" });
      return `<h2 class="sec" id="vattu">Vật tư cần đặt <small>${need.length ? `${need.length} loại` : "không có loại nào"}</small></h2>
      ${need.length ? `<ul class="ledger">${need.map((m) => matRow(m, true)).join("")}</ul>` : `<p class="empty">Vật tư đều còn đủ.</p>`}
      ${ok.length ? `<details class="more"><summary>Vật tư còn đủ (${ok.length} loại)</summary><ul class="ledger">${ok.map((m) => matRow(m, false)).join("")}</ul></details>` : ""}`;
    })()}
    ${unusedMats.length ? `<p class="note">Chưa dùng tới: ${unusedMats.map((m) => esc(matName(m))).join(", ")}.</p>` : ""}
    ${dataTools()}`;
  }

  function dataTools() {
    return `<details class="more data"><summary>Dữ liệu và sao lưu</summary>
    ${remote || canShare ? `<div class="actions"><button class="btn" data-action="export">Lưu dự phòng</button></div>` : `<div class="actions two">
      <button class="btn" data-action="export">Lưu dự phòng</button>
      <button class="btn" data-action="import">Mở file dự phòng</button>
    </div>
    ${isOwner() ? `<div class="actions"><button class="btn" data-action="reset">Xóa hết, bắt đầu lại từ file Excel</button></div>` : ""}`}
    <p class="note">Mỗi tuần nên bấm “Lưu dự phòng” một lần.</p></details>`;
  }

  // ---------- Trang: Sổ tiền ----------
  const payWay = (m) => (m === "CK" ? "Chuyển khoản" : m === "TM" ? "Tiền mặt" : "Chưa rõ trả bằng gì");
  function viewTien(tab) {
    const ds = debtors();
    const out = outsideMoney();
    const debt = sum(ds, (c) => c.debt), outTotal = sum(out, (g) => g.total);
    const ncc = tab === "ncc";
    // Tab nhà cung cấp có số của riêng nó: mình còn nợ bao nhiêu, tháng này đã trả bao nhiêu
    const month = today().slice(0, 7);
    const nccOwed = ncc ? sum(suppliers().filter((s) => s.owed > 0), (s) => s.owed) : 0;
    const [paidM, nccPaid] = ncc ? monthPick((m) => sum(live(db.supplierPays).filter((p) => String(p.date).slice(0, 7) === m), (p) => p.amount)) : [month, 0];
    const head = band({
      title: "Sổ tiền",
      totals: total("Khách còn nợ", short(debt), "#/tien") + total("Chưa về tay Liên", short(outTotal), "#/tien/thu"),
    }) + `<div class="actions">${ncc
      ? (isOwner() ? `<a class="btn primary" href="#/tien/tra">${ICON.plus}Ghi trả nhà cung cấp</a>` : "")
      : `<a class="btn${tab === "thu" ? "" : " primary"}" href="#/tien/ghi">${ICON.plus}Ghi tiền khách trả</a>`}</div>
    ${seg([["#/tien", "Khách nợ", "no"], ["#/tien/thu", "Tiền đã thu", "thu"], ["#/tien/ncc", "Nhà cung cấp", "ncc"]], tab === "thu" ? "thu" : ncc ? "ncc" : "no")}`;

    if (ncc) {
      const ss = suppliers();
      const owing = ss.filter((s) => s.owed > 0), clear = ss.filter((s) => s.owed <= 0);
      // Món nợ lớn lên đầu; số tổng và số đã trả xuống dưới
      return head + `${owing.length ? `<h2 class="sec">${owing.length === 1 ? "Mình còn nợ" : `Mình còn nợ <small>${owing.length} nơi · ${num(nccOwed)}</small>`}</h2><ul class="ledger">${owing.map((s) => row({ href: `#/ncc/${enc(s.name)}`, what: esc(s.name), sub: s.paid ? `Đã trả ${num(s.paid)}` : "Chưa trả lần nào", much: num(s.owed), md: true })).join("")}</ul>` : `<p class="empty">Không còn nợ nhà cung cấp nào.</p>`}
      <ul class="ledger">${row({ what: `Đã trả tháng ${mo(paidM)}`, much: nccPaid ? num(nccPaid) : NONE, md: true })}</ul>
      ${clear.length ? `<h2 class="sec">Đã trả đủ</h2><ul class="ledger">${clear.map((s) => row({ href: `#/ncc/${enc(s.name)}`, what: esc(s.name), much: '<span class="stamp">ĐÃ TRẢ ĐỦ</span>', md: true, cls: "done" })).join("")}</ul>` : ""}`;
    }

    if (tab !== "thu") {
      const clear = customerIds().map(customer).filter((c) => c.debt <= 0 && c.bought > 0);
      return head + `<h2 class="sec">Đang nợ <small>${ds.length} khách</small></h2>
      ${ds.length ? `<ul class="ledger">${ds.map((c) => {
        return row({ href: `#/khach/${enc(c.id)}`, what: esc(c.name), sub: owedText(c), much: num(c.debt), md: true });
      }).join("")}</ul>` : `<p class="empty">Không khách nào còn nợ.</p>`}
      ${clear.length ? `<h2 class="sec">Đã trả đủ</h2><ul class="ledger">${clear.map((c) => row({ href: `#/khach/${enc(c.id)}`, what: esc(c.name), much: '<span class="stamp">ĐÃ TRẢ ĐỦ</span>', md: true, cls: "done" })).join("")}</ul>` : ""}`;
    }

    // Tiền chưa rõ ai cầm lên trước, để hỏi cho ra người cầm
    out.sort((a, b) => (b.holder === "Chưa ghi") - (a.holder === "Chưa ghi"));
    const handed = db.payments.filter((p) => p.handed || p.void).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20);
    return head + `<h2 class="sec">Chưa về tay Liên</h2>
    ${out.length ? out.map((g) => `
      <h3 class="grp"><span>${g.holder === "Chưa ghi" ? "Chưa rõ ai cầm" : `${esc(nameOf(g.holder))} đang cầm`}<small>${g.items.length} khoản</small></span><b>${num(g.total)}</b></h3>
      ${g.holder === "Chưa ghi" && me() ? `<p class="note">${isOwner() ? "Chạm từng dòng để ghi ai đang cầm khoản&nbsp;đó." : "Bạn đang cầm khoản nào thì chạm vào để ghi&nbsp;lại."}</p>` : ""}
      <ul class="ledger">
        ${g.items.map((p) => { const act = isOwner() ? "recv" : g.holder === "Chưa ghi" && me() ? "claim" : "";
          return row({ href: act ? "" : `#/khach/${enc(cidOf(p))}`, action: act ? `data-action="${act}" data-id="${p.id}"` : "", what: esc(cname(cidOf(p))), sub: `${dm(p.date)} · ${payWay(p.method)}`, much: num(p.amount), muchSub: g.holder === "Chưa ghi" ? "ai cầm?" : "", md: true }); }).join("")}
      </ul>
      ${!isOwner() ? "" : g.holder === "Chưa ghi"
        // Chưa biết ai cầm thì không xác nhận cả nhóm: hỏi từng khoản cho ra người cầm
        ? ""
        : `<div class="actions"><button class="btn primary stacked" data-action="handover" data-holder="${esc(g.holder)}"><span>${ICON.check}${g.items.length > 1 ? `Liên đã nhận cả ${g.items.length} khoản` : "Liên đã nhận khoản này"}</span><b>${money(g.total)}</b></button></div>
      ${g.items.length > 1 ? `<p class="note">Chạm từng dòng để xác nhận riêng khoản đó.</p>` : ""}`}
    `).join("") + (isOwner() ? "" : `<p class="info">${sync === "local" ? "Đưa tiền cho Liên xong, đưa máy cho Liên bấm “Liên đã nhận”." : "Đưa tiền cho Liên xong, Liên sẽ bấm “Liên đã nhận” trên điện thoại của Liên."}</p>`)
      : `<p class="empty">Tiền khách trả đã về tay Liên hết. Không ai đang cầm hộ.</p>`}
    <h2 class="sec">Đã về tay Liên <small>${handed.length >= 20 ? "20 lần gần nhất" : "gần đây"}</small></h2>
    ${handed.length ? `<ul class="ledger">${handed.map((p) => row({
      href: `#/khach/${enc(cidOf(p))}`, what: esc(cname(cidOf(p))),
      sub: `${dm(p.date)} · ${p.void ? '<span class="stamp grey">HỦY</span>' : p.holder === "Tài khoản Mẹ" ? `<span class="stamp pen${fr(p.id)}">TÀI KHOẢN LIÊN</span>` : `<span class="nw"><span class="stamp${fr(p.id)}">ĐÃ NỘP LIÊN</span> ${dm(p.handedDate)}</span>`}`,
      much: num(p.amount), md: true, cls: p.void ? "void" : "",
    })).join("")}</ul>` : `<p class="empty">Chưa có khoản nào về tay Liên.</p>`}`;
  }

  // ---------- Trang: Một nhà cung cấp ----------
  function viewNCC(name) {
    const s = suppliers().find((x) => x.key === skey(name));
    if (!s) return band({ title: esc(name), back: "#/tien/ncc" }) + `<p class="empty">Không có nhà cung cấp này.</p>`;
    const buys = [...s.buys].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);
    const pays = [...s.pays].sort((a, b) => b.date.localeCompare(a.date));
    return band({
      title: esc(s.name), back: "#/tien/ncc", exact: true,
      totals: total("Mình còn nợ", num(Math.max(0, s.owed)), `#/ncc/${enc(s.name)}`) + total("Đã trả", num(s.paid), `#/ncc/${enc(s.name)}`),
    }) + `
    ${isOwner() && s.owed > 0 ? `<div class="actions"><a class="btn primary" href="#/tien/tra/${enc(s.name)}">Ghi trả ${esc(s.name)}</a></div>` : ""}
    <h2 class="sec">Hàng đã nhập</h2>
    ${buys.length ? `<ul class="ledger">${buys.map((b) => row({ what: esc(b.what), sub: `${dm(b.date)} · ${num(b.qty)} ${esc(b.unit)}`, much: num(b.value), md: true })).join("")}</ul>` : `<p class="empty">Chưa nhập hàng của nơi này.</p>`}
    <h2 class="sec">Tiền đã trả</h2>
    ${pays.length ? `<ul class="ledger">${pays.map((p) => row({
      what: `${dm(p.date)}${p.method ? " · " + payWay(p.method) : ""}`, sub: p.void ? '<span class="stamp grey">HỦY</span>' : p.note ? esc(p.note) : "",
      much: num(p.amount), md: true, cls: p.void ? "void" : "",
      action: isOwner() ? voidAct("supplierPays", p) : "",
    })).join("")}</ul>` : `<p class="empty">Chưa trả lần nào.</p>`}`;
  }

  function viewTraNCC(name) {
    const F = "tra";
    if (name && fv(F, "supplier") === "") setDraft(F, "supplier", name);
    const cur = fv(F, "supplier", name || "");
    const s = suppliers().find((x) => x.key === skey(cur));
    if (!isOwner()) return band({ title: "Ghi trả nhà cung cấp", back: "#/tien/ncc" }) + `<p class="empty">Chỉ Liên ghi được tiền trả nhà cung cấp.</p>`;
    return band({ title: "Ghi trả nhà cung cấp", back: name ? `#/ncc/${enc(name)}` : "#/tien/ncc" }) + `
    <form class="form" data-form="${F}" novalidate>
      <div class="field">
        <label for="tra-supplier">Trả cho ai?</label>
        <select class="input" id="tra-supplier" name="supplier" data-rerender>
          <option value="">— Chọn nhà cung cấp —</option>
          ${supplierNames().map((n) => { const x = suppliers().find((y) => y.key === skey(n)); return `<option value="${esc(n)}" ${skey(n) === skey(cur) ? "selected" : ""}>${esc(n)}${x && x.owed > 0 ? " · nợ " + num(x.owed) : ""}</option>`; }).join("")}
        </select>
      </div>
      <div class="field">
        <label for="tra-amount">Số tiền (đồng)</label>
        ${moneyIn(F, "amount", "tra-amount", "")}
        ${s && s.owed > 0 ? `<div class="chips"><button type="button" class="chip" data-action="fill" data-form="${F}" data-name="amount" data-v="${s.owed}">Trả hết: ${num(s.owed)}</button></div>` : ""}
      </div>
      <div class="field">
        <span class="label" id="lbl-tra-m">Trả bằng gì?</span>
        <div class="choices two" role="group" aria-labelledby="lbl-tra-m">
          ${[["TM", "Tiền mặt"], ["CK", "Chuyển khoản"]].map(([v, l]) => `<button type="button" class="choice" data-action="pick" data-form="${F}" data-name="method" data-v="${v}" aria-pressed="${fv(F, "method", "TM") === v}">${l}</button>`).join("")}
        </div>
      </div>
      <div class="field"><label for="tra-date">Ngày trả</label>${dateIn(F, "date", "tra-date")}</div>
      ${errOf(F)}
      <button class="btn primary" type="submit">Lưu</button>
    </form>`;
  }

  // ---------- Trang: Một khách ----------
  function viewKhach(id) {
    if (!custById(id)) { const byName = db.customers.find((x) => x.name === id); if (byName) id = byName.id; }
    const c = customer(id);
    if (!custById(id) && !c.trips.length && !c.pays.length) return band({ title: "Không tìm thấy khách", back: "#/tien" }) + `<p class="empty">Không tìm thấy khách này. Có thể đường dẫn đã cũ. Mở Sổ tiền để tìm theo tên.</p>`;
    const phone = c.info.phone;
    return band({
      title: esc(c.name), back: "#/tien", exact: true,
      sub: [phone ? `<a href="tel:${esc(phone)}">${esc(phone)}</a>` : "", esc(c.info.address || "")].filter(Boolean).join(" · "),
      totals: total(c.debt > 0 && oldestOwed(c) ? `Còn nợ · ${ageTag(oldestOwed(c))}` : "Còn nợ", c.debt > 0 ? num(c.debt) : "0", "#/khach/" + enc(id)) + total("Đã trả", num(c.paid), "#/khach/" + enc(id)),
    }) + `
    <div class="actions two">
      <a class="btn primary" href="#/tien/ghi/${enc(id)}">Ghi tiền trả</a>
      <a class="btn" href="#/don/moi/${enc(id)}">Lên đơn mới</a>
    </div>
    <h2 class="sec">Các chuyến hàng <small>Tiền khách trả trừ vào chuyến cũ nhất trước, trừ khi đã chọn chuyến khác.</small></h2>
    ${payWhere(c)}
    ${c.trips.length ? `<ul class="ledger">${[...c.trips].reverse().map((t) => row({
      href: billHref(id, t.date), what: `Chuyến ${dm(t.date)}`,
      sub: `${num(sum(t.orders, (o) => o.cartons))} thùng<br>${itemsText(t.orders)}`,
      much: num(t.owed > 0 ? t.owed : t.amount), muchSub: t.owed > 0 ? `${t.owed < t.amount ? `còn nợ, trên ${num(t.amount)}` : "chưa trả"} · ${ageTag(t.date)}` : t.unhanded ? '<span class="stamp pen">CHƯA VỀ LIÊN</span>' : '<span class="stamp">ĐÃ TRẢ</span>', md: true,
    })).join("")}</ul>` : `<p class="empty">Chưa giao chuyến nào cho khách này.</p>`}
    <h2 class="sec">Tiền đã trả</h2>
    ${c.pays.length ? `<ul class="ledger">${[...c.pays].reverse().map((p) => row({
      what: dm(p.date) + " · " + payWay(p.method),
      sub: (p.alloc && p.alloc.length && !p.void ? `${allocText(p)}<br>` : "") + (p.void ? '<span class="stamp grey">HỦY</span>' : p.handed ? (p.holder === "Tài khoản Mẹ" ? `<span class="stamp pen${fr(p.id)}">TÀI KHOẢN LIÊN</span>` : `<span class="stamp${fr(p.id)}">ĐÃ NỘP LIÊN</span>`) : `<span class="stamp pen">${p.holder === "Chưa ghi" ? "CHƯA RÕ AI CẦM" : esc(String(nameOf(p.holder)).toUpperCase()) + " CẦM"}</span>`),
      much: num(p.amount), md: true, cls: p.void ? "void" : "",
      action: isOwner() && !p.void ? `data-action="pay-menu" data-id="${p.id}"` : "",
    })).join("")}</ul>` : `<p class="empty">Khách này chưa trả lần nào.</p>`}
    ${custById(id) ? `<div class="actions"><a class="btn" href="#/khach/${enc(id)}/sua">Sửa tên, điện thoại, địa chỉ</a></div>` : ""}`;
  }

  // Nói rõ tiền khách trả đã trừ vào chuyến nào (gối đầu: chuyến cũ nhất trước)
  function payWhere(c) {
    if (!c.paid || !c.trips.length || !c.trips.some((t) => t.owed > 0)) return "";
    const full = c.trips.filter((t) => t.owed === 0), parts = c.trips.filter((t) => t.owed > 0 && t.owed < t.amount);
    const bits = [];
    if (full.length) bits.push(`trả đủ chuyến ${full.map((t) => dm(t.date)).join(", ")}`);
    parts.forEach((t) => bits.push(`trả ${num(t.amount - t.owed)} của chuyến ${dm(t.date)}`));
    return `<p class="note">Khách đã trả ${num(c.paid)}: ${bits.join(", ")}. Còn nợ ${num(c.debt)}.${isOwner() ? " Sai chuyến thì chạm vào khoản tiền bên dưới để chọn lại." : ""}</p>`;
  }

  // Thêm khách mới, hoặc sửa thông tin khách (mọi dòng cũ đi theo mã khách nên đổi tên không mất nợ)
  function viewKhachForm(id, back) {
    const c = id ? custById(id) : null;
    const F = id ? "sua-" + id : "khach";
    return band({ title: c ? "Sửa thông tin khách" : "Khách mới", back: back || (c ? `#/khach/${enc(id)}` : "#/tien") }) + `
    <form class="form" data-form="${esc(F)}" data-kind="khach" data-id="${esc(id || "")}" data-back="${esc(back || "")}" novalidate>
      <div class="field"><label for="k-name">Tên khách</label><input class="input" id="k-name" name="name" autocomplete="off" value="${esc(fv(F, "name", c ? c.name : ""))}"></div>
      <div class="field"><label for="k-phone">Điện thoại</label><input class="input" id="k-phone" name="phone" type="tel" inputmode="tel" autocomplete="off" value="${esc(fv(F, "phone", c ? c.phone : ""))}"></div>
      <div class="field"><label for="k-address">Địa chỉ</label><input class="input" id="k-address" name="address" autocomplete="off" value="${esc(fv(F, "address", c ? c.address : ""))}"></div>
      ${errOf(F)}
      <button class="btn primary" type="submit">Lưu</button>
    </form>`;
  }

  // ---------- Trang: Ghi tiền ----------
  let payDraft = null;
  function newPayDraft(id) {
    return { customer: id || "", q: "", amount: "", method: "", date: today(), dateOpen: false, error: "" };
  }
  // Đã chọn thì thu lại thành một ô, chạm vào để chọn lại
  const pickedTile = (name, action, change, note) => `<div class="picked one"><button type="button" data-action="${action}" data-v="" aria-label="${change}, đang chọn ${esc(name)}">${esc(name)}<small>${note}</small></button></div>`;
  // Ô tìm dùng chung cho khách, vật tư và nhà cung cấp: một danh sách theo vần, tìm không cần dấu.
  const formQ = (F, field) => ({ q: () => fv(F, field + "Q"), setQ: (v) => setDraft(F, field + "Q", v) });
  const custItems = () => customerIds().map((k) => ({ v: k, label: cname(k) }));
  const byName = (a, b) => a.label.localeCompare(b.label, "vi");
  const supplierItems = () => supplierNames().map((n) => ({ v: n, label: n }));
  const PICKERS = {
    "od-cust": { items: custItems, q: () => od.q, setQ: (v) => { od.q = v; }, kind: "khách", add: "cust-add" },
    "pay-cust": { items: custItems, q: () => payDraft.q, setQ: (v) => { payDraft.q = v; }, kind: "khách", add: "cust-add" },
    "vt-material": { items: () => db.materials.map((m) => ({ v: m.code, label: matName(m) })).sort(byName), ...formQ("vt", "material"), kind: "vật tư" },
    "vt-supplier": { items: supplierItems, ...formQ("vt", "supplier"), kind: "nhà cung cấp", add: "vt-supplier", always: true },
    "dau-supplier": { items: supplierItems, ...formQ("dau", "supplier"), kind: "nhà cung cấp", add: "dau-supplier", always: true },
  };
  function pickList(name, q) {
    const P = PICKERS[name], key = plain(q), all = P.items();
    const list = (items) => `<ul>${items.map((it) => `<li><button type="button" class="cp-item" data-action="${name}" data-v="${esc(it.v)}">${esc(it.label)}</button></li>`).join("")}</ul>`;
    if (!key) return all.length ? list(all) : `<p class="cp-none">Chưa có ${P.kind} nào.</p>`;
    // Khớp ở đầu tên lên trước, rồi đầu một từ, rồi giữa từ: "huong" ra Hương Chợ Mới, Đồ Thờ An Hương, rồi mới tới Phượng Xóm Trên
    const atName = [], atWord = [], inside = [];
    all.forEach((it) => { const n = plain(it.label); if (n.includes(key)) (n.startsWith(key) ? atName : ` ${n.replace(/[^a-z0-9]+/g, " ")}`.includes(` ${key}`) ? atWord : inside).push(it); });
    const hits = [...atName, ...atWord, ...inside], typed = String(q).trim();
    const wantAdd = P.add && (P.always ? !all.some((it) => plain(it.label) === key) : !hits.length);
    const add = wantAdd ? `<button type="button" class="cp-add" data-action="${P.add}" data-v="${esc(typed)}">${ICON.plus}<span>Thêm${P.always ? "" : ` ${P.kind}`} “${esc(typed)}”</span></button>` : "";
    return (hits.length ? list(hits) : add ? "" : `<p class="cp-none">Không có ${P.kind} nào tên “${esc(typed)}”.</p>`) + add + `<p class="sr-only" role="status">${hits.length} kết quả</p>`;
  }
  // Chọn rồi thì thu lại thành một ô; chưa chọn thì là ô tìm trên danh sách cuộn được
  function pickField(name, qId, lbl, picked, change, note, side = "") {
    if (picked) return `<span class="label">${lbl}</span>${pickedTile(picked, name, change, note)}`;
    const q = PICKERS[name].q();
    return `${side ? `<div class="label-row"><label for="${qId}">${lbl}</label>${side}</div>` : `<label for="${qId}">${lbl}</label>`}
      <input class="input" id="${qId}" data-pick="${name}" type="search" enterkeyhint="search" autocomplete="off" placeholder="Tìm ${PICKERS[name].kind}" value="${esc(q)}">
      <div class="cp-list" id="${qId}-list">${pickList(name, q)}</div>`;
  }
  const custField = (c, action, qId, lbl) => pickField(action, qId, lbl, c ? c.name : "", "Đổi khách", "đổi khách",
    `<a href="#/khach-moi?ve=${enc(location.hash.slice(1))}">${ICON.plus}Khách mới</a>`);
  // Chọn khoản tiền trả cho chuyến nào; phần chưa chia thì tự trừ vào chuyến cũ nhất
  const allocSum = (a) => Object.values(a).reduce((x, n) => x + (n || 0), 0);
  const allocList = (a) => Object.entries(a).filter(([, n]) => n > 0).map(([date, amount]) => ({ date, amount }));
  const allocText = (p) => (p.alloc && p.alloc.length ? `Trả cho chuyến ${p.alloc.map((a) => dm(a.date)).join(", ")}.` : "Trừ vào chuyến cũ nhất trước.");
  function allocNote(st) {
    const left = (st.amount || 0) - allocSum(st.alloc);
    if (left < 0) return `<b>Chia dư ${num(-left)}. Bớt lại cho bằng số tiền.</b>`;
    return left ? `Còn ${num(left)} chưa chia, sẽ trừ vào chuyến cũ nhất.` : allocSum(st.alloc) ? "Đã chia hết." : "";
  }
  function allocError(trips, st) {
    if (allocSum(st.alloc) > (st.amount || 0)) return `Chia dư ${num(allocSum(st.alloc) - st.amount)}. Bớt lại cho bằng số tiền.`;
    const over = trips.find((t) => (st.alloc[t.date] || 0) > t.owed);
    return over ? `Chuyến ${dm(over.date)} chỉ còn nợ ${num(over.owed)}.` : "";
  }
  const allocRows = (trips, st) => `<div class="alloc">${trips.map((t) => `<div class="alloc-row">
      <div><label for="al-${t.date}">Chuyến ${dm(t.date)}</label><small>còn nợ ${num(t.owed)}</small>
        <button type="button" class="link" data-action="alloc-fill" data-d="${t.date}" data-o="${t.owed}">Trả đủ chuyến này</button></div>
      <input class="input" id="al-${t.date}" data-money data-alloc="${t.date}" inputmode="numeric" autocomplete="off" placeholder="0" value="${st.alloc[t.date] ? num(st.alloc[t.date]) : ""}">
    </div>`).join("")}</div>
    <p class="alloc-left" id="alloc-left" aria-live="polite">${allocNote(st)}</p>`;
  // Tên người cầm đã ghi trước đây, chọn lại cho nhanh
  const OTHER = ["Người khác", "Tài khoản người khác"];
  const otherNames = (ck) => [...new Set(db.payments.map((p) => p.holder))]
    .filter((h) => h && h !== "Chưa ghi" && !PEOPLE.includes(h) && !CK_HOLDERS.includes(h) && h.startsWith("Tài khoản ") === ck).slice(0, 6);
  const holderOf = (kind, name) => { const n = String(name || "").trim().slice(0, 40); return !n || n === "Chưa ghi" || OTHER.includes(n) ? "" : kind === "Tài khoản người khác" ? `Tài khoản ${n}` : n; };
  // Từng bước một: chọn khách xong mới hỏi số tiền, cho đỡ rối mắt
  function viewGhiTien(id) {
    if (!payDraft || (id && payDraft.customer !== id)) payDraft = newPayDraft(id);
    const d = payDraft;
    const c = d.customer ? customer(d.customer) : null;
    return band({ title: "Ghi tiền khách trả", back: id ? `#/khach/${enc(id)}` : "#/tien" }) + `
    <form class="form" data-form="pay" novalidate>
      <div class="field">${custField(c, "pay-cust", "pay-q", "1. Khách nào trả?")}</div>
      ${c ? `<div class="field">
        <label for="pay-amount">2. Trả bao nhiêu?</label>
        <input class="input money pay-amount" id="pay-amount" name="amount" inputmode="numeric" autocomplete="off" placeholder="0" value="${d.amount ? num(d.amount) : ""}">
        ${c.debt > 0 ? `<div class="pay-debt"><span>Còn nợ ${num(c.debt)}</span><button type="button" class="chip" data-action="pay-fill" data-v="${c.debt}">Trả hết</button></div>` : ""}
      </div>
      <div class="field">
        <span class="label" id="lbl-method">3. Trả bằng gì?</span>
        <div class="choices two" role="group" aria-labelledby="lbl-method">
          <button type="button" class="choice" data-action="pay-method" data-v="TM" aria-pressed="${d.method === "TM"}">Tiền mặt</button>
          <button type="button" class="choice" data-action="pay-method" data-v="CK" aria-pressed="${d.method === "CK"}">Chuyển khoản</button>
        </div>
      </div>
      ${d.dateOpen ? dateField("pay-date", "date", "Ngày nhận", d.date, today()) : `<div class="pay-day"><span>Hôm nay</span><button type="button" class="link" data-action="pay-date-open">Đổi ngày</button></div>`}
      ${d.error ? `<p class="warn" role="alert">${esc(d.error)}</p>` : ""}
      <div class="save-bar"><button class="btn primary block big" type="submit">Lưu</button></div>` : ""}
    </form>`;
  }

  // Mẹ chọn lại khoản tiền đã ghi trả cho chuyến nào
  let chia = null;
  function viewChia(pid) {
    const p = db.payments.find((x) => x.id === pid);
    if (!isOwner() || !p) return band({ title: "Chọn chuyến", back: "#/tien" }) + `<p class="empty">${p ? "Chỉ Liên chọn được chuyến cho khoản tiền." : "Không tìm thấy khoản tiền này."}</p>`;
    if (!chia || chia.id !== pid) chia = { id: pid, amount: p.amount, alloc: Object.fromEntries((p.alloc || []).map((a) => [a.date, a.amount])), error: "" };
    const trips = customer(cidOf(p), p.id).trips.filter((t) => t.owed > 0);
    return band({ title: "Khoản này trả cho chuyến nào?", sub: `${esc(cname(cidOf(p)))} · ${money(p.amount)} · ngày ${dm(p.date)}`, back: `#/khach/${enc(cidOf(p))}` }) + `
    <div class="form">
      ${trips.length ? allocRows(trips, chia) : `<p class="empty">Khách này không còn chuyến nào để trừ.</p>`}
      ${chia.error ? `<p class="warn" role="alert">${esc(chia.error)}</p>` : ""}
      ${trips.length ? `<button class="btn primary" data-action="chia-save" data-id="${p.id}">Lưu cách chia</button>` : ""}
    </div>`;
  }

  // ---------- Trang: Ghi sản xuất ----------
  // Luôn ba bước: loại → màu → số thùng. Nến không có màu thì đi thẳng tới bước 3.
  let sx = { step: 1, product: null, color: null, cartons: 0 };
  const swatch = (c, cls = "") => `<span class="swatch ${SWATCH[c]} ${cls}" aria-hidden="true"></span>`;
  function viewSX() {
    const p = sx.product ? product(sx.product) : null;
    const needColor = p && p.group === "Dầu";
    const todays = db.production.filter((x) => x.date === today()).reverse();
    const t = tankInfo();
    const sxDay = sx.day === "y" ? yday() : today();
    let body = "";

    if (sx.step === 1) {
      body = `<h2 class="sec">1. Làm loại nào?</h2>
      <div class="form">${productChoices((x) => `<button type="button" class="choice" data-action="sx-product" data-v="${x.code}" aria-pressed="false">${esc(sxName(x))}${CALLED[x.code] ? `<small>${esc(shortName(x))}</small>` : ""}</button>`, null, null)}</div>`;
    } else if (sx.step === 2 && needColor) {
      body = `<h2 class="sec">2. Màu gì?</h2>
      <div class="form"><div class="choices three">
        ${COLORS.map((c) => `<button type="button" class="choice color" data-action="sx-color" data-v="${c}">${swatch(c, "big")}<span class="cname">${c}</span></button>`).join("")}
      </div></div>`;
    } else {
      const dup = madeOn(sxDay).filter((x) => x.product === p.code && (x.color || "") === (sx.color || ""));
      body = `<h2 class="sec">3. Bao nhiêu thùng?</h2>
      <div class="form">
        <div class="choices two" role="group" aria-label="Làm ngày nào">
          <button type="button" class="choice" data-action="sx-day" data-v="h" aria-pressed="${sx.day !== "y"}">Hôm nay</button>
          <button type="button" class="choice" data-action="sx-day" data-v="y" aria-pressed="${sx.day === "y"}">Hôm qua</button>
        </div>
        ${dup.length ? `<p class="info">${sx.day === "y" ? "Hôm qua" : "Hôm nay"} đã ghi ${num(sum(dup, (x) => x.cartons))} thùng loại này rồi${dup.some((x) => x.by) ? ` (${[...new Set(dup.map((x) => nameOf(x.by)).filter(Boolean))].map(esc).join(", ")})` : ""}.</p>` : ""}
        <div class="stepper">
          <button type="button" data-action="sx-step" data-v="-1" aria-label="Bớt 1 thùng">${ICON.minus}</button>
          <input class="count-in" id="sx-n" inputmode="numeric" pattern="[0-9]*" autocomplete="off" aria-label="Số thùng" placeholder="0" value="${sx.cartons || ""}">
          <button type="button" data-action="sx-step" data-v="1" aria-label="Thêm 1 thùng">${ICON.plus}</button>
        </div>
        <div class="chips two">${[5, 10].map((n) => `<button type="button" class="chip" data-action="sx-step" data-v="${n}">+${n}</button>`).join("")}</div>
        <div class="save-bar"><button class="btn primary block" id="sx-save" data-action="sx-save" ${sx.cartons ? "" : "disabled"}>${sx.day === "y" ? `Lưu cho hôm qua, ${dm(yday())}` : "Lưu"}</button></div>
      </div>`;
    }

    return band({ title: "Ghi sản xuất", sub: sx.step === 3 && sx.day === "y" ? `Đang ghi cho <b>hôm qua, ${dm(yday())}</b> · đã ghi ${num(sum(madeOn(yday()), (x) => x.cartons))} thùng` : `Hôm nay ${dm(today())} · đã ghi ${num(sum(live(todays), (x) => x.cartons))} thùng` }) + `
    <div class="steps" aria-hidden="true">${[1, 2, 3].map((i) => `<span class="${i <= sx.step ? "on" : ""}"></span>`).join("")}</div>
    ${p ? `<div class="picked">
      <button type="button" data-action="sx-back" data-v="1" aria-label="Chọn lại loại, đang chọn ${esc(sxName(p))}">${esc(sxName(p))}<small>chọn lại</small></button>
      ${sx.color ? `<button type="button" data-action="sx-back" data-v="2" aria-label="Chọn lại màu, đang chọn ${sx.color}"><span class="nw">${swatch(sx.color, "sm")}${sx.color}</span><small>chọn lại</small></button>` : ""}
    </div>` : ""}
    ${body}
    ${sx.step === 1 ? `<h2 class="sec">Hôm nay đã ghi</h2>
    ${todays.length ? `<ul class="ledger">${todays.map((x) => row({
      what: esc(sxLabel(product(x.product), x.color)), sub: x.void ? '<span class="stamp grey">HỦY</span>' : `${esc(nameOf(x.by))} ghi`,
      much: x.cartons, muchSub: "thùng", md: true, cls: x.void ? "void" : "",
      action: !x.void && (isOwner() || x.by === me()) ? `data-action="sx-menu" data-id="${x.id}"` : "",
    })).join("")}</ul>` : `<p class="empty">Hôm nay chưa ghi gì.</p>`}
    ${t ? `<h2 class="sec">Téc dầu</h2>
    <ul class="ledger">${row({ href: "#/kho#tec", what: "Còn", much: tanks(t.est), muchSub: "téc", md: true, cls: t.est <= 3 ? "alert" : "" })}</ul>` : ""}` : ""}`;
  }

  // ---------- Trang: Đơn hàng ----------
  // Một chuyến = mọi dòng hàng giao cho một khách trong một ngày; đó là một tờ hoá đơn.
  const billHref = (id, date) => `#/hoadon/${enc(id)}/${date}`;
  // Tìm tên không cần gõ dấu: "cau minh" vẫn ra "Cậu Minh"
  const plain = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().trim().replace(/\s+/g, " ");
  function dayLabel(d) {
    const t = today(), y = iso(new Date(Date.now() - 864e5));
    if (d === t) return "Hôm nay";
    if (d === y) return "Hôm qua";
    return `${WEEKDAY[new Date(d + "T00:00:00").getDay()]}, ${dm(d)}`;
  }
  const tripValue = (t) => sum(t.orders, orderValue);
  const tripCartons = (t) => sum(t.orders, (o) => o.cartons);
  const allTrips = () => trips(live(db.orders).filter((o) => o.status === "Đã giao"))
    .sort((a, b) => b.date.localeCompare(a.date) || cname(a.id).localeCompare(cname(b.id), "vi"));
  // Còn nợ của từng chuyến (trả gối đầu: tiền trả trừ vào chuyến cũ nhất trước)
  function owedOf(list) {
    const memo = new Map();
    return (t) => {
      if (!memo.has(t.id)) memo.set(t.id, customer(t.id));
      return memo.get(t.id).trips.find((x) => x.date === t.date) || { owed: 0, unhanded: false };
    };
  }
  function payNote(owed, value, unhanded, date) {
    if (owed <= 0) return unhanded ? '<span class="stamp pen">CHƯA VỀ LIÊN</span>' : '<span class="stamp">ĐÃ TRẢ</span>';
    const age = date && daysSince(date) ? ` · ${daysSince(date)} ngày` : "";
    return `<span>${owed < value ? `còn nợ ${num(owed)}` : "chưa trả"}${age}</span>`;
  }

  let donLimit = 30, donQ = "";
  function donList() {
    // Hoá đơn đã hủy vẫn nằm trong ngày của nó, bị gạch đi, không cộng vào tổng
    const gone = trips(live(db.orders).filter((o) => o.status === "Hủy")).map((t) => ({ ...t, cancelled: true }));
    const all = [...allTrips(), ...gone].sort((a, b) => b.date.localeCompare(a.date) || (a.cancelled ? 1 : 0) - (b.cancelled ? 1 : 0) || cname(a.id).localeCompare(cname(b.id), "vi"));
    const q = plain(donQ);
    const found = q ? all.filter((t) => plain(cname(t.id)).includes(q)) : all.slice(0, donLimit);
    if (!found.length) return q ? `<p class="empty">Không có đơn nào của “${esc(donQ)}”.</p>` : `<p class="empty">Chưa giao đơn nào.</p>`;
    const owed = owedOf(found.filter((t) => !t.cancelled));
    const days = [];
    found.forEach((t) => { const d = days[days.length - 1]; if (d && d.date === t.date) d.list.push(t); else days.push({ date: t.date, list: [t] }); });
    return days.map((d) => `<section class="day" aria-label="${esc(dayLabel(d.date))}">
      ${(() => { const act = d.list.filter((t) => !t.cancelled), nGone = d.list.length - act.length;
        return `<h2 class="sec day-head">${esc(dayLabel(d.date))}<small>${act.length} đơn · ${num(sum(act, tripCartons))} thùng · ${num(sum(act, tripValue))}${nGone ? ` · ${nGone} đã hủy` : ""}</small></h2>`; })()}
      <ul class="ledger">${d.list.map((t) => { const v = tripValue(t);
        if (t.cancelled) return row({ href: billHref(t.id, t.date) + "/huy", what: esc(cname(t.id)), sub: '<span class="stamp grey">HỦY</span>', much: num(v), md: true, cls: "void" });
        return row({ href: billHref(t.id, t.date), what: esc(cname(t.id)), much: num(v), muchSub: (() => { const tr = owed(t); return payNote(tr.owed, v, tr.unhanded, t.date); })(), md: true }); }).join("")}</ul>
    </section>`).join("") + (!q && all.length > donLimit ? `<div class="actions"><button class="btn" data-action="don-more">Xem đơn cũ hơn</button></div>` : "");
  }

  function viewDon() {
    const all = allTrips(), td = today(), month = td.slice(0, 7);
    const todayT = all.filter((t) => t.date === td);
    const [mm] = monthPick((m) => all.filter((t) => t.date.slice(0, 7) === m).length), monthT = all.filter((t) => t.date.slice(0, 7) === mm);
    return band({
      title: "Đơn hàng",
      totals: total(todayT.length ? `Hôm nay · ${todayT.length} đơn` : "Hôm nay", todayT.length ? short(sum(todayT, tripValue)) : NONE, "#/don")
        + total(monthT.length ? `Tháng ${mo(mm)} · ${monthT.length} đơn` : `Tháng ${mo(mm)}`, monthT.length ? short(sum(monthT, tripValue)) : NONE, "#/don"),
    }) + `
    <div class="actions"><a class="btn primary" href="#/don/moi">${ICON.plus}Lên đơn mới</a></div>
    ${all.length > 6 ? `<div class="search"><label class="sr-only" for="don-q">Tìm đơn theo tên khách</label>
      <input class="input" id="don-q" type="search" autocomplete="off" placeholder="Tìm tên khách" value="${esc(donQ)}"></div>` : ""}
    <div id="don-list" aria-live="polite">${donList()}</div>`;
  }

  // Gộp theo loại và giá: một dòng cho mỗi loại, các màu ghi ngay dưới tên
  function billItems(lines) {
    const by = new Map();
    lines.forEach((o) => {
      const k = `${o.product}|${o.price}`;
      if (!by.has(k)) by.set(k, { p: product(o.product), price: o.price, colors: new Map(), cartons: 0 });
      const it = by.get(k);
      it.colors.set(o.color, (it.colors.get(o.color) || 0) + o.cartons);
      it.cartons += o.cartons;
    });
    return [...by.values()].filter((it) => it.p).sort((a, b) => db.products.indexOf(a.p) - db.products.indexOf(b.p) || a.price - b.price);
  }
  // Màu luôn có tên: chấm màu, số thùng, tên màu
  const colorList = (pairs) => pairs.filter(([, n]) => n > 0).sort((a, b) => COLORS.indexOf(a[0]) - COLORS.indexOf(b[0]))
    .map(([c, n]) => (c ? `<span class="nw">${swatch(c, "sm")}${n} ${c}</span>` : `<span class="nw">${n} thùng</span>`)).join('<span class="sr-only">, </span>');
  const colorCounts = (it) => colorList([...it.colors]);
  function bill(id, date) {
    const lines = live(db.orders).filter((o) => cidOf(o) === id && (o.deliver || o.date) === date && o.status === "Đã giao");
    const items = billItems(lines);
    const trip = customer(id).trips.find((t) => t.date === date);
    return { lines, items, cartons: sum(items, (it) => it.cartons), value: sum(items, (it) => it.cartons * it.price), owed: trip ? trip.owed : 0, unhanded: trip ? trip.unhanded : false, paidFrom: trip ? trip.paidFrom : [] };
  }
  // Hoá đơn dạng chữ để dán vào Zalo
  function billText(id, date) {
    const b = bill(id, date);
    return [`Hoá đơn ngày ${dmy(date)}`, `Khách: ${cname(id)}`, "",
      ...b.items.map((it) => `${sxName(it.p)} (${[...it.colors].map(([c, n]) => (c ? `${n} ${c}` : `${n}`)).join(", ")}): ${it.cartons} thùng × ${num(it.price)} = ${num(it.cartons * it.price)}`), "",
      `Tổng: ${num(b.cartons)} thùng, ${money(b.value)}`,
      b.owed <= 0 ? "Đã trả đủ." : b.owed < b.value ? `Còn nợ: ${money(b.owed)}` : `Chưa trả: ${money(b.owed)}`].join("\n");
  }

  function viewHoaDon(id, date, huy) {
    const b = bill(id, date);
    if (!b.lines.length || huy) {
      // Hoá đơn đã hủy: chỉ xem, có dấu HỦY, không mất dấu vết
      const gone = live(db.orders).filter((o) => cidOf(o) === id && (o.deliver || o.date) === date && o.status === "Hủy");
      if (!gone.length) return band({ title: "Hoá đơn", back: "#/don" }) + `<p class="empty">Không tìm thấy hoá đơn này.</p>`;
      const its = billItems(gone), dd = new Date(date + "T00:00:00");
      return band({ title: esc(cname(id)), sub: `Hoá đơn ${wdMid(dd)}, ${dmy(date)}`, back: "#/don" }) + `
      <p class="note"><span class="stamp grey">HỦY</span> Hoá đơn này đã hủy${gone[0].voidBy ? ` (${esc(nameOf(gone[0].voidBy))})` : ""}. Hàng đã được cộng lại vào kho, khách không nợ khoản này.</p>
      <h2 class="sec">Hàng trong hoá đơn đã hủy</h2>
      <ul class="ledger">${its.map((it) => row({ what: esc(sxName(it.p)), sub: `<span class="counts">${colorCounts(it)}</span><br>${num(it.cartons)} thùng × ${num(it.price)}`, much: num(it.cartons * it.price), md: true, cls: "void" })).join("")}</ul>
      <div class="actions"><a class="btn" href="#/khach/${enc(id)}">Sổ của khách</a></div>`;
    }
    const d = new Date(date + "T00:00:00");
    const who = [...new Set(b.lines.map((o) => o.by).filter((x) => x && x !== "Excel"))];
    const phone = String((custById(id) || {}).phone || "").replace(/\D/g, "");
    const self = billHref(id, date);
    const pay = b.owed <= 0 ? total(b.unhanded ? "Đã trả · chưa về tay Liên" : "Đã trả đủ", num(b.value), self)
      : total(`${b.owed < b.value ? "Còn nợ" : "Chưa trả"} · ${daysSince(date) ? daysSince(date) + " ngày" : "hôm nay"}`, num(b.owed), self);
    return band({
      title: esc(cname(id)), sub: `Hoá đơn ${wdMid(d)}, ${dmy(date)}`, back: "#/don", exact: true,
      totals: pay,
    }) + `
    <h2 class="sec">Hàng đã giao</h2>
    <ul class="ledger">${b.items.map((it) => row({
      what: esc(sxName(it.p)), sub: `<span class="counts">${colorCounts(it)}</span><br>${num(it.cartons)} thùng × ${num(it.price)}`, much: num(it.cartons * it.price), md: true,
    })).join("")}</ul>
    <ul class="ledger sum">${row({ what: "Tổng cộng", sub: `${num(b.cartons)} thùng`, much: num(b.value) })}</ul>
    ${b.paidFrom.length ? `<h2 class="sec">Đã trả <small>các khoản khách trả đã trừ vào chuyến này</small></h2>
    <ul class="ledger">${b.paidFrom.map((f) => row({ what: `Tiền trả ngày ${dm(f.date)}`,
      sub: f.handed ? (f.holder === "Tài khoản Mẹ" ? '<span class="stamp pen">TÀI KHOẢN LIÊN</span>' : '<span class="stamp">ĐÃ NỘP LIÊN</span>') : f.holder === "Chưa ghi" ? "chưa rõ ai cầm" : `${esc(nameOf(f.holder))} đang cầm`,
      much: num(f.amount), md: true })).join("")}
      ${b.owed > 0 ? row({ what: "Còn nợ", much: num(b.owed), md: true }) : ""}</ul>` : ""}
    ${b.owed > 0 ? `<div class="actions"><a class="btn primary" href="#/tien/ghi/${enc(id)}">Ghi tiền trả</a></div>` : ""}
    <div class="actions two">
      <button class="btn" data-action="bill-copy" data-c="${esc(id)}" data-d="${date}" ${phone ? `data-phone="${phone}"` : ""}>${phone ? "Gửi Zalo" : "Chép gửi Zalo"}</button>
      <a class="btn" href="#/khach/${enc(id)}">Sổ của khách</a>
    </div>
    ${who.length ? `<p class="note">Người ghi: ${who.map((x) => esc(nameOf(x))).join(", ")}</p>` : ""}
    ${isOwner() ? `<div class="actions"><button class="link" data-action="cancel-bill" data-c="${esc(id)}" data-d="${date}">Hủy hoá đơn này</button></div>` : ""}`;
  }

  // ---------- Trang: Lên đơn mới ----------
  // Một tờ đơn để điền: mỗi hàng một loại, mỗi cột một màu, gõ số thùng vào ô.
  // Tổng tiền và nút lưu luôn nằm sát dưới tay, không phải cuộn xuống tìm.
  let od = null;
  function newOrderDraft(id) { return { customer: id || "", q: "", qty: {}, price: {}, editPrice: false, date: today(), error: "" }; }
  const odPrice = (p) => od.price[p.code] || p.price;
  const odLines = () => Object.entries(od.qty).filter(([, n]) => n > 0).map(([k, n]) => {
    const [code, color] = k.split("|");
    return { p: product(code), color, cartons: n };
  }).filter((l) => l.p);
  // Khách mua gần đây nhất, để chạm một lần là chọn
  function recentCustomers(n) {
    const last = new Map();
    live(db.orders).forEach((o) => { const id = cidOf(o), d = o.deliver || o.date; if (!last.has(id) || last.get(id) < d) last.set(id, d); });
    return [...last].sort((a, b) => b[1].localeCompare(a[1])).slice(0, n).map(([id]) => id);
  }

  function orderRow(p) {
    const cols = colorsOf(p);
    const priceCell = isOwner() && od.editPrice
      ? `<input class="price-in" data-price="${p.code}" inputmode="numeric" autocomplete="off" aria-label="Giá mỗi thùng ${esc(sxName(p))}" value="${num(odPrice(p))}">`
      : `<small>${num(odPrice(p))}</small>`;
    return `<div class="os-row${cols.length === 1 ? " one" : ""}">
      <div class="os-name"><strong>${esc(sxName(p))}</strong>${priceCell}</div>
      ${cols.map((c) => {
        const k = `${p.code}|${c}`, n = od.qty[k] || 0;
        return `<input class="cell${n > stock(p.code, c) ? " over" : ""}${n ? " filled" : ""}" data-k="${k}" inputmode="numeric" pattern="[0-9]*" autocomplete="off"
          aria-label="${esc(sxName(p))}${c ? " " + c : ""}, số thùng" value="${n || ""}">`;
      }).join("")}
    </div>`;
  }

  function orderSummary() {
    const lines = odLines();
    if (!lines.length) return "";
    const byP = new Map();
    lines.forEach((l) => { if (!byP.has(l.p)) byP.set(l.p, []); byP.get(l.p).push(l); });
    const over = lines.filter((l) => l.cartons > stock(l.p.code, l.color));
    return `<h2 class="sec sub">Đơn này</h2>
    <ul class="ledger">${[...byP].map(([p, ls]) => row({
      what: esc(sxName(p)),
      sub: `<span class="counts">${colorList(ls.map((l) => [l.color, l.cartons]))}</span><br>${num(sum(ls, (l) => l.cartons))} thùng × ${num(odPrice(p))}`,
      much: num(sum(ls, (l) => l.cartons) * odPrice(p)), md: true,
    })).join("")}</ul>
    ${over.length ? `<p class="warn">Kho không đủ: ${over.map((l) => `${esc(sxLabel(l.p, l.color))} còn ${num(Math.max(0, stock(l.p.code, l.color)))}`).join(", ")}.</p>` : ""}`;
  }
  // Thanh dưới cùng của tờ đơn: tổng thùng, tổng tiền, nút lưu
  function orderBar() {
    const lines = odLines(), cartons = sum(lines, (l) => l.cartons), value = sum(lines, (l) => l.cartons * odPrice(l.p));
    const over = lines.filter((l) => l.cartons > stock(l.p.code, l.color));
    const note = over.length === 1 ? `<small class="due">Kho thiếu ${num(over[0].cartons - Math.max(0, stock(over[0].p.code, over[0].color)))} thùng ${esc(sxLabel(over[0].p, over[0].color))}</small>`
      : over.length ? `<small class="due">Kho thiếu ${over.length} loại</small>` : `<small>${od.customer ? esc(cname(od.customer)) : "Chưa chọn khách"}${cartons ? ` · ${num(cartons)} thùng` : ""}</small>`;
    return `<div class="od-total"><b>${cartons ? num(value) : '<span class="none">Chưa có hàng</span>'}</b>${note}</div>
      <button class="btn primary" type="submit" ${cartons ? "" : "aria-disabled=\"true\""}>Lưu đơn</button>`;
  }
  // Chưa chọn khách, chưa có hàng thì chưa có gì để lưu: thanh này chưa cần dính ở đáy, nhường chỗ cho danh sách khách
  const odBarRests = () => !od.customer && !odLines().length;
  const refreshOrder = () => {
    const s = document.getElementById("od-sum"); if (s) s.innerHTML = orderSummary();
    const b = document.getElementById("od-bar"); if (b) { b.innerHTML = orderBar(); b.classList.toggle("rest", odBarRests()); }
    fitFigures();
  };

  function viewDonMoi(id) {
    if (!od || (id && od.customer !== id)) od = newOrderDraft(id);
    const c = od.customer ? customer(od.customer) : null;
    const owed = c ? c.trips.filter((t) => t.owed > 0) : [];
    const usual = db.products.filter((p) => !isRareKind(p)), rare = db.products.filter(isRareKind);
    const head =`<div class="os-row os-head" aria-hidden="true"><span></span>${COLORS.map((col) => `<span>${swatch(col, "mid")}<small>${col}</small></span>`).join("")}</div>`;
    return band({ title: "Lên đơn mới", back: id ? `#/khach/${enc(id)}` : "#/don" }) + `
    <form class="form order-form" data-form="order" novalidate>
      ${dateField("od-date", "date", "Ngày giao", od.date)}
      <div class="field">${custField(c, "od-cust", "od-q", "Khách")}</div>
      ${c && c.debt > 0 ? `<p class="info">${esc(c.name)} còn nợ <b>${money(c.debt)}</b>${owed.length ? ` từ chuyến ${dm(owed[0].date)}` : ""}. Nhớ hỏi tiền chuyến trước.</p>` : ""}
      <div class="field">
        <div class="label-row"><span class="label">Số thùng</span>${isOwner() ? `<button type="button" class="link" data-action="od-edit-price" aria-pressed="${od.editPrice}">${od.editPrice ? "Xong sửa giá" : "Sửa giá"}</button>` : ""}</div>
        <div class="order-sheet">${head}${usual.map(orderRow).join("")}</div>
        ${rare.length ? `<details class="more"${rare.some((p) => colorsOf(p).some((col) => od.qty[`${p.code}|${col}`] > 0)) ? " open" : ""}>
          <summary>Loại khác</summary><div class="order-sheet">${head}${rare.map(orderRow).join("")}</div></details>` : ""}
      </div>
      <div id="od-sum" aria-live="polite">${orderSummary()}</div>
      ${od.error ? `<p class="warn" role="alert">${esc(od.error)}</p>` : ""}
      <div class="od-bar${odBarRests() ? " rest" : ""}" id="od-bar">${orderBar()}</div>
    </form>`;
  }

  // ---------- Trang: Nhập hàng (vật tư, dầu, hao hụt) ----------
  const voidAct = (col, rec) => (isOwner() || rec.by === me()) && !rec.void ? `data-action="void-menu" data-col="${col}" data-id="${rec.id}"` : "";
  // Hàng trong kho để chọn khi ghi hao hụt
  const fpItems = () => db.products.filter((p) => !neverMade(p)).flatMap((p) => colorsOf(p).map((c) => ({ store: "Thành phẩm", code: p.code, color: c, name: label(p, c), unit: "thùng", system: stock(p.code, c) })));
  const nvlItems = () => db.materials.filter((m) => materialStatus(m) !== "CHƯA THEO DÕI").map((m) => ({ store: "NVL", code: m.code, color: "", name: matName(m), unit: m.unit, system: materialStock(m) }));
  const itemKey = (it) => `${it.code}|${it.color}`;

  function viewNhap(tab) {
    tab = ["vt", "dau", "hh"].includes(tab) ? tab : "vt";
    const head = band({ title: "Nhập hàng", back: "#/kho" }) + seg([["#/nhap", "Vật tư", "vt"], ["#/nhap/dau", "Dầu", "dau"], ["#/nhap/hh", "Hao hụt", "hh"]], tab);
    if (tab === "dau") return head + nhapDau();
    if (tab === "hh") return head + nhapHH();
    const F = "vt", m = material(fv(F, "material")) || null;
    const recent = [...db.purchases].sort((a, b) => (b.createdAt || b.date).localeCompare(a.createdAt || a.date)).slice(0, 10);
    return head + `
    <form class="form" data-form="${F}" novalidate>
      <div class="field">${pickField("vt-material", "vt-m", "Vật tư", m ? matName(m) : "", "Đổi vật tư", "đổi vật tư")}</div>
      <div class="field"><label for="vt-q">Số lượng${m ? ` (${esc(m.unit)})` : ""}</label>${qtyIn(F, "qty", "vt-q")}</div>
      <div class="field"><label for="vt-p">Giá mỗi ${m ? esc(m.unit) : "cái"} (đồng)</label>${moneyIn(F, "price", "vt-p", m ? matPrice(m.code) : "")}</div>
      <div class="field">${pickField("vt-supplier", "vt-s", "Mua của ai?", String(fv(F, "supplier")).trim(), "Đổi nơi mua", "đổi nơi mua")}</div>
      <div class="field"><label for="vt-d">Ngày nhập</label>${dateIn(F, "date", "vt-d")}</div>
      ${errOf(F)}
      <button class="btn primary" type="submit">Lưu</button>
    </form>
    <h2 class="sec">Lần nhập gần đây</h2>
    ${recent.length ? `<ul class="ledger">${recent.map((x) => { const mm = material(x.material) || {}; return row({
      what: esc(matName(material(x.material)) || x.material), sub: x.void ? '<span class="stamp grey">HỦY</span>' : `${dm(x.date)} · ${esc(x.supplier || "")}`,
      much: num(x.qty), muchSub: esc(mm.unit || ""), md: true, cls: x.void ? "void" : "", action: voidAct("purchases", x),
    }); }).join("")}</ul>` : `<p class="empty">Chưa nhập vật tư nào.</p>`}`;
  }

  function nhapDau() {
    const F = "dau", bs = batchesByDate(), last = bs[bs.length - 1] || {};
    return `
    <form class="form" data-form="${F}" novalidate>
      <div class="field"><label for="dau-c">Công số</label><input class="input" id="dau-c" name="code" autocomplete="off" value="${esc(fv(F, "code", nextBatchCode()))}"></div>
      <div class="field"><label for="dau-kg">Số kg dầu</label>${qtyIn(F, "kg", "dau-kg")}</div>
      <div class="field"><label for="dau-t">Đủ bao nhiêu téc?</label>${qtyIn(F, "tanks", "dau-t")}</div>
      <div class="field"><label for="dau-p">Giá mỗi kg (đồng)</label>${moneyIn(F, "price", "dau-p", last.pricePerKg || "")}</div>
      <div class="field">${pickField("dau-supplier", "dau-s", "Mua của ai?", String(fv(F, "supplier", last.supplier || "")).trim(), "Đổi nơi mua", "đổi nơi mua")}</div>
      <div class="field"><label for="dau-d">Ngày nhập</label>${dateIn(F, "date", "dau-d")}</div>
      ${errOf(F)}
      <button class="btn primary" type="submit">Lưu</button>
    </form>
    <h2 class="sec">Các công đã nhập</h2>
    ${db.batches.length ? `<ul class="ledger">${[...db.batches].sort((a, b) => b.date.localeCompare(a.date)).map((b) => row({
      what: `Công ${esc(b.code)}`, sub: b.void ? '<span class="stamp grey">HỦY</span>' : `${dm(b.date)} · ${esc(b.supplier || "")} · ${tanks(b.tanks || 0)} téc`,
      much: num(b.kg), muchSub: "kg", md: true, cls: b.void ? "void" : "", action: voidAct("batches", b),
    })).join("")}</ul>` : `<p class="empty">Chưa nhập công dầu nào.</p>`}`;
  }

  function nhapHH() {
    const F = "hh", kind = fv(F, "kind", "tp");
    const items = kind === "tp" ? fpItems() : nvlItems();
    const cur = fv(F, "item");
    const it = items.find((x) => itemKey(x) === cur);
    const recent = db.losses.filter((l) => !l.countId).sort((a, b) => (b.createdAt || b.date).localeCompare(a.createdAt || a.date)).slice(0, 10);
    return `
    <form class="form" data-form="${F}" novalidate>
      <div class="field">
        <span class="label" id="lbl-hh-k">Hao hụt gì?</span>
        <div class="choices two" role="group" aria-labelledby="lbl-hh-k">
          ${[["tp", "Thành phẩm"], ["vt", "Vật tư"]].map(([v, l]) => `<button type="button" class="choice" data-action="pick" data-form="${F}" data-name="kind" data-v="${v}" data-clear="item" aria-pressed="${kind === v}">${l}</button>`).join("")}
        </div>
      </div>
      <div class="field">
        <label for="hh-i">Loại</label>
        <select class="input" id="hh-i" name="item" data-rerender>
          <option value="">— Chọn —</option>
          ${items.map((x) => `<option value="${esc(itemKey(x))}" ${itemKey(x) === cur ? "selected" : ""}>${esc(x.name)}</option>`).join("")}
        </select>
        ${it ? `<p class="hint">Trong kho: ${num(it.system)} ${esc(it.unit)}</p>` : ""}
      </div>
      <div class="field"><label for="hh-q">Hỏng, mất bao nhiêu${it ? ` (${esc(it.unit)})` : ""}?</label>${qtyIn(F, "qty", "hh-q")}</div>
      <div class="field"><label for="hh-r">Vì sao?</label><input class="input" id="hh-r" name="reason" autocomplete="off" value="${esc(fv(F, "reason"))}"></div>
      <div class="field"><label for="hh-d">Ngày</label>${dateIn(F, "date", "hh-d")}</div>
      ${errOf(F)}
      <button class="btn primary" type="submit">Lưu</button>
    </form>
    <h2 class="sec">Hao hụt gần đây</h2>
    ${recent.length ? `<ul class="ledger">${recent.map((l) => row({
      what: esc(lossName(l)), sub: l.void ? '<span class="stamp grey">HỦY</span>' : `${dm(l.date)}${l.reason ? " · " + esc(l.reason) : ""}`,
      much: num(l.qty), muchSub: esc(lossUnit(l)), md: true, cls: l.void ? "void" : "", action: voidAct("losses", l),
    })).join("")}</ul>` : `<p class="empty">Chưa ghi hao hụt nào.</p>`}`;
  }
  const lossName = (l) => (l.store === "NVL" ? matName(material(l.code)) || l.code : product(l.code) ? label(product(l.code), l.color || "") : l.code);
  const lossUnit = (l) => (l.store === "NVL" ? (material(l.code) || {}).unit || "" : "thùng");

  // ---------- Trang: Báo cáo (chỉ Mẹ) ----------
  const monthOf = (s) => s.slice(0, 7);
  const costOf = (o) => o.cartons * unitCost(product(o.product) || {}).total;
  // Màu đi theo loại hàng, không theo thứ hạng, nên lọc tháng nào một loại vẫn một màu. Mỗi loại: [ô màu, chữ tối trên miếng sáng].
  const PIE = { "DAU-0.5": [1, 0], "DAU-0.6": [2, 1], "DAU-0.8": [3, 1], "DAU-1": [4, 0], "DAU-1.3": [5, 1], "DAU-1.5": [6, 0], "DAU-HS": [7, 1],
    "DAU-1.1": [8, 1], "DAU-1.2": [9, 1], "DAU-1.4": [10, 1], "NEN-TL": [11, 0], "NEN-SH": [12, 1] };
  // slice: chưa chọn gì thì nhấc sẵn miếng lớn nhất; null là người dùng đã đặt xuống
  let bc = { month: null, slice: undefined }, pieNow = [];
  const bcMonth = () => bc.month || today().slice(0, 7);
  const monthText = (m) => `${Number(m.slice(5))}/${m.slice(0, 4)}`;
  // Các tháng có bán, mới nhất trước; tháng này luôn có để quay về
  const bcMonths = () => [...new Set([today().slice(0, 7), ...soldOrders().map((o) => monthOf(soldDay(o)))])].sort().reverse();
  // Doanh thu cao nhất trước, cả trên bánh lẫn trong chú giải
  function pieSlices(orders) {
    const rows = db.products.map((p) => {
      const os = orders.filter((o) => o.product === p.code);
      return { code: p.code, name: sxName(p), rev: sum(os, orderValue), cartons: sum(os, (o) => o.cartons), tone: PIE[p.code] || [8, 1] };
    }).filter((x) => x.rev > 0).sort((a, b) => b.rev - a.rev);
    const all = sum(rows, (x) => x.rev);
    let a = -Math.PI / 2;
    return rows.map((x) => {
      const share = x.rev / all, from = a, to = a + share * 2 * Math.PI - (share > 0.9995 ? 0.002 : 0);
      a += share * 2 * Math.PI;
      return { ...x, share, from, to, pct: share < 0.005 ? "<1" : String(Math.round(share * 100)) };
    });
  }
  // Bánh vòng nổi: mặt trên là vành elip; thành ngoài thấy ở nửa trước, thành trong thấy ở nửa sau qua lỗ giữa
  const PIE_BOX = { w: 343, h: 240, cx: 171.5, cy: 102, rx: 150, ry: 84, depth: 38, hole: 0.44 };
  function pieSvg(slices, active) {
    const { w, h, cx, cy, rx, ry, depth, hole } = PIE_BOX, irx = rx * hole, iry = ry * hole;
    const out = (t, dz = 0) => `${(cx + rx * Math.cos(t)).toFixed(1)} ${(cy + ry * Math.sin(t) + dz).toFixed(1)}`;
    const inn = (t, dz = 0) => `${(cx + irx * Math.cos(t)).toFixed(1)} ${(cy + iry * Math.sin(t) + dz).toFixed(1)}`;
    const arcOut = (t, big, sweep, dz = 0) => `A${rx} ${ry} 0 ${big ? 1 : 0} ${sweep} ${out(t, dz)}`;
    const arcIn = (t, big, sweep, dz = 0) => `A${irx.toFixed(1)} ${iry.toFixed(1)} 0 ${big ? 1 : 0} ${sweep} ${inn(t, dz)}`;
    const wallOut = (a, b) => `M${out(a)} ${arcOut(b, b - a > Math.PI, 1)} L${out(b, depth)} ${arcOut(a, b - a > Math.PI, 0, depth)} Z`;
    const wallIn = (a, b) => `M${inn(a)} ${arcIn(b, b - a > Math.PI, 1)} L${inn(b, depth)} ${arcIn(a, b - a > Math.PI, 0, depth)} Z`;
    const cut = (t) => `M${inn(t)} L${out(t)} L${out(t, depth)} L${inn(t, depth)} Z`;
    const shaded = (cls, d, extra = "") => `<path class="${cls}" d="${d}"${extra}/><path class="${cls}-shade pie-shade" d="${d}"${extra}/>`;
    const clip = ' clip-path="url(#pie-hole)"';
    const piece = (x) => {
      const mid = (x.from + x.to) / 2, big = x.to - x.from > Math.PI;
      const f0 = Math.max(x.from, 0), f1 = Math.min(x.to, Math.PI);
      // Nửa sau của lỗ: góc từ -90° tới 0° và từ 180° tới 270°
      const back = [[Math.max(x.from, -Math.PI / 2), Math.min(x.to, 0)], [Math.max(x.from, Math.PI), Math.min(x.to, 1.5 * Math.PI)]].filter(([a, b]) => b > a);
      const lx = cx + rx * 0.72 * Math.cos(mid), ly = cy + ry * 0.72 * Math.sin(mid) + 5;
      return `<g class="slice${x.code === active ? " on" : ""}" data-slice="${x.code}" style="--c:var(--pie-${x.tone[0]});--dx:${(Math.cos(mid) * 14).toFixed(1)}px;--dy:${(Math.sin(mid) * 10 - 10).toFixed(1)}px">
        ${back.map(([a, b]) => shaded("pie-in", wallIn(a, b), clip)).join("")}
        ${shaded("pie-cut", cut(x.from))}${shaded("pie-cut", cut(x.to))}
        ${f1 > f0 ? shaded("pie-out", wallOut(f0, f1)) : ""}
        <path class="pie-top" d="M${out(x.from)} ${arcOut(x.to, big, 1)} L${inn(x.to)} ${arcIn(x.from, big, 0)} Z"/>
        ${x.share >= 0.06 ? `<text class="pie-pct${x.tone[1] ? " ink" : ""}" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}">${x.pct}%</text>` : ""}
      </g>`;
    };
    const order = [...slices.filter((x) => x.code !== active), ...slices.filter((x) => x.code === active)];
    return `<svg viewBox="0 0 ${w} ${h}" aria-hidden="true" focusable="false">
      <defs><clipPath id="pie-hole"><ellipse cx="${cx}" cy="${cy}" rx="${irx.toFixed(1)}" ry="${iry.toFixed(1)}"/></clipPath></defs>
      <g class="pie-slices">${order.map(piece).join("")}</g>
    </svg>`;
  }
  const pieDetail = (x) => (x
    ? `<strong>${esc(x.name)}</strong><span class="pie-money">${money(x.rev)}</span><small>${x.pct}% doanh thu · ${num(x.cartons)} thùng</small>`
    : '<span class="pie-hint">Chạm hoặc giữ một miếng để xem số.</span>');
  // Nhấc miếng bánh tại chỗ, không vẽ lại cả trang
  function pieSet(code) {
    if (bc.slice === code) return;
    bc.slice = code;
    const holder = document.querySelector("#pie .pie-slices");
    if (!holder) return;
    holder.querySelectorAll(".slice.on").forEach((g) => g.classList.remove("on"));
    if (code) {
      const g = holder.querySelector(`[data-slice="${CSS.escape(code)}"]`);
      if (g) { holder.appendChild(g); g.getBoundingClientRect(); g.classList.add("on"); }
    }
    const d = document.getElementById("pie-detail");
    if (d) d.innerHTML = pieDetail(pieNow.find((x) => x.code === code));
    document.querySelectorAll(".pie-key").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === code)));
  }
  function monthsSheet() {
    const cur = bcMonth();
    sheet(`<h2 id="sheet-title">Xem tháng nào?</h2>
      ${bcMonths().map((m) => `<button class="btn block" data-action="bc-month" data-v="${m}" aria-pressed="${m === cur}">Tháng ${monthText(m)}</button>`).join("")}
      <div class="sheet-links"><span></span><button class="link" data-action="sheet-no">Đóng</button></div>`);
  }

  function viewBaoCao() {
    if (!isOwner()) return band({ title: "Báo cáo", back: "#/" }) + `<p class="empty">Chỉ Liên xem được trang này.</p>`;
    const m = bcMonth(), os = soldOrders().filter((o) => monthOf(soldDay(o)) === m);
    const rev = sum(os, orderValue), profit = rev - sum(os, costOf);
    pieNow = pieSlices(os);
    if (bc.slice === undefined) bc.slice = pieNow.length ? pieNow[0].code : null;
    else if (!pieNow.some((x) => x.code === bc.slice)) bc.slice = null;
    return band({ title: `Báo cáo tháng ${monthText(m)}`, back: "#/", exact: true,
      side: `<button class="who icon" data-action="bc-months" aria-label="Chọn tháng khác, đang xem tháng ${monthText(m)}">${ICON.cal}</button>`,
      totals: total("Doanh thu", rev ? num(rev) : NONE, "#/baocao") + total("Lợi nhuận", rev ? num(Math.round(profit / 1000) * 1000) : NONE, "#/baocao") }) + `
    <h2 class="sec">Theo loại hàng</h2>
    ${pieNow.length ? `<div class="pie-detail" id="pie-detail" aria-live="polite">${pieDetail(pieNow.find((x) => x.code === bc.slice))}</div>
    <div id="pie">${pieSvg(pieNow, bc.slice)}</div>
    <ul class="pie-legend">${pieNow.map((x) => `<li><button type="button" class="pie-key" data-action="bc-slice" data-v="${x.code}" aria-pressed="${x.code === bc.slice}" style="--c:var(--pie-${x.tone[0]})"><span class="pie-swatch" aria-hidden="true"></span><span>${esc(x.name)}</span><b>${num(x.rev)}</b></button></li>`).join("")}</ul>`
      : `<p class="empty">Tháng ${monthText(m)} chưa bán thùng nào. Chạm vào hình lịch ở góc trên để xem tháng khác.</p>`}`;
  }

  // Bánh: nhấn xuống là nhấc miếng lên, buông ra vẫn giữ để đọc số; chạm lại miếng đó hoặc chỗ trống thì đặt xuống.
  // Đang vuốt cuộn trang thì máy huỷ lần nhấn: trả về như trước.
  let piePress = null;
  document.addEventListener("pointerdown", (e) => {
    if (!e.target.closest || !e.target.closest("#pie")) return;
    const g = e.target.closest("[data-slice]"), code = g ? g.dataset.slice : null;
    piePress = { was: bc.slice, code };
    if (code && code !== bc.slice) pieSet(code);
  });
  document.addEventListener("pointerup", () => {
    if (!piePress) return;
    const p = piePress; piePress = null;
    if (!p.code || p.code === p.was) pieSet(null);
  });
  document.addEventListener("pointercancel", () => {
    if (!piePress) return;
    const p = piePress; piePress = null;
    pieSet(p.was);
  });
  document.addEventListener("contextmenu", (e) => { if (e.target.closest && e.target.closest("#pie")) e.preventDefault(); });

  // ---------- Bảng chọn người / xác nhận ----------
  let sheetReturn = null, focusAfter = null, walk = null;
  function sheet(html) {
    if (!document.getElementById("sheet")) sheetReturn = document.activeElement;
    closeSheet(true);
    const bg = document.createElement("div");
    bg.className = "sheet-bg"; bg.id = "sheet";
    bg.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">${html}</div>`;
    bg.addEventListener("click", (e) => { if (e.target === bg && me()) closeSheet(); });
    document.body.appendChild(bg);
    const title = bg.querySelector("#sheet-title");
    if (title) { title.tabIndex = -1; title.focus(); } else { const first = bg.querySelector("button, textarea"); if (first) first.focus(); }
    return bg;
  }
  function closeSheet(keep) {
    const s = document.getElementById("sheet"); if (s) s.remove();
    if (keep) return;
    walk = null;
    // Trang vẽ lại thì nút cũ mất; nhớ dòng đã chạm để trả chỗ đứng sau khi vẽ
    const r = sheetReturn, d = r && r.dataset;
    focusAfter = d && d.action ? `[data-action="${CSS.escape(d.action)}"]${d.id ? `[data-id="${CSS.escape(d.id)}"]` : ""}` : null;
    (r && document.contains(r) ? r : document.querySelector(".who") || document.getElementById("main")).focus();
    sheetReturn = null;
  }
  const unknownPays = () => live(db.payments).filter((p) => !p.handed && p.holder === "Chưa ghi").sort((a, b) => a.date.localeCompare(b.date));
  // Ghi xong một khoản: còn khoản chưa rõ thì hỏi tiếp ngay, hết thì báo và cho Ghi nhầm
  function stepOn(msg, undo) {
    const w = walk;
    closeSheet(); save(); render();
    const rest = w ? unknownPays() : [];
    if (rest.length) { walk = { done: w.done + 1, total: w.total, last: { msg, undo } }; recvSheet(rest[0]); }
    else toast(msg, undo, true);
  }
  function recvSheet(p) {
    const unk = p.holder === "Chưa ghi";
    // Chưa rõ ai cầm thì hỏi người cầm trước. Mẹ nhận rồi cũng phải chọn, để sổ biết tiền về bằng đường nào.
    const all = p.method === "CK" ? CK_HOLDERS : p.method === "TM" ? PEOPLE : [...PEOPLE, "Tài khoản Mẹ"];
    const opts = unk ? all : all.filter((h) => !WITH_OWNER.includes(h) && (h !== p.holder || OTHER.includes(h)));
    const pick = (h) => WITH_OWNER.includes(h)
      ? `<button class="btn" data-action="recv-yes" data-id="${p.id}" data-v="${esc(h)}">${h === OWNER ? "Liên đã nhận" : "Tài khoản Liên"}</button>`
      : OTHER.includes(h) ? `<button class="btn" data-action="recv-other" data-id="${p.id}" data-v="${esc(h)}">${h === "Người khác" ? "Người khác…" : "Tài khoản khác…"}</button>`
      : `<button class="btn" data-action="recv-holder" data-id="${p.id}" data-v="${esc(h)}">${esc(nameOf(h))}</button>`;
    const multi = walk && walk.total > 1;
    sheet(`<h2 id="sheet-title">${esc(cname(cidOf(p)))} · ${money(p.amount)}</h2>
      ${walk && walk.last ? `<p class="just">${esc(walk.last.msg)} <button class="link" data-action="walk-undo">Ghi nhầm</button></p>` : ""}
      <p>${multi ? `Khoản ${walk.done + 1}/${walk.total} · ` : ""}Ngày ${dm(p.date)} · ${payWay(p.method)}${unk ? "" : ` · ${esc(nameOf(p.holder))} đang cầm`}.</p>
      ${unk ? "" : `<button class="btn block primary" data-action="recv-yes" data-id="${p.id}">${ICON.check}Liên đã nhận khoản này</button>`}
      ${opts.length ? `<p class="ask" id="recv-ask">${unk ? "Ai đang cầm khoản này?" : "Hoặc ghi lại người đang cầm"}</p>
      <div class="choices two" role="group" aria-labelledby="recv-ask">${opts.map(pick).join("")}</div>` : ""}
      <div class="sheet-links"><button class="link" data-action="go-close" data-v="#/khach/${enc(cidOf(p))}">Xem sổ của khách</button>
      <button class="link" data-action="sheet-no">${multi ? "Để sau" : "Thôi"}</button></div>`);
  }
  // Hỏi tên người cầm: gõ mới hoặc chọn tên đã ghi trước đây
  function otherSheet(p, kind) {
    const ck = kind !== "Người khác", names = otherNames(ck);
    const bg = sheet(`<h2 id="sheet-title">${ck ? "Tài khoản của ai?" : "Người đó là ai?"}</h2>
      <p>${esc(cname(cidOf(p)))} · ${money(p.amount)}.</p>
      ${names.length ? `<div class="chips">${names.map((n) => `<button class="chip" data-action="recv-other-save" data-id="${p.id}" data-v="${esc(n)}">${esc(ck ? n.replace(/^Tài khoản /, "") : n)}</button>`).join("")}</div>` : ""}
      <label class="sr-only" for="other-name">Tên người cầm</label>
      <input class="input" id="other-name" autocomplete="off" maxlength="40" placeholder="Gõ tên">
      <p class="warn" id="other-err" role="alert" tabindex="-1" hidden>Chưa có tên. Gõ tên người đang cầm tiền.</p>
      <button class="btn block primary" data-action="recv-other-save" data-id="${p.id}" data-k="${esc(kind)}">Lưu tên này</button>
      <div class="sheet-links"><span></span><button class="link" data-action="sheet-no">Thôi</button></div>`);
    const box = bg.querySelector("#other-name");
    box.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); bg.querySelector('[data-k]').click(); } });
  }
  function whoSheet() {
    const sizes = `<h2 id="size-title" class="sheet-sub">Cỡ chữ</h2>
      <div class="size-pick" role="group" aria-labelledby="size-title">
        ${SIZES.map((s, i) => `<button type="button" class="choice" data-action="set-size" data-v="${i}" aria-pressed="${(db.meta.textSize || 0) === i}">${s.label}</button>`).join("")}
      </div>`;
    if (canShare) {
      sheet(`<h2 id="sheet-title">${esc(nameOf(who.name))}</h2>
        <p>${isOwner() ? "Máy này đang dùng tài khoản của Liên, nên có đủ quyền của Liên." : "App sẽ nhớ ai đã ghi từng dòng."}</p>
        ${sizes}
        <button class="btn block" data-action="sign-out">Đăng xuất</button>
        <div class="sheet-links"><span></span><button class="link" data-action="sheet-no">Đóng</button></div>`);
      return;
    }
    sheet(`<h2 id="sheet-title">Ai đang dùng máy này?</h2><p>App sẽ nhớ ai đã ghi từng dòng.</p>
      ${people().map((p) => `<button class="btn block ${p === me() ? "primary" : ""}" data-action="set-user" data-v="${esc(p)}" aria-pressed="${p === me()}">${esc(nameOf(p))}</button>`).join("")}
      ${sizes}`);
  }
  function confirmSheet(title, text, yesLabel, onYes, _danger, noLabel = "Thôi, không làm") {
    sheet(`<h2 id="sheet-title">${title}</h2><p>${text}</p>
      <button class="btn block primary" data-action="sheet-yes">${yesLabel}</button>
      <button class="btn block" data-action="sheet-no">${noLabel}</button>`);
    pendingYes = onYes;
  }
  let pendingYes = null;
  // Máy thử (không có kết nối) mới hỏi tên; có kết nối thì tên lấy từ tài khoản đăng nhập
  const maybeAsk = () => {
    if (canShare) return;
    if (!me() && !document.getElementById("sheet")) whoSheet();
  };

  // ---------- Điều hướng ----------
  function route() {
    const h = location.hash.replace(/^#\/?/, "");
    const [path, anchor] = h.split("#");
    const parts = path.split("/").map(decodeURIComponent);
    return { parts, anchor };
  }

  function render() {
    if (gate !== "ok") { renderGate(); return; }
    document.body.classList.remove("gated");
    const { parts, anchor } = route();
    const [a0, b, c] = parts;
    const [a, query] = a0.split("?");
    let html, tab = "home";
    if (a === "tien" && b === "ghi") { html = viewGhiTien(c); tab = "tien"; }
    else if (a === "tien" && b === "chia") { html = viewChia(c); tab = "tien"; }
    else if (a === "tien" && b === "tra") { html = viewTraNCC(c); tab = "tien"; }
    else if (a === "tien") { html = viewTien(b); tab = "tien"; }
    else if (a === "ncc" && b) { html = viewNCC(b); tab = "tien"; }
    else if (a === "khach-moi") { html = viewKhachForm(null, (new URLSearchParams(query || "").get("ve") || "") ? "#" + new URLSearchParams(query).get("ve") : ""); tab = "tien"; }
    else if (a === "khach" && b && c === "sua") { html = viewKhachForm(b); tab = "tien"; }
    else if (a === "khach" && b) { html = viewKhach(b); tab = "tien"; }
    else if (a === "sx") { html = viewSX(); tab = "sx"; }
    else if (a === "don" && b === "moi") { html = viewDonMoi(c); tab = "don"; }
    else if (a === "hoadon" && b && c) { html = viewHoaDon(b, c, parts[3] === "huy"); tab = "don"; }
    else if (a === "don") { html = viewDon(); tab = "don"; }
    else if (a === "kho") { html = viewKho(); tab = "kho"; }
    else if (a === "nhap") { html = viewNhap(b); tab = "kho"; }
    else if (a === "baocao") { html = viewBaoCao(); tab = "home"; }
    else html = viewHome();
    const main = document.getElementById("main");
    // Danh sách khách đang cuộn dở thì giữ nguyên chỗ khi trang vẽ lại (số mới từ sổ chung về giữa chừng)
    const cp = main.querySelector(".cp-list"), cpTop = cp ? cp.scrollTop : 0, cpId = cp ? cp.id : "";
    main.innerHTML = html;
    if (cpTop) { const again = document.getElementById(cpId); if (again) again.scrollTop = cpTop; }
    const h1 = main.querySelector("h1");
    document.title = (h1 ? h1.textContent.trim() + " · " : "") + "Sổ công dầu";
    document.querySelectorAll(".tabs a").forEach((el) => {
      if (el.dataset.tab === tab) el.setAttribute("aria-current", "page"); else el.removeAttribute("aria-current");
    });
    fit();
    if (focusAfter) { const f = main.querySelector(focusAfter); if (f) f.focus({ preventScroll: true }); focusAfter = null; }
    if (fresh.size) setTimeout(() => fresh.clear(), 700);
    if (anchor) { const t = document.getElementById(anchor); if (t) t.scrollIntoView(); }
  }

  // Số to tự thu nhỏ cho vừa ô: chữ to thì số ngắn to theo, số dài vẫn nằm gọn bên phải lề đỏ
  function fitFigures() {
    document.querySelectorAll(".row .much, .total b, .od-total b").forEach((el) => {
      el.style.fontSize = "";
      let fs = parseFloat(getComputedStyle(el).fontSize);
      // Số canh phải nên tràn sang trái, scrollWidth không thấy: đo cả mép trái
      const pad = parseFloat(getComputedStyle(el).paddingLeft) || 0;
      // Con dấu dưới số được xuống dòng nên không đẩy ô rộng ra: đo riêng phần chữ số so với chỗ còn lại
      const stack = el.querySelector(".stack"), fig = stack && stack.firstElementChild;
      const figWide = () => { if (!fig) return false; const r = document.createRange(); r.selectNodeContents(fig); return r.getBoundingClientRect().width > stack.clientWidth + 1; };
      const over = () => el.scrollWidth > el.clientWidth + 1 || figWide() || (el.firstElementChild && el.firstElementChild.getBoundingClientRect().left < el.getBoundingClientRect().left + pad - 1);
      while (over() && fs > 16) { fs -= 1; el.style.fontSize = fs + "px"; }
    });
  }
  // Thanh tổng tiền của tờ đơn đứng ngay trên thanh dưới, cao bao nhiêu cũng vậy
  function fit() {
    const nav = document.querySelector(".tabs");
    if (nav) document.documentElement.style.setProperty("--tabh", nav.offsetHeight + "px");
    fitFigures();
  }
  window.addEventListener("resize", fit);
  // Bản cài lên máy mở được cả khi mất mạng; trên máy thử (không có https) thì không cần,
  // trừ bài thử tự động: emulator mở với ?sw=1 thì vẫn đăng ký để thử đúng đường mất mạng
  if ("serviceWorker" in navigator && window.top === window
    && (location.protocol === "https:" || (window.SO_EMULATOR === true && /[?&]sw=1(&|$)/.test(location.search))))
    navigator.serviceWorker.register("sw.js").catch(() => {});
  if (document.fonts) document.fonts.ready.then(fit);

  let lastPath = "";
  window.addEventListener("hashchange", () => {
    const path = route().parts.join("/");
    if (path !== lastPath) {
      // Đi thêm khách mới giữa chừng thì giữ nguyên tờ đơn / tờ ghi tiền đang điền
      const side = path.startsWith("khach-moi");
      if (!path.startsWith("tien/ghi") && !side) payDraft = null;
      if (!path.startsWith("don/moi") && !side) od = null;
      if (!path.startsWith("tien/tra")) delete drafts.tra;
      if (!side) delete drafts.khach;
      if (!path.startsWith("baocao")) bc = { month: null, slice: undefined };
      if (!path.startsWith("sx")) sx = { step: 1, product: null, color: null, cartons: 0 };
      lastPath = path;
      render();
      window.scrollTo(0, 0);
      if (!route().anchor) document.getElementById("main").focus({ preventScroll: true });
    } else render();
  });

  // ---------- Thao tác ----------
  // Ô đang gõ không được nằm khuất sau thanh Lưu dính ở đáy
  document.addEventListener("focusin", (e) => {
    const t = e.target, bar = t.closest && t.matches("input, select, textarea") && t.closest("form")?.querySelector(".od-bar, .save-bar");
    // Ô tìm khách đưa lên đầu màn hình, để bàn phím mở ra vẫn còn thấy danh sách
    if (t.dataset && t.dataset.pick) { t.closest(".field").scrollIntoView({ block: "start" }); return; }
    if (!bar || bar.contains(t)) return;
    const hidden = t.getBoundingClientRect().bottom + 12 - bar.getBoundingClientRect().top;
    if (hidden > 0) window.scrollBy(0, hidden);
  });
  document.addEventListener("input", (e) => {
    const t = e.target;
    const f = t.closest && t.closest("form[data-form]");
    // Có máy chỉ báo "change" khi rời ô ngày: đủ ngày là đổi chữ ngay, không phải chờ
    if ((t.id === "od-date" || t.id === "pay-date") && /^\d{4}-\d{2}-\d{2}$/.test(t.value)) {
      if (t.id === "od-date") od.date = pickDate(t); else payDraft.date = pickDate(t);
    }
    // Tìm khách: chỉ vẽ lại danh sách, ô tìm giữ nguyên
    if (t.dataset.pick) {
      PICKERS[t.dataset.pick].setQ(t.value);
      const l = document.getElementById(t.id + "-list"); if (l) { l.innerHTML = pickList(t.dataset.pick, t.value); l.scrollTop = 0; }
    }
    if (t.id === "pay-amount" || t.dataset.price || t.hasAttribute("data-money")) {
      const n = parseMoney(t.value);
      if (t.id === "pay-amount") payDraft.amount = n; else if (t.dataset.price) od.price[t.dataset.price] = n;
      if (t.dataset.alloc) { chia.alloc[t.dataset.alloc] = n; const l = document.getElementById("alloc-left"); if (l) l.innerHTML = allocNote(chia); }
      const pos = t.value.length - t.selectionStart;
      t.value = n ? num(n) : "";
      const p = Math.max(0, t.value.length - pos); t.setSelectionRange(p, p);
    }
    if (f && t.name && !["order", "pay"].includes(f.dataset.form)) {
      setDraft(f.dataset.form, t.name, t.hasAttribute("data-money") ? String(parseMoney(t.value)) : t.value);
    }
    // Tờ đơn: chỉ cập nhật ô vừa gõ và phần cộng tiền, không vẽ lại cả trang để khỏi mất chỗ đang gõ
    if (t.dataset.k && od) {
      const n = Math.min(9999, parseMoney(t.value));
      if (n) od.qty[t.dataset.k] = n; else delete od.qty[t.dataset.k];
      if (String(n || "") !== t.value) t.value = n || "";
      const [code, color] = t.dataset.k.split("|");
      t.classList.toggle("over", n > stock(code, color));
      t.classList.toggle("filled", n > 0);
    }
    if ((t.dataset.k || t.dataset.price) && od) refreshOrder();
    // Sản xuất: gõ thẳng số thùng, không vẽ lại trang để bàn phím không tắt
    if (t.id === "sx-n") {
      const n = Math.min(9999, parseMoney(t.value));
      sx.cartons = n;
      if (String(n || "") !== t.value) t.value = n || "";
      const b = document.getElementById("sx-save"); if (b) b.disabled = !n;
    }
    // Tìm đơn theo tên khách: chỉ vẽ lại danh sách, ô tìm giữ nguyên
    if (t.id === "don-q") { donQ = t.value; const l = document.getElementById("don-list"); if (l) l.innerHTML = donList(); }
  });
  document.addEventListener("change", (e) => {
    const t = e.target;
    if (t.id === "pay-date") payDraft.date = pickDate(t);
    if (t.id === "od-date") od.date = pickDate(t);
    if (t.hasAttribute("data-rerender")) { const f = t.closest("form[data-form]"); setDraft(f.dataset.form, t.name, t.value); if (t.name === "material") delete drafts[f.dataset.form].price; render(); }
  });

  // Enter trong ô tìm khách không được lưu cả form: còn đúng một khách thì chọn luôn, không thì chỉ cất bàn phím
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || !e.target.dataset || !e.target.dataset.pick) return;
    e.preventDefault();
    const hits = document.querySelectorAll(`#${e.target.id}-list .cp-item`);
    if (hits.length === 1) hits[0].click(); else e.target.blur();
  });

  document.addEventListener("submit", (e) => {
    if (e.target.id === "signin-form") { e.preventDefault(); trySignIn(document.getElementById("pin").value.trim()); return; }
    const f = e.target.closest("form[data-form]");
    if (!f) return;
    e.preventDefault();
    const kind = f.dataset.kind || f.dataset.form;
    // Thêm dòng mới thì được ghi cả khi chưa có mạng; sửa thông tin khách đã có thì cần mạng
    if (blocked(!(kind === "khach" && f.dataset.id))) return;
    if (drafts[f.dataset.form]) delete drafts[f.dataset.form].error;
    ({ pay: savePayment, order: saveOrder, tra: saveTra, khach: saveKhach, vt: saveVT, dau: saveDau, hh: saveHH }[kind] || (() => {}))(f);
    const w = document.querySelector(".form .warn[role=alert]");
    if (w) { w.tabIndex = -1; w.focus(); }
  });
  const stamp = () => ({ by: me() ? me().normalize("NFC") : me(), void: false, createdAt: new Date().toISOString() });

  // Tiền đã về tay Mẹ ngay lúc ghi? Mẹ ghi thì có; người khác chỉ khi tiền vào "Tài khoản Mẹ".
  // Người khác ghi "Mẹ Liên đang cầm" thì Mẹ còn phải tự bấm đã nhận (kho chung cũng không nhận khác đi). Máy thử thì như cũ.
  const holderGetsMoney = (holder) => WITH_OWNER.includes(holder) && (!canShare || isOwner() || holder === "Tài khoản Mẹ");
  function savePayment() {
    const d = payDraft;
    if (!d.customer) { d.error = "Chưa chọn khách. Chọn tên khách ở ô trên cùng."; return render(); }
    if (!d.amount) { d.error = "Chưa có số tiền. Gõ số tiền khách đưa."; return render(); }
    if (!d.method) { d.error = "Chưa chọn trả bằng gì. Chọn Tiền mặt hay Chuyển khoản."; return render(); }
    // Tiền mặt: người ghi đang cầm. Chuyển khoản: vào tài khoản Mẹ.
    const holder = d.method === "CK" ? "Tài khoản Mẹ" : !canShare && me() === "Người khác" ? "Người khác" : me() || OWNER;
    const got = holderGetsMoney(holder);
    const p = {
      id: uid(), date: d.date || today(), customerId: d.customer, customer: cname(d.customer), amount: d.amount, method: d.method,
      holder, handed: got, handedDate: got ? d.date : null, ...stamp(),
    };
    addRec("payments", p); save(); if (p.handed) fresh.add(p.id);
    const id = d.customer; payDraft = null;
    location.hash = `#/khach/${enc(id)}`;
    toast(`Đã ghi ${money(p.amount)} của ${p.customer}.`, () => { db.payments = db.payments.filter((x) => x.id !== p.id); });
  }

  // Lưu cả tờ đơn: mỗi ô có số thành một dòng hàng, giao vào ngày đã chọn
  function saveOrder(f, sure) {
    const lines = odLines();
    if (!od.customer) { od.error = "Chưa chọn khách. Chọn tên khách ở ô trên cùng."; return render(); }
    if (!lines.length) { od.error = "Chưa có hàng nào. Gõ số thùng vào ô."; return render(); }
    // Đặt nhiều hơn số trong kho: hỏi lại, vì có thể gõ nhầm, cũng có thể kho trong máy chưa đúng
    const over = lines.filter((l) => l.cartons > stock(l.p.code, l.color));
    if (over.length && !sure) {
      return confirmSheet("Kho không đủ hàng", over.map((l) => `${esc(sxLabel(l.p, l.color))}: đặt <b>${num(l.cartons)}</b>, kho còn ${num(Math.max(0, stock(l.p.code, l.color)))}`).join("<br>"),
        "Vẫn lưu đơn", () => saveOrder(null, true), false, "Sửa lại số");
    }
    const day = od.date, st = stamp();
    const made = lines.map((l) => ({
      id: uid(), date: day, deliver: day, customerId: od.customer, customer: cname(od.customer), product: l.p.code, color: l.color,
      cartons: l.cartons, price: odPrice(l.p), status: "Đã giao", ...st,
    }));
    made.forEach((o) => addRec("orders", o)); save();
    const id = od.customer, ids = new Set(made.map((o) => o.id)); od = null;
    location.hash = billHref(id, day);
    toast(`Đã giao ${num(sum(made, (o) => o.cartons))} thùng cho ${cname(id)}.`, () => { db.orders = db.orders.filter((x) => !ids.has(x.id)); });
  }

  function saveTra() {
    const F = "tra", supplier = String(fv(F, "supplier")).trim(), amount = parseMoney(fv(F, "amount"));
    if (!supplier) return failForm(F, "Chưa chọn trả cho ai.");
    if (!amount) return failForm(F, "Chưa có số tiền.");
    const p = { id: uid(), date: fv(F, "date", today()), supplier, amount, method: fv(F, "method", "TM"), note: "", ...stamp() };
    addRec("supplierPays", p); save(); delete drafts[F];
    location.hash = `#/ncc/${enc(supplier)}`;
    toast(`Đã ghi trả ${money(amount)} cho ${supplier}.`, () => { db.supplierPays = db.supplierPays.filter((x) => x.id !== p.id); });
  }

  function saveKhach(f) {
    const F = f.dataset.form, id = f.dataset.id, c = id ? custById(id) : null;
    const val = (n) => String(fv(F, n, c ? c[n] || "" : "")).trim();
    const name = val("name"), phone = val("phone"), address = val("address");
    if (!name) return failForm(F, "Chưa có tên khách.");
    if (db.customers.some((x) => x.id !== id && x.name.toLowerCase() === name.toLowerCase())) return failForm(F, "Đã có khách tên này. Đặt tên khác để khỏi nhầm.");
    delete drafts[F];
    if (c) {
      // Gắn mã khách vào các dòng cũ chỉ có tên, rồi mới đổi tên, để nợ không bị tách đôi
      if (c.name !== name) [...db.orders, ...db.payments].forEach((r) => { if (!r.customerId && r.customer === c.name) r.customerId = c.id; });
      Object.assign(c, { name, phone, address }); save();
      location.hash = `#/khach/${enc(id)}`;
      toast("Đã lưu thông tin khách.");
      return;
    }
    const k = { id: "k-" + uid(), name, phone, address, note: "", ...stamp() };
    addRec("customers", k); save();
    const back = f.dataset.back;
    if (back.startsWith("#/don/moi") && od) od.customer = k.id;
    if (back.startsWith("#/tien/ghi") && payDraft) payDraft.customer = k.id;
    location.hash = back || `#/khach/${enc(k.id)}`;
    toast(`Đã thêm khách ${name}.`);
  }

  function saveVT() {
    const F = "vt", m = material(fv(F, "material")), qty = parseQty(fv(F, "qty"));
    if (!m) return failForm(F, "Chưa chọn vật tư.");
    if (!qty) return failForm(F, "Chưa có số lượng.");
    const price = parseMoney(fv(F, "price", matPrice(m.code)));
    const x = { id: uid(), date: fv(F, "date", today()), material: m.code, qty, price, supplier: String(fv(F, "supplier")).trim(), ...stamp() };
    addRec("purchases", x); save(); delete drafts[F]; render();
    toast(`Đã nhập ${num(qty)} ${m.unit} ${matName(m)}.`, () => { db.purchases = db.purchases.filter((y) => y.id !== x.id); });
  }

  function saveDau() {
    const F = "dau", code = String(fv(F, "code", nextBatchCode())).trim().toUpperCase(), kg = parseQty(fv(F, "kg")), t = parseQty(fv(F, "tanks"));
    const last = batchesByDate().slice(-1)[0] || {};
    if (!code) return failForm(F, "Chưa có công số.");
    if (db.batches.some((b) => String(b.code).toUpperCase() === code)) return failForm(F, `Đã có công ${code}. Đặt công số khác.`);
    if (!kg) return failForm(F, "Chưa có số kg dầu.");
    if (!t) return failForm(F, "Chưa có số téc.");
    const b = { id: code, code, date: fv(F, "date", today()), supplier: String(fv(F, "supplier", last.supplier || "")).trim(), kg, tanks: t, pricePerKg: parseMoney(fv(F, "price", last.pricePerKg || 0)), extra: 0, ...stamp() };
    addRec("batches", b); save(); delete drafts[F]; render();
    toast(`Đã nhập công ${code}: ${num(kg)} kg dầu.`, () => { db.batches = db.batches.filter((y) => y.id !== b.id); });
  }

  function saveHH() {
    const F = "hh", kind = fv(F, "kind", "tp"), items = kind === "tp" ? fpItems() : nvlItems();
    const it = items.find((x) => itemKey(x) === fv(F, "item")), qty = parseQty(fv(F, "qty"));
    if (!it) return failForm(F, "Chưa chọn loại.");
    if (!qty) return failForm(F, "Chưa có số lượng.");
    const l = { id: uid(), date: fv(F, "date", today()), store: it.store, code: it.code, qty, reason: String(fv(F, "reason")).trim(), ...stamp() };
    if (it.store === "Thành phẩm") l.color = it.color;
    addRec("losses", l); save(); delete drafts[F]; render();
    toast(`Đã ghi hao hụt ${num(qty)} ${it.unit} ${it.name}.`, () => { db.losses = db.losses.filter((y) => y.id !== l.id); });
  }

  function copyText(text) {
    const ok = () => toast("Đã chép hoá đơn. Mở Zalo rồi dán vào tin nhắn.");
    const show = () => {
      const bg = sheet(`<h2 id="sheet-title">Chép hoá đơn</h2><p>Bấm giữ vào chữ, chọn “Chép”, rồi dán vào Zalo.</p>
        <textarea class="input copy-box" readonly rows="10"></textarea>
        <button class="btn block" data-action="sheet-no">Xong</button>`);
      const ta = bg.querySelector("textarea"); ta.value = text; ta.focus(); ta.select();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, show); else show();
  }

  const EDITS = ["handover", "recv", "recv-yes", "recv-holder", "claim", "claim-yes", "ask-next", "walk-undo", "recv-other", "recv-other-save", "pay-void", "chia-save", "pay-menu", "sx-menu", "cancel-bill", "void-menu", "import", "reset"];
  document.addEventListener("click", (e) => {
    const go = e.target.closest("[data-go]");
    if (go) { location.hash = go.dataset.go; return; }
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const v = el.dataset.v, id = el.dataset.id;
    if (EDITS.includes(el.dataset.action) && blocked(false)) return;
    if (el.dataset.action === "sx-save" && blocked(true)) return;
    switch (el.dataset.action) {
      case "who": whoSheet(); break;
      case "set-user": db.meta.user = v; save(); closeSheet(); render(); toast(`Xin chào ${nameOf(v)}.`); break;
      case "set-size": db.meta.textSize = Number(v); save(); applySize(); whoSheet(); render(); break;
      case "sign-out": doSignOut(); break;
      case "retry-profile": if (pendingUser) onUser(pendingUser); break;
      case "signin-pick":
        gateState.email = v; gateState.err = "";
        document.querySelectorAll('[data-action="signin-pick"]').forEach((b) => b.setAttribute("aria-pressed", String(b === el)));
        { const w = document.getElementById("signin-err"); if (w) w.remove(); const b = document.getElementById("pin"); if (b) b.focus(); }
        break;
      case "sheet-yes": { const f = pendingYes; pendingYes = null; closeSheet(); if (f) { f(); save(); render(); } break; }
      case "sheet-no": pendingYes = null; closeSheet(); break;
      case "reject-ok": rejected = []; keepRejected(); closeSheet(); break;
      case "go-close": closeSheet(true); location.hash = v; break;

      case "pick": setDraft(el.dataset.form, el.dataset.name, v); if (el.dataset.clear) setDraft(el.dataset.form, el.dataset.clear, ""); render(); break;
      case "fill": setDraft(el.dataset.form, el.dataset.name, String(v)); render(); break;
      case "pay-method": payDraft.method = v; render(); break;
      case "pay-date-open": {
        payDraft.dateOpen = true; render();
        const box = document.getElementById("pay-date");
        if (box) { box.focus(); try { box.showPicker(); } catch (err) { /* máy cũ: chạm vào ô để mở lịch */ } }
        break;
      }
      case "pay-fill": payDraft.amount = Number(v); render(); break;
      case "pay-cust":
        payDraft.customer = v; payDraft.q = ""; payDraft.error = "";
        // Đổi khách khi mở từ trang của một khách: bỏ tên khách trên địa chỉ để chọn lại được
        if (!v && location.hash !== "#/tien/ghi") { location.hash = "#/tien/ghi"; break; }
        render(); if (v) document.getElementById("pay-amount")?.focus();
        break;
      case "handover": {
        if (el.dataset.holder === "Chưa ghi") break;
        const items = live(db.payments).filter((p) => !p.handed && p.holder === el.dataset.holder);
        const amt = sum(items, (p) => p.amount);
        const from = el.dataset.holder === "Chưa ghi" ? "các khoản chưa rõ ai cầm" : el.dataset.holder;
        confirmSheet("Liên đã nhận tiền?", `Xác nhận Liên đã nhận đủ <b>${money(amt)}</b> từ ${esc(nameOf(from))}.`, "Đúng, Liên đã nhận đủ", () => {
          const day = today();
          items.forEach((p) => { p.handed = true; p.handedDate = day; p.handedBy = me(); fresh.add(p.id); });
          setTimeout(() => toast(`Liên đã nhận ${money(amt)}.`, () => items.forEach((p) => { p.handed = false; p.handedDate = null; }), true), 0);
        }, false, "Chưa nhận");
        break;
      }
      // Hỏi lần lượt các khoản chưa rõ ai cầm, khỏi mở từng dòng
      case "ask-next": {
        const rest = unknownPays(); if (!rest.length) break;
        walk = { done: 0, total: rest.length, last: null };
        recvSheet(rest[0]);
        break;
      }
      case "walk-undo": {
        if (!walk || !walk.last) break;
        walk.last.undo(); walk.done -= 1; walk.last = null;
        save(); render();
        const rest = unknownPays(); if (rest.length) recvSheet(rest[0]);
        break;
      }
      // Một khoản tiền: Mẹ nhận riêng khoản này, hoặc ghi ai đang cầm
      case "recv": {
        const p = db.payments.find((x) => x.id === id); if (!p) break;
        if (p.holder === "Chưa ghi" && !walk) walk = { done: 0, total: unknownPays().length, last: null };
        recvSheet(p);
        break;
      }
      case "recv-yes": {
        const p = db.payments.find((x) => x.id === id); if (!p) break;
        const was = p.holder; if (v) p.holder = v;
        p.handed = true; p.handedDate = today(); p.handedBy = me(); fresh.add(p.id);
        stepOn(`Liên đã nhận ${money(p.amount)} của ${cname(cidOf(p))}.`, () => { p.handed = false; p.handedDate = null; p.holder = was; });
        break;
      }
      // Người khác nhận là mình đang cầm một khoản chưa rõ ai cầm; chỉ Mẹ mới bấm đã nhận
      case "claim": {
        const p = db.payments.find((x) => x.id === id); if (!p || p.holder !== "Chưa ghi" || p.handed) break;
        sheet(`<h2 id="sheet-title">${esc(cname(cidOf(p)))} · ${money(p.amount)}</h2>
          <p>Ngày ${dm(p.date)} · ${payWay(p.method)} · chưa rõ ai cầm.</p>
          <button class="btn block primary" data-action="claim-yes" data-id="${p.id}">Tôi đang cầm khoản này</button>
          <div class="sheet-links"><button class="link" data-action="go-close" data-v="#/khach/${enc(cidOf(p))}">Xem sổ của khách</button>
          <button class="link" data-action="sheet-no">Thôi</button></div>`);
        break;
      }
      case "claim-yes": {
        const p = db.payments.find((x) => x.id === id); if (!p || p.holder !== "Chưa ghi" || !me()) break;
        if (!canShare && me() === "Người khác") { otherSheet(p, "Người khác"); break; }
        p.holder = me();
        stepOn(`Đã ghi ${nameOf(me())} đang cầm ${money(p.amount)}.`, () => { p.holder = "Chưa ghi"; });
        break;
      }
      // "Người khác" chưa nói được tiền ở đâu: hỏi cho ra tên
      case "recv-other": {
        const p = db.payments.find((x) => x.id === id); if (p) otherSheet(p, v);
        break;
      }
      case "recv-other-save": {
        const p = db.payments.find((x) => x.id === id); if (!p) break;
        const box = document.getElementById("other-name");
        const name = v || holderOf(el.dataset.k, box ? box.value : "");
        if (!name) { const w = document.getElementById("other-err"); if (w) { w.hidden = false; w.focus(); } break; }
        const was = p.holder; p.holder = name;
        stepOn(`Đã ghi ${name} đang cầm ${money(p.amount)}.`, () => { p.holder = was; });
        break;
      }
      case "recv-holder": {
        const p = db.payments.find((x) => x.id === id); if (!p) break;
        const was = p.holder; p.holder = v;
        stepOn(`Đã ghi ${nameOf(v)} đang cầm ${money(p.amount)}.`, () => { p.holder = was; });
        break;
      }
      case "pay-menu": {
        const p = db.payments.find((x) => x.id === id); if (!p) break;
        const c = customer(cidOf(p));
        sheet(`<h2 id="sheet-title">${esc(cname(cidOf(p)))} · ${money(p.amount)}</h2>
          <p>Ngày ${dm(p.date)} · ${payWay(p.method)}. ${allocText(p)}</p>
          ${c.trips.length ? `<button class="btn block" data-action="go-chia" data-v="${p.id}">Chọn chuyến cho khoản này</button>` : ""}
          <div class="sheet-links"><button class="link" data-action="pay-void" data-id="${p.id}">Hủy khoản này</button>
          <button class="link" data-action="sheet-no">Thôi</button></div>`);
        break;
      }
      case "pay-void": {
        const p = db.payments.find((x) => x.id === id); if (!p) break;
        confirmSheet("Hủy khoản tiền này?", `${esc(cname(cidOf(p)))} · ${money(p.amount)} · ngày ${dm(p.date)}. Dòng này sẽ bị gạch đi chứ không mất hẳn.`, "Hủy khoản này", () => {
          p.void = true; p.voidBy = me();
          setTimeout(() => toast("Đã hủy khoản tiền.", () => { p.void = false; }, true), 0);
        }, true, "Giữ lại");
        break;
      }
      case "go-chia": chia = null; closeSheet(true); sheetReturn = null; location.hash = `#/tien/chia/${enc(v)}`; break;
      case "alloc-fill": {
        const st = chia, d = el.dataset.d, others = allocSum(st.alloc) - (st.alloc[d] || 0);
        st.alloc[d] = Math.max(0, Math.min(Number(el.dataset.o), (st.amount || 0) - others));
        render();
        break;
      }
      case "chia-save": {
        const p = db.payments.find((x) => x.id === id); if (!p || !chia) break;
        const err = allocError(customer(cidOf(p), p.id).trips, chia);
        if (err) { chia.error = err; render(); break; }
        const was = p.alloc || null, cid = cidOf(p);
        p.alloc = allocList(chia.alloc); if (!p.alloc.length) p.alloc = null;
        chia = null; save();
        location.hash = `#/khach/${enc(cid)}`;
        toast(p.alloc ? `Đã chia khoản ${money(p.amount)}.` : "Khoản này trừ vào chuyến cũ nhất trước.", () => { p.alloc = was; }, true);
        break;
      }

      // Hủy một dòng nhập hàng, nhập dầu, hao hụt hay tiền trả nhà cung cấp: gạch đi, không xoá
      case "void-menu": {
        const col = el.dataset.col, x = (db[col] || []).find((y) => y.id === id);
        if (!x) break;
        confirmSheet("Hủy dòng này?", "Dòng này sẽ bị gạch đi và số trong kho, số tiền tự tính lại.", "Hủy dòng này", () => {
          x.void = true; x.voidBy = me();
          setTimeout(() => toast("Đã hủy dòng.", () => { x.void = false; }, true), 0);
        }, true, "Giữ lại");
        break;
      }

      case "sx-product": sx = { step: 2, product: v, color: null, cartons: 0 }; if (product(v).group !== "Dầu") sx.step = 3; render(); break;
      case "sx-color": sx.color = v; sx.step = 3; render(); break;
      case "sx-day": sx.day = v; render(); break;
      case "sx-back": if (v === "1") sx = { step: 1, product: null, color: null, cartons: 0 }; else { sx.step = 2; sx.color = null; } render(); break;
      case "sx-step": sx.cartons = Math.min(9999, Math.max(0, sx.cartons + Number(v))); render(); document.querySelector(`[data-action="sx-step"][data-v="${v}"]`)?.focus(); break;
      case "sx-save": {
        const x = { id: uid(), date: sx.day === "y" ? yday() : today(), product: sx.product, color: sx.color || "", cartons: sx.cartons, note: "", ...stamp() };
        addRec("production", x); save();
        sx = { step: 1, product: null, color: null, cartons: 0 };
        render();
        toast(`Đã lưu ${x.cartons} thùng ${sxLabel(product(x.product), x.color)}${x.date === today() ? "" : " cho hôm qua"}.`, () => { db.production = db.production.filter((y) => y.id !== x.id); });
        break;
      }
      case "sx-menu": {
        const x = db.production.find((y) => y.id === id);
        confirmSheet("Bỏ dòng này?", `${x.cartons} thùng ${esc(sxLabel(product(x.product), x.color))}. Dòng này sẽ bị gạch đi và kho tự tính lại.`, "Bỏ dòng này", () => {
          x.void = true; x.voidBy = me();
          setTimeout(() => toast("Đã bỏ dòng.", () => { x.void = false; }, true), 0);
        }, true, "Giữ lại");
        break;
      }
      case "cancel-bill": {
        const cid = el.dataset.c, day = el.dataset.d, lines = bill(cid, day).lines;
        confirmSheet("Hủy hoá đơn này?", `${esc(cname(cid))} · ${dm(day)} · ${num(sum(lines, (o) => o.cartons))} thùng, ${money(sum(lines, orderValue))}. Hàng sẽ được cộng lại vào kho.`, "Hủy hoá đơn", () => {
          lines.forEach((o) => { o.status = "Hủy"; o.voidBy = me(); });
          location.hash = "#/don";
          setTimeout(() => toast("Đã hủy hoá đơn.", () => lines.forEach((o) => { o.status = "Đã giao"; }), true), 0);
        }, true, "Giữ lại");
        break;
      }
      // Chép hoá đơn rồi mở luôn Zalo của khách (nếu có số điện thoại) để dán vào
      case "bill-copy":
        copyText(billText(el.dataset.c, el.dataset.d));
        if (el.dataset.phone) window.open(`https://zalo.me/${el.dataset.phone}`, "_blank", "noopener");
        break;
      case "don-more": donLimit += 30; render(); break;
      case "od-cust":
        od.customer = v; od.q = ""; od.error = "";
        // Đổi khách khi mở từ trang của một khách: bỏ tên khách trên địa chỉ để chọn lại được
        if (!v && location.hash !== "#/don/moi") { location.hash = "#/don/moi"; break; }
        if (v) focusAfter = ".picked button";
        render();
        break;
      case "bc-months": monthsSheet(); break;
      case "bc-month": bc.month = v; bc.slice = undefined; closeSheet(); render(); break;
      case "bc-slice": pieSet(bc.slice === v ? null : v); break;
      case "cust-add": setDraft("khach", "name", v); location.hash = `#/khach-moi?ve=${enc(location.hash.slice(1))}`; break;
      case "vt-material": case "vt-supplier": case "dau-supplier": {
        const [F, field] = el.dataset.action === "vt-material" ? ["vt", "material"] : [el.dataset.action.slice(0, -9), "supplier"];
        setDraft(F, field, v); setDraft(F, field + "Q", "");
        if (field === "material") delete drafts.vt.price;
        if (v) focusAfter = `.picked [data-action="${el.dataset.action}"]`;
        render();
        break;
      }
      case "od-edit-price": od.editPrice = !od.editPrice; render(); break;

      case "export": {
        const filename = `so-cong-dau-${today()}.json`, text = JSON.stringify(db, null, 1);
        const blob = new Blob([text], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob); a.download = filename; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        break;
      }
      case "import": {
        const inp = document.createElement("input"); inp.type = "file"; inp.accept = "application/json,.json";
        inp.onchange = () => {
          const f = inp.files[0]; if (!f) return;
          f.text().then((txt) => {
            try {
              const next = JSON.parse(txt);
              if (!next.products || !next.orders) throw new Error("bad");
              confirmSheet("Mở file dự phòng?", "Số liệu trong điện thoại này sẽ được thay bằng số liệu trong file.", "Mở file này", () => { const u = db.meta.user; db = upgrade(next); db.meta.user = u; }, false, "Không mở");
            } catch (err) { toast("File này không phải file dự phòng của Sổ công dầu. Chọn file có tên bắt đầu bằng so-cong-dau."); }
          });
        };
        inp.click();
        break;
      }
      case "reset":
        confirmSheet("Xóa hết và bắt đầu lại?", "Mọi thứ đã ghi trong app sẽ mất, chỉ còn số liệu gốc từ file Excel. Nên bấm “Lưu dự phòng” trước.", "Xóa và bắt đầu lại", () => { const u = db.meta.user; db = fromSeed(window.SEED); db.meta.user = u; }, true, "Không xóa");
        break;
    }
  });

  document.addEventListener("keydown", (e) => {
    const s = document.getElementById("sheet");
    if (!s) return;
    if (e.key === "Escape" && me()) closeSheet();
    if (e.key === "Tab") {
      const f = [...s.querySelectorAll("button, input, textarea")];
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
  });

  // ---------- Khởi động ----------
  lastPath = route().parts.join("/");
  applySize();
  render();
  if (canShare) window.soBackend.onUser((u) => { onUser(u).catch(() => { gate = "signin"; gateState.err = SIGNIN_ERR.other; render(); }); });
  else maybeAsk();
})();
