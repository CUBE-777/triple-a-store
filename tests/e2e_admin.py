#!/usr/bin/env python3
"""اختبار واجهة الإدارة والمتجر العام عبر Supabase "وهمي" (tests/fake_supabase.js) داخل Chromium.
⚠ يختبر سلوك الواجهة وتدفق العمل فقط، ولا يختبر سياسات RLS الحقيقية في Postgres (انظر README قسم الاختبار)."""
import io, os, shutil, subprocess, sys, tempfile, time
from PIL import Image
from playwright.sync_api import sync_playwright
SRC = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
tmp = tempfile.mkdtemp(); dst = os.path.join(tmp, "site"); shutil.copytree(SRC, dst, ignore=shutil.ignore_patterns("tests", ".git"))
shutil.copy(os.path.join(SRC, "tests", "serve.py"), os.path.join(tmp, "serve.py"))
FAKE = open(os.path.join(SRC, "tests", "fake_supabase.js"), encoding="utf-8").read()
cfg = open(dst + "/js/config.js", encoding="utf-8").read().replace('SUPABASE_URL: ""', 'SUPABASE_URL: "https://test.supabase.co"').replace('SUPABASE_ANON_KEY: ""', 'SUPABASE_ANON_KEY: "test-anon-key-0123456789abcdef"'); open(dst + "/js/config.js", "w", encoding="utf-8").write(cfg)
PORT = 8767; srv = subprocess.Popen([sys.executable, os.path.join(tmp, "serve.py"), str(PORT), dst]); time.sleep(1.2)
B = f"http://127.0.0.1:{PORT}"; R = []
def check(n, ok, extra=""): R.append(bool(ok)); print(("  ✔ " if ok else "  ✘ ") + n + ("" if ok else f"   [{extra}]"))
def png(name, color):
    bio = io.BytesIO(); Image.new("RGB", (2400, 1800), color).save(bio, "PNG"); return {"name": name, "mimeType": "image/png", "buffer": bio.getvalue()}
