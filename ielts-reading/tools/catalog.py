#!/usr/bin/env python3
"""Manage the shared IELTS catalog without rebuilding or redeploying the page."""
import argparse,base64,json,sys,urllib.request,urllib.error
from pathlib import Path
BASE='https://class-optic-default-rtdb.asia-southeast1.firebasedatabase.app/ieltsReading/catalog/entries'
def key(id): return base64.urlsafe_b64encode(id.encode()).decode().rstrip('=')
def request(url, method='GET', data=None):
 req=urllib.request.Request(url, data=None if data is None else json.dumps(data,ensure_ascii=False).encode(), method=method, headers={'Content-Type':'application/json'})
 with urllib.request.urlopen(req,timeout=20) as res: return json.load(res)
def validate(w):
 for k in ('id','book','term','meaning','source','sentence','translation','target'):
  if not isinstance(w.get(k),str) or not w[k].strip():raise ValueError('Missing '+k)
 if w['target'].lower() not in w['sentence'].lower():raise ValueError('Target not in sentence: '+w['id'])
 if not w.get('extensions') or not all(all(e.get(k) for k in ('meaning','example','translation')) for e in w['extensions']):raise ValueError('Missing extension: '+w['id'])
 return {k:v for k,v in w.items() if k!='sourceFile'}
p=argparse.ArgumentParser(description='管理 Firebase 雅思阅读词库');sub=p.add_subparsers(dest='cmd',required=True)
sub.add_parser('list'); up=sub.add_parser('upsert',help='按 id 添加或更新 JSON 数组中的词条');up.add_argument('file',type=Path);up.add_argument('--new-only',action='store_true',help='只添加云端不存在的词条，保留已修改的内容')
a=p.parse_args()
try:
 if a.cmd=='list':
  data=request(BASE+'.json') or {}; print(json.dumps(sorted(data.values(),key=lambda w:w['id']),ensure_ascii=False,indent=2))
 else:
  data=json.loads(a.file.read_text());words=data if isinstance(data,list) else [data]; clean=[validate(w) for w in words]
  if len({w['id'] for w in clean})!=len(clean):raise ValueError('Duplicate ids')
  existing=request(BASE+'.json') or {} if a.new_only else {}
  patch={key(w['id']):w for w in clean if key(w['id']) not in existing}
  if patch: request(BASE+'.json','PATCH',patch)
  print(f'已更新 {len(patch)} 个词条；跳过 {len(clean)-len(patch)} 个已有词条')
except (OSError,ValueError,KeyError,urllib.error.HTTPError) as e:print('词库操作失败:',e,file=sys.stderr);sys.exit(1)
