#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Supabase 프로젝트가 잠들지 않게 매일 한 번 깨운다.

무료 플랜은 7일 동안 아무 요청이 없으면 프로젝트를 정지시킨다.
정지되면 사랑방의 줄기·한 줄 남기기가 전부 멈추고, 형님이 대시보드에서
직접 깨워야 다시 돈다.

방문자가 있으면 저절로 유지되지만, 방문이 없는 주가 한 번만 와도 멈춘다.
그래서 하루 한 번 **공개키로 공개 뷰 하나를 읽는다.** 비밀키가 필요 없고,
읽기뿐이라 아무것도 바꾸지 않는다.

검수 도우미(ai_moderate.py)에 맡기지 않는 이유 — 그쪽은 AI 키가 없으면
DB를 건드리기 전에 끝난다. 깨우는 일이 다른 설정에 인질로 잡히면 안 된다.
"""
import json, os, sys, urllib.request, urllib.error

URL = "https://vxrazyiqvdwgvgpkkitm.supabase.co"
# 공개키다. 브라우저에도 그대로 들어 있고, 공개되는 것이 정상이다.
KEY = os.environ.get("SUPABASE_PUBLISHABLE_KEY",
                     "sb_publishable_HSy_9JL7qeWLRMHt8OZ0dg_Owu_JwwP")


def main():
    req = urllib.request.Request(
        URL + "/rest/v1/notes_filled?select=songs",
        headers={"apikey": KEY, "Authorization": "Bearer " + KEY})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            body = r.read().decode()
        print("깨움 — HTTP 200 ·", body.strip()[:80])
        return 0
    except urllib.error.HTTPError as e:
        print("깨우지 못했습니다 — HTTP", e.code)
        return 1
    except Exception as e:
        print("깨우지 못했습니다 —", type(e).__name__)
        return 1


if __name__ == "__main__":
    sys.exit(main())
