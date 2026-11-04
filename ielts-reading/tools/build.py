"""Build the Pages subdirectory without publishing local attachment paths."""
from pathlib import Path
import json
root=Path(__file__).resolve().parents[1]
words=json.loads((root/'data/words.json').read_text())
for w in words:
    w.pop('sourceFile',None)
    if w['target'].lower() not in w['sentence'].lower():raise ValueError(w['term'])
html=(root/'review.template.html').read_text().replace('__DATA__',json.dumps(words,ensure_ascii=False).replace('<','\\u003c'))
(root/'index.html').write_text(html)
print(f'Built IELTS reading page with {len(words)} expressions')
