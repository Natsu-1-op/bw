from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
from concurrent.futures import ThreadPoolExecutor
import urllib.request,re,html,json
folder=Path('/tmp/cantonese-tone-check');folder.mkdir(exist_ok=True)
def get(tone):
 p=folder/(str(tone)+'.html')
 if not p.exists():
  with urllib.request.urlopen('https://humanum.arts.cuhk.edu.hk/Lexis/lexi-can/pho-rel.php?s3='+str(tone),timeout=25) as r:p.write_bytes(r.read())
 s=p.read_bytes().decode('big5hkscs',errors='replace');result={}
 for row in re.findall(r'<tr\b[^>]*>(.*?)</tr>',s,re.S|re.I):
  m=re.search(r'sound.php\?s=([a-z]+[1-6])',row)
  if m:result[m[1]]=set(''.join(html.unescape(x) for x in re.findall(r'<a href="search.php\?q=[^"]*">(.*?)</a>',row,re.S)))
 return result
lookup={}
with ThreadPoolExecutor(max_workers=4) as ex:
 for part in ex.map(get,range(1,7)):lookup.update(part)
d=json.loads((ROOT/'data/phonetics.json').read_text());checked=0;issues=[]
for key,entry in d['entries'].items():
 for e in entry['examples']:
  chars=list(e['text']);syllables=e['jyutping'].split()
  assert len(chars)==len(syllables),(key,e)
  for char,jp in zip(chars,syllables):
   checked+=1
   if char not in lookup.get(jp,set()):issues.append((char,jp,key))
print('CUHK dictionary cross-check:',checked,'character/syllable pairs;',len(issues),'requiring contextual review')
for x in issues:print(x)

assert issues==[('氏','si2','sound/L4mp3/L4(5)2.mp3')],issues
report={'annotatedAudioFiles':len(d['entries']),'characterSyllablePairs':checked,'dictionaryMatches':checked-len(issues),'contextualReadings':[{'word':'屈臣氏','jyutping':'wat1 san4 si2','note':'氏在原课程名称录音中使用变调 si2；字库常用字音为 si6。'}],'dictionarySource':'https://humanum.arts.cuhk.edu.hk/Lexis/lexi-can/','unexpectedMismatches':0}
(ROOT/'data/pronunciation-validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
