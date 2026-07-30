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
window.INSOONI_CONFIG = window.INSOONI_CONFIG || {};

if (!window.INSOONI_CONFIG.url) {
  window.INSOONI_CONFIG.url = "https://vxrazyiqvdwgvgpkkitm.supabase.co";
}
if (!window.INSOONI_CONFIG.anonKey) {
  window.INSOONI_CONFIG.anonKey = "sb_publishable_HSy_9JL7qeWLRMHt8OZ0dg_Owu_JwwP";
}
