#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""도입부 — 거위가 어둠에서 날아올라 상표가 되는 영화를 만든다.

이야기
  어둠 속에 웅크린 거위가 있다. 아무도 보지 않는다.
  빛 한 줄기가 스친다. 거위가 고개를 든다.
  웅크렸다가 — 날아오른다.
  화면 왼쪽 위로 날아가 멈춘다. 거기서부터는 브라우저가 이어받아
  헤더의 상표 자리에 내려앉는다. 거위가 곧 이 사이트의 이름이 된다.

이 파일이 만드는 것은 그중 앞부분(어둠~활공)이고,
착지는 main.js 의 initLoader() 가 이어서 한다. 이음매가 보이지 않으려면
인수인계 순간 두 그림이 같은 자리·같은 크기·같은 픽셀이어야 한다. 그래서

  · 마지막 프레임의 거위 위치·크기를 LAND_* 로 못박고, 이 스크립트가 그 값을 출력한다
  · 브라우저가 이어받을 그림(goose-handoff.webp)을 여기서 같이 잘라 내보낸다
    — 영상과 같은 처리를 거친 같은 픽셀이라야 바뀌는 순간이 안 보인다

왜 그림 세 장으로 만드나 —
Higgsfield 같은 영상 AI 는 계정과 결제가 필요하다. 그래서 가진 것으로 만든다.
같은 화풍의 세 자세(쉼 · 날개 아래 · 날개 위)를 넘기면 날갯짓이 된다.
사람이 아니라 그림이므로 자세가 조금 달라도 어색하지 않다 —
어머니 얼굴에는 절대 쓰면 안 되는 방법이지만, 거위에게는 통한다.

연출 (애니메이션 12원칙에서 셋을 빌렸다)
  anticipation  날기 전에 웅크린다. 이게 없으면 갑자기 붕 뜬다
  slow in/out   떠오를 때 가속하고, 착지 지점에서 감속한다
  follow-through 잔상을 남긴다 — 잔상은 자세가 아니라 궤적을 보여준다

  0.00~0.60  어둠. 먼지가 떠다닌다. 거위는 거의 안 보인다
  0.60~1.30  드러난다. 숨을 쉰다 (2px 아래위)
  0.80~1.75  무대 조명 한 줄기가 오른쪽에서 왼쪽으로 스친다
  1.30~1.50  웅크린다 — anticipation
  1.50~1.66  날개를 편다 (쉼 → 아래)
  1.66~2.80  날갯짓 세 번. 가속하며 떠오른다. 금빛 잔상
  2.80~3.42  왼쪽 위로 활공. 감속하며 착지점에 닿는다
  3.42~3.60  거의 멈춘 채 아주 약하게 뜬다 — 브라우저가 여기를 이어받는다
  총 3.6초 · 1080x1080 · 30fps

