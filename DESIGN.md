---
name: Sổ công dầu
description: The family's shared credit notebook (vở ô ly) for a lamp-oil and candle workshop, made exact.
colors:
  paper: "#ffffff"
  band: "#eef0fb"
  grid: "#c9cdf0"
  grid-soft: "#dfe2f6"
  grid-faint: "#e7e9f8"
  line: "#d7daee"
  edge: "#7f86bd"
  ink: "#1f1f24"
  ink-2: "#4a4a57"
  pen: "#1b3a8a"
  pen-deep: "#142c69"
  pen-soft: "#e6ebf8"
  info-ink: "#13285f"
  red: "#c42f27"
  red-soft: "#fbeceb"
  warn-ink: "#7d1d18"
  warn-edge: "#efc4c1"
  ok: "#1d6b3f"
typography:
  display:
    fontFamily: "Be Vietnam Pro, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "2rem"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.01em"
    fontFeature: "tnum"
  figure:
    fontFamily: "Be Vietnam Pro, system-ui, sans-serif"
    fontSize: "1.7rem"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.01em"
    fontFeature: "tnum"
  figure-md:
    fontFamily: "Be Vietnam Pro, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.01em"
    fontFeature: "tnum"
  counter:
    fontFamily: "Be Vietnam Pro, system-ui, sans-serif"
    fontSize: "2.6rem"
    fontWeight: 700
    lineHeight: 1
    fontFeature: "tnum"
  headline:
    fontFamily: "Be Vietnam Pro, system-ui, sans-serif"
    fontSize: "1.4rem"
    fontWeight: 700
    lineHeight: 1.2
  title:
    fontFamily: "Be Vietnam Pro, system-ui, sans-serif"
    fontSize: "1.1rem"
    fontWeight: 700
    lineHeight: 1.3
  row-label:
    fontFamily: "Be Vietnam Pro, system-ui, sans-serif"
    fontSize: "1.05rem"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "Be Vietnam Pro, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "tnum"
  note:
    fontFamily: "Be Vietnam Pro, system-ui, sans-serif"
    fontSize: "0.9rem"
    fontWeight: 500
    lineHeight: 1.35
  tab-label:
    fontFamily: "Be Vietnam Pro, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
  stamp:
    fontFamily: "Be Vietnam Pro, system-ui, sans-serif"
    fontSize: "0.8rem"
    fontWeight: 700
    letterSpacing: "0.04em"
rounded:
  stamp: "4px"
  r: "10px"
  sheet: "16px"
  pill: "999px"
spacing:
  xs: "6px"
  sm: "8px"
  md: "10px"
  lg: "12px"
  gutter: "16px"
  section: "28px"
  tap: "56px"
components:
  button-primary:
    backgroundColor: "{colors.pen}"
    textColor: "{colors.paper}"
    rounded: "{rounded.r}"
    padding: "0 18px"
    height: "{spacing.tap}"
  button-primary-active:
    backgroundColor: "{colors.pen-deep}"
  button-outline:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.pen}"
    rounded: "{rounded.r}"
    padding: "0 18px"
    height: "{spacing.tap}"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.r}"
    padding: "10px 12px"
    height: "{spacing.tap}"
  input-money:
    textColor: "{colors.pen}"
    typography: "{typography.figure}"
  input-readonly:
    backgroundColor: "{colors.band}"
    textColor: "{colors.ink-2}"
  choice:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.r}"
    padding: "8px 10px"
    height: "{spacing.tap}"
  choice-selected:
    backgroundColor: "{colors.pen}"
    textColor: "{colors.paper}"
  chip:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.r}"
    padding: "0 18px"
    height: "{spacing.tap}"
  segment:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink-2}"
    height: "{spacing.tap}"
  segment-selected:
    backgroundColor: "{colors.pen}"
    textColor: "{colors.paper}"
  total-card:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.pen}"
    typography: "{typography.display}"
    rounded: "{rounded.r}"
    padding: "10px 14px 12px"
  ledger-row:
    textColor: "{colors.ink}"
    height: "72px"
  stamp-ok:
    textColor: "{colors.ok}"
    typography: "{typography.stamp}"
    rounded: "{rounded.stamp}"
    padding: "1px 6px"
  stamp-red:
    textColor: "{colors.red}"
  stamp-pen:
    textColor: "{colors.pen}"
  stamp-grey:
    textColor: "{colors.ink-2}"
  tab:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink-2}"
    typography: "{typography.tab-label}"
    height: "64px"
  tab-active:
    textColor: "{colors.pen}"
  empty-state:
    backgroundColor: "{colors.band}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.r}"
    padding: "22px 16px"
  warn:
    backgroundColor: "{colors.red-soft}"
    textColor: "{colors.warn-ink}"
    rounded: "{rounded.r}"
    padding: "12px 14px"
  info:
    backgroundColor: "{colors.pen-soft}"
    textColor: "{colors.info-ink}"
    rounded: "{rounded.r}"
    padding: "12px 14px"
  toast:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.r}"
    padding: "8px 8px 8px 16px"
  sheet:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.sheet}"
    padding: "18px 16px"
