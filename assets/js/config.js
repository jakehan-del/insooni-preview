/* ============================================================
   INSOONI OFFICIAL · 백엔드 연결 설정
   ------------------------------------------------------------
   이 두 줄만 채우면 사랑방의 편지·응원·신청곡·구독이 실제로 동작합니다.
   채우기 전까지는 지금처럼 "이 기기에만 저장"으로 동작합니다 (사이트는 정상).

   Supabase 프로젝트 → Project Settings → API Keys 에서 가져옵니다.

   ── 두 개의 키를 반드시 구분하세요 ──

   Supabase가 키 이름을 바꿨습니다. 지금 화면에는 이렇게 보입니다.

     sb_publishable_...   ← 이것을 넣습니다  (예전 이름: anon / public)
                             브라우저가 쓰는 키. 공개되는 것이 정상입니다.
                             보안은 서버 쪽 규칙(RLS)이 담당합니다.

     sb_secret_...        ← 절대 넣지 마세요  (예전 이름: service_role)
                             모든 보안 규칙을 무시합니다. 이 키를 가진 사람은
                             구독자 이메일을 전부 읽고 지울 수 있습니다.
                             이 저장소는 공개이므로 넣는 순간 누구나 가져갑니다.

   두 글자만 다릅니다. publishable 인지 secret 인지 넣기 전에 꼭 확인하세요.
   실수로 secret 키를 노출했다면 대시보드에서 즉시 폐기(revoke)하고 새로 발급하세요.
   ============================================================ */
/* www.insooni.com 으로 들어오면 insooni.com 으로 옮긴다(2026-10-02).
   www 도 사이트를 그대로 보여 주는데, 브라우저에게 둘은 다른 사이트라 로그인·쓰던 글·카카오 로그인
   검증값이 따로 저장된다. 그래서 www 에서 카카오 로그인을 하면 돌아올 때 insooni.com 첫 화면에 떨어지고
   다시 로그인하라고 했다(형님 실측). 주소 하나로 모은다. */
if (location.hostname === "www.insooni.com") {
  location.replace("https://insooni.com" + location.pathname + location.search + location.hash);
}
window.INSOONI_CONFIG = window.INSOONI_CONFIG || {};

/* 이미 정해진 값이 있으면 손대지 않는다.
   '있다'의 기준은 undefined 인지 아닌지다 — 빈 문자열은 '값 없음'이 아니라
   "일부러 비워 둔 것"으로 본다. 자동 검사가 백엔드를 끄려고 빈 문자열을
   넣어 두는데, 이걸 falsy로 판단해 실제 키로 덮어쓰면 검사가 운영 DB에
   글을 쓰게 된다. 실제로 그런 적이 있어 기준을 바꿨다. */
if (typeof window.INSOONI_CONFIG.url === "undefined") {
  window.INSOONI_CONFIG.url = "https://vxrazyiqvdwgvgpkkitm.supabase.co";
}
if (typeof window.INSOONI_CONFIG.anonKey === "undefined") {
  window.INSOONI_CONFIG.anonKey = "sb_publishable_HSy_9JL7qeWLRMHt8OZ0dg_Owu_JwwP";
}

/* 회원 게시판(supabase/010) 스위치 — 010 을 운영 DB 에 실행하고 실서버에서 확인한 뒤 true 로 바꾼다.
   꺼져 있는 동안 게시판 섹션은 숨고 서버에 아무것도 묻지 않는다.
   왜 자동 감지가 아니라 스위치인가 — 없는 함수를 부르면 PostgREST 가 404 를 주고, 그 404 가
   모든 방문자의 콘솔과 사이트 회귀 검사(verify.py)에 오류로 남는다. 그리고 검증 전에 기능이
   공개되지 않게 막는 문이기도 하다.
   2026-10-02 켬 — 010 운영 적용(공개 키로 board_list·cafe_info 200, 새 표 7개 잠김, 라이브 점검 36/36)과
   카카오·돌아올 주소 설정을 확인한 뒤. */
if (typeof window.INSOONI_CONFIG.board === "undefined") {
  window.INSOONI_CONFIG.board = true;
}

