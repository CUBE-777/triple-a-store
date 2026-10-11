// اختبارات الوحدة (Node ≥ 18، بدون أي مكتبات):  node tests/unit.test.mjs
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const Cart = require("../js/cart-core.js");
const ctxI = { window: {} }; vm.createContext(ctxI); vm.runInContext(readFileSync("js/i18n.js", "utf8"), ctxI);
const UI = ctxI.window.STORE_UI;
let pass = 0, fail = 0;
const test = (name, fn) => { try { fn(); pass++; console.log("  ✔", name); } catch (e) { fail++; console.log("  ✘", name, "\n     ", e.message); } };
const cfg = { MAX_QTY: 20, LOW_STOCK_THRESHOLD: 3 };
const base = { id: "p1", slug: "x", type: "physical", fulfillment: "own_stock", stock: 10, isAvailable: true, price: 120, priceIsStarting: false, quoteOnly: false, variants: [], t: { ar: { name: "منتج" }, en: { name: "Item" } } };
const mem = () => { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } }; };
const t = (k, v) => { const e = UI[k]; return e[0].replace(/\{(\w+)\}/g, (_, n) => v?.[n] ?? ""); };
const money = n => t("money", { n });
const ctx = { t, money, pick: p => p.t.ar.name, L: o => o.ar, ref: "TA-261010-ABCD", single: false };

console.log("السلة والتوفر");
test("المخزون 0 = غير متوفر", () => assert.equal(Cart.availability({ ...base, stock: 0 }, cfg).status, "out"));
test("مخزون منخفض", () => assert.equal(Cart.availability({ ...base, stock: 2 }, cfg).status, "low"));
test("الكمية القصوى = min(المخزون, MAX_QTY)", () => assert.equal(Cart.availability({ ...base, stock: 500 }, cfg).max, 20));
test("مورّد خارجي بدون كمية = عند الطلب", () => assert.deepEqual(Cart.availability({ ...base, fulfillment: "external_supplier", stock: null }, cfg), { status: "on_order", max: 20 }));
test("منتج مخفي مؤقتاً (is_available=false) = غير متوفر", () => assert.equal(Cart.availability({ ...base, isAvailable: false }, cfg).max, 0));
test("رقمي وخدمة: كمية واحدة فقط", () => { assert.equal(Cart.availability({ ...base, type: "digital", fulfillment: null, stock: null }, cfg).max, 1); assert.equal(Cart.availability({ ...base, type: "service", fulfillment: null, stock: null }, cfg).max, 1); });
test("لا يمكن إضافة تجاوز المخزون (يُقصّ)", () => { const r = Cart.addToCart([], { ...base, stock: 3 }, { qty: 9 }, cfg); assert.equal(r.lines[0].qty, 3); assert.equal(r.clamped, true); });
test("الإضافة المتكررة تدمج السطر ولا تتجاوز الحد", () => { let r = Cart.addToCart([], { ...base, stock: 4 }, { qty: 3 }, cfg); r = Cart.addToCart(r.lines, { ...base, stock: 4 }, { qty: 3 }, cfg); assert.equal(r.lines.length, 1); assert.equal(r.lines[0].qty, 4); });
test("كمية غير صالحة (NaN/سالبة) تصبح 1", () => { assert.equal(Cart.addToCart([], base, { qty: "abc" }, cfg).lines[0].qty, 1); assert.equal(Cart.addToCart([], base, { qty: -5 }, cfg).lines[0].qty, 1); });
test("رفض إضافة منتج غير متوفر", () => assert.equal(Cart.addToCart([], { ...base, stock: 0 }, { qty: 1 }, cfg).ok, false));
const withVar = { ...base, variants: [{ name: { ar: "اللون" }, options: ["أسود", "أبيض"] }] };
test("الخيارات المطلوبة إلزامية", () => { const r = Cart.addToCart([], withVar, { qty: 1 }, cfg); assert.equal(r.ok, false); assert.equal(r.reason, "options"); });
test("قيمة خيار غير موجودة مرفوضة", () => assert.equal(Cart.addToCart([], withVar, { qty: 1, options: { 0: "أحمر" } }, cfg).ok, false));
test("سطران بخيارين مختلفين لنفس المنتج", () => { let r = Cart.addToCart([], withVar, { qty: 1, options: { 0: "أسود" } }, cfg); r = Cart.addToCart(r.lines, withVar, { qty: 1, options: { 0: "أبيض" } }, cfg); assert.equal(r.lines.length, 2); });
test("حد أقصى لعدد الأسطر", () => { let L = []; for (let i = 0; i < 25; i++) L.push({ id: "x" + i, qty: 1, options: {}, note: "" }); assert.equal(Cart.addToCart(L, base, { qty: 1 }, cfg).reason, "full"); });
test("تخزين السلة: تجاهل البيانات التالفة/الخبيثة", () => {
  const s = mem(); s.setItem(Cart.KEY, JSON.stringify([{ id: "a", qty: 2, options: {} }, { id: "b", qty: -1, options: {} }, { id: "c", qty: 1.5, options: {} }, { id: 5, qty: 1, options: {} }, { id: "d", qty: 1, options: { 0: { x: 1 } } }, "junk", null]));
  assert.deepEqual(Cart.load(s).map(l => l.id), ["a"]); s.setItem(Cart.KEY, "{not json"); assert.deepEqual(Cart.load(s), []); });
