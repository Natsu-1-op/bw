"""Apply maintained pronunciation notes without modifying the original audio."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def apply_annotations(library):
    notes=json.loads((ROOT/'data/phonetics.json').read_text())
    count=0
    for unit in library['units']:
        for track in unit['tracks']:
            key=track['url'].split('/OnlineTutorial/',1)[-1]
            annotation=notes['entries'].get(key)
            if annotation:
                track.setdefault('originalTitle',track['title'])
                track['title']=annotation['title']
                track['phonetics']=annotation
                count+=1
    library['pronunciationReferences']=notes['references']
    library['annotatedTracks']=count
    missing=[t['id'] for u in library['units'] for t in u['tracks'] if '粵語語音特點' in t['section'] and not t.get('phonetics')]
    if missing:raise ValueError('Missing pronunciation notes: '+', '.join(missing))
    return count
if __name__=='__main__':
    p=ROOT/'data/library.js'
    data=json.loads(p.read_text().removeprefix('window.LIBRARY = ').strip().removesuffix(';'))
    count=apply_annotations(data)
    p.write_text('window.LIBRARY = '+json.dumps(data,ensure_ascii=False)+';\n')
    print('Annotated tracks:',count)
