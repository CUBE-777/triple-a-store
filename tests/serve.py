#!/usr/bin/env python3
"""خادم محلي صغير للتطوير والاختبار: يقدّم الملفات ويطبّق نفس ترويسات netlify.toml (بما فيها CSP).
الاستعمال:  python3 tests/serve.py [منفذ] [مجلد]   ثم افتح http://localhost:8080"""
import sys, http.server, socketserver, tomllib, fnmatch, os
port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
root = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
cfg = tomllib.load(open(os.path.join(root, "netlify.toml"), "rb"))
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(s, *a, **k): super().__init__(*a, directory=root, **k)
    def end_headers(s):
        path = s.path.split("?")[0]
        for h in cfg.get("headers", []):
            pat = h["for"].replace("/*", "/**") if h["for"].endswith("/*") and h["for"] != "/*" else h["for"]
            if h["for"] == "/*" or fnmatch.fnmatch(path, h["for"].replace("*", "*")):
                for k, v in h["values"].items(): s.send_header(k, v)
        super().end_headers()
    def log_message(s, *a): pass
    def send_error(s, code, *a, **k):   # يحاكي 404.html في Netlify
        if code == 404 and os.path.exists(os.path.join(root, "404.html")):
            body = open(os.path.join(root, "404.html"), "rb").read(); s.send_response(404); s.send_header("Content-Type", "text/html; charset=utf-8"); s.send_header("Content-Length", str(len(body))); s.end_headers(); s.wfile.write(body)
        else: super().send_error(code, *a, **k)
class T(socketserver.ThreadingTCPServer): allow_reuse_address = True; daemon_threads = True
with T(("127.0.0.1", port), H) as srv: print("http://localhost:%d  (Ctrl+C للإيقاف)" % port, flush=True); srv.serve_forever()
