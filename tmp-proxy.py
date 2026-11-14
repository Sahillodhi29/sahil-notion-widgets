import http.server, socketserver, urllib.request

LIVE = 'https://sahil-notion-widgets-wavx.vercel.app'


class H(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith('/api/'):
            try:
                with urllib.request.urlopen(LIVE + self.path, timeout=20) as r:
                    body = r.read()
                    ctype = r.headers.get('Content-Type', 'application/json')
            except Exception as e:
                body = ('{"error": "proxy failed: %s"}' % e).encode()
                ctype = 'application/json'
            self.send_response(200)
            self.send_header('Content-Type', ctype)
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def log_message(self, *a):
        pass


socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(('127.0.0.1', 8137), H) as httpd:
    httpd.serve_forever()