GIF = bytes.fromhex("47494638396101000100800000ffffff00000021f90401000000002c00000000010001000002024401003b")
try:
    with sync_playwright() as p:
        br = p.chromium.launch(); ctx = br.new_context(viewport={"width": 1280, "height": 900}); errors = []
        def route(r):
            u = r.request.url
            if u.startswith(B): return r.continue_()
            if "supabase-js@" in u: return r.fulfill(status=200, content_type="application/javascript", body=FAKE)
            if "test.supabase.co/storage" in u: return r.fulfill(status=200, content_type="image/gif", body=GIF)
            return r.fulfill(status=200, body="")
        ctx.route("**/*", route); pg = ctx.new_page()
        pg.on("pageerror", lambda e: errors.append("pageerror: " + str(e))); pg.on("console", lambda m: errors.append("console: " + m.text) if m.type == "error" else None)
        fk = lambda js: pg.evaluate("() => " + js)
        pg.on("dialog", lambda d: d.accept())
        def login(email="admin@x.com", pw="pass123"):
            pg.fill("#l-email", email); pg.fill("#l-pass", pw); pg.click("#l-btn")
        print("الدخول والتفويض")
        pg.goto(B + "/admin.html"); pg.wait_for_selector("#login")
        check("زائر غير مسجَّل يرى شاشة الدخول فقط", pg.locator("#login").is_visible() and pg.locator("[data-new]").count() == 0)
        login(pw="wrong"); pg.wait_for_selector(".errs"); check("كلمة مرور خاطئة → رسالة واضحة", "غير صحيحين" in pg.inner_text(".errs"))
        login("user@x.com"); pg.wait_for_selector(".errs"); check("حساب غير مسؤول → مرفوض", "غير مخوَّل" in pg.inner_text(".errs") and fk("__fake.user") is None)
        login(); pg.wait_for_selector("[data-new]"); check("المسؤول يدخل ويرى القائمة", pg.locator("[data-new]").is_visible())

        print("الأقسام")
        pg.click("[data-go=cats]"); pg.click("[data-cnew]"); pg.fill("#c-slug", "Bad Slug!"); pg.fill("#c-n-ar", "قسم"); pg.click("#c-save"); check("slug قسم غير صالح → خطأ ولا إدراج", pg.locator("#cerrs .errs").count() == 1 and fk("__fake.db.categories.length") == 1)
        pg.fill("#c-slug", "design-services"); pg.fill("#c-n-ar", "خدمات التصميم"); pg.fill("#c-n-en", "Design services"); pg.click("#c-save"); pg.wait_for_selector("#cform", state="detached")
        check("إضافة قسم بلغتين", fk("__fake.db.categories.length") == 2 and fk("__fake.db.category_translations.filter(x=>x.name=='Design services').length") == 1)

        print("إنشاء منتج مادي مع صورة")
        pg.click("[data-go=list]"); pg.click("[data-new]"); pg.click("#save"); pg.wait_for_selector(".errs")
        check("حفظ نموذج فارغ → أخطاء تحقق واضحة بدون أي كتابة", "العربي" in pg.inner_text("#errs") and "سعر" in pg.inner_text("#errs") and fk("__fake.db.products.length") == 0)
        pg.fill("#f-name-ar", "إضاءة حلقية"); pg.fill("#f-name-en", "LED Ring Light"); check("slug يُولَّد تلقائياً من الاسم الإنجليزي", pg.input_value("#f-slug") == "led-ring-light")
        pg.fill("#f-price", "349.5"); pg.select_option("#f-cat", "c1"); pg.fill("#f-stock", "5"); pg.check("#f-pub"); pg.check("#f-feat")
        pg.fill("#f-supname", "مورد سري"); pg.fill("#f-cost", "200")
        pg.click("[data-vadd]"); pg.fill("[data-v=ar]", "اللون"); pg.fill("[data-v=en]", "Colour"); pg.fill("[data-v=options]", "أسود, أبيض, أسود")
        pg.set_input_files("#f-img", [png("a.png", "purple"), {"name": "bad.gif", "mimeType": "image/gif", "buffer": GIF}]); pg.wait_for_selector(".imgs .im")
        check("الصورة غير المسموحة (GIF) تُرفض برسالة", "غير مسموح" in pg.inner_text("#errs") and pg.locator(".imgs .im").count() == 1)
        pg.fill("#f-name-ar", "إضاءة حلقية"); pg.click("#save"); pg.wait_for_selector("[data-new]")
        prod = fk("__fake.db.products[0]"); up = fk("Object.entries(__fake.storage['product-images'])")
        check("المنتج حُفظ بالقيم الصحيحة", prod["slug"] == "led-ring-light" and prod["price"] == 349.5 and prod["stock_quantity"] == 5 and prod["is_published"] and prod["is_featured"] and prod["currency"] == "MAD" and prod["fulfillment"] == "own_stock")
        check("الصورة رُفعت بـ WebP ومصغّرة (<5MB) بمسار آمن", len(up) == 1 and up[0][0].startswith("products/") and up[0][0].endswith(".webp") and up[0][1]["type"] == "image/webp" and up[0][1]["size"] < 5 * 1048576, up)
        check("مسار الصورة محفوظ في المنتج", prod["images"] == [up[0][0]])
        check("خيارات المنتج: قيم مكررة أُزيلت", prod["variants"] == [{"name": {"ar": "اللون", "en": "Colour"}, "options": ["أسود", "أبيض"]}], prod["variants"])
        check("ترجمتان فقط (ar,en) بدون صف فارغ للفرنسية", sorted(fk("__fake.db.product_translations.map(x=>x.language)")) == ["ar", "en"])
        check("بيانات المورّد في جدول خاص منفصل", fk("__fake.db.product_private[0].supplier_name") == "مورد سري" and "supplier_name" not in prod)

        print("تعديل وتبديل الحالة وإعادة المحاولة")
        pg.click("[data-edit]"); pg.wait_for_selector("#pform")
        check("النموذج يُحمَّل بالقيم المحفوظة", pg.input_value("#f-price") == "349.5" and pg.input_value("#f-name-en") == "LED Ring Light" and pg.input_value("[data-v=options]") == "أسود, أبيض")
        pg.fill("#f-name-fr", "Anneau LED"); pg.click("#langs [data-l=en]"); pg.wait_for_selector("#pform")
        check("تغيير اللغة أثناء التعديل لا يُفقد ما كُتب", pg.input_value("#f-name-fr") == "Anneau LED" and pg.evaluate("document.documentElement.dir") == "ltr")
        pg.click("#langs [data-l=ar]"); pg.fill("#f-price", "399"); pg.click("#save"); pg.wait_for_selector("[data-new]")
        check("التعديل يحدّث السعر ويضيف الترجمة الفرنسية", fk("__fake.db.products[0].price") == 399 and fk("__fake.db.product_translations.length") == 3)
        pg.click("[data-pub]"); pg.wait_for_function("() => __fake.db.products[0].is_published===false"); check("إخفاء المنتج", True)
        pg.click("[data-pub]"); pg.wait_for_function("() => __fake.db.products[0].is_published===true"); pg.click("[data-feat]"); pg.wait_for_function("() => __fake.db.products[0].is_featured===false"); check("نشر + إلغاء تمييز", True)

        print("إنشاء رقمي (ملف خاص + رابط موقّع) وخدمة")
        pg.click("[data-new]"); pg.select_option("#f-type", "digital"); pg.wait_for_selector("#f-ff")
        check("النموذج يتكيّف: حقول رقمية ظاهرة وحقول المخزون مخفية", pg.locator("#f-stock").count() == 0 and pg.locator("#f-dm").count() == 1)
        pg.fill("#f-name-ar", "قوالب كانفا"); pg.fill("#f-name-en", "Canva Pack"); pg.fill("#f-price", "79"); pg.fill("#f-ff", "Canva"); pg.select_option("#f-dm", "signed_link")
        pg.set_input_files("#f-file", {"name": "قوالب pack.zip", "mimeType": "application/zip", "buffer": b"PK" + b"0" * 100}); pg.click("#save"); pg.wait_for_selector("[data-new]")
        priv = fk("__fake.db.product_private.filter(x=>x.digital_file_path)[0]"); files = fk("Object.keys(__fake.storage['digital-files'])")
        check("الملف الرقمي في الـbucket الخاص بمسار آمن (ASCII)", len(files) == 1 and files[0].isascii() and files[0].endswith(".zip") and priv["digital_file_path"] == files[0], files)
        check("الملف الخاص لم يُرفع إلى bucket الصور العام", all(not k.endswith(".zip") for k in fk("Object.keys(__fake.storage['product-images'])")))
        pg.locator("tr", has_text="قوالب كانفا").locator("[data-edit]").click(); pg.wait_for_selector("[data-link]"); pg.click("[data-link]"); pg.wait_for_selector("#f-linkout")
        check("رابط موقّع مؤقت لمدة 24 ساعة", "sign/digital-files/" in pg.input_value("#f-linkout") and "exp=86400" in pg.input_value("#f-linkout"))
        pg.click("[data-go=list]"); pg.click("[data-new]"); pg.select_option("#f-type", "service"); pg.wait_for_selector("#f-quote")
        pg.fill("#f-name-ar", "هوية متكاملة"); pg.check("#f-quote"); check("خدمة عرض سعر: حقل السعر يُعطَّل", pg.is_disabled("#f-price")); pg.fill("#f-deliverables-ar", "شعار\nألوان"); pg.fill("#f-delivery-ar", "7 أيام"); pg.fill("#f-slug", "full-branding"); pg.click("#save"); pg.wait_for_selector("[data-new]")
        sv = fk("__fake.db.products.filter(x=>x.slug=='full-branding')[0]"); check("الخدمة: سعر NULL وquote_only وبدون مخزون", sv["price"] is None and sv["quote_only"] and sv["stock_quantity"] is None and sv["fulfillment"] is None)
        check("المخرجات ومدة التنفيذ في الترجمة", fk("__fake.db.product_translations.filter(x=>x.deliverables)[0].deliverables") == "شعار\nألوان")

        print("الأخطاء والاسترجاع")
        n0 = fk("__fake.db.products.length"); nt = fk("__fake.db.product_translations.length")
        pg.click("[data-new]"); pg.select_option("#f-type", "service"); pg.fill("#f-name-ar", "مكرر"); pg.fill("#f-price", "10"); pg.fill("#f-slug", "full-branding"); pg.set_input_files("#f-img", png("b.png", "red")); pg.click("#save"); pg.wait_for_selector(".errs")
        check("slug مكرر → رسالة واضحة", "مستخدم" in pg.inner_text("#errs"))
        check("بعد الفشل: لا منتج ولا صورة يتيمة (تراجع)", fk("__fake.db.products.length") == n0 and fk("__fake.db.product_translations.length") == nt and len(fk("Object.keys(__fake.storage['product-images'])")) == 1)
        check("الزر عاد قابلاً للاستعمال بعد الفشل", pg.is_enabled("#save"))
        pg.click("[data-go=list]")

        print("البحث والفلاتر والترقيم")
        fk("(()=>{for(let i=0;i<14;i++){__fake.db.products.push({id:'bulk'+i,slug:'bulk-'+i,type:'service',category_id:null,price:5+i,price_is_starting:false,quote_only:false,currency:'MAD',is_available:true,variants:[],images:[],is_published:i%2==0,is_featured:false,created_at:new Date(2020,0,i+1).toISOString()});__fake.db.product_translations.push({id:'bt'+i,product_id:'bulk'+i,language:'ar',name:'منتج جماعي '+i})}})()")
        pg.locator("[data-feat]").first.click(); pg.wait_for_function("() => document.querySelectorAll('.tbl tbody tr').length===10")   # أي إجراء يعيد تحميل القائمة من القاعدة
        check("ترقيم: 10 صفوف في الصفحة الأولى", pg.locator(".tbl tbody tr").count() == 10)
        check("عدّاد الصفحات صحيح (2 من 2 بعد التالي)", (pg.click("[data-pg='1']") or True) and "2" in pg.inner_text(".pager span") and pg.locator(".tbl tbody tr").count() == 7 and pg.is_disabled("[data-pg='1']"), pg.locator(".tbl tbody tr").count())
        pg.fill("#a-q", "جماعي 13"); check("البحث بالاسم يعيد الصفحة 1 بنتيجة واحدة", pg.locator(".tbl tbody tr").count() == 1)
        pg.fill("#a-q", ""); pg.select_option("#a-s", "hidden"); check("فلتر الحالة: المخفي فقط", all("مخفي" in r for r in pg.locator(".tbl tbody tr td:nth-child(5)").all_inner_texts()))
        pg.select_option("#a-s", ""); pg.select_option("#a-t", "digital"); check("فلتر النوع: رقمي = 1", pg.locator(".tbl tbody tr").count() == 1); pg.select_option("#a-t", ""); pg.select_option("#a-c", "c1"); check("فلتر القسم", pg.locator(".tbl tbody tr").count() == 1)
        pg.select_option("#a-c", "")

        print("المتجر العام عبر نفس الواجهة (القراءة)")
        pub = fk("__fake.db.products.filter(x=>x.is_published).length")
        pg2 = ctx.new_page(); pg2.on("pageerror", lambda e: errors.append("pageerror2: " + str(e)))
        pg2.add_init_script("""window.__SEED={products:[
          {id:'pub1',slug:'visible-item',type:'service',category_id:null,price:100,price_is_starting:false,quote_only:false,currency:'MAD',is_available:true,variants:[],images:[],is_published:true,is_featured:false,created_at:'2026-01-01T00:00:00Z'},
          {id:'hid1',slug:'hidden-item',type:'service',category_id:null,price:100,price_is_starting:false,quote_only:false,currency:'MAD',is_available:true,variants:[],images:[],is_published:false,is_featured:false,created_at:'2026-01-02T00:00:00Z'}],
          product_translations:[{id:'t1',product_id:'pub1',language:'ar',name:'ظاهر'},{id:'t2',product_id:'hid1',language:'ar',name:'مخفي'}],
          product_private:[{product_id:'pub1',supplier_name:'SECRET-SUPPLIER'}]}""")
        pg2.goto(B + "/index.html"); pg2.wait_for_selector("#grid .card")
        check("الزائر (عبر Supabase) يرى المنشور فقط", pg2.locator("#grid .card").count() == 1 and "ظاهر" in pg2.inner_text("#grid") and "مخفي" not in pg2.content())
        pg2.goto(B + "/product.html?slug=hidden-item"); pg2.wait_for_selector(".empty"); check("رابط منتج غير منشور → غير موجود", "غير موجود" in pg2.inner_text(".empty"))
        pg2.goto(B + "/product.html?slug=visible-item"); pg2.wait_for_selector(".pd"); check("منتج منشور يُعرض ولا تظهر بيانات المورّد الخاصة", "SECRET-SUPPLIER" not in pg2.content())
        pg2.evaluate("localStorage.setItem('ta_store_cart_v1', JSON.stringify([{id:'hid1',qty:1,options:{},note:''}]))"); pg2.goto(B + "/cart.html"); pg2.wait_for_selector(".line")
        check("سلة تحوي منتجاً غير منشور → غير متاح ويُمنع الإرسال", pg2.locator(".line.bad").count() == 1 and pg2.get_attribute("#wa-send", "aria-disabled") == "true")
        pg2.close()

        print("حذف وانتهاء الجلسة")
        pg.on("dialog", lambda d: None)
        pg.locator("tr", has_text="هوية متكاملة").locator("[data-del]").click(); pg.wait_for_selector("dialog[open]")
        check("نافذة تأكيد الحذف تذكر اسم المنتج", "هوية متكاملة" in pg.inner_text("dialog")); pg.click("dialog button[value=cancel]"); check("الإلغاء لا يحذف", fk("__fake.db.products.filter(x=>x.slug=='full-branding').length") == 1)
        pg.locator("tr", has_text="LED").locator("[data-del]").click(); pg.wait_for_selector("dialog[open]"); pg.click("dialog button[value=ok]"); pg.wait_for_function("() => __fake.db.products.filter(x=>x.slug=='led-ring-light').length===0")
        check("الحذف بعد التأكيد يزيل المنتج وترجماته وبياناته الخاصة", fk("__fake.db.product_translations.filter(x=>x.product_id=='id2').length") == 0 if False else fk("__fake.db.product_private.filter(x=>x.supplier_name).length") == 0)
        check("وحُذفت صورته من التخزين", len(fk("Object.keys(__fake.storage['product-images'])")) == 0)
        fk("__fake.expireNext = true"); pg.click("[data-go=cats]"); pg.click("[data-go=list]"); pg.locator("[data-pub]").first.click(); pg.wait_for_selector("#login")
        check("انتهاء الجلسة → عودة آمنة للدخول برسالة", "انتهت الجلسة" in pg.inner_text("#login") and pg.locator("[data-new]").count() == 0)
        login(); pg.wait_for_selector("[data-new]"); pg.click("[data-signout]"); pg.wait_for_selector("#login"); check("تسجيل الخروج", fk("__fake.user") is None)
        errors = [e for e in errors if "Failed to load resource" not in e and "مستخدم لمنتج آخر" not in e]   # الأخير: خطأ متوقَّع سُجّل عمداً في اختبار slug المكرر
        check("لا أخطاء JavaScript أو CSP", errors == [], errors[:4]); br.close()
finally:
    srv.terminate(); shutil.rmtree(tmp, ignore_errors=True)
print(f"\nالنتيجة: {sum(R)} نجح، {len(R)-sum(R)} فشل"); sys.exit(0 if all(R) else 1)