/* 카카오 로그인 단추 스위치 — 2026-10-02 KOE205 사고에서 나왔다.
   Supabase 에서 카카오를 켜 두면 서버(settings)는 '된다'고 답한다. 그런데 카카오 개발자 콘솔의
   동의항목(이메일·프로필 사진)이 비어 있으면 카카오 화면에서 KOE205 로 막혀 돌아오지 못한다 —
   서버의 '켜짐'은 실제 왕복이 된다는 증거가 아니다. 그래서 형님이 본인 카카오 계정으로
   카카오톡 인앱 1회 · 아이폰 사파리 1회 끝까지 왕복해 본 뒤에만 true 로 바꾼다.
   false 인 동안 회원 창에는 이메일만 보인다(서버가 카카오를 켜 둬도).
   2026-10-02 밤: 형님 폰 한 대로 가입이 된 뒤 true 로 켰으나(f66cba1) 'KOE205 오류도 나와' 재보고 —
   GoTrue 는 account_email·profile_image·profile_nickname 셋을 늘 요청하므로 동의항목 셋이 모두 있어야 한다.
   그 뒤 형님이 비즈 앱 전환 → 동의항목 셋(닉네임 필수·프로필 사진 선택·이메일 선택)을 채웠고,
   KOE006(리다이렉트 URI 가 다른 키에 있었다)까지 고친 다음 형님 카카오 계정으로 왕복이 끝까지 됐다
   (Supabase auth 로그 10/02 18:31:44 /callback login provider=kakao → /token). 그래서 true.
   다시 KOE 가 보고되면 false 로 돌리고 원인을 찾는다. */
if (typeof window.INSOONI_CONFIG.kakao === "undefined") {
  window.INSOONI_CONFIG.kakao = true;
}

/* 공연 모드(supabase/011) 스위치 — 공연 화면(/live)과 사랑방의 '오늘 공연' 줄.
   011 을 운영에 실행하고 ✅ 를 확인한 뒤 true. 꺼져 있으면 공연 관련 서버 함수를 부르지 않는다
   (없는 함수를 부르면 PostgREST 404 가 모든 방문자의 콘솔에 남는다 — board 스위치와 같은 이유).
   2026-10-03 08:16 형님이 011+012 를 운영에 실행 → 공개 키로 gig_event('5UYX8') ok · 새 표 6개 잠김 · rate_ok/req_ip_hash 막힘 확인 → true. */
if (typeof window.INSOONI_CONFIG.live === "undefined") {
  window.INSOONI_CONFIG.live = true;
}

/* 공연장에서 연 회원 창에 이메일 '처음 가입'을 보일지. 이메일 가입은 확인 메일 왕복이 필요하고
   Supabase 기본 메일은 시간당 몇 통뿐이라 객석에서는 사실상 막힌다 — 카카오만 권한다.
   이메일 로그인(이미 가입한 분)은 늘 남는다. 커스텀 SMTP 를 붙인 뒤 true 로 바꿀 수 있다. */
if (typeof window.INSOONI_CONFIG.liveEmail === "undefined") {
  window.INSOONI_CONFIG.liveEmail = false;
}

/* 마이페이지의 서버 칸(supabase/013) 스위치 — 내 댓글 모아 보기 · 좋아하는 노래(가입 질문 포함) · 운영 화면의 '내 노래'.
   013 을 운영에 실행하고 ✅ 를 확인한 뒤 true. 꺼져 있어도 마이페이지(community.html#me)는 열린다 —
   010 에 이미 있는 것(별명·등급·내가 쓴 글·별명 바꾸기·로그아웃·탈퇴)과 011 의 도장만 보이고,
   013 칸은 '준비하고 있습니다' 한 줄로 정직하게 비운다. 없는 함수를 부르지 않는다(404 가 방문자 콘솔에 남는다).
   2026-10-03 형님이 013 을 운영에 실행 → member_page·member_my_posts 등 존재(익명 401)·새 표 잠김 확인 → true. */
if (typeof window.INSOONI_CONFIG.mypage === "undefined") {
  window.INSOONI_CONFIG.mypage = true;
}

/* 이메일 소식지 폼 — 보낼 도구(발송 서비스)가 없는 동안은 숨긴다. 신청만 받고 보내지 못하면 거짓 약속이 된다. */
if (typeof window.INSOONI_CONFIG.newsletter === "undefined") {
  window.INSOONI_CONFIG.newsletter = false;
}
