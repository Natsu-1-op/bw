#!/usr/bin/env python3
"""Build a static course audio library from public CUHK course pages."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.request import Request, urlopen, getproxies
from urllib.parse import urljoin, urlparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import argparse, json, time, hashlib, os
ROOT=Path(__file__).resolve().parents[1]
BASE='https://www.ilc.cuhk.edu.hk/workshop/Chinese/Cantonese/OnlineTutorial/'
TITLES=[('b'+str(i+1),x) for i,x in enumerate(['見面','打電話','購物','問路','用餐','出行','景點','天氣','娛樂','求醫'])]+[('c'+str(i+1),x) for i,x in enumerate(['中大校園生活','人際關係','興趣愛好','生活風情','新聞書刊'])]

class CourseParser(HTMLParser):
    def __init__(self):
        super().__init__();self.section='录音';self.heading=None;self.row=None;self.cell=None;self.tracks=[];self.tables=[];self.table=None;self.paragraph=None;self.paragraphTracks=[]
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag=='h2':self.heading=[]
        if tag=='p':self.paragraph=[];self.paragraphTracks=[]
        if tag=='table':self.table={'rows':[],'tracks':[]};self.tables.append(self.table)
        if tag=='tr':self.row={'cells':[],'tracks':[],'header':False}
        if tag in ('td','th') and self.row is not None:
            self.cell=[]
            if tag=='th':self.row['header']=True
        if tag=='br' and self.cell is not None:self.cell.append('\n')
        if tag=='audio' and a.get('src'):
            t={'url':urljoin(BASE,a['src']),'section':self.section}
            self.tracks.append(t)
            if self.paragraph is not None and self.table is None:self.paragraphTracks.append(t)
            if self.table is not None:self.table['tracks'].append(t)
            if self.row is not None:self.row['tracks'].append(t)
    def handle_data(self,s):
        if self.heading is not None:self.heading.append(s)
        if self.paragraph is not None:self.paragraph.append(s)
        if self.cell is not None:self.cell.append(s)
    def handle_endtag(self,tag):
        if tag=='p' and self.paragraph is not None:
            context=' '.join(''.join(self.paragraph).split())
            for t in self.paragraphTracks:
                if context:t['context']=context
            self.paragraph=None;self.paragraphTracks=[]
        if tag=='h2' and self.heading is not None:self.section=''.join(self.heading).strip();self.heading=None
        if tag in ('td','th') and self.cell is not None and self.row is not None:self.row['cells'].append(''.join(self.cell).strip());self.cell=None
        if tag=='tr' and self.row is not None:
            for t in self.row['tracks']:t['cells']=self.row['cells'][:]
            if self.table is not None:self.table['rows'].append(self.row)
            self.row=None;self.cell=None
        if tag=='table':self.table=None
    def finish(self):
        for table in self.tables:
            rows=table['rows']
            for i,row in enumerate(rows):
                if row['tracks'] and not any(row['cells']):
                    segments=[]
                    for following in rows[i+1:]:
                        if following['tracks']:break
                        if not following['header'] and any(following['cells']):segments.append(following['cells'])
                    for t in row['tracks']:
                        if segments:t['segments']=segments
        return self.tracks

def is_audio(body):return len(body)>128 and (body.startswith(b'ID3') or (body[0]==255 and body[1]&224==224) or body.startswith(b'RIFF') or b'ftyp' in body[:20])

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--html-dir',type=Path,default=ROOT/'source');ap.add_argument('--request-har',type=Path,help='Temporary browser request export; never included in the published library');ap.add_argument('--workers',type=int,default=4);args=ap.parse_args()
    headers={'User-Agent':'Mozilla/5.0','Referer':BASE};browser_requests=None;proxy=None
    if args.request_har:
        from curl_cffi import requests as browser_requests
        records=json.loads(args.request_har.read_text())['log']['entries']
        record=next(e for e in records if urlparse(e['request']['url']).hostname==urlparse(BASE).hostname and e['response']['status'] in (200,206))
        headers={x['name']:x['value'] for x in record['request']['headers'] if not x['name'].startswith(':') and x['name'].lower() not in ('host','connection','accept-encoding','content-length','range')}
        proxy=getproxies().get('https')
    def get(url):
        if urlparse(url).hostname!=urlparse(BASE).hostname:raise RuntimeError('Unexpected source host')
        if browser_requests:
            r=browser_requests.get(url,headers=headers,impersonate='safari',proxy=proxy,timeout=35)
            if r.status_code!=200:raise RuntimeError('HTTP '+str(r.status_code))
            return r.content
        with urlopen(Request(url,headers=headers),timeout=35) as r:
            if r.status!=200:raise RuntimeError('HTTP '+str(r.status))
            return r.read()
    manifest={'units':[],'source':BASE,'updated':time.strftime('%Y-%m-%d %H:%M:%S')};failures=[];jobs={}
    for uid,title in TITLES:
        try:
            page=args.html_dir/('courseList_'+uid+'.aspx');body=page.read_bytes() if page.exists() else get(BASE+page.name)
            parser=CourseParser();parser.feed(body.decode('utf-8-sig'));tracks=parser.finish()
            if not tracks:raise RuntimeError('Course page contains no audio')
            page.parent.mkdir(parents=True,exist_ok=True);page.write_bytes(body)
            unit={'id':uid,'title':title,'tracks':[]};sectionCounts={}
            for n,t in enumerate(tracks):
                t['id']=uid+'-'+str(n+1)
                fixes={BASE+'sound/L9mp3/L9-6-c-'+str(i)+'.mp3':BASE+'sound/L8mp3/L8-6-d-'+str(i)+'.mp3' for i in (6,7,8)}
                fixes[BASE+'sound/L10mp3/L10-2-4.mp3']=BASE+'sound/L10mp3/L10-4.mp3'
                if t['url'] in fixes:t['originalUrl']=t['url'];t['url']=fixes[t['url']];t['repair']='原站失效音频链接修正'
                t['file']='audio/'+hashlib.sha256(t['url'].encode()).hexdigest()[:20]+'.mp3'
                cells=t.get('cells',[]);t['title']=next((c for c in cells if c),t['section'].split('—')[-1].strip())
                sectionCounts[t['section']]=sectionCounts.get(t['section'],0)+1
                if not any(cells) and sum(x['section']==t['section'] for x in tracks)>1:t['title']+=' · '+str(sectionCounts[t['section']])
                unit['tracks'].append(t);jobs[t['url']]=t['file']
            manifest['units'].append(unit);print('PAGE',uid,len(tracks),flush=True)
        except Exception as e:failures.append({'unit':uid,'error':str(e)});print('PAGE_FAILED',uid,str(e),flush=True)
    def download(item):
        url,file=item;dest=ROOT/file
        if dest.exists() and is_audio(dest.read_bytes()):return url,None
        for attempt in range(3):
            try:
                body=get(url)
                if not is_audio(body):raise RuntimeError('Response is not audio')
                dest.parent.mkdir(parents=True,exist_ok=True);temp=dest.with_suffix('.tmp');temp.write_bytes(body);temp.replace(dest)
                return url,None
            except Exception as e:
                error=str(e)
                if attempt<2:time.sleep(1+attempt)
        return url,error
    available=set();done=0
    with ThreadPoolExecutor(max_workers=max(1,min(args.workers,6))) as pool:
        futures=[pool.submit(download,item) for item in jobs.items()]
        for future in as_completed(futures):
            url,error=future.result();done+=1
            if error:failures.append({'url':url,'error':error})
            else:available.add(url)
            if done%25==0 or done==len(jobs):print('AUDIO',done,'/',len(jobs),'OK',len(available),flush=True)
    for u in manifest['units']:u['tracks']=[t for t in u['tracks'] if t['url'] in available]
    manifest['units']=[u for u in manifest['units'] if u['tracks']]
    data=ROOT/'data';data.mkdir(exist_ok=True);(data/'sync-errors.json').write_text(json.dumps(failures,ensure_ascii=False,indent=2))
    count=sum(len(u['tracks']) for u in manifest['units'])
    if not count:raise SystemExit('No valid audio downloaded; existing library preserved.')
    manifest['audioFiles']=len(available)
    from phonetics import apply_annotations
    apply_annotations(manifest)
    temp=data/'library.tmp';temp.write_text('window.LIBRARY = '+json.dumps(manifest,ensure_ascii=False)+';\n');temp.replace(data/'library.js')
    print('COMPLETE',len(manifest['units']),'units',count,'tracks',len(available),'files',len(failures),'failures',flush=True)
if __name__=='__main__':main()
