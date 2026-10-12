#!/usr/bin/env python3
"""اختبار ميزة الطلبات: تسجيل الطلب من السلة/صفحة المنتج + تبويب الطلبات في الإدارة، عبر Supabase "وهمي".
⚠ الوهمي يحاكي قواعد create_order لكنه ليس كود SQL الحقيقي؛ دالة SQL نفسها لم تُنفَّذ على Postgres هنا."""
import os, shutil, subprocess, sys, tempfile, time, re
from playwright.sync_api import sync_playwright
SRC = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
tmp = tempfile.mkdtemp(); dst = os.path.join(tmp, "site"); shutil.copytree(SRC, dst, ignore=shutil.ignore_patterns("tests", ".git"))
shutil.copy(os.path.join(SRC, "tests", "serve.py"), os.path.join(tmp, "serve.py"))
FAKE = open(os.path.join(SRC, "tests", "fake_supabase.js"), encoding="utf-8").read()
cfg = open(dst + "/js/config.js", encoding="utf-8").read().replace('SUPABASE_URL: ""', 'SUPABASE_URL: "https://test.supabase.co"').replace('SUPABASE_ANON_KEY: ""', 'SUPABASE_ANON_KEY: "test-anon-key-0123456789abcdef"'); open(dst + "/js/config.js", "w", encoding="utf-8").write(cfg)
PORT = 8769; srv = subprocess.Popen([sys.executable, os.path.join(tmp, "serve.py"), str(PORT), dst]); time.sleep(1.2)
B = f"http://127.0.0.1:{PORT}"; R = []
def check(n, ok, extra=""): R.append(bool(ok)); print(("  ✔ " if ok else "  ✘ ") + n + ("" if ok else f"   [{extra}]"))
BASE = "type:'physical',category_id:null,price_is_starting:false,quote_only:false,currency:'MAD',is_available:true,images:[],is_featured:false,created_at:'2026-01-01T00:00:00Z'"
SEED = """window.__SEED={products:[
 {id:'p1',slug:'ring-light',%s,price:100,fulfillment:'own_stock',stock_quantity:5,variants:[{name:{ar:'اللون'},options:['أسود','أبيض']}],is_published:true},
 {id:'p2',slug:'branding',%s,type:'service',price:null,quote_only:true,variants:[],is_published:true},
 {id:'p3',slug:'secret',%s,price:50,fulfillment:'own_stock',stock_quantity:9,variants:[],is_published:false},
 {id:'p4',slug:'logo',%s,type:'service',price:500,price_is_starting:true,variants:[],is_published:true}],
 product_translations:[{id:'t1',product_id:'p1',language:'ar',name:'إضاءة'},{id:'t2',product_id:'p2',language:'ar',name:'هوية'},{id:'t3',product_id:'p3',language:'ar',name:'سري'},{id:'t4',product_id:'p4',language:'ar',name:'شعار'},{id:'t5',product_id:'p1',language:'en',name:'Ring light'}]}""" % (BASE, BASE, BASE, BASE)
def mk(ctx, seed=""):
    pg = ctx.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    if seed: pg.add_init_script(seed)
    return pg, errs
