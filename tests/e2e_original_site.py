#!/usr/bin/env python3
"""يتحقق أن تعديل رابط المتجر في موقع Triple A Studio الأصلي لا يغيّر أي سلوك قائم.
الاستعمال: python3 tests/e2e_original_site.py <مجلد الموقع الأصلي> <مجلد الموقع بعد التعديل>"""
import os, shutil, subprocess, sys, tempfile, time
from playwright.sync_api import sync_playwright
orig, patched = sys.argv[1], sys.argv[2]; R = []
def check(n, ok, extra=""): R.append(bool(ok)); print(("  ✔ " if ok else "  ✘ ") + n + ("" if ok else f"   [{extra}]"))
SERVE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "serve_plain.py")
open(SERVE, "w").write("import sys,http.server,socketserver,os\nr=os.path.abspath(sys.argv[2])\nclass H(http.server.SimpleHTTPRequestHandler):\n    def __init__(s,*a,**k): super().__init__(*a,directory=r,**k)\n    def log_message(s,*a): pass\n    def send_error(s,c,*a,**k):\n        if c==404 and os.path.exists(r+'/404.html'):\n            b=open(r+'/404.html','rb').read(); s.send_response(404); s.send_header('Content-Type','text/html; charset=utf-8'); s.send_header('Content-Length',str(len(b))); s.end_headers(); s.wfile.write(b)\n        else: super().send_error(c,*a,**k)\nclass T(socketserver.ThreadingTCPServer): allow_reuse_address=True; daemon_threads=True\nT(('127.0.0.1',int(sys.argv[1])),H).serve_forever()\n")
def serve(port, d): return subprocess.Popen([sys.executable, SERVE, str(port), d])
tmp = tempfile.mkdtemp(); withurl = os.path.join(tmp, "with"); shutil.copytree(patched, withurl)
d = open(withurl + "/data.js", encoding="utf-8").read().replace('storeUrl: ""', 'storeUrl: "https://store.example.test"'); open(withurl + "/data.js", "w", encoding="utf-8").write(d)
S = [serve(8771, orig), serve(8772, patched), serve(8773, withurl)]; time.sleep(1.2)
PAGES = ["index.html", "portfolio.html", "project.html?id=triple-a-business-card", "no-such-page"]
try:
    with sync_playwright() as p:
        br = p.chromium.launch(); errs = {8771: [], 8772: [], 8773: []}
        def page(port, w=1280, lang="ar"):
            ctx = br.new_context(viewport={"width": w, "height": 900}); ctx.route("**/*", lambda r: r.continue_() if r.request.url.startswith("http://127.0.0.1") else r.fulfill(status=200, body=""))
            ctx.add_init_script(f"localStorage.setItem('lang','{lang}')"); pg = ctx.new_page()
            pg.on("pageerror", lambda e: errs[port].append(str(e))); return pg
        navs = lambda pg: pg.evaluate("[document.querySelector('#nav').innerHTML, document.querySelector('#fnav') ? document.querySelector('#fnav').innerHTML : '']")
        print("بدون ضبط storeUrl: السلوك مطابق للأصلي تماماً")
        for path in PAGES:
            a, b = page(8771), page(8772)
            a.goto(f"http://127.0.0.1:8771/{path}"); b.goto(f"http://127.0.0.1:8772/{path}"); a.wait_for_selector("#nav a"); b.wait_for_selector("#nav a")
            check(f"{path}: قائمة التنقل والفوتر مطابقتان للأصلي", navs(a) == navs(b))
        print("مع ضبط storeUrl: الرابط يظهر بالصيغة الصحيحة في كل الصفحات واللغات")
        for lang, label in [("ar", "المتجر"), ("fr", "Boutique"), ("en", "Store")]:
            for path in PAGES:
                pg = page(8773, lang=lang); pg.goto(f"http://127.0.0.1:8773/{path}"); pg.wait_for_selector("#nav a")
                a = pg.locator("#nav a", has_text=label)
                check(f"{lang} / {path}: رابط '{label}' في الهيدر والفوتر", a.count() == 1 and a.get_attribute("href") == "https://store.example.test" and pg.locator("#fnav a", has_text=label).count() == 1, a.count())
        pg = page(8773); pg.goto("http://127.0.0.1:8773/index.html"); pg.wait_for_selector("#nav a")
        base = page(8771); base.goto("http://127.0.0.1:8771/index.html"); base.wait_for_selector("#nav a")
        check("الروابط الخمسة الأصلية باقية كما هي + رابط واحد جديد", pg.locator("#nav a").count() == base.locator("#nav a").count() + 1)
        pg.click("#langs [data-l=en]"); check("تبديل اللغة يحدّث تسمية الرابط (Store)", pg.locator("#nav a", has_text="Store").count() == 1)
        pg.click("#theme"); check("تبديل الثيم يعمل", pg.evaluate("document.documentElement.dataset.theme") in ("light", "dark"))
        m = page(8773, 375); m.goto("http://127.0.0.1:8773/index.html"); m.wait_for_selector("#menu"); m.wait_for_timeout(1500); m.click("#menu"); m.wait_for_timeout(500)
        check("الجوال: الرابط ظاهر داخل القائمة", m.locator("#nav a", has_text="المتجر").is_visible() and m.evaluate("document.documentElement.scrollWidth <= innerWidth"))
        # رابط الأصل → المتجر وعودة: href صحيح وrel آمن
        check("الرابط يفتح في نفس التبويب مع rel=noopener", pg.locator("#nav a", has_text="Store").get_attribute("rel") == "noopener")
        allerr = [e for k in errs for e in errs[k]]; check("لا أخطاء JavaScript في الصفحات الثلاث", allerr == [], allerr[:3]); br.close()
finally:
    for s in S: s.terminate()
    shutil.rmtree(tmp, ignore_errors=True)
    try: os.remove(SERVE)
    except OSError: pass
print(f"\nالنتيجة: {sum(R)} نجح، {len(R)-sum(R)} فشل"); sys.exit(0 if all(R) else 1)
