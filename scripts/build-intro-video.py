#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""도입부 거위 영상을 만든다 — 그림 세 장으로 날갯짓을.

왜 이렇게 만드나 —
Higgsfield 같은 영상 AI 를 붙이려면 계정과 결제가 필요하다. 그래서 가진 것으로 만든다.
같은 화풍으로 그린 세 자세(쉼 · 날개 아래 · 날개 위)를 겹쳐 넘기면 날갯짓이 된다.
사람이 아니라 그림이므로 자세가 조금씩 달라도 어색하지 않다 —
어머니 얼굴에는 절대 쓰면 안 되는 방법이지만, 거위에게는 통한다.

만드는 것
  0.00~1.10  쉬는 거위가 어둠에서 떠오른다      "나는 오리였어요"
  0.55~1.45  무대 조명 한 줄기가 스친다
  1.10~1.30  날개를 편다 (쉼 → 아래)
  1.30~2.35  날갯짓 두 번 (아래↔위), 몸이 떠오른다
  2.35~3.20  날아가며 작아지고 사라진다 · 금빛 잔상
  총 3.2초 · 1080x1080 · 30fps

원본 그림은 건드리지 않는다. 멱등하다 — 같은 입력이면 같은 영상.
"""
import math, os, shutil, subprocess, sys
from PIL import Image, ImageChops, ImageEnhance, ImageFilter

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(BASE, "assets", "img")
OUT = os.path.join(BASE, "assets", "media", "intro-goose.mp4")
TMP = "/tmp/insooni-intro-frames"
W = H = 1080
FPS = 30
DUR = 3.2
BG = (0, 0, 0)   # 순수 검정. screen 합성에서 0 이 아니면 사각형이 떠오른다

POSES = ["goose-emblem.webp", "goose-mid.webp", "goose-flight.webp"]  # 쉼 · 아래 · 위


def load(name):
    p = os.path.join(SRC, name)
    if not os.path.exists(p):
        print("그림이 없다: " + p, file=sys.stderr); sys.exit(1)
    im = Image.open(p).convert("RGB")
    # 검은 배경 위의 그림이므로, 배경을 빼서 알파를 만든다.
    # 그래야 겹쳐 넘길 때 사각형 경계가 보이지 않는다.
    a = im.convert("L").point(lambda v: 0 if v < 30 else min(255, int((v - 30) * 1.9)))
    im.putalpha(a.filter(ImageFilter.GaussianBlur(0.6)))
    # 알파가 지워질 자리의 RGB 도 순수 검정으로 눌러 둔다.
    # 그러지 않으면 원본의 숯빛 질감이 screen 합성에서 옅은 얼룩으로 뜬다.
    im = Image.composite(im, Image.new("RGBA", im.size, (0, 0, 0, 0)), a.point(lambda v: 255 if v > 6 else 0))
    # 헤더 상표가 화면 왼쪽 위에 있으므로 거위도 왼쪽을 보고 날아야 한다.
    # 원본 그림은 오른쪽을 보고 있어 좌우로 뒤집는다.
    im = im.transpose(Image.FLIP_LEFT_RIGHT)
    return im.resize((W, H), Image.LANCZOS)


def ease(t):
    return t * t * (3 - 2 * t)          # smoothstep


def place(canvas, img, scale, dx, dy, alpha):
    if alpha <= 0.002:
        return
    s = max(8, int(W * scale))
    r = img.resize((s, s), Image.LANCZOS)
    if alpha < 1:
        al = r.getchannel("A").point(lambda v: int(v * alpha))
        r.putalpha(al)
    canvas.alpha_composite(r, (int((W - s) / 2 + dx), int((H - s) / 2 + dy)))


def sweep(canvas, t):
    """무대 조명 한 줄기. 0.55~1.45초."""
    if not (0.55 <= t <= 1.45):
        return
    p = (t - 0.55) / 0.90
    x = int(W * 1.7 - p * W * 2.1)   # 오른쪽에서 왼쪽으로
    band = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    px = band.load()
    fade = math.sin(math.pi * p)
    for i in range(max(0, x - 190), min(W, x + 190)):
        d = abs(i - x) / 190.0
        a = int(90 * (1 - d) ** 2 * fade)
        if a <= 0:
            continue
        for j in range(H):
            px[i, j] = (255, 250, 236, a)
    canvas.alpha_composite(band.filter(ImageFilter.GaussianBlur(26)))


def main():
    rest, down, up = (load(p) for p in POSES)
    if os.path.isdir(TMP):
        shutil.rmtree(TMP)
    os.makedirs(TMP)

    n = int(DUR * FPS)
    for f in range(n):
        t = f / FPS
        c = Image.new("RGBA", (W, H), BG + (255,))

        if t < 1.10:                                   # 어둠에서 떠오른다
            a = ease(min(1, t / 0.85))
            place(c, rest, 0.50 + 0.04 * (1 - a), 0, int(12 * (1 - a)), a)
        elif t < 1.30:                                 # 날개를 편다 (쉼 → 아래)
            p = ease((t - 1.10) / 0.20)
            place(c, rest, 0.50, 0, 0, 1 - p)
            place(c, down, 0.50, 0, int(-8 * p), p)
        elif t < 2.35:                                 # 날갯짓 두 번, 떠오른다
            p = (t - 1.30) / 1.05
            beat = (t - 1.30) / 0.2625                 # 한 번에 0.2625초 → 네 구간
            # 두 자세를 길게 겹치면 거위가 두 마리로 보인다.
            # 실제 셀 애니메이션은 자세를 툭툭 바꾼다 — 겹침을 짧게(0.06초) 준다.
            ph = beat % 2.0                            # 0~2 한 왕복
            raw = 1.0 if ph < 1.0 else 0.0             # 아래(0) ↔ 위(1)
            edge = min(ph % 1.0, 1.0 - (ph % 1.0))     # 전환점까지 거리
            blend = 0.5 * (1 - ease(min(1.0, edge / 0.09)))
            k = raw * (1 - blend) + (1 - raw) * blend  # 전환 순간만 살짝 겹친다
            lift = ease(p)
            dx, dy = int(-150 * lift), int(-150 * lift - 8)   # 왼쪽 위로
            sc = 0.50 - 0.08 * lift
            place(c, down, sc, dx, dy, 1 - k)
            place(c, up,   sc, dx, dy, k)
        else:                                          # 날아가며 사라진다
            p = ease((t - 2.35) / 0.85)
            place(c, up, 0.42 - 0.16 * p,
                  int(-150 - 330 * p), int(-158 - 300 * p), 1 - p)

        sweep(c, t)
        c.convert("RGB").save(os.path.join(TMP, "f%04d.png" % f))

    r = subprocess.run([
        "ffmpeg", "-v", "error", "-y", "-framerate", str(FPS),
        "-i", os.path.join(TMP, "f%04d.png"),
        # 색 범위를 full 로 못박는다. 기본(limited/TV)은 검정을 16 으로 들어올려
        # screen 합성에서 사각형이 보이게 만든다 — 실측: 모서리가 RGB(9,9,9) 였다.
        "-vf", "scale=out_range=full",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20",
        "-color_range", "pc", "-colorspace", "bt709",
        "-color_primaries", "bt709", "-color_trc", "bt709",
        "-profile:v", "high", "-movflags", "+faststart", OUT])
    if r.returncode != 0:
        print("ffmpeg 실패", file=sys.stderr); sys.exit(1)
    print("만듦: %s · %d프레임 · %.1f초 · %.1fMB"
          % (os.path.relpath(OUT, BASE), n, DUR, os.path.getsize(OUT) / 1048576))


if __name__ == "__main__":
    main()
