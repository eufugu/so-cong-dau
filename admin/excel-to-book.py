# Đổi file Excel "Quản lý công dầu" thành các dòng của sổ chung, ghi ra một file JSON. Chỉ đọc Excel, không chạm vào sổ.
# Cách dùng: python admin/excel-to-book.py "<file.xlsx>" [data-export/book-excel.json]
# Cách đổi dòng giống lần nạp đầu của app (fromSeed trong app/app.js), trừ một điều: file Excel chỉ ghi
# một khoản khách trả sau khi Mẹ đã xác nhận có tiền, nên mọi khoản ở đây đều là tiền đã về tay Mẹ.
import datetime, json, os, re, sys, warnings
import openpyxl

warnings.filterwarnings("ignore")
sys.stdout.reconfigure(encoding="utf-8")


def text(v):
    return str(v).strip() if v is not None else ""


def number(v):
    if not isinstance(v, (int, float)):
        return 0
    return int(v) if float(v).is_integer() else v


def day(v):
    return v.strftime("%Y-%m-%d") if isinstance(v, datetime.datetime) else text(v)


def sheet(wb, name):
    ws = wb[name]
    head = [c.value for c in ws[1]]
    return [dict(zip(head, r)) for r in ws.iter_rows(min_row=2, values_only=True)]


