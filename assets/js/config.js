/* ============================================================
   INSOONI OFFICIAL · 백엔드 연결 설정
   ------------------------------------------------------------
   이 두 줄만 채우면 사랑방의 편지·응원·신청곡·구독이 실제로 동작합니다.
   채우기 전까지는 지금처럼 "이 기기에만 저장"으로 동작합니다 (사이트는 정상).

   값을 어디서 가져오는지: supabase/설정안내.md 참고
     Supabase 프로젝트 → Settings → API 에서
       url     = Project URL
       anonKey = Project API keys 의 anon / public 키

   ── 반드시 지켜 주세요 ──
   anon 키는 웹사이트가 브라우저에서 쓰는 키라 공개되는 것이 정상입니다.
   보안은 서버 쪽 규칙(RLS)이 담당합니다.

   그러나 service_role 키는 절대, 어떤 경우에도 이 파일에 넣지 마세요.
   그 키는 모든 규칙을 무시하고 구독자 이메일까지 전부 읽고 지울 수 있습니다.
   이 저장소는 공개이므로, 넣는 순간 누구나 가져갈 수 있습니다.
   ============================================================ */
/* 이미 설정된 값이 있으면 덮어쓰지 않는다.
   (스테이징에서 다른 프로젝트를 가리키게 하거나, 이 파일을 건드리지 않고
    앞선 스크립트에서 주입하는 경우를 위해) */
window.INSOONI_CONFIG = window.INSOONI_CONFIG || {};

if (!window.INSOONI_CONFIG.url) {
  window.INSOONI_CONFIG.url = "https://vxrazyiqvdwgvgpkkitm.supabase.co";
}
if (!window.INSOONI_CONFIG.anonKey) {
  window.INSOONI_CONFIG.anonKey = "";    // 예: "eyJhbGciOi..." (anon / public 키)
}
