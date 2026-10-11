#!/usr/bin/env python3
"""اختبار المتصفح (Playwright + Chromium) للواجهة العامة في الوضع التجريبي.
يعمل على نسخة مؤقتة من المشروع بعد تفعيل DEMO_MODE، ويخدمها بترويسات netlify.toml (CSP).
تشغيل: python3 tests/e2e_storefront.py"""
import os, re, shutil, subprocess, sys, tempfile, time, urllib.parse
from playwright.sync_api import sync_playwright
SRC = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
tmp = tempfile.mkdtemp(); dst = os.path.join(tmp, "site"); shutil.copytree(SRC, dst, ignore=shutil.ignore_patterns("tests", ".git"))
shutil.copy(os.path.join(SRC, "tests", "serve.py"), os.path.join(tmp, "serve.py"))
cfg = open(dst + "/js/config.js", encoding="utf-8").read().replace("DEMO_MODE: false", "DEMO_MODE: true"); open(dst + "/js/config.js", "w", encoding="utf-8").write(cfg)
PORT = 8765; srv = subprocess.Popen([sys.executable, os.path.join(tmp, "serve.py"), str(PORT), dst]); time.sleep(1.2)
B = f"http://127.0.0.1:{PORT}"; R = []
def check(name, ok, extra=""):
    R.append(ok); print(("  ✔ " if ok else "  ✘ ") + name + ("" if ok else f"   [{extra}]"))
