/* Triple A Store — admin-orders.js (إضافة مستقلة: تبويب "الطلبات" في لوحة الإدارة)
   يعمل فقط إذا نفّذت 005_orders.sql. يستدعيه admin.js عبر window.TSAdminOrders.
   لإلغاء الميزة احذف وسم <script> الخاص به من admin.html (يختفي التبويب ولا يتأثر شيء آخر).
   "جديد" = الزبون ضغط زر الإرسال فقط. لا يعني أنه أرسل الرسالة أو دفع. */
(function () {
  "use strict";
  var TS = window.TS, t = TS.t, esc = TS.esc, $ = TS.$;
  var STATUSES = ["new", "confirmed", "completed", "cancelled"], PER = 10;
  var ctx = null, timer = null, wired = false, newCount = 0, prevIds = null, orders = [], st = { status: "", page: 1 }, drafts = {};

  function badge() { return '<span class="nbadge" id="ord-badge"' + (newCount ? "" : " hidden") + ">" + newCount + "</span>"; }
  function tab(active) { return '<button class="btn sm' + (active ? " pri" : "") + '" data-go="orders">' + esc(t("a.orders")) + badge() + "</button>"; }
  function updateBadge() { var b = $("#ord-badge"); if (b) { b.textContent = newCount; b.hidden = !newCount; } }

  // عدّاد الطلبات الجديدة (يُحدَّث كل دقيقة وعند فتح التبويب). إشعار بسيط عند وصول طلب جديد.
  async function refreshCount() {
    var rows = await ctx.db(ctx.sb.from("orders").select("id").eq("status", "new").limit(500));
    var ids = rows.map(function (r) { return r.id; });
    if (prevIds && ids.some(function (id) { return !prevIds.has(id); })) TS.toast(t("a.o.newtoast"));
    prevIds = new Set(ids); newCount = ids.length; updateBadge();
  }
  function start(c) {
    ctx = c; wire(); stop(true);
    refreshCount().catch(function () { /* الجدول غير موجود (لم تُنفَّذ 005) أو انتهت الجلسة: نتجاهل بصمت */ });
    timer = setInterval(function () { if (document.visibilityState === "visible" && ctx) refreshCount().catch(function () {}); }, 60000);
  }
  function stop(keep) { if (timer) clearInterval(timer); timer = null; if (!keep) { newCount = 0; prevIds = null; orders = []; drafts = {}; } }

  async function load() {
    orders = await ctx.db(ctx.sb.from("orders").select("*, order_items(*)").order("created_at", { ascending: false }).limit(500));
    newCount = orders.filter(function (o) { return o.status === "new"; }).length; prevIds = new Set(orders.filter(function (o) { return o.status === "new"; }).map(function (o) { return o.id; }));
  }

  function itemRows(o) {
    return (o.order_items || []).map(function (i) {
      var opts = Object.keys(i.options || {}).sort().map(function (k) { return i.options[k]; }).join(" | ");
      var price = i.unit_price == null ? t("a.o.quote") : TS.money(i.unit_price), sub = i.unit_price == null ? "—" : TS.money(Math.round(i.unit_price * 100) * i.quantity / 100);
      return "<tr><td>" + esc(i.product_name) + (i.product_id ? "" : ' <small class="note">(' + esc(t("a.o.gone")) + ")</small>") + (opts ? '<br><small class="note">' + esc(opts) + "</small>" : "") + (i.note ? '<br><small class="note">' + esc(i.note) + "</small>" : "") +
        "</td><td>" + esc(t("type." + i.product_type + ".s")) + "</td><td>× " + i.quantity + "</td><td>" + esc(price) + "</td><td>" + esc(sub) + "</td></tr>";
    }).join("");
  }
  function card(o) {
    var when = new Date(o.created_at).toLocaleString({ ar: "ar-MA-u-nu-latn", fr: "fr-FR", en: "en-GB" }[TS.lang] || "en-GB");
    var cls = o.status === "new" ? "on" : "off", draft = drafts[o.id] != null ? drafts[o.id] : (o.admin_note || "");
    return '<article class="fs" data-oid="' + esc(o.id) + '"><div class="acts" style="justify-content:space-between;align-items:center"><div><b dir="ltr">' + esc(o.ref) + '</b> <span class="pill ' + cls + '">' + esc(t("a.o.s." + o.status)) + "</span></div><div class=\"note\">" + esc(when) + " · " + esc(t("a.o.lang")) + ": " + esc(String(o.lang).toUpperCase()) + "</div></div>" +
      '<div class="scroll-x"><table class="tbl"><tbody>' + itemRows(o) + "</tbody></table></div>" +
      '<div class="price">' + esc(t(o.has_estimate ? "c.total.est" : "c.total")) + ": " + esc(TS.money(o.total)) + (o.has_estimate ? ' <small class="note">(' + esc(t("a.o.est")) + ")</small>" : "") + "</div>" +
      '<div class="acts"><span class="note">' + esc(t("a.o.setstatus")) + "</span>" + STATUSES.filter(function (s) { return s !== o.status; }).map(function (s) { return '<button class="btn sm" type="button" data-oact="status" data-ostatus="' + s + '">' + esc(t("a.o.s." + s)) + "</button>"; }).join("") + "</div>" +
      '<div class="fld"><label for="on-' + esc(o.id) + '">' + esc(t("a.o.note")) + '</label><textarea id="on-' + esc(o.id) + '" data-onote="' + esc(o.id) + '" maxlength="1000" rows="2">' + esc(draft) + "</textarea></div>" +
      '<div class="acts"><button class="btn sm" type="button" data-oact="note">' + esc(t("a.o.savenote")) + '</button><button class="btn sm danger" type="button" data-oact="del">' + esc(t("a.delete")) + "</button></div></article>";
  }
  function draw() {
    var list = orders.filter(function (o) { return !st.status || o.status === st.status; }), pages = Math.max(1, Math.ceil(list.length / PER)); st.page = Math.min(st.page, pages);
    var opts = '<option value="">' + esc(t("a.o.all")) + "</option>" + STATUSES.map(function (s) { return '<option value="' + s + '"' + (st.status === s ? " selected" : "") + ">" + esc(t("a.o.s." + s)) + "</option>"; }).join("");
    ctx.root.innerHTML = ctx.frame('<p class="disc" style="margin-bottom:14px">' + esc(t("a.o.help")) + '</p><div class="acts" style="margin-bottom:14px;align-items:center"><label class="sr" for="o-st">' + esc(t("a.status")) + '</label><select id="o-st" style="max-width:240px">' + opts + '</select><button class="btn sm" type="button" data-oact="refresh">' + esc(t("a.o.refresh")) + '</button><span class="note">' + esc(t("a.total", { n: list.length })) + "</span></div>" +
      (list.length ? '<div style="display:grid;gap:14px">' + list.slice((st.page - 1) * PER, st.page * PER).map(card).join("") + "</div>" : '<div class="empty">' + esc(t("a.o.none")) + "</div>") +
      '<div class="pager"><button class="btn sm" type="button" data-oact="pg" data-od="-1"' + (st.page <= 1 ? " disabled" : "") + ">" + esc(t("a.prev")) + "</button><span>" + esc(t("a.page", { p: st.page, n: pages })) + '</span><button class="btn sm" type="button" data-oact="pg" data-od="1"' + (st.page >= pages ? " disabled" : "") + ">" + esc(t("a.next")) + "</button></div>");
  }
  async function render(c) {
    ctx = c; wire();
    ctx.root.innerHTML = ctx.frame('<div class="skel" style="max-width:420px"></div>');
    try { await load(); } catch (e) {
      if (e && e.handled) return;
      var missing = e && (e.code === "42P01" || /orders/.test(e.message || ""));
      ctx.root.innerHTML = ctx.frame('<div class="msg err" role="alert">' + esc(missing ? "005_orders.sql ← supabase/migrations" : (e && e.message) || String(e)) + "</div>"); return;
    }
    draw();
  }

  async function act(b) {
    var art = b.closest("[data-oid]"), id = art && art.dataset.oid, a = b.dataset.oact;
    if (a === "pg") { st.page = Math.max(1, st.page + (+b.dataset.od)); return draw(); }
    if (a === "refresh") return render(ctx);
    var o = orders.filter(function (x) { return x.id === id; })[0]; if (!o || ctx.busy()) return;
    if (a === "del" && !(await ctx.confirmDialog(t("a.confirm.title"), t("a.o.confirm", { ref: o.ref }), t("a.delete")))) return;
    ctx.setBusy(true);
    try {
      if (a === "status") await ctx.db(ctx.sb.from("orders").update({ status: b.dataset.ostatus }).eq("id", id));
      else if (a === "note") { var v = ($("#on-" + id) || {}).value || ""; await ctx.db(ctx.sb.from("orders").update({ admin_note: v.trim() || null }).eq("id", id)); delete drafts[id]; }
      else if (a === "del") await ctx.db(ctx.sb.from("orders").delete().eq("id", id));
      await load(); TS.toast(t("a.saved"));
    } catch (e) { ctx.fail(e); }
    if (ctx.view() === "orders") { ctx.setBusy(false); draw(); } else ctx.setBusy(false);
  }
  function wire() {
    if (wired) return; wired = true;
    ctx.root.addEventListener("click", function (e) { var b = e.target.closest("[data-oact]"); if (b) act(b); });
    ctx.root.addEventListener("change", function (e) { if (e.target.id === "o-st") { st.status = e.target.value; st.page = 1; draw(); } });
    ctx.root.addEventListener("input", function (e) { var n = e.target.dataset && e.target.dataset.onote; if (n) drafts[n] = e.target.value; });
  }

  window.TSAdminOrders = { tab: tab, render: render, start: start, stop: stop, poll: function () { return refreshCount(); } };
})();
