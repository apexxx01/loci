"""Helpers to plan emulator shots for scripts/film.mjs: head paths with
min-jerk easing, look-at orientations, and running a job."""
import json
import math
import subprocess
import time

FPS = 30


def ease(t):
    """Min-jerk: zero velocity and acceleration at both ends."""
    t = max(0.0, min(1.0, t))
    return t * t * t * (10 - 15 * t + 6 * t * t)


def look_quat(eye, target):
    """Quaternion (x, y, z, w) for a head at eye looking at target, no roll."""
    dx, dy, dz = target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]
    yaw = math.atan2(-dx, -dz)
    pitch = math.atan2(dy, math.hypot(dx, dz))
    cy, sy = math.cos(yaw / 2), math.sin(yaw / 2)
    cp, sp = math.cos(pitch / 2), math.sin(pitch / 2)
    # q = yaw(Y) * pitch(X)
    return [cy * sp, sy * cp, -sy * sp, cy * cp]


def lerp(a, b, t):
    return [a[i] + (b[i] - a[i]) * t for i in range(len(a))]


def move(eye0, eye1, look0, look1, seconds, curve=ease):
    """Frames for a head moving eye0->eye1 while its gaze moves look0->look1."""
    n = max(1, round(seconds * FPS))
    out = []
    for i in range(n):
        t = curve(i / max(1, n - 1))
        e, l = lerp(eye0, eye1, t), lerp(look0, look1, t)
        out.append({'p': e, 'q': look_quat(e, l)})
    return out


def hold(eye, look, seconds):
    return move(eye, eye, look, look, seconds)


def run(dir, frames, start=0, release=True, quality=0.93, chunk=60):
    """Film frames in chunks (each browser script is capped at 110 s)."""
    t = time.time()
    done = 0
    while done < len(frames):
        part = frames[done:done + chunk]
        last = done + len(part) >= len(frames)
        job = {'dir': dir, 'start': start + done, 'frames': part, 'quality': quality, 'release': release and last}
        open('.tmp/film/job.json', 'w').write(json.dumps(job))
        out = subprocess.run(['npx', '@iwsdk/cli', 'browser', 'run', 'scripts/film.mjs', '--timeout', '110000'], capture_output=True, text=True)
        txt = out.stdout + out.stderr
        i = txt.find('__RESULT__')
        if i < 0:
            print(f'{dir}: chunk at {done} failed: {txt[-600:]}', flush=True)
            if chunk > 15:
                chunk //= 2
                continue
            return {'error': txt[-600:], 'done': done}
        res = json.loads(txt[i + 10:].split('\n')[0])
        done += res['frames']
        print(f'  {dir}: {done}/{len(frames)} ({res["sec"]:.0f}s for {res["frames"]})', flush=True)
    print(f'{dir}: {done} frames in {time.time() - t:.0f}s', flush=True)
    return {'frames': done}
