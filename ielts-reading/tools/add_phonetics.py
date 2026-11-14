#!/usr/bin/env python3
"""把缺失的音标补写进共享词库；只填空缺，不覆盖已有值。"""
import base64,json,re,sys,urllib.request
from pathlib import Path

BASE='https://class-optic-default-rtdb.asia-southeast1.firebasedatabase.app/ieltsReading/catalog/entries'

def key(i): return base64.urlsafe_b64encode(i.encode()).decode().rstrip('=')

def get(url):
    with urllib.request.urlopen(url,timeout=20) as r: return json.load(r)

def patch(url,data):
    req=urllib.request.Request(url,data=json.dumps(data,ensure_ascii=False).encode(),method='PATCH',headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(req,timeout=20) as r: return json.load(r)

def load_map(root):
    out={}
    for line in (root/'phonetics.js').read_text(encoding='utf-8').splitlines():
        m=re.match(r'\s*"(.*?)"\s*:\s*"(.*?)"\s*,?\s*$',line)
        if m: out[m.group(1)]=m.group(2)
    return out

def main(dry=False):
    root=Path(__file__).resolve().parents[1]
    table=load_map(root)
    entries=get(BASE+'.json') or {}
    updates={}
    for k,w in entries.items():
        if not w.get('phonetic'):
            v=table.get((w.get('term') or '').lower())
            if v: updates[k]={'phonetic':v}
    if dry:
        print(f'将补写 {len(updates)} 条（dry-run）'); return
    if updates: patch(BASE+'.json',updates)
    print(f'补写音标 {len(updates)} 条；其余 {len(entries)-len(updates)} 条未改动')

if __name__=='__main__':
    try: main('--dry-run' in sys.argv)
    except Exception as e:
        print('音标写回失败：',e,file=sys.stderr); sys.exit(1)
