# 실서버 권한 점검 — 공개 키(인터넷의 아무나와 같은 자격)로 insooni.com 의 Supabase 를 두드린다.
# 실행: playwright 파이썬으로 `python scripts/check_live_supabase.py`  (서버 띄울 필요 없음)
# 지우는 호출은 '없는 토큰'뿐이라 아무것도 지워지지 않는다. 운영 DB 에 쓰지 않는다.
#
# 왜 있나: 2026-10-01, 004 가 notes 표를 통째로 열어 두어 지우기 토큰이 공개 키로 읽혔다.
# SQL 이 스스로 낸 ✅ 표만 믿지 않고, 바깥에서 실제로 막히는지 두 번째로 확인한다.
import json, sys
from playwright.sync_api import sync_playwright
UA = "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/128 Safari/537.36"
JS = """async ([path, method, body]) => {
  const c = window.INSOONI_CONFIG;
  const r = await fetch(c.url + path, {method, headers: {apikey: c.anonKey, Authorization: 'Bearer ' + c.anonKey,
            'Content-Type': 'application/json'}, body: method === 'GET' ? undefined : JSON.stringify(body || {})});
  let j = null; try { j = await r.json(); } catch (e) {}
  const rows = Array.isArray(j) ? j : [];
  return {status: r.status, code: j && !Array.isArray(j) ? j.code : null, reason: j && j.reason,
          cols: rows.length ? Object.keys(rows[0]) : []};
}"""
R = []
def chk(n, ok, info): R.append((n, ok, info))
with sync_playwright() as p:
    br = p.chromium.launch(); pg = br.new_context(user_agent=UA).new_page()
    pg.goto("https://www.insooni.com/admin", wait_until="load"); pg.wait_for_timeout(800)
    c = lambda path, m="POST", b=None: pg.evaluate(JS, [path, m, b])
    for q, lbl in [("notes?select=*", "notes 통째"), ("notes?select=token", "notes.token"),
                   ("notes?select=ai_reason", "notes.ai_reason"), ("dreams?select=ai_reason", "dreams.ai_reason"),
                   ("letters?select=ai_verdict", "letters.ai_verdict"), ("posts?select=ai_verdict", "posts.ai_verdict"),
                   ("subscribers?select=*", "구독자 이메일"), ("rate_counter?select=*", "접속 기록"),
                   ("moderation_queue?select=*", "검수 대기열"), ("admins?select=*", "운영자 명단"),
                   ("moderation_log?select=*", "처리 기록")]:
        r = c("/rest/v1/" + q + "&limit=1", "GET"); chk("공개 키 → %s 거절" % lbl, r["status"] in (401, 403), r)
    for fn, b in [("admin_whoami", {}), ("admin_list", {"p_status": "pending", "p_limit": 1}),
                  ("admin_set_status", {"p_kind": "note", "p_id": 1, "p_status": "approved"}), ("is_admin", {})]:
        r = c("/rest/v1/rpc/" + fn, "POST", b); chk("공개 키 → %s 거절(함수는 있음)" % fn, r["status"] in (401, 403) and r["code"] == "42501", r)
    r = c("/rest/v1/rpc/withdraw_note", "POST", {"p_token": None}); chk("withdraw_note 있음 · 빈 토큰 → bad_token", r["status"] == 200 and r["reason"] == "bad_token", r)
    r = c("/rest/v1/rpc/withdraw_note", "POST", {"p_token": "00000000-0000-4000-8000-000000000000"}); chk("withdraw_note · 없는 토큰 → not_found", r["status"] == 200 and r["reason"] == "not_found", r)
    for v in ("public_notes", "notes_filled", "issue_notes", "public_issues", "sarangbang_state",
              "public_letters", "public_posts", "public_dreams", "public_cheers", "song_tally", "presets"):
        r = c("/rest/v1/%s?select=*&limit=1" % v, "GET"); chk("공개 뷰 %s 그대로·토큰 없음" % v, r["status"] == 200 and "token" not in r["cols"], r)
    r = c("/rest/v1/notes?select=id,status&status=neq.approved&limit=1", "GET")
    chk("검수 전 글은 안 보임", r["status"] == 200 and not r["cols"], r)
    # 팬 화면이 부르는 쓰기 함수가 살아 있는가. 권한이 빠지면 화면은 '서버 오류'만 띄우고 끝난다.
    # 입력 검사가 저장보다 앞에 있으므로 일부러 틀린 값을 보내면 행이 생기지 않는다(001·003·004·005).
    # 인자는 backend.js 가 보내는 것과 똑같이 전부 보낸다 — 하나라도 빠지면 PostgREST 가 함수를 못 찾는다(PGRST202).
    song = {"p_song_key": None, "p_song_title": None, "p_song_year": None, "p_name": None}
    for fn, b, want in [("submit_note",   dict(song, p_body=""), "empty"),
                        ("submit_preset", dict(song, p_chip=0),  "bad_chip"),
                        ("submit_dream",  {"p_name": None, "p_text": ""}, "empty"),
                        ("request_song",  {"p_title": ""}, "empty"),
                        ("subscribe",     {"p_email": "x"}, "bad_email"),
                        ("note_status",   {"p_token": None}, "bad_token"),
                        ("cancel_note",   {"p_token": None}, "bad_token")]:
        r = c("/rest/v1/rpc/" + fn, "POST", b)
        chk("팬 쓰기 함수 %s 살아 있음 · 틀린 입력 → %s" % (fn, want), r["status"] == 200 and r["reason"] == want, r)
    br.close()
f = 0
for n, ok, info in R:
    if not ok: f += 1
    print(("  ✓ " if ok else "  ✗ ") + n + ("" if ok else "   ← " + json.dumps(info, ensure_ascii=False)[:170]))
print("\n%d/%d 통과" % (len(R) - f, len(R)))
sys.exit(1 if f else 0)
