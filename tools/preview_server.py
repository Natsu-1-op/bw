#!/usr/bin/env python3
"""Preview only the site's public assets, bound to localhost."""
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlsplit,unquote
import re
ROOT=Path(__file__).resolve().parents[1]
class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*a,**kw):super().__init__(*a,directory=str(ROOT),**kw)
 def allowed(self):
  path=unquote(urlsplit(self.path).path)
  return path in ('/','/index.html','/data/library.js') or re.fullmatch(r'/audio/[a-f0-9]{20}\.mp3',path)
 def do_GET(self):
  if not self.allowed():self.send_error(404);return
  super().do_GET()
 def do_HEAD(self):
  if not self.allowed():self.send_error(404);return
  super().do_HEAD()
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
print('http://127.0.0.1:'+str(server.server_port),flush=True)
server.serve_forever()