def build(path):
    wb = openpyxl.load_workbook(path, data_only=True)
    candles = {text(r["Mã SP"]) for r in sheet(wb, "Kho thành phẩm") if text(r["Nhóm (Dầu/Nến)"]) == "Nến"}
    known = {text(r["Mã SP"]) for r in sheet(wb, "Kho thành phẩm") if text(r["Mã SP"])}
    problems = []

    customers = []
    for r in sheet(wb, "Khách hàng"):
        if text(r["Tên khách hàng"]):
            customers.append({"id": f"k-{len(customers) + 1}", "name": text(r["Tên khách hàng"]), "phone": text(r["Số điện thoại"]), "address": text(r["Địa chỉ"]), "note": text(r["Ghi chú"])})
    id_of = {c["name"]: c["id"] for c in customers}

    def customer_id(name, where):
        if name not in id_of:
            problems.append(f"{where}: khách \"{name}\" không có trong trang Khách hàng")
        return id_of.get(name, "")

    def colour(code, value):
        return "" if code in candles else text(value)

    orders = []
    for r in sheet(wb, "Đơn hàng"):
        name, code = text(r["Khách hàng"]), text(r["Mã SP"])
        if not name:
            continue
        where = f"Đơn hàng dòng {len(orders) + 1}"
        if code not in known:
            problems.append(f"{where}: không biết mã \"{code}\"")
        orders.append({"id": f"x-ord-{len(orders) + 1}", "date": day(r["Ngày đặt"]), "deliver": day(r["Ngày giao"]), "customer": name, "customerId": customer_id(name, where), "product": code, "color": colour(code, r["Màu sắc"]), "cartons": number(r["Số thùng"]), "price": number(r["Đơn giá / thùng (₫)"]), "status": text(r["Trạng thái"]), "by": "Excel", "void": False})

    payments, supplier_pays = [], []
    for r in sheet(wb, "Dòng tiền"):
        kind, name, note = text(r["Loại"]), text(r["Tên (khách / nhà phân phối / người nhận)"]), text(r["Nội dung"])
        if kind == "Thu tiền khách":
            bank, cash = re.search("chuyển khoản", note, re.I), re.search("tiền mặt", note, re.I)
            date = day(r["Ngày"])
            payments.append({"id": f"x-pay-{len(payments) + 1}", "date": date, "customer": name, "customerId": customer_id(name, f"Dòng tiền {date}"), "amount": number(r["Tiền vào (₫)"]), "method": "CK" if bank else "TM" if cash else "", "holder": "Tài khoản Mẹ" if bank else "Mẹ Liên", "handed": True, "handedDate": date, "note": note, "by": "Excel", "void": False})
        elif kind == "Trả nhà phân phối":
            supplier_pays.append({"id": f"x-tra-{len(supplier_pays) + 1}", "date": day(r["Ngày"]), "supplier": name, "amount": number(r["Tiền ra (₫)"]), "method": "", "note": note, "by": "Excel", "void": False})
        elif kind and kind != "Số dư đầu":
            problems.append(f"Dòng tiền: app chưa ghi được loại \"{kind}\" ({day(r['Ngày'])}, {name})")

    production = []
    for r in sheet(wb, "Sản xuất"):
        code = text(r["Mã SP"])
        if code:
            production.append({"id": f"x-sx-{len(production) + 1}", "date": day(r["Ngày"]), "product": code, "color": colour(code, r["Màu sắc"]), "cartons": number(r["Số thùng làm được"]), "note": text(r["Ghi chú"]), "by": "Excel", "void": False})

    purchases = []
    for r in sheet(wb, "Nhập vật tư"):
        if text(r["Mã vật tư"]):
            purchases.append({"id": f"x-nhap-{len(purchases) + 1}", "date": day(r["Ngày"]), "material": text(r["Mã vật tư"]), "qty": number(r["Số lượng"]), "price": number(r["Đơn giá (₫)"]), "supplier": text(r["Nhà cung cấp"])})

    batches = []
    for r in sheet(wb, "Công dầu"):
        if text(r["Mã công"]):
            batches.append({"id": text(r["Mã công"]), "code": text(r["Mã công"]), "date": day(r["Ngày nhập"]), "supplier": text(r["Nhà phân phối"]), "tanks": number(r["Số téc"]), "kg": number(r["Tổng kg dầu"]), "pricePerKg": number(r["Giá dầu / kg (₫)"]), "extra": number(r["Vận chuyển, thuế, bốc xếp (₫)"])})

    losses = []
    for r in sheet(wb, "Hao hụt"):
        if text(r["Mã"]):
            losses.append({"id": f"x-hh-{len(losses) + 1}", "date": day(r["Ngày"]), "store": text(r["Kho"]), "code": text(r["Mã"]), "qty": number(r["Số lượng mất (+) / thừa (−)"]), "reason": text(r["Lý do"])})

    # Số trên chính file Excel, để đối chiếu với số tính ra từ các dòng
    overview = {text(r[0]): r[1] for r in wb["Tổng quan"].iter_rows(values_only=True) if r[0]}
    revenue = sum(o["cartons"] * o["price"] for o in orders if o["status"] == "Đã giao")
    paid = sum(p["amount"] for p in payments)
    check = {
        "customers": overview.get("Số khách hàng"), "orders": overview.get("Số đơn hàng (không tính đơn hủy)"),
        "debt": overview.get("Tổng tiền khách còn nợ"), "revenue": overview.get("Doanh thu đã giao 12 tháng qua"),
        "debts": {text(r["Tên khách hàng"]): number(r["Còn nợ (₫)"]) for r in sheet(wb, "Khách hàng") if text(r["Tên khách hàng"])},
        "stock": {text(r["Mã SP"]): {k: v for k, v in r.items() if k and str(k).startswith("Tồn kho")} for r in sheet(wb, "Kho thành phẩm") if text(r["Mã SP"])},
        "oilLeftKg": overview.get("Dầu còn trong téc (kg)"),
    }
    if len(customers) != check["customers"]:
        problems.append(f"Số khách: tính ra {len(customers)}, Excel ghi {check['customers']}")
    if len(orders) != check["orders"]:
        problems.append(f"Số đơn: tính ra {len(orders)}, Excel ghi {check['orders']}")
    if revenue != check["revenue"]:
        problems.append(f"Doanh thu: tính ra {revenue}, Excel ghi {check['revenue']}")
    if revenue - paid != check["debt"]:
        problems.append(f"Khách còn nợ: tính ra {revenue - paid}, Excel ghi {check['debt']}")

    rows = {"customers": customers, "orders": orders, "payments": payments, "production": production, "purchases": purchases, "batches": batches, "losses": losses, "supplierPays": supplier_pays}
    return {"source": os.path.basename(path), "rows": rows, "check": check}, problems


def main():
    if len(sys.argv) < 2:
        print('Cách dùng: python admin/excel-to-book.py "<file.xlsx>" [file-ra.json]')
        return 1
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join("data-export", "book-excel.json")
    book, problems = build(sys.argv[1])
    for k, v in book["rows"].items():
        print(f"{k:14}{len(v):5} dòng")
    if problems:
        print("\nFile Excel có chỗ chưa khớp, chưa ghi file ra:")
        for p in problems:
            print(" -", p)
        return 1
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(book, f, ensure_ascii=False, indent=1)
    print(f"\nĐã ghi {out}. Số khách, số đơn, doanh thu và tiền khách nợ đều khớp với trang Tổng quan.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