---

# Design System: Sổ công dầu

## Overview

**Creative North Star: "The Family Credit Notebook"**

The app is the vở ô ly the family already keeps: a white page, a lilac-blue grid printed only at the top of the sheet, one faint rule running down every list, labels written in near-black ink and every figure in ballpoint blue. It is the same notebook, made exact and shared. Every list puts *who or what* on the left of the rule and *how much* on the right, so the eye learns one path through every screen.

Density is low and type is large on purpose. The root size is 112.5% (18px). A text-size setting raises it to 125% or 140%, and every value is in rem so the whole page scales together. Tap targets start at 48px and most controls sit at 52px, 60px, 64px or 72px. The surface is flat paper. Depth comes from rules, borders and tint. The only shadows are on the two things that float: the undo toast and the bottom sheet's scrim.

Status is written on, never removed. Payment and stock states are rubber stamps: uppercase, bordered in their own colour, tilted -3deg. Cancelled entries stay on the page, struck through and stamped HỦY. The system refuses the KPI-tile dashboard: no grey cards, no tile grid, and no blue accent as decoration. Blue means a number.

**Key Characteristics:**
- White paper, with the ô ly grid pattern only in the header band
- One faint ruled line (1px, the Ruled Line colour) dividing label from figure on every ledger list
- Figures in pen blue, tabular numerals, right-aligned and large
- Rotated rubber stamps for every state. Cancelled items are struck through, never deleted
- Flat surfaces, 2px borders, 10px corners, 48px+ targets
- Scales as a whole from the root size (112.5% / 125% / 140%). Figures take their full rem size; a figure that would not fit its half of the page (right of the ruled line, or a total card) is shrunk one pixel at a time until it fits, so short numbers grow with the text setting and long ones stay whole

## Colors

A paper-and-ink palette: white page, lilac-blue printed grid, ballpoint blue for figures, one red pen for margin and alarm, and a green that appears only as an ink stamp.

### Primary
- **Ballpoint Blue** (pen): every figure, the money input, the primary button fill, outline-button borders and text, the selected tab bar and choices, links, and the focus outline. It is the colour of something counted.
- **Pressed Ballpoint** (pen-deep): the primary button's pressed state only.
- **Blotter Blue** (pen-soft): pressed rows, info notes, filled order cells, and the halo around a focused input. Never a selected state.
- **Deep Blue Ink** (info-ink): text inside info notes.

### Secondary
- **Alarm Red** (red): only through the alert and stamp classes: out of stock, materials to order, few tanks left, an order past stock, and a lost connection. Overdue debt belongs here too, once the app has an overdue rule.
- **Red Blot** (red-soft) with **Dried Red Ink** (warn-ink) text and **Red Blot Edge** (warn-edge) border: warning notes.

### Tertiary
- **Stamp Green** (ok): default stamps (ĐÃ NỘP MẸ, ĐÃ TRẢ, ĐÃ TRẢ ĐỦ) and the live sync dot. It never fills an area.

