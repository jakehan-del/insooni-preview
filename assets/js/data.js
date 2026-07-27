/* ============================================================
   INSOONI 공식 팬 플랫폼, 콘텐츠 데이터 (프로토타입)
   ------------------------------------------------------------
   ◆ 이 파일이 곧 'CMS' 역할을 합니다.
     실제 서비스에서는 관리자 페이지에서 등록한 내용이
     API로 내려오며, 프로토타입에서는 이 파일만 고치면
     사이트 전체(홈/소식/일정/아카이브)에 반영됩니다.
   ◆ 연혁·디스코그래피는 위키백과 + 언론 보도(경향신문,
     뉴시스, 미주중앙일보 등) + 음원 사이트(벅스, Apple Music)
     교차 확인을 거친 항목만 검증으로 표기했습니다.
     [공식 확인 필요] 항목은 소속사 검수 후 확정합니다.
   ============================================================ */
window.SITE_DATA = {

  /* ---------- 시각 아카이브 (실사진 확보 시 추가) ---------- */
  archive: [
    { img: "assets/img/hero.jpg", w: 1280, h: 720, year: "2025", cat: "무대", caption: "'그래도 꿈은 흐른다' MV, 합창단과 함께" },
    { img: "assets/img/story.jpg", w: 720, h: 720, year: "2025", cat: "포트레이트", caption: "'그래도 꿈은 흐른다' 세션 스틸" },
    { img: "assets/img/thumbs/busking.jpg", w: 1280, h: 720, year: "2025", cat: "무대", caption: "성수동 버스킹, 거리의 첫 무대" },
    { img: "assets/img/thumbs/bnd.jpg", w: 1280, h: 720, year: "2025", cat: "비하인드", caption: "BOYNEXTDOOR와 백스테이지에서" },
    { img: "assets/img/thumbs/callme.jpg", w: 1280, h: 720, year: "2025", cat: "무대", caption: "'콜미' 커버 세션" },
    { img: "assets/img/stills/s6.jpg", w: 1280, h: 720, year: "2025", cat: "포트레이트", caption: "'그래도 꿈은 흐른다' MV, 하늘을 향해" },
    { img: "assets/img/stills/s5.jpg", w: 1280, h: 720, year: "2025", cat: "무대", caption: "스포트라이트 아래, 두 팔을 펴며" },
    { img: "assets/img/stills/s2.jpg", w: 1280, h: 720, year: "2025", cat: "포트레이트", caption: "'그래도 꿈은 흐른다' MV 프로필" },
    { img: "assets/img/stills/s7.jpg", w: 1280, h: 720, year: "2025", cat: "무대", caption: "합창단과 함께한 클라이맥스" },
    { img: "assets/img/stills/s4.jpg", w: 1280, h: 720, year: "2025", cat: "포트레이트", caption: "노래에 잠긴 순간" },
    { img: "assets/img/stills/s8.jpg", w: 1280, h: 720, year: "2025", cat: "무대", caption: "어둠 속 한 줄기 빛, 무대 위의 사람" },
    { placeholder: true, cat: "무대", caption: "공연 실사진 [자료 확보 예정]" },
    { placeholder: true, cat: "포트레이트", caption: "공식 화보 [자료 확보 예정]" }
  ],

  /* ---------- 현재 스포트라이트 (관리자 교체 영역) ---------- */
  spotlight: {
    label: "New Release",
    title: "그래도 꿈은 흐른다",
    date: "2025.11.28",
    desc: "겨울에 발표한 신곡. 반세기의 무대를 지나, 여전히 꿈을 노래합니다.",
    linkText: "뮤직비디오 보기",
    videoId: "6joBf4xW6Qs",
    image: "assets/img/stills/s6.jpg"
  },

  /* ---------- 소식 (type: 공지 | 공연 | 방송 | 보도) ---------- */
  news: [
    {
      type: "공지",
      title: "인순이 공식 팬 플랫폼이 문을 열었습니다",
      excerpt: "음악 아카이브, 공연 소식, 사랑방까지, 모든 공식 소식이 이곳에서 시작됩니다.",
      date: "2026-08-01"
    },
    {
      type: "공연",
      title: "[샘플] 단독 콘서트 서울 공연 예매 안내",
      excerpt: "예매 일정과 좌석 안내를 확인하세요. 팬클럽 회원 선예매는 협의 후 안내됩니다. [실제 공연 확인 필요]",
      date: "2026-08-20"
    },
    {
      type: "방송",
      title: "TV조선 '조선의 사랑꾼' 출연 중",
      excerpt: "2026년 3월부터 고정 출연 중입니다. 방송 시간과 다시보기 안내는 추후 게시됩니다. [편성 정보 확인 필요]",
      date: "2026-08-12"
    },
    {
      type: "보도",
      title: "[샘플] 새 싱글 '그래도 꿈은 흐른다' 소식",
      excerpt: "꿈을 노래해 온 여정이 이어집니다. 음원 사이트에서 감상하실 수 있습니다.",
      date: "2026-08-05"
    },
    {
      type: "공지",
      title: "사랑방 이용 안내: 서로를 존중하는 공간을 위해",
      excerpt: "따뜻한 소통을 위한 커뮤니티 약속과 게시물 운영 원칙을 안내드립니다.",
      date: "2026-08-02"
    }
  ],

  /* ---------- 일정 (kind: 공연 | 방송 | 행사) ---------- */
  events: [
    {
      date: "2026-08-29",
      kind: "공연",
      title: "[샘플] 단독 콘서트, 서울",
      place: "서울 ○○아트홀 [실제 공연장 확인 필요]",
      note: "예매처: 공식 예매 링크로 연결",
      link: "#"
    },
    {
      date: "2026-08-15",
      kind: "행사",
      status: "soon", title: "[샘플] 광복절 기념 축하 무대",
      place: "장소 미정 [확인 필요]",
      link: "#"
    },
    {
      date: "2026-09-12",
      kind: "공연",
      title: "[샘플] 지역 초청 공연, 부산",
      place: "부산 ○○문화회관 [확인 필요]",
      link: "#"
    },
    {
      date: "2026-08-07",
      kind: "방송", status: "broadcast",
      title: "TV조선 '조선의 사랑꾼' [방영 요일·시간 확인 필요]",
      place: "TV조선",
      link: "#"
    }
  ],

  /* ---------- 무대 영상 (공식 유튜브 @insooni8081 실제 영상 · 2026.7 RSS 확인) ---------- */
  videos: [
    { title: "그래도 꿈은 흐른다", desc: "2025년 겨울에 발표한 신곡 공식 뮤직비디오. 여전히 꿈을 노래합니다.", year: "2025", youtubeId: "6joBf4xW6Qs", thumb: "assets/img/thumbs/mv.jpg" },
    { title: "성수동 버스킹", desc: "첫 성수동 거리 무대. '바보 멍청이 똥개' 최초 공개 현장.", year: "2025", youtubeId: "AHGXsBvkVVI", thumb: "assets/img/thumbs/busking.jpg" },
    { title: "BOYNEXTDOOR와 함께", desc: "'바보 멍청이 똥개' 세대를 넘은 컬래버 무대.", year: "2025", youtubeId: "neUVzSyKCn8", thumb: "assets/img/thumbs/bnd.jpg" },
    { title: "콜미 (CALL ME) 커버", desc: "코요태 신곡을 인순이 스타일로. 조회수가 증명한 커버.", year: "2025", youtubeId: "9wwtxL2TLJQ", thumb: "assets/img/thumbs/callme.jpg" },
    { title: "거위의 꿈", desc: "1997년 카니발 원곡을 2007년 리메이크해 세대를 넘어 위로가 된 노래.", year: "2007", youtubeId: null },
    { title: "밤이면 밤마다", desc: "1983년 발표, 인순이표 에너지의 원점이 된 히트곡.", year: "1983", youtubeId: null },
    { title: "아버지", desc: "2009년 발표, 라디오 방송횟수 주간 1위를 기록한 곡.", year: "2009", youtubeId: null }
  ],

  /* ---------- 디스코그래피 (검증된 주요 발표작) ---------- */
  albums: [
    { featured: true, art: "assets/img/stills/s8.jpg", year: "1978", title: "희자매 1집", kind: "그룹", note: "타이틀곡 '실버들'로 TBC 가요차트 7주 연속 1위 데뷔.",
      tracks: ["실버들", "우리는 사랑해요", "이제는 모두 잊어요", "앵두", "말도 안돼", "아리랑 내님아", "어찌합니까", "달무리", "사랑만은 않겠어요", "오동잎"],
      credits: "'실버들' — 작사 김소월(시) · 작곡·편곡 안치행 · 1978 힛트레코드 (희자매: 김인순·김재희·이영숙)",
      links: [
        { label: "벅스", url: "https://music.bugs.co.kr/album/119626" },
        { label: "Spotify('실버들')", url: "https://open.spotify.com/track/6TufjMtsLO7W8tilip8BMr" }
      ] },
    { year: "1980", title: "인연 (Fate)", kind: "솔로 1집", note: "솔로 가수 인순이의 첫걸음.",
      tracks: ["인연", "웃어주세요", "재수생", "풍문으로 들었어", "정말로 모르시나", "조용한 이별", "차표한장 (One Way Ticket)", "춤을 춰요 (I Was Made For Dancing)", "꿈이였나봐", "복돌이", "내마음 흔들려", "빨간 마후라"],
      credits: "1980년 10월 현대음향 발매. 곡별 작사·작곡 크레딧은 공식 자료 확인 후 추가됩니다. [자료 필요]",
      links: [] },
    { featured: true, art: "assets/img/stills/s7.jpg", year: "1983", title: "밤이면 밤마다", kind: "대표곡", note: "디바의 시대를 연 폭발적 히트곡. 독집 제4집 수록.",
      tracks: ["밤이면 밤마다", "슬픈 아침", "한밤중", "내 고향집", "왜 나를 떠나셨나요", "손모아 마음모아", "욕망", "하늘 날고파라", "그리운 내사랑아", "다른 사람 말처럼 들리네", "고독", "고독 (경음악)"],
      credits: "'밤이면 밤마다' — 작사·작곡·편곡 김정택 · 1983 독집 제4집. 이 곡의 히트로 1984 KBS 7대가수상 수상.",
      links: [
        { label: "멜론(곡)", url: "https://www.melon.com/song/detail.htm?songId=60847" },
        { label: "벅스(곡)", url: "https://music.bugs.co.kr/track/1005869" }
      ] },
    { year: "1996", title: "The Queen Of Soul", kind: "정규 11집", note: "'또' 수록. 소울의 여왕이라는 이름을 새긴 앨범.",
      tracks: ["또", "이별연습", "밀애", "너의 곁에 나", "이별을 준비할꺼야", "그대가 말하는 사랑", "혼자가 아닌 나", "White Christmas For You"],
      credits: "'또'·'밀애'·'그대가 말하는 사랑' — 작사·작곡 박진영 · '이별연습'·'이별을 준비할꺼야' — 작사·작곡 김형석 · '너의 곁에 나' — 작사 노영심, 작곡 김형석 · 1996년 5월 세원음반",
      links: [
        { label: "벅스", url: "https://music.bugs.co.kr/album/4690" },
        { label: "Spotify", url: "https://open.spotify.com/album/7odz1LsIS2ltX2tQZe41Q7" }
      ] },
    { year: "2004", title: "A To Z", kind: "정규 16집", note: "'친구여'(feat. 조PD) 수록. 2004년 9월 9일 발매.",
      tracks: ["Tonight", "Higher", "웃고 있지만", "My Life", "연가", "여정", "Swing My Baby", "연인", "여자이니까", "잠깐", "첫사랑", "비에 스친 날들", "친구여 (feat. 조PD)", "비상"],
      credits: "'친구여' — 작사 조PD, 작곡·편곡 박근태 · 타이틀곡 'Tonight' — 작사 김민지, 작곡 박해운, 편곡 한태수 · 프로듀서 김도형",
      links: [
        { label: "멜론", url: "https://www.melon.com/album/detail.htm?albumId=35502" },
        { label: "벅스", url: "https://music.bugs.co.kr/album/35502" },
        { label: "Spotify", url: "https://open.spotify.com/album/7hdxullH6yeBjneaZ9rRDD" },
        { label: "Apple Music", url: "https://music.apple.com/kr/album/16th-a-to-z/1269489854" }
      ] },
    { featured: true, art: "assets/img/stills/s5.jpg", year: "2007", title: "거위의 꿈", kind: "대표곡", note: "카니발 원곡(1997) 리메이크. 위로의 상징이 된 노래.",
      tracks: ["거위의 꿈 (Original)", "거위의 꿈 (Inst.)", "거위의 꿈 (Radio Edit)", "거위의 꿈 (Director's Edit)", "하늘이여...제발 (주몽 OST)"],
      credits: "작사 이적 · 작곡 김동률 (원곡 카니발, 1997) · 2007. 1. 22. 디지털 싱글, 2007. 2. 1. 디지털 음반 《거위의 꿈, 꿈을 꾸는 모든 이들에게》",
      links: [
        { label: "멜론", url: "https://www.melon.com/album/detail.htm?albumId=342766" },
        { label: "지니", url: "https://www.genie.co.kr/detail/albumInfo?axnm=79967223" },
        { label: "Spotify", url: "https://open.spotify.com/album/7t69eXfrQb8fY51q8EvMQe" },
        { label: "Apple Music", url: "https://music.apple.com/kr/album/gooses-dream-to-all-dreamers-ep/1423480473" }
      ] },
    { year: "2009", title: "인순이 (17집)", kind: "정규", note: "타이틀곡 'Fantasia', '아버지' 수록. 데뷔 31주년 기념작.",
      tracks: ["Fantasia", "Cry", "향수", "아버지", "기회", "일어나", "뿌리 (Prologue)", "나무", "딸에게", "사랑가", "Merry Merry", "Fantasia (Inst.)"],
      credits: "'아버지' — 작사·작곡·편곡 이현승 · 'Fantasia' — 작사 나비, 작곡·편곡 이현승 · '향수' — 시 정지용, 작곡 김희갑 · 총괄 프로듀서 이현승 · 2009. 5. 8. 발매",
      links: [
        { label: "멜론", url: "https://www.melon.com/album/detail.htm?albumId=557957" },
        { label: "벅스", url: "https://music.bugs.co.kr/album/183804" },
        { label: "지니", url: "https://www.genie.co.kr/detail/albumInfo?axnm=77740353" },
        { label: "Spotify", url: "https://open.spotify.com/album/2fdeLt66Qis4rWCYxWI8ro" },
        { label: "Apple Music", url: "https://music.apple.com/kr/album/insooni/1641834078" }
      ] },
    { featured: true, art: "assets/img/stills/s4.jpg", year: "2023", title: "One Last Time", kind: "골든걸스", note: "KBS2 '골든걸스' 프로젝트 그룹 데뷔곡 (박진영 프로듀싱).",
      tracks: ["One Last Time"],
      credits: "작사 박진영 'The Asiansoul' · 작곡 박진영, Deza · 편곡 박진영, 이해솔 · 제작 ZEMMIX C&B · 유통 워너뮤직코리아 · 2023. 12. 1. 디지털 싱글 (인순이·박미경·신효범·이은미)",
      links: [
        { label: "멜론", url: "https://www.melon.com/album/detail.htm?albumId=11376398" },
        { label: "벅스", url: "https://music.bugs.co.kr/album/4093691" },
        { label: "지니", url: "https://www.genie.co.kr/detail/albumInfo?axnm=84552822" },
        { label: "Apple Music", url: "https://music.apple.com/kr/album/one-last-time-single/1719039298" },
        { label: "Spotify", url: "https://open.spotify.com/track/0OYq4lcsCvC3aVWVt3lFTK" }
      ] },
    { featured: true, art: "assets/img/stills/s6.jpg", year: "2025", title: "인순이, 아름다운 우리나라", kind: "앨범", note: "2025년 2월 발매, 9곡 수록.",
      tracks: ["광주 광주", "밤이면 밤마다", "아름다운 우리나라", "야속한 내 님", "흔들리는 갈대", "너와 나", "욕망", "이별의 눈동자", "길섶에 핀 꽃"],
      credits: "정규 9곡 · 2025. 2. 19. 발매 · 기획 탑뮤직 · 유통 RIAK · 타이틀곡 '아름다운 우리나라'(원곡 1984, 작사·작곡 박인호). 곡별 세부 크레딧은 공식 자료 확인 후 추가됩니다.",
      links: [
        { label: "벅스", url: "https://music.bugs.co.kr/album/20705354" },
        { label: "지니", url: "https://www.genie.co.kr/detail/albumInfo?axnm=85993266" },
        { label: "Apple Music", url: "https://music.apple.com/kr/album/%EC%9D%B8%EC%88%9C%EC%9D%B4-%EC%95%84%EB%A6%84%EB%8B%A4%EC%9A%B4-%EC%9A%B0%EB%A6%AC%EB%82%98%EB%9D%BC/1797462838" },
        { label: "Spotify", url: "https://open.spotify.com/album/5ErPwrIgz4dd8y6wEhXnwU" }
      ] },
    { year: "2025", title: "그래도 꿈은 흐른다", kind: "싱글", note: "2025년 11월 발매. 여전히 꿈을 노래합니다.",
      tracks: ["그래도 꿈은 흐른다"],
      credits: "작사 Ashbun, 인순이 · 작곡 Ashbun · 편곡·프로듀싱 Ethan · 코프로듀싱 박세인 · 보컬 디렉팅 이현승 · 믹싱·마스터링 김석민 · 기획 주식회사 소솝 · 유통 NHN벅스 · 2025. 11. 28. 싱글",
      links: [
        { label: "멜론", url: "https://www.melon.com/album/detail.htm?albumId=12411745" },
        { label: "벅스", url: "https://music.bugs.co.kr/album/4134490" },
        { label: "지니", url: "https://www.genie.co.kr/detail/albumInfo?axnm=86987698" },
        { label: "Apple Music", url: "https://music.apple.com/kr/album/dream-single/1856589303" },
        { label: "공식 MV", url: "https://www.youtube.com/watch?v=6joBf4xW6Qs" }
      ] },
    { year: "예정", title: "전체 디스코그래피", kind: "준비 중", note: "정규 14장 포함 총 19장(영문 위키 기준). 전체 목록은 공식 자료 검수 후 시대별로 정리됩니다. [공식 확인 필요]" }
  ],

  /* ---------- 연혁 타임라인 (milestone: 굵은 표시 / 검증 완료 항목 중심) ---------- */
  timeline: [
    { year: "1957", event: "4월 5일 출생 (본명 김인순)", note: "" },
    { year: "1978", event: "걸그룹 '희자매'로 데뷔", note: "타이틀곡 '실버들' TBC 가요차트 7주 1위", milestone: true },
    { year: "1980", event: "솔로 1집 《인연》으로 홀로서기", note: "" },
    { year: "1983", event: "'밤이면 밤마다' 발표", note: "디바의 시대 개막", milestone: true },
    { year: "1996", event: "《The Queen Of Soul》 발매", note: "'또'(박진영 곡) 수록, 정규 11집" },
    { year: "1999", event: "뉴욕 카네기홀 첫 공연", note: "조용필·패티김에 이은 한국 대중가수 카네기홀 무대", milestone: true },
    { year: "2004", event: "'친구여' (조PD 피처링) 히트", note: "정규 16집 《A To Z》 수록 (2004. 9. 9. 발매)" },
    { year: "2007", event: "'거위의 꿈' 발표", note: "위로와 도전의 아이콘이 되다", milestone: true },
    { year: "2009", event: "'아버지' 발표", note: "정규 17집 《인순이》 수록 (작사·작곡 이현승)" },
    { year: "2010", event: "카네기홀 두 번째 단독 콘서트", note: "2월, 아이작 스턴홀" },
    { year: "2012", event: "사단법인 '인순이와 좋은 사람들' 설립", note: "10월" },
    { year: "2013", event: "다문화 대안학교 '해밀학교' 개교", note: "강원 홍천, 3월. 무대 밖의 또 다른 무대", milestone: true },
    { year: "2023", event: "KBS2 '골든걸스' 출연, 'One Last Time' 발표", note: "인순이·박미경·신효범·이은미, KBS 연예대상 신인상 수상", milestone: true },
    { year: "2025", event: "《인순이, 아름다운 우리나라》 발매", note: "2월, 9곡 수록" },
    { year: "2025", event: "펄벅 인터내셔널 '올해의 여성상' 수상", note: "Woman of Influence 2025 (공식 채널 영상 확인)" },
    { year: "2026", event: "데뷔 48주년, 그리고 계속되는 이야기", note: "새로운 기록이 이곳에 쌓입니다" }
  ],

  /* ---------- 사랑방 샘플 콘텐츠 ---------- */
  sampleLetters: [
    { name: "30년 팬 순이언니", date: "2026. 8. 3.", body: "힘들 때마다 거위의 꿈을 들으며 버텼어요. 늘 건강하게 오래오래 노래해 주세요." },
    { name: "막내팬", date: "2026. 8. 2.", body: "골든걸스 보고 팬이 됐어요. 엄마와 함께 다음 콘서트 꼭 갈게요!" }
  ],
  samplePosts: [
    {
      id: "s1", artist: true, name: "인순이",
      date: "[게시 예정]", likes: 0,
      body: "이 자리는 인순이 님이 직접 남기는 글이 표시되는 예시입니다. [공식 콘텐츠 필요]"
    },
    {
      id: "s2", name: "순이바라기", date: "2026. 8. 3.", likes: 41,
      body: "1999년 카네기홀 공연 기사를 아직 스크랩해 두고 있어요. 아카이브에 올리는 날을 기다립니다!"
    },
    {
      id: "s3", name: "홍천 주민", date: "2026. 8. 1.", likes: 27,
      body: "해밀학교 근처에 살아요. 아이들 웃음소리가 참 좋습니다. 이사장 선생님 응원합니다."
    }
  ],

  /* ---------- 이달의 투표 ---------- */
  poll: {
    id: "poll-2026-08",
    question: "다음 콘서트에서 꼭 듣고 싶은 노래는?",
    options: [
      { label: "거위의 꿈", base: 128 },
      { label: "밤이면 밤마다", base: 97 },
      { label: "친구여", base: 64 },
      { label: "아버지", base: 52 }
    ]
  }
};
