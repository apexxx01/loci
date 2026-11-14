import json, subprocess, sys
n = sys.argv[1] if len(sys.argv) > 1 else '60'
out = subprocess.run(['npx','@iwsdk/cli','browser','logs','--input-json',json.dumps({'count':int(n)})],capture_output=True,text=True).stdout
d = json.loads(out)
def find(o):
    if isinstance(o, list) and o and isinstance(o[0], dict) and 'level' in o[0]: return o
    if isinstance(o, dict):
        for v in o.values():
            r = find(v)
            if r: return r
    return None
for e in find(d) or []:
    m = str(e.get('message',''))
    if e.get('kind') == 'requestfailed' or e.get('level') == 'info' or '▄' in m or '▀' in m: continue
    print(e.get('level'), m[:600])
