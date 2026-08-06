#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""약한 사진을 살려낸다 — 버리는 대신 고쳐 쓴다.

어디서 왔나 —
사이트 사진 81장을 전수로 눈에 담아 보니, 문제는 촬영 실력이 아니라 출처였다.
좋은 사진은 전부 제대로 찍힌 것(스튜디오 화보·공식 무대 촬영)이고,
약한 사진은 전부 현장에서 급히 남긴 것(TV 화면 캡처·객석 폰 사진·연회장 스냅)이다.

무엇이 실제로 통했나 (실측) —
  1) 크롭이 압도적으로 크다. 객석에서 찍혀 어머니가 콩알만 하던 사진이,
     인물로 좁히니 황금 촛대 아치 앞의 무대 사진이 됐다.
  2) 채도를 ~52%로 낮추면 방송용 LED 배경의 형광 파랑이 가라앉고 피부톤이 돌아온다.
     처음에 파랑 채널만 곱셈으로 눌러 봤다가 사진이 새까맣게 죽었다 — 하지 말 것.
  3) 레벨 2%~98% 로 대비를 되살린다. 폰 사진은 대개 물빠진 상태로 저장된다.
  4) 해상도를 올리는 것은 의미가 없다. 없는 디테일은 만들어지지 않는다.
     크롭 후 원본 픽셀이 남아 있는 만큼만 쓴다.

원본은 건드리지 않는다. `-orig.webp` 로 남기고 결과만 덮어쓴다.
멱등하다 — 두 번 돌려도 원본에서 다시 만든다.
"""
import os, subprocess, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
PH = ROOT / "assets/img/photos"

# crop: "폭x높이+x+y" (원본 픽셀 기준) · sat: 채도 % · bc: 밝기x대비
# 값은 눈으로 보고 정했다. 자동으로 고를 수 있는 종류가 아니다.
RESCUE = {
    # 방송 화면 캡처 — 형광 파랑을 가라앉히고 인물로 좁힌다
    "hanteo-3": dict(crop="1000x1000+600+120", sat=52, bc="-3x8"),
    "hanteo-4": dict(crop="820x1100+40+260",   sat=55, bc="-2x8"),
    "hanteo-5": dict(crop="1000x750+420+180",  sat=58, bc="-2x8"),
    # 객석에서 찍은 원경 — 인물로 잘라내되 너무 좁히지 않는다.
    # 460x540 까지 좁혔더니 홈 스트립(세로 슬롯)에서 원본보다 크게 늘어났다.
    # 황금 촛대 아치를 함께 남기는 편이 화면도 채우고 그림도 낫다.
    "openc-1":  dict(crop="700x900+430+620",   sat=88, bc="4x8"),
    # 연회장 스냅 — 무대만 남기고 테이블·뒤통수를 잘라낸다
    "woi-award":  dict(crop="590x848+236+231", sat=80, bc="2x6"),
    "woi-podium": dict(crop="495x880+198+240", sat=80, bc="2x6"),
    "woi-speech": dict(crop="495x880+198+240", sat=80, bc="2x6"),
}

# 살릴 수 없는 것들. 크롭해도 어머니가 실루엣이거나 아예 없다.
# 지우지 않고 목록으로만 남긴다 — 판단 근거를 코드에 남겨야 다음 사람이 되돌리지 않는다.
UNSALVAGEABLE = {
    "kakao22":      "LED 조형물만 보이고 어머니는 실루엣",
    "woi-song":     "낯선 사람의 뒤통수가 화면을 채우고 초점도 나감",
    "woi-flag":     "무대 위 남성들만. 어머니가 없다",
    "woi-audience": "빈 연회 테이블. 어머니가 없다",
    "dsprac-1":     "빈 연습실 원경",
    "dsprac-2":     "빈 연습실 원경",
    "jazzc-1":      "어두운 객석 원경 — 형체만",
    "jazzc-2":      "어두운 객석 원경 — 형체만",
    "jazzc-3":      "어두운 객석 원경 — 형체만",
    "dsc0284":      "앙상블 군무. 어머니가 주인공이 아니다",
    "dsc0369":      "앙상블 군무. 어머니가 주인공이 아니다",
    "dsc0628":      "앙상블 군무. 어머니가 주인공이 아니다",
    "dsc9427":      "앙상블 군무. 어머니가 주인공이 아니다",
    "kakao21":      "원색 무대의 군무. 어머니 식별이 어렵다",
}


def run(name, spec, write):
    src = PH / f"{name}.webp"
    orig = PH / f"{name}-orig.webp"
    if not src.exists():
        print(f"  {name}: 파일 없음"); return False
    # 원본 보존 — 이미 있으면 그것을 입력으로 쓴다(멱등)
    inp = orig if orig.exists() else src
    args = ["magick", str(inp)]
    if spec.get("crop"):
        args += ["-crop", spec["crop"], "+repage"]
    args += ["-modulate", f"100,{spec['sat']},100",
             "-level", "2%,98%",
             "-brightness-contrast", spec["bc"],
             "-unsharp", "0x0.8+0.4+0.02",
             "-quality", "88"]
    dst = PH / f"{name}.webp"
    args += [str(dst if write else pathlib.Path("/tmp/fix") / f"{name}.webp")]
    if write and not orig.exists():
        subprocess.run(["cp", str(src), str(orig)], check=True)
    subprocess.run(args, check=True)
    out = dst if write else pathlib.Path("/tmp/fix") / f"{name}.webp"
    d = subprocess.run(["magick", "identify", "-format", "%wx%h", str(out)],
                       capture_output=True, text=True).stdout
    print(f"  {name:<12} → {d}")
    return True


def main():
    write = "--write" in sys.argv
    pathlib.Path("/tmp/fix").mkdir(exist_ok=True)
    print("사진 복원" + ("" if write else "  (미리보기 — 쓰려면 --write)"))
    n = sum(run(k, v, write) for k, v in RESCUE.items())
    print(f"\n복원 {n}장 / 포기 {len(UNSALVAGEABLE)}장")
    if not write:
        print("결과는 /tmp/fix/ 에 있다. 눈으로 보고 --write 로 확정할 것.")


if __name__ == "__main__":
    main()