원본 그림은 건드리지 않는다. 멱등하다 — 같은 입력이면 같은 영상.
"""
import json, math, os, random, shutil, subprocess, sys
from PIL import Image, ImageFilter

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(BASE, "assets", "img")
OUT = os.path.join(BASE, "assets", "media", "intro-goose.mp4")
HANDOFF = os.path.join(SRC, "goose-handoff.webp")
TMP = "/tmp/insooni-intro-frames"

W = H = 1080
FPS = 30
DUR = 3.6
BG = (0, 0, 0)          # 순수 검정. 0 이 아니면 화면에서 사각형이 떠오른다
GOLD = (232, 194, 122)  # 잔상 색 — CSS 의 --gold 와 같은 계열

POSES = ["goose-emblem.webp", "goose-mid.webp", "goose-flight.webp"]  # 쉼 · 아래 · 위

# ── 인수인계 지점 ─────────────────────────────────────────────
# 마지막 프레임에서 거위가 놓이는 정사각형. 프레임 폭 기준 정규화 값이다.
# main.js 의 LAND 상수와 반드시 같아야 한다 — 다르면 바뀌는 순간 거위가 튄다.
LAND_SCALE = 0.150      # 놓이는 정사각형의 한 변 / 프레임 폭
LAND_NX = 0.280         # 그 정사각형 중심의 가로 위치 (0=왼쪽 끝, 1=오른쪽 끝)
LAND_NY = 0.245         # 세로 위치


def load(name):
    """검은 배경 위의 그림에서 거위만 오려낸다.

    배경을 빼서 알파를 만들지 않으면 겹쳐 넘길 때 사각형 경계가 보인다.
    알파가 지워질 자리의 RGB 도 검정으로 눌러 둔다 — 원본의 숯빛 질감이
    남으면 밝은 화면에서 옅은 얼룩으로 뜬다.
    """
    p = os.path.join(SRC, name)
    if not os.path.exists(p):
        print("그림이 없다: " + p, file=sys.stderr); sys.exit(1)
    im = Image.open(p).convert("RGB")
    a = im.convert("L").point(lambda v: 0 if v < 30 else min(255, int((v - 30) * 1.9)))
    im.putalpha(a.filter(ImageFilter.GaussianBlur(0.6)))
    im = Image.composite(im, Image.new("RGBA", im.size, (0, 0, 0, 0)),
                         a.point(lambda v: 255 if v > 6 else 0))
    # 헤더 상표가 화면 왼쪽 위에 있으므로 거위도 왼쪽을 보고 그쪽으로 날아야 한다.
    # 원본 그림은 오른쪽을 보고 있어 좌우로 뒤집는다.
    im = im.transpose(Image.FLIP_LEFT_RIGHT)
    return im.resize((W, H), Image.LANCZOS)


def gilded(img):
    """잔상용 금빛 판본. 형태는 그대로 두고 색만 금으로 민다."""
    g = Image.new("RGBA", img.size, GOLD + (0,))
    g.putalpha(img.getchannel("A"))
    return g


def ease(t):
    return t * t * (3 - 2 * t)                      # smoothstep


def ease_in(t):
    return t * t * t                                 # 떠오를 때 — 점점 빨라진다


def ease_out(t):
    return 1 - (1 - t) ** 3                          # 착지할 때 — 점점 느려진다


# ── 궤적과 자세를 따로 둔다 ────────────────────────────────────
# 잔상을 그리려면 "0.05초 전에 어디 있었나"를 물어봐야 한다.
# 궤적이 시각의 함수로 분리돼 있어야 그 질문에 답할 수 있다.

def path(t):
    """t 초에서 거위가 놓이는 (한 변 비율, 가로 밀림, 세로 밀림)."""
    if t < 1.30:                                     # 어둠 속 · 숨쉬기
        rise = ease(min(1.0, t / 0.85))
        breathe = math.sin(t * 2.1) * 2.0
        return 0.50 + 0.035 * (1 - rise), 0.0, 12 * (1 - rise) + breathe
    if t < 1.50:                                     # anticipation — 웅크린다
        p = ease((t - 1.30) / 0.20)
        return 0.50 - 0.012 * p, 0.0, 7.0 * p
    if t < 2.80:                                     # 날갯짓하며 떠오른다 (가속)
        p = ease_in((t - 1.50) / 1.30)
        return 0.50 - 0.075 * p, -168 * p, 7.0 - 172 * p
    p = ease_out(min(1.0, (t - 2.80) / 0.62))        # 활공 → 착지 (감속)
    # 끝점이 LAND_* 와 정확히 맞아야 한다. 여기서 어긋나면 이음매가 보인다.
    end_dx = (LAND_NX - 0.5) * W
    end_dy = (LAND_NY - 0.5) * H
    settle = math.sin(max(0.0, t - 3.42) * 7.0) * 1.6   # 내려앉기 직전의 미세한 흔들림
    return (0.425 + (LAND_SCALE - 0.425) * p,
            -168 + (end_dx + 168) * p,
            -165 + (end_dy + 165) * p + settle)


def posture(t):
    """t 초에서 세 자세를 각각 얼마나 섞을지 — (쉼, 아래, 위)."""
    if t < 1.50:
        return 1.0, 0.0, 0.0
    if t < 1.66:                                     # 쉼 → 아래, 날개를 편다
        p = ease((t - 1.50) / 0.16)
        return 1 - p, p, 0.0
    # 날갯짓 세 번. 두 자세를 길게 겹치면 거위가 두 마리로 보인다 —
    # 실제 셀 애니메이션은 자세를 툭툭 바꾼다. 겹침은 0.055초만 준다.
    ph = ((t - 1.66) / 0.19) % 2.0                   # 한 왕복 0.38초
    raw = 1.0 if ph < 1.0 else 0.0
    edge = min(ph % 1.0, 1.0 - (ph % 1.0))
    blend = 0.5 * (1 - ease(min(1.0, edge / 0.085)))
    k = raw * (1 - blend) + (1 - raw) * blend
    # 착지 직전에는 퍼덕임을 멈추고 활공 자세(위)로 고정한다.
    # 내려앉는 새는 날개를 치지 않는다 — 그리고 더 중요하게는, 브라우저가
    # 이어받을 그림(goose-handoff.webp)이 바로 이 자세다. 마지막 프레임이
    # 다른 자세로 끝나면 인수인계 순간 거위가 형태를 바꾸며 튄다.
    glide = ease(min(1.0, max(0.0, t - 3.22) / 0.22))
    k = k + (1.0 - k) * glide
    return 0.0, 1 - k, k


def beam_x(t):
    """조명 줄기의 가로 위치. 없으면 None. draw_goose 도 이걸 물어본다."""
    if not (0.80 <= t <= 1.75):
        return None
    return W * 1.65 - ((t - 0.80) / 0.95) * W * 2.05


def visible(t):
    """어둠에서 얼마나 드러났나. 사라지지는 않는다 — 브라우저가 이어받으므로.

    이야기의 경첩은 '빛이 스치자 거위가 드러난다' 이므로, 조명이 거위를
    지나는 순간 실제로 더 밝아져야 한다. 그냥 위에 흰 띠를 얹는 것으로는
    빛이 거위를 비춘 게 아니라 거위 앞을 가린 것처럼 보인다.
    """
    dim = 0.10 + 0.22 * ease(min(1.0, t / 0.60))          # 어둠 속 실루엣
    v = dim + (1 - dim) * ease(min(1.0, max(0.0, t - 0.62) / 0.68))
    bx = beam_x(t)
    if bx is not None:
        near = max(0.0, 1.0 - abs(bx - W * 0.5) / (W * 0.55))
        v *= 1.0 + 0.42 * near * near
    return min(1.0, v)


def place(canvas, img, scale, dx, dy, alpha):
    if alpha <= 0.003:
        return
    s = max(8, int(W * scale))
    r = img.resize((s, s), Image.LANCZOS)
    if alpha < 1:
        r.putalpha(r.getchannel("A").point(lambda v: int(v * alpha)))
    canvas.alpha_composite(r, (int((W - s) / 2 + dx), int((H - s) / 2 + dy)))


def draw_goose(canvas, t, poses, golds, trail=True):
    """궤적 위에 거위를 놓는다. 잔상은 지나온 자리에 금빛으로."""
    rest_a, down_a, up_a = posture(t)
    vis = visible(t)
    steps = ((3, 0.10, True), (2, 0.17, True), (1, 0.30, True), (0, 1.0, False)) if trail \
        else ((0, 1.0, False),)
    for back, weight, gold in steps:
        tt = t - back * 0.042
        if back and tt < 1.66:                       # 잔상은 날기 시작한 뒤에만
            continue
        sc, dx, dy = path(tt)
        src = golds if gold else poses
        for img, a in zip(src, (rest_a, down_a, up_a)):
            # 잔상은 '그때의 자세'가 아니라 '그때의 자리'를 보여준다.
            # 옛 자세까지 되살리면 거위가 여러 마리로 보인다.
            place(canvas, img, sc, dx, dy, a * vis * weight)


def dust(canvas, t, motes):
    """어둠에 떠다니는 먼지. 검정만 있으면 화면이 죽어 보인다."""
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    px = layer.load()
    for x0, y0, sp, br in motes:
        y = int((y0 - t * sp) % H)
        x = int(x0 + math.sin(t * 0.8 + x0) * 9) % W
        a = int(br * (0.35 + 0.65 * math.sin(t * 1.7 + y0)) * min(1.0, t / 0.5))
        if a <= 0:
            continue
        for j in range(max(0, y - 1), min(H, y + 2)):
            for i in range(max(0, x - 1), min(W, x + 2)):
                px[i, j] = (255, 246, 226, a)
    canvas.alpha_composite(layer.filter(ImageFilter.GaussianBlur(1.0)))


def sweep(canvas, t):
    """무대 조명 한 줄기. 0.80~1.75초, 오른쪽에서 왼쪽으로 — 거위가 갈 쪽에서 온다."""
    if not (0.80 <= t <= 1.75):
        return
    p = (t - 0.80) / 0.95
    x = int(beam_x(t))
    band = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    px = band.load()
    fade = math.sin(math.pi * p)
    for i in range(max(0, x - 300), min(W, x + 300)):
        a = int(62 * (1 - abs(i - x) / 300.0) ** 2.4 * fade)
        if a <= 0:
            continue
        for j in range(H):
            px[i, j] = (255, 250, 236, a)
    canvas.alpha_composite(band.filter(ImageFilter.GaussianBlur(46)))


def write_handoff(up):
    """브라우저가 이어받을 그림을 잘라 내보낸다.

    영상과 같은 load() 를 거친 같은 픽셀이라야 바뀌는 순간이 안 보인다.
    투명 여백을 잘라 내는 이유는, 헤더 상표와 크기를 맞추려면
    '정사각형'이 아니라 '거위 자체'의 상자를 알아야 하기 때문이다.
    """
    box = up.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    up.crop(box).save(HANDOFF, "WEBP", quality=92, method=6)
    return box


def main():
    rest, down, up = (load(p) for p in POSES)
    poses = (rest, down, up)
    golds = tuple(gilded(p) for p in poses)

    box = write_handoff(up)
    if os.path.isdir(TMP):
        shutil.rmtree(TMP)
    os.makedirs(TMP)

    rnd = random.Random(7)                           # 고정 씨앗 — 멱등해야 한다
    motes = [(rnd.randrange(W), rnd.randrange(H), rnd.uniform(8, 26), rnd.randrange(70, 185))
             for _ in range(70)]

    n = int(DUR * FPS)
    for f in range(n):
        t = f / FPS
        c = Image.new("RGBA", (W, H), BG + (255,))
        dust(c, t, motes)
        draw_goose(c, t, poses, golds)
        sweep(c, t)
        c.convert("RGB").save(os.path.join(TMP, "f%04d.png" % f))

    r = subprocess.run([
        "ffmpeg", "-v", "error", "-y", "-framerate", str(FPS),
        "-i", os.path.join(TMP, "f%04d.png"),
        # 색 범위를 full 로 못박는다. 기본(limited/TV)은 검정을 16 으로 들어올려
        # 화면에서 사각형이 보이게 만든다 — 실측: 모서리가 RGB(9,9,9) 였다.
        "-vf", "scale=out_range=full",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20",
        "-color_range", "pc", "-colorspace", "bt709",
        "-color_primaries", "bt709", "-color_trc", "bt709",
        "-profile:v", "high", "-movflags", "+faststart", OUT])
    if r.returncode != 0:
        print("ffmpeg 실패", file=sys.stderr); sys.exit(1)

    # 마지막 프레임에서 거위(투명 여백을 뺀 몸통)가 차지하는 자리.
    # main.js 의 LAND 상수가 이 값이어야 한다. 여기서 출력해 두는 이유는
    # 두 파일이 조용히 어긋나는 것이 이 연출에서 가장 티 나는 고장이기 때문이다.
    side = LAND_SCALE
    hand = {
        "nx": round(LAND_NX - side / 2 + side * box[0] / W, 5),
        "ny": round(LAND_NY - side / 2 + side * box[1] / H, 5),
        "nw": round(side * (box[2] - box[0]) / W, 5),
        "nh": round(side * (box[3] - box[1]) / H, 5),
    }
    print("만듦: %s · %d프레임 · %.1f초 · %.1fMB"
          % (os.path.relpath(OUT, BASE), n, DUR, os.path.getsize(OUT) / 1048576))
    print("인수인계: %s ← main.js 의 LAND 와 같아야 한다" % json.dumps(hand))


if __name__ == "__main__":
    main()