### Neutral
- **Paper** (paper): the page, cards, inputs and buttons at rest.
- **Ô Ly Tint** (band): the header band's base colour, empty states, read-only inputs, table header row and total column, and the person chips on the production log.
- **Grid Line** (grid): the band's bottom border, the tab bar's top border, the dashed outline of empty states and total-card borders.
- **Faintest Grid** (grid-faint): the 22px grid lines inside the band.
- **Faint Grid** (grid-soft): the progress-step track and the stock table's last header cell.
- **Ruled Line** (line): the 1px row dividers in ledgers and the stock table.
- **Control Edge** (edge): 2px borders on inputs, choices, chips and the person button (3.5:1 on white). Also the idle sync dot.
- **Ink** (ink): labels, body text, toast background.
- **Pencil** (ink-2): secondary text, sub-lines, units, inactive tabs, done or void figures, grey stamps.

Product swatches (#c8102e Đỏ, #f2c230 Vàng, #fff Trắng) are content colours for the cans. They always appear with the colour name written beside them and are not part of the palette.

### Named Rules
**The Blue Means Number Rule.** Ballpoint blue is for figures and the controls that produce them. It is never decoration.

**The Red Pen Rule.** Red means out of stock, overdue or a sync error, and nothing else. Ordinary debt, money not yet with Mẹ, negative profit, the active tab and destructive actions are never red. Error notices (`.warn`) keep their red tint.

**The Calm Home Rule.** Hôm nay is the screen Mẹ opens every day, so its figures drop to weight 600.

**The Debt Stays In Its Book Rule.** Debt appears in Sổ tiền and on customer pages, bills and new-order notes. Hôm nay never mentions it.

**The Printed Grid Rule.** The 22px ô ly grid pattern appears only in the header band. Empty states and table headers get the flat tint. Data never sits on the grid pattern.

## Typography

**Display Font:** Be Vietnam Pro (with system-ui, -apple-system, Segoe UI, Roboto, sans-serif)
**Body Font:** Be Vietnam Pro, same stack
**Label/Mono Font:** none; numerals use the `tnum` feature on the body (`font-variant-numeric: tabular-nums`)

**Character:** One humanist sans, built for Vietnamese diacritics, in weights 400 to 700. Tabular numerals keep money columns aligned like a ruled ledger. Weight carries the hierarchy: figures are 700, labels 600, notes 500.

### Hierarchy
- **Display**: the two header totals. Capped with min() against the viewport width so 8.250.000 ₫ never wraps. With `.exact` (full amounts on a customer page) it drops to min(1.45rem, 5.6vw).
- **Figure**: the right-hand column of a ledger row. **Figure-md** for money and secondary lists.
- **Counter**: the cartons number in the production and order steppers.
- **Headline**: the band title (weekday and date, or screen name).
- **Title**: section headings above each ledger, with an optional 0.9rem / 500 sub-line on its own line.
- **Row label**: the left-hand *what* of a ledger row. Its sub-line uses the Note style.
- **Body**: forms, sheets and running text (1rem on an 18px root). Field labels are body at 600.
- **Note**: hints, sub-lines, table headers, the person button and chips. Notes have a 0.9rem floor and units a 0.85rem floor.
- **Stamp**: uppercase rubber-stamp labels, with a 0.8rem floor.
- **Tab label**: bottom-bar labels under 26px icons.

Units after a figure (thùng, téc, ₫) are set at 0.6–0.7em, weight 600.

### Named Rules
**The Floor Rule.** Nothing smaller than 0.8rem (stamps). Notes and hints are 0.9rem, at a root that starts at 18px and goes up to 140%.

**The Capped Figure Rule.** Large figures use `min(rem, vw)` and `white-space: nowrap`. An amount shrinks to fit. It never wraps or truncates.

## Layout

A single phone column, max-width 560px, centred. The tab bar and sheet use the same width. The horizontal gutter is 16px everywhere: section headings, notes, notices, actions, forms and the table wrapper. Sections open with 28px above the heading and 8px below it. Gaps between controls step through 6, 8, 10 and 12px. Forms stack fields 18px apart.

The ledger is the main layout primitive: a two-column grid with the split at `--m` (50%, the ruled line in the middle of the row). The first column holds the label, padded 12px 14px 12px 16px. The second holds the right-aligned figure plus a chevron when the row is tappable. Rows are at least 72px tall and divided by 1px ruled lines.

Choice grids use auto-fill at minmax(140px, 1fr), or fixed 2 or 3 columns. Paired actions use a 1fr 1fr grid. The stepper is 72px | 1fr | 72px.

Main content reserves 96px plus the bottom safe-area inset under the fixed tab bar. The band adds the top safe-area inset to its 14px top padding.

## Elevation & Depth

The page is flat paper. Depth comes from tint (band, blotter, red blot), 2px borders and ruled lines. Only the two floating layers get shadow or scrim.

### Shadow Vocabulary
- **Toast lift** (`box-shadow: 0 8px 24px rgba(0, 0, 0, .22)`): the dark undo toast floating above the tab bar.
- **Sheet scrim** (`background: rgba(0, 0, 0, .35)`): behind the bottom sheet. The sheet itself has no shadow.

### Named Rules
**The Flat Page Rule.** Nothing on the page has a shadow. If it is in the notebook, it is flat. Only the toast and the sheet float.

## Shapes

Gently rounded rectangles (10px) for every control, card, notice, table wrapper and the toast. Stamps are nearly square (4px) and tilted -3deg. The bottom sheet rounds only its top corners (16px 16px 0 0). Progress steps are 6px bars with 3px ends. The active-tab notch is a 4px pen bar hanging from the tab bar's top border, with rounded bottom corners (0 0 3px 3px).

Interactive borders are 2px. Rules and dividers are 1px, except the band's bottom border and the tab bar's top border, which are 2px grid. Empty states use a 2px dashed grid border.

## Components

### Buttons
Firm and plain: outlined pen-blue on paper, filled only for the main action.
- **Shape:** one size everywhere: gently rounded (10px), 2px border, minimum 56px tall (`--tap`), padding 0 18px, 1.05rem / 700, 22px inline SVG icon with 8px gap. `.block` makes a button full width.
- **Primary:** pen-blue fill, white text. Pressed: pen-deep.
- **Outline (default):** paper fill, pen-blue border and text.
- **Exactly two styles and one link.** Primary (filled) and secondary (outline). Text links are pen blue, 600, underlined and 48px tall. Destructive actions use these same styles; a confirm sheet protects them.
- **Disabled:** solid grid-soft fill, control-edge border, pencil text.
- **Disabled:** solid grid-soft fill, control-edge border, pencil text, not-allowed cursor (no fading, so the label stays readable).
- **Stacked (money confirm):** a primary with two lines, so it grows taller than one line: the action with its check icon, then the amount at min(1.6rem, 7vw) / 700. Min 84px tall. Used for "Mẹ đã nhận…"; it is always the strongest button on its screen. Never on Hôm nay, where money is a plain row.
- **Money format rule.** Short form (57tr, 24,2tr) only in the two band total cards. Every list row, sheet and button shows the exact amount (28.200.000), rounded to the thousand only for profit. Ledger and card figures carry no ₫; buttons, sheets and toasts add " ₫". Never show the same amount twice on one screen.
- **One main button per screen.** On Hôm nay it is "Ghi sản xuất" for everyone ("Ghi sản xuất hôm nay" for workers), right under the revenue chart. The money line is the first row of the list, at regular weight (`.row.plain`): "Còn 3 khoản tiền chưa đưa Mẹ" for Mẹ, "Bạn đang giữ 2 khoản" for the person holding them. There is no debt anywhere on Hôm nay; debt lives in Sổ tiền.
- **Focus:** the global 3px pen-blue outline with a 2px offset.

### Chips
- **Style:** a chip is a secondary button (+5, +10, Trả hết…), same height, radius and colours.
- **State:** action only. Chips have no selected state; selection belongs to Choices.

### Choices and Segmented Control
- **Choice:** a 56px tile, 2px control-edge border, 10px radius, centred 600 label with an optional 0.85rem sub-line. Used for product, colour (with a written swatch name), method and text size.
- **Selected, everywhere:** any `[aria-pressed="true"]` control and the picked-summary tiles are solid pen with white text and a check icon before the label. The icon means the state never rests on colour alone.
- **Segmented (screen tabs):** equal 56px outlined tabs with a 6px gap, directly above the list they switch. The current one takes the selected style above.

### Cards / Containers
- **Total card:** inside the band only. Paper fill, 1px grid border, 10px radius, padding 10px 14px 12px. A 0.9rem pencil label sits over a Display figure. The whole card is a link.
- **Notices:** warn (red blot, dried red ink, 1px red blot edge) and info (blotter, deep blue ink). Both are 10px radius, padding 12px 14px, 0.95rem.
- **Empty state:** centred pencil text on band tint with a 2px dashed grid border, 10px radius.
- **Shadow Strategy:** none (see Elevation & Depth).

### Inputs / Fields
- **Style:** paper fill, 2px control-edge border, 10px radius, min 52px, padding 10px 12px, 1.05rem. Labels are body at 600 with 6px below. Hints are 0.9rem pencil.
- **Money input:** 1.6rem / 700, pen blue, right-aligned, matching how figures sit right of the margin.
- **Focus:** the border turns pen blue, with a 3px blotter outline and no offset.
- **Read-only:** band fill, pencil text.

### Navigation
- **Tab bar:** fixed to the bottom, paper fill, 2px grid top border, five equal 64px cells that never move: Hôm nay, Sổ tiền, Sản xuất, Đơn hàng, Kho hàng. Nhập hàng opens from the primary button at the top of Kho hàng (its pages light the Kho tab and go back to Kho); Báo cáo opens from Mẹ's "Lãi tháng" row on Hôm nay (it lights Hôm nay). Each cell has a stroked SVG icon (at least 26px, 1.3rem) over a 0.8rem / 600 label in pencil. Both grow with the text setting: at Vừa the label sits on one line, at To and Rất to each word takes its own line ("Đơn / hàng"), so all five always fit. The bar's height is measured into `--tabh`, and the page padding, sticky bars and toast all sit on it. Active (`aria-current="page"`): red label and a red notch hanging from the top border.
- **Save bar:** the save button on Ghi tiền and Sản xuất, and the order form's bar, stick to the top of the tab bar. A field focused under one scrolls up clear of it.
- **Back button:** a secondary button with a left arrow, "Quay lại", at the top of the band on sub-screens. Sub-screen bands are compact (title min(1.25rem, 6vw), 12px bottom padding) so large text still leaves room for content.
- **Link row:** a 48px text link with a chevron under a list ("Xem tất cả … khách đang nợ"), used instead of a second big button.
- **Money group heading:** in Tiền đã thu each holder is a real h3 ("Chưa rõ ai cầm · 3 khoản") with its pen-blue total on the right, not a fake ledger row. Unclear money is listed first.
- **Person button:** a secondary button on the right of the band showing who is using the phone. It opens the sheet with the person picker and the text-size choice (Vừa / To / Rất to).

### Header Band (signature)
Ô ly tint with a 22px grid of barely visible grid-faint lines and a 2px grid bottom border. It contains the headline, a pencil sub-line (the lunar date, with its key part in pen-blue 600, because a date is a number, not an alarm), the sync status line, and optionally two total cards side by side.

### Sync Status Line
A 0.85rem / 600 pencil line under the band sub-line with a 9px dot in front. Live: green dot, "Sổ chung". Loading: edge-coloured dot. Stale or read-only: red text and red dot. It is announced as `role="status"`.

### Margin Ledger (signature)
A list with an absolutely positioned 1px ruled line at `--m`, running the full height. Each row puts a Row-label (and Note sub-line) left of the rule and a Figure or Figure-md right of it, right-aligned, with a stacked unit or sub-line and a 18px control-edge chevron when tappable. Pressed rows fill with blotter. Alert rows turn the figure red. Done rows turn it pencil. Void rows strike through the label and the amount in pencil and carry a grey HỦY stamp. A delivered trip is one row, and its items are grouped in the sub-line with one product per line and colours summed under each product.

### Stamp (signature)
An inline uppercase label, 0.8rem / 700, 0.04em tracking, padding 1px 6px, 2px currentColor border, 4px radius, rotated -3deg. Variants: green (ĐÃ NỘP MẸ, ĐÃ TRẢ), pen (TÀI KHOẢN MẸ, and CHƯA VỀ MẸ for a trip paid with money that has not reached Mẹ yet: settled, not debt, so never red), red (HẾT, CẦN ĐẶT, "… CẦM", CHƯA RÕ AI CẦM), grey (HỦY). A stamp-in keyframe plays once when money reaches Mẹ (ĐÃ NỘP MẸ / TÀI KHOẢN MẸ): it starts at scale 1.8 and transparent and lands at scale 1 in .45s with cubic-bezier(.16,1,.3,1). It is disabled under reduced motion.

### Stepper
A 72px minus/plus button pair (pen outline) flanking a 2px edge-bordered numeric input with the Counter numeral: tap it to type the count, or build it with the buttons and the +5/+10 chips (the pressed button keeps focus). Below it, the oil hint ("Mỗi thùng 7,2 kg dầu, 12 can." until a count exists, then "Dùng khoảng … kg dầu, … can.") keeps two lines of room so "Lưu" never moves under the thumb. If the same kind and colour was already logged today, a red notice above the stepper says how many and by whom.

### Toast and Sheet
- **Toast:** dark ink bar fixed above the tab bar, white text, with a white-outlined "Ghi nhầm" undo button (8px radius, min 44px). It slides up 16px and fades in (.35s cubic-bezier(.16,1,.3,1), opacity .25s ease-out). It stays for 8s when undo is offered, otherwise 4s, and pauses while pointed at or focused. Swiping it sideways or down (or Esc) puts it away; a short swipe springs back.
- **Sheet:** paper panel docked to the bottom, 16px top corners, a stack of big block buttons with 10px gaps, over a 35% black scrim. At most one primary; alternatives sit in a two-column choice grid under a bold question; the exits ("Xem sổ của khách", "Thôi") are text links on one line at the bottom, "Thôi" in pencil.
- **Unknown-holder money:** a "Chưa rõ ai cầm" group never gets an all-at-once confirm. Each line says "ai cầm?" and its sheet asks "Ai đang cầm khoản này?" with Mẹ cầm rồi / Bác Khang / Người khác / Tài khoản Mẹ (by payment method), so money always has a holder before it counts as đã về tay Mẹ. Mẹ's home row ("Còn 3 khoản tiền chưa đưa Mẹ") opens the sheet itself while any payment is unknown, otherwise it opens Tiền đã thu: each answer moves straight to the next unknown payment ("Khoản 2/3", with the last answer and its "Ghi nhầm" on top, "Để sau" to stop) and ends back on the page she started from. Anyone else can tap an unknown line and choose "Tôi đang cầm khoản này" (only Mẹ marks money received), and their home row then reads "Bạn đang giữ 1 khoản".
- **Sheet focus:** a sheet opens with focus on its title, never on a money button, and closing it returns focus to the line that opened it, even after the page redraws. The faded toast is visibility-hidden so its button can't be reached.

### Order List (Đơn hàng)
The band carries two total cards (today and this month, with the number of bills). An empty card reads a small grey "Chưa có", never a big 0, and an empty month falls back to last month. Under the primary "Lên đơn mới" sits a search field that matches names without diacritics ("cau minh" finds Cậu Minh) and redraws only the list. Bills are grouped by day under a heading ("Hôm nay", "Hôm qua", "Thứ Sáu, 30/10") whose sub-line sums the day (bills · cartons · money). Each row is only the customer's name left of the margin and the bill's amount right of it, with its payment state under the amount: a green ĐÃ TRẢ stamp, a pen CHƯA VỀ MẸ stamp, or red "chưa trả · 3 ngày" / "còn nợ … · 3 ngày". Thirty bills show first, then "Xem đơn cũ hơn".

### Order Sheet (Lên đơn mới)
The first field is the delivery date (see Date Field), defaulting to today, any date allowed; the order is saved with it. Then the customer (see Customer Picker): once chosen, the picker collapses into one picked tile (name, "đổi khách") that reopens it. Below is a fill-in grid like a hand-written order: one row per kind (workshop names: 1L, 9 can, 2L…), one column per colour headed by a 28px swatch with its name written under it, each cell a 68px numeric input; a filled cell turns blotter-blue, a cell asking for more than is in stock turns red (red wins over filled). Prices sit as grey text under each name; Mẹ gets a "Sửa giá" link that turns them into inputs. The grid shows the same six main kinds as Sản xuất in the same order (1L, 9 can, 1.4L, 1.8L, 2L, Hoa sen, the fixed `MAIN_KINDS` list); everything else sits under "Loại khác". "Đơn này" appears only once something is typed, as the bill preview. Once a customer is chosen or a cell is filled, a sticky bar on the measured top of the tab bar shows the running total and cartons beside "Lưu đơn", so nobody scrolls to find the save button; before that it rests at the end of the form so it doesn't sit on the customer list. A focused cell scrolls clear of the bar, and at the end of the page the bar sits under the last row. When a cell asks for more than is in stock, the cartons line becomes a red "Kho thiếu 465 thùng 2L Vàng". Saving an order past stock first asks in a sheet ("Kho không đủ hàng", each short line with what was ordered and what is left; "Vẫn lưu đơn" or "Sửa lại số"), because the count in the app can be wrong too. Saving records every filled cell as delivered on the chosen date and opens the bill.

### Date Field
A 56px bordered row showing the date the way people say it ("Thứ Hai, 02/11", with the year only when it isn't this year), a small relative note ("Hôm nay", "3 ngày trước", "Còn 2 ngày nữa") and a calendar icon. The native date input lies transparent over the whole row, so a tap anywhere opens the phone's own calendar. Clearing the date goes back to today.

### Customer Picker
Shared by Lên đơn mới and Ghi tiền. A "Tìm tên khách" search box above a bordered list that scrolls inside the page (max min(19rem, 46dvh), so half a row shows and says there is more). Every customer is listed: with the box empty, "Mua gần đây" (five most recent) then "Tất cả khách" A–Z under sticky band-tint labels; while typing, only matches, ignoring diacritics and case ("cau minh" finds Cậu Minh). Rows are 56px, name only, no figures. Focusing the box scrolls it to the top so the list stays above the keyboard. Enter never submits the form: it picks the customer if exactly one matches, otherwise it just closes the keyboard. "+ Khách mới" sits beside the label.

### Ghi tiền
One step at a time. It opens with only the Customer Picker under "1. Khách nào trả?". Picking a customer collapses it into the picked tile, moves focus to the amount and reveals the rest: "2. Trả bao nhiêu?", a large money input with "Còn nợ …" once, small, beside a "Trả hết" chip; "3. Trả bằng gì?", Tiền mặt / Chuyển khoản, left unselected; "Hôm nay" with a small "Đổi ngày" link that opens a Date Field; and one big 64px "Lưu" in a sticky bar above the tab bar. The method decides the holder: cash is held by whoever records it, a transfer goes to Tài khoản Mẹ. Payments fall to the oldest trip automatically. Mẹ chooses a trip afterwards from the customer page (tap a payment, "Chọn chuyến cho khoản này").

### Revenue (Doanh thu)
Mẹ's Hôm nay only; workers see no revenue there. The band holds one full-width total card: "Doanh thu tháng N", the exact amount as the main figure, and two small lines comparing with last month: "Tháng 10 tới ngày 2: …" (same point in the month, because comparing a few days against a whole month always looks like a fall) and "Cả tháng 10: …". Before the first sale of the month the figure is a small grey "Chưa có". The card links to Báo cáo.

Directly under it, "Doanh thu 7 ngày" is an inline SVG column chart, oldest day first: pen blue at 70%, today at full strength with a bolder value and darker label. No grid, no legend, one edge-coloured baseline. Each value sits on its column in millions (4,2) with "đơn vị: triệu đồng" in the heading, and the weekday (T7, CN) and date below; at Rất to the date drops so labels never touch. A day with no sales shows "—". The SVG has no viewBox, so its text keeps the chosen text size and columns are placed in percentages. The whole chart links to Đơn hàng, where each day's total comes from, and carries the exact amounts for screen readers. This is the one exception to the short-form-only-in-band-cards rule.

### Bill (Hoá đơn)
One trip (one customer, one day) as a bill. The band shows one full-width card with the payment state ("Chưa trả · 2 ngày", or "Đã trả đủ"). Lines are one per kind and price: the kind's name, then its colours as swatch + count + name ("● 6 Vàng ○ 4 Trắng"), then "14 thùng × 485.000"; the line amount sits right of the margin. A total row sits under a 2px ink rule. Under it, "Đã trả" lists each payment that paid this trip (oldest trip first), with its holder, then a red "Còn nợ" row. Then "Ghi tiền trả" as the one primary action (only when something is owed), "Gửi Zalo" (copies the bill as text and opens the customer's Zalo when a phone is known) beside "Sổ của khách", who recorded it, and for Mẹ a quiet red text action to cancel the bill.

## Do's and Don'ts

### Do:
- **Do** put the label left of the ruled line and the figure right of it, right-aligned in pen blue, on every list of things and amounts.
- **Do** open every section with `h2.sec` and `--section` (28px) above it, on every screen.
- **Do** set every size in rem from the 112.5% root so the 125% and 140% text settings scale the whole page.
- **Do** cap big figures with `min(<rem>, <vw>)` and `nowrap` instead of letting them wrap.
- **Do** record a state with a stamp (uppercase, 2px currentColor border, -3deg), and keep void entries visible, struck through, with HỦY.
- **Do** use 2px control-edge (#7f86bd) borders on inputs, choices and chips, and 2px pen borders on buttons.
- **Do** keep targets at 48px or more (56px for buttons, inputs and choices, 72px for ledger rows and steppers), including text links and the toast's "Ghi nhầm".
- **Do** let a stamp under a figure wrap rather than shrink the figure. Figures stop shrinking at 16px.
- **Do** write the colour name beside every product swatch.
- **Do** use inline stroked SVG icons (stroke 2–2.5, round caps) in currentColor.

### Don't:
- **Don't** build KPI tiles, grey cards or a tile grid. Totals live in the band, and everything else is a ledger.
- **Don't** use pen blue as decoration or red outside out of stock, overdue and sync errors.
- **Don't** put the ô ly grid pattern behind tables, lists or forms. It belongs to the header band.
- **Don't** delete or hide a cancelled entry. Strike it through and stamp it.
- **Don't** add shadows to on-page elements. Only the toast lifts.
- **Don't** set any text below 0.8rem, or notes and hints below 0.9rem.
- **Do** write kg with a decimal comma ("0,5 kg"); workshop names (1.4L, 9 can) stay as the family says them.
- **Do** say a customer's unpaid trips one way: "Nợ chuyến 20/10" or "2 chuyến chưa trả, từ 20/10".
- **Do** keep every colour in the `:root` tokens (pen-press, pen-ink, red-ink, red-line, dye-do, dye-vang, swatch-line, scrim, lift); no literal hex in rules.
- **Do** name who holds the money: choosing "Người khác…" or "Tài khoản khác…" on Tiền đã thu asks for a name and offers names used before; the name becomes the holder.
- **Do** leave the payment method unselected on Ghi tiền.
- **Do** show "Chưa về tay Mẹ" and "… đang cầm" figures in pen blue. CHƯA VỀ MẸ on a paid trip is a pen stamp too.
- **Do** make the figure on an unpaid trip what's still owed, with the trip total in the small line ("còn nợ, trên 3.520.000"), so those figures add up to the debt.
- **Do** default payments to the oldest trip. Mẹ can reassign one by tapping it on the customer page (#/tien/chia/<id>). Money not assigned falls to the oldest trip.
- **Don't** show a big 0 in a band card or a month row. Show last month, or a small grey "Chưa có".
- **Don't** offer a hard delete anywhere, including on lines that are already cancelled.
- **Don't** squeeze the 5-column Kho table at the To and Rất to text sizes; switch to one ledger row per kind with each colour on its own line under the name.