try:
    with sync_playwright() as p:
        br = p.chromium.launch(); ctx = br.new_context(viewport={"width": 1280, "height": 900}); errors = []
        def route(r):
            u = r.request.url
            if u.startswith(B): return r.continue_()
            if "supabase-js@" in u: return r.fulfill(status=200, content_type="application/javascript", body="")
            return r.fulfill(status=200, body="")   # الخطوط وغيرها: لا شبكة في بيئة الاختبار
        ctx.route("**/*", route)
        pg = ctx.new_page(); csp = []
        pg.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
        pg.on("console", lambda m: (errors.append("console: " + m.text) if m.type == "error" else None))
        pg.goto(B + "/index.html"); pg.wait_for_selector("#grid .card")
        count = lambda: pg.locator("#grid .card").count()
        print("الصفحة الرئيسية واللغات والثيم")
        check("العربية افتراضية وRTL", pg.evaluate("[document.documentElement.lang, document.documentElement.dir]") == ["ar", "rtl"])
        check("الثيم الداكن افتراضي", pg.evaluate("document.documentElement.dataset.theme") == "dark")
        check("9 منتجات تجريبية في الشبكة", count() == 9, count())
        check("قسم المميز يعرض 4", pg.locator("#featured .card").count() == 4)
        check("بانر الوضع التجريبي ظاهر", pg.locator(".demo").is_visible())
        check("رابط الاستوديو يشير للموقع الأصلي", pg.locator("#nav .studio-link").get_attribute("href") == "https://triple-a-a-a.netlify.app/")
        h1_ar = pg.inner_text("h1")
        pg.click("#langs [data-l=fr]"); check("الفرنسية: LTR + نص مترجم", pg.evaluate("[document.documentElement.lang, document.documentElement.dir]") == ["fr", "ltr"] and pg.inner_text("h1") != h1_ar and "créatif" in pg.inner_text("h1"))
        pg.click("#langs [data-l=en]"); check("الإنجليزية: LTR", pg.evaluate("document.documentElement.dir") == "ltr" and "Everything" in pg.inner_text("h1"))
        check("اسم المنتج يتبدل باللغة", "Sketchbook" in pg.inner_text("#grid"))
        pg.reload(); pg.wait_for_selector("#grid .card"); check("اللغة تُحفظ بعد إعادة التحميل", pg.evaluate("document.documentElement.lang") == "en")
        pg.click("#theme"); check("الثيم الفاتح + حفظه", pg.evaluate("[document.documentElement.dataset.theme, localStorage.theme]") == ["light", "light"])
        pg.click("#theme"); pg.click("#langs [data-l=ar]")
        unt = pg.evaluate("[...document.querySelectorAll('[data-t]')].filter(e=>!e.textContent.trim()).map(e=>e.dataset.t)"); check("لا عناصر ترجمة فارغة", unt == [], unt)

        print("البحث والفلاتر")
        pg.fill("#hq", "logo"); pg.wait_for_timeout(400); check("بحث إنجليزي 'logo' → 1", count() == 1 and "شعار" in pg.inner_text("#grid"), count())
        pg.fill("#hq", "شعار"); pg.wait_for_timeout(400); check("بحث عربي 'شعار' → 1", count() == 1)
        pg.fill("#hq", "appareil"); pg.wait_for_timeout(400); check("بحث فرنسي يجد منتجاً بالعربية", count() == 1)
        pg.fill("#hq", "اكسسوار كاميرا"); pg.wait_for_timeout(400); check("بحث متعدد الكلمات بدون نتائج → حالة فارغة", count() == 0 and pg.locator("#status .empty").is_visible())
        pg.click("#status [data-reset]"); pg.wait_for_timeout(200); check("إعادة الضبط تعيد 9", count() == 9 and pg.input_value("#hq") == "")
        pg.click("#cats [data-cat=photography]"); check("فلتر القسم: التصوير = 3", count() == 3, count())
        pg.select_option("#f-type", "physical"); check("قسم + نوع", count() == 3)
        pg.check("#f-stock"); check("المتوفر فقط يستبعد الميكروفون (2)", count() == 2, count())
        pg.fill("#f-min", "300"); pg.fill("#f-max", "400"); check("فلتر سعر 300–400 مع ما سبق → 1", count() == 1, count())
        pg.click("#reset"); pg.select_option("#f-sort", "price_asc")
        prices = pg.evaluate("[...document.querySelectorAll('#grid .price')].map(e=>e.textContent)")
        check("الترتيب بالسعر: الأرخص أولاً وعرض السعر آخراً", "49" in prices[0] and ("سعر" in prices[-1] or "عرض" in prices[-1]), prices)
        check("الرابط يعكس الحالة (sort)", "sort=price_asc" in pg.url)
        pg.click("#reset"); pg.select_option("#f-type", "service"); pg.fill("#f-min", "1"); check("فلتر السعر يستبعد عرض السعر (خدمتان بسعر)", count() == 2, count())
        pg.goto(B + "/index.html?cat=design-services&type=service"); pg.wait_for_selector("#grid .card"); check("المعاملات في الرابط تُطبَّق", count() == 2, count())

        print("السلة وواتساب")
        pg.goto(B + "/index.html"); pg.wait_for_selector("#grid .card")
        pg.locator("#grid [data-add]").first.click(); check("الإضافة من البطاقة ترفع المؤشر", pg.inner_text("#cartcount") == "1")
        pg.goto(B + "/product.html?slug=demo-sketchbook-set"); pg.wait_for_selector(".pd")
        pg.click("#wa-order"); check("خيار مطلوب غير مختار → رسالة وليس واتساب", pg.locator(".toast.err").count() >= 1)
        pg.select_option("#opt0", "A4"); pg.click("[data-q='1']"); pg.click("#add")
        check("المنتج بخيار: مؤشر السلة 3", pg.inner_text("#cartcount") == "3", pg.inner_text("#cartcount"))
        href = pg.get_attribute("#wa-order", "href"); txt = urllib.parse.unquote(href.split("?text=")[1])
        check("رابط واتساب بالرقم الصحيح", href.startswith("https://wa.me/212633740099?text="))
        check("رسالة المنتج: الاسم والخيار والكمية والمجموع", all(s in txt for s in ["دفتر رسم", "A4", "الكمية: 2", "258"]), txt)
        pg.goto(B + "/cart.html"); pg.wait_for_selector(".line")
        check("السلة: سطران", pg.locator(".line").count() == 2)
        total = pg.inner_text(".sum .tot"); check("الإجمالي = 79 (Canva) + 258 (دفترين) = 337", "337" in total, total)
        pg.fill("[data-note='0']", "ملاحظة & اختبار"); pg.click(".line [data-q='1']")
        t2 = pg.inner_text(".sum .tot"); check("زيادة الكمية تحدّث الإجمالي إلى 466", "466" in t2, t2)
        pg.click(".line [data-rm]"); check("الإزالة تعمل", pg.locator(".line").count() == 1)
        href = pg.get_attribute("#wa-send", "href"); txt = urllib.parse.unquote(href.split("?text=")[1])
        check("رسالة السلة: مرجع الطلب والعربية وتنبيه عدم الدفع", "TA-" in txt and "العربية" in txt and "لا تعني تأكيد الدفع" in txt)
        pg.evaluate("localStorage.setItem('ta_store_cart_v1', JSON.stringify([{id:'d4',qty:1,options:{},note:''},{id:'zzz',qty:1,options:{},note:''}]))"); pg.reload(); pg.wait_for_selector(".line")
        check("منتج نفد/محذوف: تحذير ويُعطَّل الإرسال", pg.locator(".line.bad").count() == 2 and pg.get_attribute("#wa-send", "aria-disabled") == "true")
        pg.click("#rm-bad"); check("إزالة غير المتاح تُفرغ السلة", pg.locator(".empty").is_visible())
        pg.evaluate("localStorage.setItem('ta_store_cart_v1', JSON.stringify([{id:'d2',qty:15,options:{},note:''}]))"); pg.reload(); pg.wait_for_selector(".line")
        check("كمية تتجاوز المخزون (2) تُقصّ تلقائياً", pg.locator(".line output").inner_text() == "2" and pg.locator(".msg.warn").count() == 1)
        pg.evaluate("localStorage.setItem('ta_store_cart_v1','{bad json')"); pg.reload(); pg.wait_for_timeout(300); check("بيانات سلة تالفة لا تكسر الصفحة", pg.locator(".empty").is_visible())

        print("حالات خاصة")
        pg.goto(B + "/product.html?slug=nope"); pg.wait_for_selector(".empty"); check("منتج غير موجود: حالة واضحة", "غير موجود" in pg.inner_text(".empty"))
        pg.goto(B + "/product.html?slug=<script>"); pg.wait_for_selector(".empty"); check("slug خبيث لا يُنفَّذ", pg.locator(".empty").is_visible())
        pg.goto(B + "/product.html?slug=demo-full-branding"); pg.wait_for_selector(".pd"); check("خدمة عرض سعر: زر طلب عرض سعر بلا زر سلة", pg.locator("#add").count() == 0 and "عرض" in pg.inner_text("#wa-order"))
        pg.fill("#pnote", "أريد هوية لمقهى"); u = urllib.parse.unquote(pg.get_attribute("#wa-order", "href").split("?text=")[1]); check("ملاحظة الخدمة + عرض السعر في الرسالة", "أريد هوية لمقهى" in u and "عرض سعر مطلوب" in u)
        pg.goto(B + "/product.html?slug=demo-mirrorless-camera"); pg.wait_for_selector(".pd"); check("مورّد خارجي: بدون صورة → بديل (لا أيقونة مكسورة)", pg.locator(".gal .ph").count() == 1 and "عند الطلب" in pg.inner_text(".pi"))
        pg.goto(B + "/no-such-page"); pg.wait_for_selector("h1"); check("صفحة 404 بالمسارات الصحيحة", "غير موجودة" in pg.inner_text("h1") and pg.locator(".bar").is_visible())
        pg.goto(B + "/admin.html"); pg.wait_for_timeout(500); check("الإدارة في الوضع التجريبي غير متاحة", "الإدارة غير متاحة" in pg.inner_text("#adm-root") or "تجريبي" in pg.inner_text("#adm-root"), pg.inner_text("#adm-root")[:80])

        print("الجوال")
        m = ctx.new_page(); m.set_viewport_size({"width": 375, "height": 760}); m.on("pageerror", lambda e: errors.append("m-pageerror: " + str(e)))
        m.goto(B + "/index.html"); m.wait_for_selector("#grid .card")
        check("لا تمرير أفقي على 375px", m.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), m.evaluate("document.documentElement.scrollWidth"))
        check("القائمة مخفية ثم تُفتح بالزر", not m.locator("#nav").is_visible()); m.click("#menu"); check("القائمة تُفتح", m.locator("#nav").is_visible() and m.locator("#nav .studio-link").is_visible())
        m.click("#nav .studio-link", no_wait_after=True) if False else None
        m.keyboard.press("Escape"); check("Escape يغلق القائمة", not m.locator("#nav").is_visible())
        check("الفلاتر قابلة للفتح على الجوال", m.locator("#fwrap").evaluate("e=>!e.open")); m.click("#fwrap summary"); check("تظهر الفلاتر", m.locator("#f-sort").is_visible())
        check("بطاقتان لكل صف", m.evaluate("getComputedStyle(document.querySelector('#grid')).gridTemplateColumns.split(' ').length") == 2)
        print("أخطاء الكونسول/الصفحة")
        errors = [e for e in errors if "Failed to load resource" not in e and "ERR_" not in e]
        check("لا أخطاء JavaScript ولا انتهاكات CSP", errors == [], errors[:4])
        br.close()
finally:
    srv.terminate(); shutil.rmtree(tmp, ignore_errors=True)
print(f"\nالنتيجة: {sum(R)} نجح، {len(R)-sum(R)} فشل"); sys.exit(0 if all(R) else 1)
