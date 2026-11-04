"""Import marked expressions and verified contexts from the learning memory folder."""
import argparse,json,re,subprocess,sys
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('memory_root',type=Path);args=parser.parse_args()
root=Path(__file__).resolve().parents[1];words=[]
for file in sorted((args.memory_root/'词汇').glob('*.md')):
    context=json.loads((args.memory_root/'词汇'/'语境'/(file.stem+'.json')).read_text())
    for line in file.read_text().splitlines():
        if not line.startswith('|'):continue
        parts=[v.strip() for v in line.strip('|').split('|')]
        if len(parts)<3 or parts[0] in ('表达','词或表达') or re.fullmatch(r'[- :]+',parts[0]):continue
        term=parts[0];entry=context['entries'][term.lower()];sentence=context['sentences'][entry['sentenceId']]
        words.append(dict(id=file.stem+':'+term.lower(),book=file.stem,term=term,meaning=parts[1],source=file.stem+' · '+parts[2],sentence=sentence['english'],translation=sentence['translation'],target=entry['target'],extensions=entry['extensions'],note=entry.get('note',''),page=entry.get('page','')))
(root/'data/words.json').write_text(json.dumps(words,ensure_ascii=False,indent=2))
subprocess.run([sys.executable,str(root/'tools/build.py')],check=True)
