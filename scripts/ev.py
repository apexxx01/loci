"""Run JS in the app frame: python3 scripts/ev.py 'return 1+1'"""
import json, subprocess, sys
def ev(code, timeout=60000):
    open('.tmp/eval.js','w').write(code)
    out = subprocess.run(['npx','@iwsdk/cli','browser','run','scripts/pw-eval.mjs','--timeout',str(timeout)],capture_output=True,text=True)
    txt = out.stdout + out.stderr
    i = txt.find('__RESULT__')
    if i < 0:
        try:
            d = json.loads(out.stdout); r = d.get('data',{}).get('result')
            if r is not None: return r.get('value', r) if isinstance(r, dict) else r
        except Exception: pass
        return {'error': txt[-800:]}
    line = txt[i+10:].split('\n')[0]
    try: return json.loads(line)
    except Exception: return line
if __name__ == '__main__':
    print(json.dumps(ev(sys.argv[1]), indent=1)[:3000])
