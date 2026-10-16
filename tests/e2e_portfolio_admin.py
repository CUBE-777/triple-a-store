#!/usr/bin/env python3
"""اختبار قسم «إدارة المعرض» في لوحة الإدارة عبر Supabase "وهمي" (tests/fake_supabase.js) داخل Chromium.
⚠ يختبر سلوك الواجهة وتدفق العمل وسلامة البيانات المرسلة فقط، ولا يختبر سياسات RLS الحقيقية في Postgres."""
import io, os, shutil, subprocess, sys, tempfile, time, json
from PIL import Image
from playwright.sync_api import sync_playwright
SRC = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
tmp = tempfile.mkdtemp(); dst = os.path.join(tmp, "site"); shutil.copytree(SRC, dst, ignore=shutil.ignore_patterns("tests", ".git"))
shutil.copy(os.path.join(SRC, "tests", "serve.py"), os.path.join(tmp, "serve.py"))
FAKE = open(os.path.join(SRC, "tests", "fake_supabase.js"), encoding="utf-8").read()
cfg = open(dst + "/js/config.js", encoding="utf-8").read().replace('SUPABASE_URL: ""', 'SUPABASE_URL: "https://test.supabase.co"').replace('SUPABASE_ANON_KEY: ""', 'SUPABASE_ANON_KEY: "test-anon-key-0123456789abcdef"')
open(dst + "/js/config.js", "w", encoding="utf-8").write(cfg)
PORT = 8771; srv = subprocess.Popen([sys.executable, os.path.join(tmp, "serve.py"), str(PORT), dst]); time.sleep(1.2)
B = f"http://127.0.0.1:{PORT}"; R = []
def check(n, ok, extra=""): R.append(bool(ok)); print(("  ✔ " if ok else "  ✘ ") + n + ("" if ok else f"   [{extra}]"))
def png(name, color, size=(2400, 1800)):
    bio = io.BytesIO(); Image.new("RGB", size, color).save(bio, "PNG"); return {"name": name, "mimeType": "image/png", "buffer": bio.getvalue()}
GIF = bytes.fromhex("47494638396101000100800000ffffff00000021f90401000000002c00000000010001000002024401003b")
# مشروع قديم (مسارات محلية + حقول متقدمة) ومشروع مخفي — للتأكد أن التعديل لا يفسد ما لا تعرضه الواجهة
LEGACY = {"id": "lg1", "slug": "legacy-card", "category_slug": "graphic-design", "collection_slug": "business-cards",
          "title": {"ar": "بطاقة قديمة", "en": "Legacy card"}, "description": {"en": "d"}, "overview": {}, "challenge": {}, "solution": {}, "results": {}, "services": {}, "tools": [],
          "cover": "assets/portfolio/x/cover.webp", "cover_ratio": "9/5", "cover_w": 1134, "cover_h": 661,
          "gallery": [{"src": "assets/portfolio/x/a.webp", "w": 1134, "h": 661}], "pdf_url": "assets/portfolio/x/file.pdf",
          "links": {"other": [{"label": {"en": "More"}, "url": "https://example.com/more"}], "whatsapp": "https://wa.me/212600000000"},
          "extra": {"process": [{"title": {"en": "Step"}, "text": {"en": "Do"}}], "metrics": [{"value": "+40%", "label": {"en": "Growth"}}]},
          "sort_order": 1, "is_featured": False, "is_published": True, "created_at": "2026-01-01T00:00:00Z", "updated_at": "2026-01-01T00:00:00Z"}
