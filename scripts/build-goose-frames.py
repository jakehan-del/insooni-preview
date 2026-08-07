#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""도입부 거위의 자세 세 장을 투명 이미지로 오려낸다.

■ 왜 영상이 아니라 그림 세 장인가 (2026-08-07, 앞의 설계를 뒤집었다)

처음에는 이 연출을 mp4 로 구웠다. 잘 돌아갔지만 근본 한계가 있었다 —
영상은 불투명한 사각형이다. 검은 배경 위의 거위를 화면에 얹으면
그 사각형이 사이트를 가린다. 어머니가 노래하는 히어로 영상 위에
검은 상자가 뜨는 셈이다. 그래서 화면 전체를 덮어 "가리는 게 아니라
장면인 척" 하고 있었을 뿐, 도입부와 사이트는 여전히 두 개의 다른 것이었다.

투명 영상(VP9 alpha)으로 풀려 했으나 이 환경의 ffmpeg 는 yuva420p 를
지원한다고 보고하면서 실제로는 yuv420p 를 내보냈다. 두 경로 모두 확인했다.

그런데 이 연출은 결국 '그림 세 장 + 위치·크기·자세'다. 구울 이유가 없다.
투명 WebP 세 장을 두고 브라우저가 직접 움직이면 —
  · 거위가 어머니와 같은 공간을 난다. 검은 상자가 없다
  · 어둠은 걷을 수 있는 막이 되어, 거위가 나는 동안 히어로가 드러난다
  · 도입부부터 상표 착지까지 끊기는 곳이 없다 — 인수인계 자체가 사라졌다
  · 어느 해상도에서도 선명하다 (영상은 1080 고정이었다)
움직임의 정본은 이제 assets/js/main.js 의 initLoader() 다.

■ 세 장을 '같은 정사각형'으로 자르는 이유
자세마다 날개 폭이 다르다. 각자 딱 맞게 자르면 자세를 바꿀 때 거위가
튄다. 세 장의 알파 경계를 합집합으로 묶고 정사각형으로 넓혀 똑같이 자른다.
그러면 셋이 완전히 갈아끼울 수 있고, 브라우저는 상자 하나만 움직이면 된다.

원본 그림은 건드리지 않는다. 멱등하다 — 같은 입력이면 같은 출력.
"""
import os, sys
from PIL import Image, ImageFilter

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(BASE, "assets", "img")
SIZE = 560          # 화면에서 가장 클 때가 뷰포트의 약 42% — 560 이면 레티나에서도 충분하다

# 원본 → 내보낼 이름 (쉼 · 날개 아래 · 날개 위)
PAIRS = [("goose-emblem.webp", "goose-rest.webp"),
         ("goose-mid.webp",    "goose-down.webp"),
         ("goose-flight.webp", "goose-up.webp")]


def cut(name):
    """검은 배경 위의 그림에서 거위만 오려 알파를 붙인다.

    알파가 지워질 자리의 RGB 도 검정으로 눌러 둔다 — 원본의 숯빛 질감이
    남으면 밝은 화면 위에서 옅은 얼룩으로 뜬다.
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
    return im.transpose(Image.FLIP_LEFT_RIGHT)


def main():
    cuts = [cut(src) for src, _ in PAIRS]

    boxes = [c.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox() for c in cuts]
    if any(b is None for b in boxes):
        print("실패: 알파가 비어 있는 그림이 있다", file=sys.stderr); sys.exit(1)
    u = (min(b[0] for b in boxes), min(b[1] for b in boxes),
         max(b[2] for b in boxes), max(b[3] for b in boxes))

    # 합집합을 정사각형으로 넓힌다. 브라우저가 정사각형 상자 하나만 움직이면
    # 되도록 — 상표(114x66)와 비율이 달라도 상자를 정사각형으로 두면
    # 안에서 가운데 맞춤이 되어 착지가 픽셀 단위로 맞는다.
    side = max(u[2] - u[0], u[3] - u[1])
    cx, cy = (u[0] + u[2]) / 2, (u[1] + u[3]) / 2
    sq = (int(cx - side / 2), int(cy - side / 2), int(cx + side / 2), int(cy + side / 2))

    total = 0
    for (src, dst), c in zip(PAIRS, cuts):
        out = os.path.join(SRC, dst)
        c.crop(sq).resize((SIZE, SIZE), Image.LANCZOS).save(out, "WEBP", quality=88, method=6)
        n = os.path.getsize(out)
        total += n
        print("  %-18s → %-18s %5.1f KB" % (src, dst, n / 1024))
    print("정사각형 %dpx 로 통일 · 합계 %.1f KB" % (side, total / 1024))


if __name__ == "__main__":
    main()
