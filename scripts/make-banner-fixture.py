#!/usr/bin/env python3
"""Fabrique des vidéos de test « compilation de bannières » dont les frontières sont connues.

Usage : make-banner-fixture.py <ffmpeg> <dossier> [cas]
Écrit <cas>.mp4 et <cas>.json (frontières réelles, en secondes).
"""
import json, subprocess, sys

FF, OUT = sys.argv[1], sys.argv[2]
ONLY = sys.argv[3] if len(sys.argv) > 3 else None
W, H, FPS = 360, 640, 30

# Scènes : sources visuellement distinctes, toutes animées.
def scene(kind, dur, hue=0, extra=""):
    src = {
        "bars":   f"testsrc2=s={W}x{H}:r={FPS}:d={dur}",
        "mandel": f"mandelbrot=s={W}x{H}:r={FPS}:end_scale=0.3,trim=duration={dur}",
        "grad":   f"gradients=s={W}x{H}:r={FPS}:d={dur}:speed=0.05:seed={hue+1}",
        "life":   f"life=s={W}x{H}:r={FPS}:mold=10:ratio=0.2:death_color=#102040:life_color=#ffd060,trim=duration={dur}",
        "cell":   f"cellauto=s={W}x{H}:r={FPS}:rule=110,trim=duration={dur}",
        "rgb":    f"rgbtestsrc=s={W}x{H}:r={FPS}:d={dur}",
        "smpte":  f"smptehdbars=s={W}x{H}:r={FPS}:d={dur}",
        "yuv":    f"yuvtestsrc=s={W}x{H}:r={FPS}:d={dur}",
        "pal":    f"pal100bars=s={W}x{H}:r={FPS}:d={dur}",
        "color":  f"color=c=0x203060:s={W}x{H}:r={FPS}:d={dur},noise=alls=40:allf=t",
    }[kind]
    f = src
    if hue: f += f",hue=h={hue}"
    if extra: f += "," + extra
    return f + f",format=yuv420p,setsar=1,fps={FPS}"

ZOOM = f"scale={W*2}:{H*2},crop={W}:{H}:'(iw-ow)/2+80*sin(t*2)':'(ih-oh)/2+120*t'"      # mouvement de caméra continu
FAST = f"scale={W*2}:{H*2},crop={W}:{H}:'(iw-ow)/2+150*sin(t*9)':'(ih-oh)/2+150*cos(t*7)'" # mouvement rapide
def flash(t): return f"eq=brightness='if(between(t,{t},{t+0.07}),0.9,0)':eval=frame"       # flash blanc de 2 images
PULSE = "eq=brightness='0.18*sin(t*8)':saturation='1+0.5*sin(t*5)':eval=frame"             # effets lumineux

CASES = {
  # 6 bannières, coupes franches, durées égales
  "coupes": dict(scenes=[("bars",2.5),("mandel",2.5),("grad",2.5,0),("life",2.5),("smpte",2.5),("yuv",2.5)], trans=["cut"]*5),
  # 5 bannières séparées par des fondus enchaînés et des fondus au noir
  "fondus": dict(scenes=[("bars",3),("mandel",3),("grad",3,40),("smpte",3),("rgb",3)], trans=[("fade",0.5),("fadeblack",0.6),("fade",0.4),("fadewhite",0.6)]),
  # pièges : flashs, pulsations lumineuses, zoom et mouvement rapide À L'INTÉRIEUR des bannières
  "effets": dict(scenes=[("bars",3,0,flash(1.2)),("mandel",3,0,PULSE),("grad",3,0,ZOOM),("smpte",3,0,FAST),("rgb",3,0,flash(0.8)+","+flash(2.0)),("life",3)], trans=["cut",("fade",0.4),"cut","cut",("fade",0.4)]),
  # séquences visuellement proches : même source, teinte voisine
  "proches": dict(scenes=[("grad",2.5,0),("grad",2.5,3),("grad",2.5,7),("mandel",2.5,0),("mandel",2.5,180)], trans=["cut"]*4),
  # vidéo classique : un seul plan avec mouvement et effets
  "classique": dict(scenes=[("mandel",9,0,PULSE)], trans=[]),
  # 14 bannières courtes, transitions mélangées
  "quatorze": dict(scenes=[(k,2.0,h) for k,h in [("bars",0),("mandel",0),("grad",0),("smpte",0),("rgb",0),("yuv",0),("pal",0),("bars",120),("mandel",90),("grad",9),("smpte",200),("life",0),("yuv",150),("pal",60)]],
                   trans=["cut",("fade",0.3)]*6+["cut"]),
}

def build(name, case):
    scenes, trans = case["scenes"], case["trans"]
    inputs, parts = [], []
    for i, s in enumerate(scenes):
        kind, dur = s[0], s[1]
        hue = s[2] if len(s) > 2 else 0
        extra = s[3] if len(s) > 3 else ""
        inputs += ["-f", "lavfi", "-i", scene(kind, dur, hue, extra)]
    cur, t, truth, fc = "[0:v]", scenes[0][1], [], []
    for i, tr in enumerate(trans):
        nxt, dur = f"[{i+1}:v]", scenes[i+1][1]
        out = f"[v{i}]"
        if tr == "cut":
            fc.append(f"{cur}{nxt}concat=n=2:v=1:a=0,settb=1/{FPS},fps={FPS}{out}")
            truth.append(round(t, 3)); t += dur
        else:
            kind, d = tr
            fc.append(f"{cur}{nxt}xfade=transition={kind}:duration={d}:offset={t-d}{out}")
            truth.append(round(t - d/2, 3)); t += dur - d
        cur = out
    total = t
    n = len(scenes)
    inputs += ["-f", "lavfi", "-i", f"sine=frequency=330:duration={total}"]
    fc.append(f"{cur}null[vout]")
    cmd = [FF, "-y", "-loglevel", "error", *inputs, "-filter_complex", ";".join(fc), "-map", "[vout]", "-map", f"{n}:a", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-g", "60", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", "-movflags", "+faststart", f"{OUT}/{name}.mp4"]
    subprocess.run(cmd, check=True)
    json.dump({"boundaries": truth, "duration": round(total, 3), "segments": n}, open(f"{OUT}/{name}.json", "w"))
    print(name, n, "séquences", round(total, 2), "s")

for name, case in CASES.items():
    if ONLY and name != ONLY: continue
    build(name, case)