HIDDEN = dict(LEGACY, id="hd1", slug="hidden-draft", title={"ar": "مسودة", "en": "Draft"}, cover="", gallery=[], pdf_url=None, links={}, extra={}, collection_slug=None, category_slug="web-development", sort_order=2, is_published=False)
try:
    with sync_playwright() as p:
        br = p.chromium.launch(); ctx = br.new_context(viewport={"width": 1280, "height": 900}); errors = []; warns = []
        ctx.add_init_script("window.__SEED = " + json.dumps({"portfolio_projects": [LEGACY, HIDDEN]}) + ";")
        def route(r):
            u = r.request.url
            if u.startswith(B): return r.continue_()
            if "supabase-js@" in u: return r.fulfill(status=200, content_type="application/javascript", body=FAKE)
            if "test.supabase.co/storage" in u: return r.fulfill(status=200, content_type="image/gif", body=GIF)
            return r.fulfill(status=200, body="")
        ctx.route("**/*", route); pg = ctx.new_page()
        pg.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
        pg.on("console", lambda m: (errors.append("console: " + m.text) if m.type == "error" else (warns.append(m.text) if m.type == "warning" else None)))
        fk = lambda js: pg.evaluate("() => " + js)
        def login(email="admin@x.com", pw="pass123"): pg.fill("#l-email", email); pg.fill("#l-pass", pw); pg.click("#l-btn")
        def rows(): return fk("__fake.db.portfolio_projects")
        def by(slug): return [x for x in rows() if x["slug"] == slug][0]
        def store(): return fk("Object.keys(__fake.storage['product-images'])")

        print("الدخول والتبويب")
        pg.goto(B + "/admin.html"); pg.wait_for_selector("#login")
        check("زائر غير مسجَّل لا يرى تبويب المعرض", pg.locator("[data-go=portfolio]").count() == 0)
        login("user@x.com"); pg.wait_for_selector(".errs")
        check("حساب غير مسؤول → مرفوض ولا يظهر التبويب", "غير مخوَّل" in pg.inner_text(".errs") and pg.locator("[data-go=portfolio]").count() == 0)
        login(); pg.wait_for_selector("[data-new]")
        check("المسؤول يرى تبويب «إدارة المعرض» بجانب المنتجات والأقسام والطلبات", pg.locator("[data-go=portfolio]").inner_text().strip() == "إدارة المعرض" and pg.locator("[data-go=list]").count() == 1 and pg.locator("[data-go=cats]").count() == 1 and pg.locator("[data-go=orders]").count() == 1)
        check("لا استعلامات للمعرض قبل فتح التبويب (لا أثر على سرعة الدخول)", not any("portfolio" in x for x in fk("__fake.log")), fk("__fake.log"))

        print("القائمة والبحث والفلاتر")
        pg.click("[data-go=portfolio]"); pg.wait_for_selector("tr[data-pid]")
        check("المشروعان (المنشور والمخفي) يظهران للمسؤول", pg.locator("tr[data-pid]").count() == 2)
        check("المشروع المخفي موسوم «مخفي» والمنشور «منشور»", "مخفي" in pg.locator("tr", has_text="hidden-draft").inner_text() and "منشور" in pg.locator("tr", has_text="legacy-card").inner_text())
        check("مجموعة المشروع القديم تظهر تحت الفئة", "بطاقات الأعمال" in pg.locator("tr", has_text="legacy-card").inner_text())
        check("صورة محلية قديمة لا تنتج أيقونة مكسورة (بديل فقط)", pg.locator("tr[data-pid] img").count() == 0 and pg.locator("tr[data-pid] .ph").count() == 2)
        check("فلتر الفئات يضم الفئات الخمس من قاعدة البيانات", pg.locator("#pf-cat option").count() == 6)
        pg.fill("#pf-q", "legacy"); check("البحث بالـslug يعمل", pg.locator("tr[data-pid]").count() == 1)
        pg.fill("#pf-q", "مسودة"); check("البحث بالعنوان العربي يعمل", pg.locator("tr[data-pid]").count() == 1 and pg.input_value("#pf-q") == "مسودة")
        pg.fill("#pf-q", ""); pg.select_option("#pf-st", "hidden"); check("فلتر الحالة: مخفي", pg.locator("tr[data-pid]").count() == 1)
        pg.select_option("#pf-st", ""); pg.select_option("#pf-cat", "graphic-design"); check("فلتر الفئة", pg.locator("tr[data-pid]").count() == 1)
        pg.select_option("#pf-cat", ""); pg.fill("#pf-q", "zzz"); check("لا نتائج → رسالة واضحة", pg.locator(".empty").count() == 1); pg.fill("#pf-q", "")

        print("التحقق من المدخلات (بدون أي كتابة)")
        n0 = len(rows()); s0 = len(store())
        pg.click("[data-pact=new]"); pg.wait_for_selector("#pf-form"); pg.click("#save"); pg.wait_for_selector(".errs")
        t = pg.inner_text("#errs")
        check("نموذج فارغ → خطأ العنوان والفئة، ولا إدراج", "عنوان" in t and "فئة" in t and len(rows()) == n0)
        pg.fill("#pf-title-ar", "هوية مطعم"); pg.fill("#pf-title-en", "Restaurant Brand")
        check("slug يُولَّد تلقائياً من العنوان الإنجليزي", pg.input_value("#pf-slug") == "restaurant-brand")
        pg.select_option("#pf-category", "web-development")
        check("المجموعات المعروضة تخص الفئة المختارة فقط", pg.locator("#pf-collection option").count() == 1)
        pg.select_option("#pf-category", "graphic-design")
        check("عند اختيار فئة التصميم تظهر مجموعة «بطاقات الأعمال»", pg.locator("#pf-collection option").count() == 2)
        pg.fill("#pf-l-live", "javascript:alert(1)"); pg.fill("#pf-order", "1.5"); pg.click("#save"); pg.wait_for_selector(".errs")
        t = pg.inner_text("#errs")
        check("رابط javascript: مرفوض + ترتيب غير رقمي مرفوض", "https://" in t and "رقماً صحيحاً" in t and len(rows()) == n0, t)
        pg.fill("#pf-l-live", "https://example.com/live"); pg.fill("#pf-order", "5")

        print("إضافة مشروع مع صور (غلاف + معرض)")
        pg.set_input_files("#pf-cover", [png("cover.png", "purple")]); pg.wait_for_selector("#pf-form .imgs .im")
        pg.set_input_files("#pf-gal", [png("g1.png", "red"), png("g2.png", "blue"), {"name": "bad.gif", "mimeType": "image/gif", "buffer": GIF}])
        pg.wait_for_function("() => document.querySelectorAll('#pf-form .imgs .im').length >= 3")
        check("ملف GIF مرفوض برسالة، ويُقبل ملفا PNG", "غير مسموح" in pg.inner_text("#errs") and pg.locator("#pf-form .imgs .im").count() == 3)
        pg.check("#pf-pub"); pg.check("#pf-feat"); pg.fill("#pf-year", "2026"); pg.fill("#pf-client", "مطعم الأصيل"); pg.fill("#pf-tools", "Figma, Photoshop, figma")
        pg.fill("#pf-services-en", "Logo\nStationery\n\n"); pg.check("#pf-wa")
        pg.select_option("#pf-collection", ""); pg.click("#save"); pg.wait_for_selector("tr[data-pid] >> text=restaurant-brand")
        r = by("restaurant-brand"); up = store()
        check("الصف حُفظ بالقيم الصحيحة", r["category_slug"] == "graphic-design" and r["collection_slug"] is None and r["is_published"] and r["is_featured"] and r["sort_order"] == 5 and r["year"] == "2026" and r["client"] == "مطعم الأصيل", r)
        check("العنوان يحوي اللغات المعبّأة فقط (بدون فرنسية فارغة)", r["title"] == {"ar": "هوية مطعم", "en": "Restaurant Brand"}, r["title"])
        check("الأدوات: تنظيف المكرر، والخدمات: سطر لكل خدمة بدون الفارغ", r["tools"] == ["Figma", "Photoshop"] and r["services"] == {"en": ["Logo", "Stationery"]}, (r["tools"], r["services"]))
        check("الروابط: https محفوظ + واتساب = true", r["links"] == {"live": "https://example.com/live", "whatsapp": True}, r["links"])
        check("3 صور رُفعت إلى الـbucket الموجود تحت portfolio/ بصيغة WebP", len(up) == s0 + 3 and all(x.startswith("portfolio/") and x.endswith(".webp") for x in up), up)
        check("الغلاف والمعرض يشيران إلى مسارات التخزين الصحيحة", r["cover"] in up and [g["src"] for g in r["gallery"]] == [x for x in up if x != r["cover"]][:2] or (r["cover"] in up and all(g["src"] in up for g in r["gallery"]) and len(r["gallery"]) == 2), r)
        check("الأبعاد بعد التصغير: 1600×1200 للغلاف والمعرض (لتحسين التحميل)", (r["cover_w"], r["cover_h"]) == (1600, 1200) and all((g["w"], g["h"]) == (1600, 1200) for g in r["gallery"]), r)
        check("لم يُلمس أي جدول من المتجر (منتجات/أقسام/طلبات)", fk("__fake.db.products.length") == 0 and fk("__fake.db.categories.length") == 1 and fk("__fake.db.orders.length") == 0)
        check("لا ملف في مسار products/ (صور المتجر منفصلة)", not any(x.startswith("products/") for x in store()))
        cov0, gal0 = r["cover"], [g["src"] for g in r["gallery"]]

        print("تعديل مشروع")
        pg.locator("tr", has_text="restaurant-brand").locator("[data-pact=edit]").click(); pg.wait_for_selector("#pf-form")
        check("النموذج يُحمَّل بالقيم المحفوظة", pg.input_value("#pf-title-en") == "Restaurant Brand" and pg.input_value("#pf-year") == "2026" and pg.input_value("#pf-tools") == "Figma, Photoshop" and pg.input_value("#pf-services-en") == "Logo\nStationery" and pg.is_checked("#pf-wa") and pg.is_checked("#pf-pub"))
        check("المعاينة تعرض صور المعرض المرفوعة (روابط عامة صحيحة)", pg.locator("#pf-form img.pimg").count() == 3 and all("/storage/v1/object/public/product-images/portfolio/" in (pg.locator("#pf-form img.pimg").nth(i).get_attribute("src") or "") for i in range(3)))
        pg.fill("#pf-title-fr", "Identité restaurant"); pg.click("#langs [data-l=en]"); pg.wait_for_selector("#pf-form")
        check("تبديل اللغة أثناء التعديل لا يُفقد ما كُتب وينقل الاتجاه LTR", pg.input_value("#pf-title-fr") == "Identité restaurant" and pg.evaluate("document.documentElement.dir") == "ltr" and "Portfolio" in pg.locator("[data-go=portfolio]").inner_text())
        pg.click("#langs [data-l=fr]"); pg.wait_for_selector("#pf-form"); check("الفرنسية: التبويب مترجم", "portfolio" in pg.locator("[data-go=portfolio]").inner_text().lower())
        pg.click("#langs [data-l=ar]"); pg.wait_for_selector("#pf-form")
        pg.click("[data-pact=gdel][data-i='0']"); pg.wait_for_selector("#pf-form")
        pg.set_input_files("#pf-cover", [png("newcover.png", "green", (800, 800))]); pg.wait_for_selector("#pf-form .imgs .im")
        pg.click("#save"); pg.wait_for_selector("[data-pact=new]")
        r = by("restaurant-brand"); up = store()
        check("العنوان الفرنسي أُضيف وبقية الحقول لم تتغير", r["title"].get("fr") == "Identité restaurant" and r["title"]["ar"] == "هوية مطعم" and r["links"]["live"] == "https://example.com/live")
        check("الغلاف الجديد بُدّل ونسبة غلاف قديمة لا تبقى (cover_ratio=null)", r["cover"] != cov0 and r["cover"] in up and r["cover_ratio"] is None and (r["cover_w"], r["cover_h"]) == (800, 800), r)
        check("الغلاف القديم وصورة المعرض المحذوفة حُذفتا من التخزين، والبقية باقية", cov0 not in up and gal0[0] not in up and gal0[1] in up and len(r["gallery"]) == 1, (up, gal0))

        print("تبديل الحالة والتمييز والترتيب من القائمة")
        row = pg.locator("tr", has_text="restaurant-brand")
        row.locator("[data-pact=pub]").click(); pg.wait_for_function("() => __fake.db.portfolio_projects.find(x=>x.slug=='restaurant-brand').is_published===false"); check("إلغاء النشر (إخفاء عن الزوار)", True)
        pg.locator("tr", has_text="restaurant-brand").locator("[data-pact=pub]").click(); pg.wait_for_function("() => __fake.db.portfolio_projects.find(x=>x.slug=='restaurant-brand').is_published===true"); check("إعادة النشر", True)
        pg.locator("tr", has_text="restaurant-brand").locator("[data-pact=feat]").click(); pg.wait_for_function("() => __fake.db.portfolio_projects.find(x=>x.slug=='restaurant-brand').is_featured===false"); check("إلغاء التمييز", True)
        order_slugs = pg.eval_on_selector_all("tr[data-pid] small.note", "els => els.map(e=>e.textContent)")
        check("القائمة مرتّبة بحسب «الترتيب» (الأصغر أولاً)", [s for s in order_slugs if s in ("legacy-card", "hidden-draft", "restaurant-brand")] == ["legacy-card", "hidden-draft", "restaurant-brand"], order_slugs)

        print("تعديل المشروع القديم لا يفسد حقوله غير المعروضة")
        pg.locator("tr", has_text="legacy-card").locator("[data-pact=edit]").click(); pg.wait_for_selector("#pf-form")
        check("صورة محلية قديمة تظهر ببديل واسم الملف (بلا أيقونة مكسورة)", pg.locator("#pf-form img.pimg").count() == 0 and "cover.webp" in pg.inner_text("#pf-form"))
        pg.fill("#pf-title-en", "Legacy card v2"); pg.click("#save"); pg.wait_for_selector("[data-pact=new]")
        l = by("legacy-card")
        check("العنوان تغيّر", l["title"]["en"] == "Legacy card v2" and l["title"]["ar"] == "بطاقة قديمة")
        check("الغلاف المحلي والنسبة والأبعاد والمعرض وPDF بقيت كما هي", l["cover"] == LEGACY["cover"] and l["cover_ratio"] == "9/5" and (l["cover_w"], l["cover_h"]) == (1134, 661) and l["gallery"] == LEGACY["gallery"] and l["pdf_url"] == LEGACY["pdf_url"], l)
        check("روابط other وواتساب المخصص (نص) بقيت", l["links"].get("other") == LEGACY["links"]["other"] and l["links"].get("whatsapp") == "https://wa.me/212600000000", l["links"])
        check("الحقول المتقدمة extra لم تُمَس إطلاقاً", l["extra"] == LEGACY["extra"])
        check("لم يُحذف أي ملف تخزين بسبب مسارات محلية", not any(x.startswith("assets") for x in store()))

        print("التراجع عند الفشل والـslug المكرر")
        s1 = len(store()); n1 = len(rows())
        pg.click("[data-pact=new]"); pg.wait_for_selector("#pf-form"); pg.fill("#pf-title-ar", "نسخة"); pg.fill("#pf-title-en", "x"); pg.fill("#pf-slug", "legacy-card"); pg.select_option("#pf-category", "web-development")
        pg.set_input_files("#pf-cover", [png("c.png", "orange")]); pg.wait_for_selector("#pf-form .imgs .im"); pg.click("#save"); pg.wait_for_selector(".errs")
        check("slug مكرر → رسالة واضحة ولا إدراج", "مستخدم لمشروع آخر" in pg.inner_text("#errs") and len(rows()) == n1)
        check("الصورة التي رُفعت قبل الفشل حُذفت (لا بقايا في التخزين)", len(store()) == s1, store())
        check("النموذج بقي مفتوحاً بما كتبه المسؤول (إعادة المحاولة ممكنة)", pg.input_value("#pf-title-ar") == "نسخة" and pg.locator("#pf-form .imgs .im").count() == 1)
        pg.click("[data-pact=cancel]"); pg.wait_for_selector("tr[data-pid]")
        check("الإلغاء يعيد للقائمة بلا تغيير", len(rows()) == n1)

        print("الحذف")
        fk("__fake.storage['product-images']['products/shop-item.webp'] = {size: 1, type: 'image/webp'}")   # صورة منتج لا يجوز أن يمسّها حذف مشروع
        before = store(); mine = [x for x in before if x.startswith("portfolio/")]
        pg.locator("tr", has_text="restaurant-brand").locator("[data-pact=del]").click(); pg.wait_for_selector("dialog[open]")
        check("نافذة التأكيد تذكر اسم المشروع", "هوية مطعم" in pg.inner_text("dialog")); pg.click("dialog button[value=cancel]")
        check("الإلغاء لا يحذف", any(x["slug"] == "restaurant-brand" for x in rows()))
        pg.locator("tr", has_text="restaurant-brand").locator("[data-pact=del]").click(); pg.wait_for_selector("dialog[open]"); pg.click("dialog button[value=ok]")
        pg.wait_for_function("() => !__fake.db.portfolio_projects.some(x=>x.slug=='restaurant-brand')")
        after = store()
        check("الحذف يزيل الصف وصور المعرض المرفوعة فقط", not any(x in after for x in mine) and len(mine) == 2, (before, after))
        check("صورة منتج في نفس الـbucket لم تُحذف", "products/shop-item.webp" in after)
        pg.locator("tr", has_text="legacy-card").locator("[data-pact=del]").click(); pg.wait_for_selector("dialog[open]"); pg.click("dialog button[value=ok]")
        pg.wait_for_function("() => !__fake.db.portfolio_projects.some(x=>x.slug=='legacy-card')")
        check("حذف مشروع بمسارات محلية لا يحاول حذف ملفات تخزين", "products/shop-item.webp" in store())

        print("التنقل والجلسة")
        pg.click("[data-go=list]"); check("تبويب المنتجات ما زال يعمل بعد زيارة المعرض", pg.locator("[data-new]").count() == 1)
        pg.click("[data-go=cats]"); check("تبويب الأقسام يعمل", pg.locator("[data-cnew]").count() == 1)
        pg.click("[data-go=orders]"); pg.wait_for_selector("#o-st, .empty, .msg"); check("تبويب الطلبات يعمل", True)
        pg.click("[data-go=portfolio]"); pg.click("[data-pact=new]"); pg.wait_for_selector("#pf-form"); pg.click("[data-go=portfolio]"); pg.wait_for_selector("[data-pact=new]")
        check("النقر على تبويب المعرض أثناء النموذج يعيد إلى القائمة", pg.locator("#pf-form").count() == 0 and pg.locator("#pf-results").count() == 1)
        fk("__fake.expireNext = true"); pg.locator("tr[data-pid]").first.locator("[data-pact=pub]").click(); pg.wait_for_selector("#login")
        check("انتهاء الجلسة أثناء عملية معرض → عودة آمنة للدخول برسالة", "انتهت الجلسة" in pg.inner_text("#login") and pg.locator("[data-go=portfolio]").count() == 0)
        login(); pg.wait_for_selector("[data-new]"); pg.click("[data-go=portfolio]"); pg.wait_for_selector("[data-pact=new]")
        check("بعد إعادة الدخول يُحمَّل المعرض من جديد", pg.locator("#pf-results").count() == 1 and pg.locator("#pf-cat option").count() == 6)
        pg.click("[data-signout]"); pg.wait_for_selector("#login"); check("تسجيل الخروج", fk("__fake.user") is None and pg.locator("[data-go=portfolio]").count() == 0)

        print("الجوال والترجمة")
        login(); pg.wait_for_selector("[data-new]"); pg.set_viewport_size({"width": 390, "height": 800}); pg.click("[data-go=portfolio]"); pg.wait_for_selector("[data-pact=new]"); pg.click("[data-pact=new]"); pg.wait_for_selector("#pf-form")
        check("نموذج المعرض على الجوال بلا تمرير أفقي للصفحة", pg.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), pg.evaluate("[document.documentElement.scrollWidth, window.innerWidth]"))
        missing = [w for w in warns if "[i18n] missing" in w]; check("لا مفاتيح ترجمة ناقصة في أي لغة", missing == [], missing[:3])
        errors = [e for e in errors if "Failed to load resource" not in e and "مستخدم لمشروع آخر" not in e]
        check("لا أخطاء JavaScript أو CSP", errors == [], errors[:4]); br.close()
finally:
    srv.terminate(); shutil.rmtree(tmp, ignore_errors=True)
print(f"\nالنتيجة: {sum(R)} نجح، {len(R)-sum(R)} فشل"); sys.exit(0 if all(R) else 1)
