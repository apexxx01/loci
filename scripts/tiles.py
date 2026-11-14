"""Dump memory-tile entities: id, position, face, due, anchor attached."""
import json, subprocess
def cli(*args):
    return json.loads(subprocess.run(['npx','@iwsdk/cli',*args],capture_output=True,text=True).stdout)
found = cli('ecs','find','--input-json',json.dumps({'withComponents':['MemoryTile']}))['data']['result']
for e in found['entities']:
    res = cli('ecs','query','--input-json',json.dumps({'entityIndex':e['entityIndex']}))['data']['result']
    comps = {c['componentId']: c.get('values',{}) for c in res['components']}
    t = comps.get('Transform',{}); m = comps.get('MemoryTile',{}); a = comps.get('XRAnchor')
    par = (t.get('parent') or {}).get('name')
    print(e['entityIndex'], m.get('memoryId'), [round(x,2) for x in t.get('position',[])], 'face',m.get('face'),'due',m.get('due'),'anchor',None if a is None else a.get('attached'),'parent',par)