try:
    with sync_playwright() as p:
        br = p.chromium.launch(); ctx = br.new_context(viewport={"width": 1280, "height": 900}); popups = []; ctx.on("page", lambda pg: popups.append(pg))
        def route(r):
            u = r.request.url
            if u.startswith(B): return r.continue_()
            if "supabase-js@" in u: return r.fulfill(status=200, content_type="application/javascript", body=FAKE)
            return r.fulfill(status=200, body="")
        ctx.route("**/*", route)
        fk = lambda pg, js: pg.evaluate("() => " + js)
        print("تسجيل الطلب من جهة الزبون")
        v, verr = mk(ctx, SEED); v.goto(B + "/product.html?slug=ring-light"); v.wait_for_selector(".pd")
        v.select_option("#opt0", "أسود"); v.click("[data-q='1']"); n = len(popups); v.click("#wa-order"); v.wait_for_timeout(500)
        check("زر واتساب يفتح نافذة واتساب", len(popups) == n + 1 and "wa.me/212633740099" in popups[-1].url, [x.url for x in popups])
        o = fk(v, "__fake.db.orders"); it = fk(v, "__fake.db.order_items")
        check("سُجّل طلب واحد بمرجع صحيح ولغة الزبون", len(o) == 1 and re.match(r"^TA-\d{6}-[A-Z2-9]{4}$", o[0]["ref"]) and o[0]["lang"] == "ar" and o[0]["status"] == "new")
        check("المجموع حُسب في الخادم من السعر المخزَّن (2 × 100 = 200)", o[0]["total"] == 200 and it[0]["quantity"] == 2 and it[0]["unit_price"] == 100, o)
        check("اسم المنتج لقطة عربية والخيار مسجَّل", it[0]["product_name"] == "إضاءة" and it[0]["options"] == {"0": "أسود"})
        print("محاولات التلاعب (مباشرة على الدالة)")
        call = lambda args: v.evaluate("(a) => window.supabase.createClient().rpc('create_order', a).then(r => r.error ? r.error.message : 'OK')", args)
        good = {"product_id": "p1", "quantity": 1, "options": {"0": "أسود"}, "note": ""}
        check("المجموع المُرسَل من المتصفح يُتجاهل", call({"p_ref": "TA-261010-AAAA", "p_lang": "ar", "p_items": [dict(good, total=1, unit_price=0.01)]}) == "OK" and fk(v, "__fake.db.orders.find(o=>o.ref=='TA-261010-AAAA').total") == 100)
        check("منتج غير منشور مرفوض", call({"p_ref": "TA-261010-BBBB", "p_lang": "ar", "p_items": [{"product_id": "p3", "quantity": 1, "options": {}}]}) == "product_unavailable")
        check("كمية فوق المخزون مرفوضة", call({"p_ref": "TA-261010-CCCC", "p_lang": "ar", "p_items": [dict(good, quantity=6)]}) == "quantity_unavailable")
        check("خيار غير موجود مرفوض", call({"p_ref": "TA-261010-DDDD", "p_lang": "ar", "p_items": [dict(good, options={"0": "أحمر"})]}) == "invalid_options")
        check("مرجع بصيغة خاطئة / لغة خاطئة / قائمة فارغة مرفوضة", call({"p_ref": "x", "p_lang": "ar", "p_items": [good]}) == "invalid_ref" and call({"p_ref": "TA-261010-EEEE", "p_lang": "zz", "p_items": [good]}) == "invalid_lang" and call({"p_ref": "TA-261010-EEEE", "p_lang": "ar", "p_items": []}) == "invalid_items")
        n0 = fk(v, "__fake.db.orders.length"); call({"p_ref": "TA-261010-AAAA", "p_lang": "ar", "p_items": [good]})
        check("نفس المرجع مرتين لا يُكرّر الطلب", fk(v, "__fake.db.orders.length") == n0)
        check("الطلبات المرفوضة لم تترك أي صف (طلبان فقط: الأول + AAAA)", n0 == 2, n0)
        check("الزائر لا يقرأ جدول الطلبات", v.evaluate("() => window.supabase.createClient().from('orders').select('*').then(r => r.data.length)") == 0)
        print("من السلة (خدمة بعرض سعر + سعر ابتدائي)")
        v.evaluate("() => localStorage.setItem('ta_store_cart_v1', JSON.stringify([{id:'p1',qty:1,options:{0:'أبيض'},note:''},{id:'p2',qty:1,options:{},note:'أريد هوية لمقهى'},{id:'p4',qty:1,options:{},note:''}]))")
        v.goto(B + "/cart.html"); v.wait_for_selector(".line"); n = len(popups); v.click("#wa-send"); v.wait_for_timeout(500)
        last = fk(v, "__fake.db.orders[__fake.db.orders.length-1]"); li = fk(v, "__fake.db.order_items.filter(i=>i.order_id=='%s')" % last["id"])
        check("طلب السلة: 3 أسطر، المجموع 100+500، ووُسم تقديرياً", len(li) == 3 and last["total"] == 600 and last["has_estimate"] is True, last)
        check("عرض السعر محفوظ بسعر NULL والملاحظة محفوظة", any(i["unit_price"] is None and i["note"] == "أريد هوية لمقهى" for i in li) and len(popups) == n + 1)
        print("فشل التسجيل لا يمنع واتساب")
        v.goto(B + "/product.html?slug=ring-light"); v.wait_for_selector(".pd"); v.select_option("#opt0", "أبيض")
        fk(v, "(__fake.db.products[0].is_published=false)"); n = len(popups); n0 = fk(v, "__fake.db.orders.length"); v.click("#wa-order"); v.wait_for_timeout(500)
        check("المنتج أُخفي بعد فتح الصفحة: لا يُسجَّل طلب لكن واتساب يُفتح", fk(v, "__fake.db.orders.length") == n0 and len(popups) == n + 1)
        check("لا أخطاء JavaScript عند الزبون", verr == [], verr)

        print("تبويب الطلبات في الإدارة")
        ORD = """window.__SEED={orders:[
          {id:'o1',ref:'TA-261010-AAAA',lang:'ar',status:'new',total:200,has_estimate:false,admin_note:null,created_at:'2026-10-10T10:00:00Z'},
          {id:'o2',ref:'TA-261009-BBBB',lang:'fr',status:'new',total:600,has_estimate:true,admin_note:null,created_at:'2026-10-09T10:00:00Z'},
          {id:'o3',ref:'TA-261008-CCCC',lang:'en',status:'completed',total:50,has_estimate:false,admin_note:'تم',created_at:'2026-10-08T10:00:00Z'}],
         order_items:[{id:'i1',order_id:'o1',product_id:'p1',product_name:'إضاءة',product_type:'physical',options:{'0':'أسود'},quantity:2,unit_price:100,note:null},
          {id:'i2',order_id:'o2',product_id:null,product_name:'هوية',product_type:'service',options:{},quantity:1,unit_price:null,note:'ملاحظة الزبون'},
          {id:'i3',order_id:'o3',product_id:'p1',product_name:'شيء',product_type:'digital',options:{},quantity:1,unit_price:50,note:null}]}"""
        a, aerr = mk(ctx, ORD); a.on("dialog", lambda d: d.accept()); a.goto(B + "/admin.html"); a.wait_for_selector("#login")
        a.fill("#l-email", "admin@x.com"); a.fill("#l-pass", "pass123"); a.click("#l-btn"); a.wait_for_selector("[data-new]")
        a.wait_for_function("() => document.querySelector('#ord-badge') && !document.querySelector('#ord-badge').hidden")
        check("عدّاد الطلبات الجديدة = 2 على التبويب", a.inner_text("#ord-badge") == "2")
        check("تبويب المنتجات الحالي سليم (زر منتج جديد ظاهر)", a.locator("[data-new]").is_visible())
        a.click("[data-go=orders]"); a.wait_for_selector("article[data-oid]")
        check("عرض 3 طلبات الأحدث أولاً مع المرجع والعناصر", a.locator("article[data-oid]").count() == 3 and "TA-261010-AAAA" in a.locator("article[data-oid]").first.inner_text() and "× 2" in a.inner_text("article[data-oid]"))
        txt = a.inner_text("[data-oid=o2]"); check("عرض السعر/التقديري/ملاحظة الزبون ومنتج محذوف", "عرض سعر" in txt and "تقديري" in txt and "ملاحظة الزبون" in txt and "منتج محذوف" in txt, txt)
        check("تنبيه أن «جديد» لا يعني الدفع", "لا تعني أنه أرسل الرسالة أو دفع" in a.inner_text(".disc"))
        a.select_option("#o-st", "completed"); check("فلتر الحالة: مكتمل = 1", a.locator("article[data-oid]").count() == 1); a.select_option("#o-st", "")
        a.locator("[data-oid=o1] [data-oact=status][data-ostatus=confirmed]").click(); a.wait_for_function("() => __fake.db.orders[0].status==='confirmed'")
        check("تغيير الحالة إلى مؤكد يحفظ ويُنقص العدّاد إلى 1", a.inner_text("#ord-badge") == "1" and "مؤكد" in a.inner_text("[data-oid=o1] .pill"))
        a.fill("#on-o1", "اتصل به غداً"); a.locator("[data-oid=o1] [data-oact=note]").click(); a.wait_for_function("() => __fake.db.orders[0].admin_note==='اتصل به غداً'"); check("حفظ الملاحظة الداخلية", True)
        a.fill("#on-o2", "مسودة لم تُحفظ"); a.click("#langs [data-l=en]"); a.wait_for_selector("article[data-oid]")
        check("تبديل اللغة: التبويب يُترجم والمسودة لا تضيع", "Orders" in a.inner_text(".tabs") and a.input_value("#on-o2") == "مسودة لم تُحفظ" and a.evaluate("document.documentElement.dir") == "ltr")
        a.click("#langs [data-l=ar]"); a.wait_for_selector("article[data-oid]")
        fk(a, "__fake.db.orders.push({id:'o9',ref:'TA-261011-ZZZZ',lang:'ar',status:'new',total:10,has_estimate:false,created_at:'2026-10-11T10:00:00Z'})")
        a.evaluate("() => window.TSAdminOrders.poll()"); a.wait_for_selector(".toast")
        check("وصول طلب جديد: إشعار + العدّاد يصبح 2", "طلب جديد" in a.inner_text("#toasts") and a.inner_text("#ord-badge") == "2")
        a.locator("[data-oid=o3] [data-oact=del]").click(); a.wait_for_selector("dialog[open]"); check("نافذة التأكيد تذكر مرجع الطلب", "TA-261008-CCCC" in a.inner_text("dialog")); a.click("dialog button[value=ok]"); a.wait_for_function("() => !__fake.db.orders.some(o=>o.id==='o3')")
        check("حذف طلب بتأكيد يحذف عناصره أيضاً", fk(a, "__fake.db.order_items.filter(i=>i.order_id=='o3').length") == 0)
        a.click("[data-go=list]"); a.wait_for_selector("[data-new]"); a.click("[data-signout]"); a.wait_for_selector("#login")
        check("بعد الخروج لا يبقى تبويب الطلبات ولا عدّاد", a.locator("#ord-badge").count() == 0)
        check("لا أخطاء JavaScript في الإدارة", aerr == [], aerr)
        br.close()
finally:
    srv.terminate(); shutil.rmtree(tmp, ignore_errors=True)
print(f"\nالنتيجة: {sum(R)} نجح، {len(R)-sum(R)} فشل"); sys.exit(0 if all(R) else 1)