test("الملاحظة تُقصّ إلى الحد", () => assert.equal(Cart.cleanNote("x".repeat(999)).length, Cart.NOTE_MAX));

console.log("التسعير (يُحسب من بيانات حديثة لا من السلة)");
test("المجموع الفرعي والإجمالي دقيقان (بدون أخطاء عشرية)", () => {
  const p = { ...base, price: 19.99 }; const r = Cart.priceLines([{ id: "p1", qty: 3, options: {}, note: "" }], { p1: p }, cfg);
  assert.equal(r.items[0].subtotal, 59.97); assert.equal(r.totals.sum, 59.97); });
test("السعر في السلة القديمة لا يُستعمل: التغيير في القاعدة ينعكس", () => {
  const L = [{ id: "p1", qty: 2, options: {}, note: "" }];
  assert.equal(Cart.priceLines(L, { p1: { ...base, price: 100 } }, cfg).totals.sum, 200); assert.equal(Cart.priceLines(L, { p1: { ...base, price: 150 } }, cfg).totals.sum, 300); });
test("منتج محذوف/غير منشور = missing ويمنع الإرسال", () => { const r = Cart.priceLines([{ id: "gone", qty: 1, options: {}, note: "" }], {}, cfg); assert.equal(r.items[0].status, "missing"); assert.equal(r.totals.blocked, 1); });
test("نفاد المخزون بعد الإضافة = unavailable", () => assert.equal(Cart.priceLines([{ id: "p1", qty: 2, options: {}, note: "" }], { p1: { ...base, stock: 0 } }, cfg).items[0].status, "unavailable"));
test("انخفاض المخزون يقصّ الكمية ويُعلَّم adjusted", () => { const r = Cart.priceLines([{ id: "p1", qty: 8, options: {}, note: "" }], { p1: { ...base, stock: 5 } }, cfg); assert.equal(r.items[0].qty, 5); assert.equal(r.totals.adjusted, true); assert.equal(r.totals.sum, 600); });
test("خيارات تغيّرت = options_invalid", () => assert.equal(Cart.priceLines([{ id: "p1", qty: 1, options: { 0: "أخضر" }, note: "" }], { p1: withVar }, cfg).items[0].status, "options_invalid"));
test("عرض سعر: لا يدخل في المجموع ويُعلَّم تقديرياً", () => { const q = { ...base, type: "service", fulfillment: null, stock: null, price: null, quoteOnly: true }; const r = Cart.priceLines([{ id: "p1", qty: 1, options: {}, note: "" }], { p1: q }, cfg); assert.equal(r.totals.sum, 0); assert.equal(r.totals.hasEstimate, true); });
test("سعر ابتدائي: تقديري", () => { const r = Cart.priceLines([{ id: "p1", qty: 1, options: {}, note: "" }], { p1: { ...base, type: "service", fulfillment: null, stock: null, priceIsStarting: true } }, cfg); assert.equal(r.totals.hasEstimate, true); });

