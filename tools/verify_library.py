#!/usr/bin/env python3
"""Check every referenced recording with macOS Audio File Services."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import json,re,subprocess
ROOT=Path(__file__).resolve().parents[1]
p=ROOT/'data/library.js';data=json.loads(p.read_text().removeprefix('window.LIBRARY = ').strip().removesuffix(';'))
tracks=[t for u in data['units'] for t in u['tracks']];files=sorted({t['file'] for t in tracks})
def check(file):
 path=ROOT/file
 r=subprocess.run(['/usr/bin/afinfo',str(path)],capture_output=True,text=True)
 match=re.search(r'estimated duration:\s*([\d.]+)',r.stdout)
 if r.returncode or not match or float(match[1])<=0:raise ValueError('Unreadable audio: '+file+' '+r.stderr[:100])
 return file,round(float(match[1]),3),path.stat().st_size
with ThreadPoolExecutor(max_workers=6) as pool:results=list(pool.map(check,files))
durations={f:d for f,d,n in results}
for t in tracks:t['duration']=durations[t['file']]
data['audioFiles']=len(files);data['totalBytes']=sum(n for f,d,n in results)
p.write_text('window.LIBRARY = '+json.dumps(data,ensure_ascii=False)+';\n')
ids=[t['id'] for t in tracks]
assert len(ids)==len(set(ids)),'Duplicate track ID'
assert len(data['units'])==15,'Missing course unit'
for t in tracks:
 assert t['title'] and t['section'] and not t['file'].startswith('/'),t['id']
 if not any(t.get('cells',[])) and '— 對話' in t['section']:assert t.get('segments'),t['id']+' missing transcript'
summary={'units':len(data['units']),'tracks':len(tracks),'audioFiles':len(files),'bytes':data['totalBytes'],'uniqueAudioMinutes':round(sum(d for f,d,n in results)/60,1),'repairedLinks':[{ 'track':t['id'],'originalUrl':t['originalUrl'],'url':t['url']} for t in tracks if t.get('originalUrl')],'audioReadErrors':0}
(ROOT/'data/validation.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2))
print(json.dumps({k:v for k,v in summary.items() if k!='repairedLinks'},ensure_ascii=False))
