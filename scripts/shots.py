import sys, subprocess, time
sys.path.insert(0,'scripts')
from ev import ev
from PIL import Image
def shot(name):
    subprocess.run(['npx','@iwsdk/cli','browser','screenshot','--output-file',f'artifacts/{name}.png'],capture_output=True)
    im=Image.open(f'artifacts/{name}.png'); im.thumbnail((1000,1000)); im.save(f'artifacts/{name}-s.png')
for i,name in enumerate(sys.argv[1:]):
    idx,_,n = name.partition(':')
    print(ev(f"const l=document.querySelector('.landing'); l.style.scrollBehavior='auto'; const s=l.querySelectorAll('section.s')[{idx}]; l.scrollTop = s.offsetTop + s.offsetHeight/2 - l.clientHeight/2; await new Promise(r=>setTimeout(r,3500)); return l.scrollTop"))
    shot(n)