console.log("رسالة واتساب");
const pl = Cart.priceLines([{ id: "p1", qty: 2, options: { 0: "أسود" }, note: "الاسم: أحمد & سارة؟\nسطر ثانٍ" }], { p1: { ...withVar, price: 120 } }, cfg);
const msg = Cart.buildMessage(pl.items, pl.totals, ctx);
test("الرسالة تحوي اللغة والمرجع والاسم والنوع والكمية والسعر والمجموع والخيارات", () => {
  for (const s of ["TA-261010-ABCD", "العربية", "منتج", "منتج مادي", "الكمية: 2", "120 د.م.", "240 د.م.", "اللون: أسود", "المجموع"]) assert.ok(msg.includes(s), "missing: " + s); });
test("الملاحظات متعددة الأسطر تُسطَّح داخل سطر واحد", () => assert.ok(msg.includes("الاسم: أحمد & سارة؟ سطر ثانٍ")));
test("الرسالة تشرح أنها ليست تأكيد دفع", () => assert.ok(msg.includes("لا تعني تأكيد الدفع")));
test("رابط واتساب مرمَّز بشكل صحيح ويُفك إلى نفس النص", () => {
  const url = Cart.waUrl("+212 633-740-099", msg); assert.ok(url.startsWith("https://wa.me/212633740099?text="));
  assert.ok(!/[\s\n&؟ ]/.test(url.split("?text=")[1])); assert.equal(decodeURIComponent(url.split("?text=")[1]), msg); });
test("المرجع المحلي: الصيغة والتفرّد", () => { const r = new Set(); for (let i = 0; i < 200; i++) r.add(Cart.makeRef()); assert.ok([...r].every(x => /^TA-\d{6}-[A-Z2-9]{4}$/.test(x))); assert.ok(r.size > 190); });
test("المرجع يستعمل التاريخ الممرَّر", () => assert.ok(Cart.makeRef(new Date(2026, 9, 10), () => 0).startsWith("TA-261010-AAAA")));

console.log("الترجمة");
test("كل مفتاح له 3 لغات غير فارغة", () => { for (const [k, v] of Object.entries(UI)) { assert.equal(v.length, 3, k); v.forEach((s, i) => assert.ok(typeof s === "string" && s.trim() !== "", k + "[" + i + "]")); } });
test("المتغيرات {x} متطابقة بين اللغات الثلاث", () => { for (const [k, v] of Object.entries(UI)) { const sets = v.map(s => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join()); assert.ok(sets[0] === sets[1] && sets[1] === sets[2], k + " " + sets.join(" | ")); } });
test("كل مفتاح مستعمل في HTML/JS موجود في القاموس", () => {
  const files = [...readdirSync(".").filter(f => f.endsWith(".html")), ...readdirSync("js").filter(f => f.endsWith(".js") && f !== "i18n.js").map(f => "js/" + f)];
  const used = new Set(), dyn = /(["'])((?:type|avail|sort|dm|p\.delivery|a\.status)\.)\1?/;
  for (const f of files) { const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/data-(?:t|tph|taria|talt)="([\w.]+)"/g)) used.add(m[1]);
    for (const m of src.matchAll(/\b(?:TS\.t|t|T)\(\s*["']([\w.]+)["']/g)) used.add(m[1]); }
  const missing = [...used].filter(k => !k.endsWith(".") && !(k in UI));  assert.deepEqual(missing, []); });
test("المفاتيح الديناميكية (type.*.s / avail.* / dm.* / p.delivery.* / sort.*) كاملة", () => {
  for (const k of ["physical", "digital", "service"]) for (const p of ["type.", "p.delivery."]) assert.ok((p + k) in UI, p + k);
  for (const k of ["physical", "digital", "service"]) assert.ok(`type.${k}.s` in UI && `type.${k}.d` in UI);
  for (const k of ["in_stock", "low", "out", "on_order", "available"]) assert.ok("avail." + k in UI);
  for (const k of ["whatsapp_manual", "signed_link"]) assert.ok("dm." + k in UI);
  for (const k of ["relevance", "newest", "price_asc", "price_desc"]) assert.ok("sort." + k in UI); });

console.log(`\nالنتيجة: ${pass} نجح، ${fail} فشل`); process.exit(fail ? 1 : 0);
