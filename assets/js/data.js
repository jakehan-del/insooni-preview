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
    { img: "assets/img/story.jpg", w: 720, h: 720, year: "2025", cat: "포트레이트", caption: "'그래도 꿈은 흐른다' 세션 스틸" },
    { img: "assets/img/photos/insooni007.jpg", w: 1064, h: 1600, year: "", cat: "무대", caption: "황금빛 조명 기둥 아래에서" },
    { img: "assets/img/photos/press-1723.jpg", w: 500, h: 333, year: "", cat: "무대", caption: "흰 모자와 베일, 순백의 퍼포먼스" },
    { img: "assets/img/photos/press-2019.jpg", w: 640, h: 960, year: "", cat: "무대", caption: "푸른 안개 속 흰 레이스 드레스" },
    { img: "assets/img/photos/hinkchi1.jpg", w: 1067, h: 1600, year: "", cat: "화보", caption: "오버사이즈 수트 스튜디오 화보" },
    { img: "assets/img/photos/press-105959.jpg", w: 610, h: 636, year: "1970년대", cat: "자켓", caption: "희자매 3집 LP" },
    { img: "assets/img/photos/album02.jpg", w: 1200, h: 1200, year: "", cat: "자켓", caption: "LP 자켓 아카이브" },
    { img: "assets/img/photos/album07.jpg", w: 595, h: 595, year: "", cat: "자켓", caption: "《에레나라 불리운 여인》" },
    { img: "assets/img/photos/album09.jpg", w: 595, h: 597, year: "", cat: "자켓", caption: "《Turning Point》" },
    { img: "assets/img/photos/album10.jpg", w: 595, h: 596, year: "", cat: "자켓", caption: "《여자》" },
    { img: "assets/img/photos/album13.jpg", w: 779, h: 785, year: "", cat: "자켓", caption: "《Future & Memories》" },
    { img: "assets/img/photos/album15.jpg", w: 512, h: 512, year: "", cat: "자켓", caption: "《My Turn》" },
    { img: "assets/img/photos/jazz-album.jpg", w: 620, h: 626, year: "", cat: "자켓", caption: "《Insooni Jazz》" },
    { img: "assets/img/photos/press-35024303.jpg", w: 510, h: 510, year: "", cat: "자켓", caption: "디지털 싱글 '어퍼컷' 커버" },
    { img: "assets/img/photos/press-149006.jpg", w: 708, h: 698, year: "", cat: "자켓", caption: "스페셜 싱글 'Can You Feel It' 커버" },
    { img: "assets/img/photos/haemill-2013.jpg", w: 1024, h: 681, year: "2013", cat: "기록", caption: "해밀학교 교사 앞, 학생들과 하트" },
    { img: "assets/img/photos/haemill-hanbok.jpg", w: 600, h: 458, year: "", cat: "기록", caption: "해밀학교, 한복 입은 졸업생들과" },
    { img: "assets/img/photos/haemill-class.jpg", w: 600, h: 400, year: "", cat: "기록", caption: "해밀학교 교실에서 학생들과" },
    { img: "assets/img/photos/haemill-halloween.jpg", w: 600, h: 400, year: "", cat: "기록", caption: "해밀학교 한옥 교정의 핼러윈 파티" },
    { img: "assets/img/photos/haemill-wall.jpg", w: 450, h: 658, year: "", cat: "기록", caption: "건축 후원자의 이름이 새겨진 해밀학교 나무 벽 앞에서" },
    { img: "assets/img/photos/haemill-library.jpg", w: 650, h: 364, year: "", cat: "기록", caption: "해밀학교 서가 계단에서 학생들과" },
    { img: "assets/img/stills/s5.jpg", w: 1280, h: 720, year: "2025", cat: "무대", caption: "스포트라이트 아래, 두 팔을 펴며" },
    { img: "assets/img/stills/s2.jpg", w: 1280, h: 720, year: "2025", cat: "포트레이트", caption: "'그래도 꿈은 흐른다' MV 프로필" },
    { img: "assets/img/stills/s7.jpg", w: 1280, h: 720, year: "2025", cat: "무대", caption: "합창단과 함께한 클라이맥스" },
    { img: "assets/img/stills/s4.jpg", w: 1280, h: 720, year: "2025", cat: "포트레이트", caption: "노래에 잠긴 순간" },
    { img: "assets/img/stills/s8.jpg", w: 1280, h: 720, year: "2025", cat: "무대", caption: "어둠 속 한 줄기 빛, 무대 위의 사람" },
    { img: "assets/img/photos/portrait-bw.jpg", w: 1067, h: 1600, year: "", cat: "화보", caption: "흑백 터틀넥 화보" },
  ],

  /* ---------- 지난 무대 리캡 (VIEW RECAP: 사진 갤러리 + 영상) ----------
     · 공연명은 사진·영상 안에서 검증된 것만 표기 (로고·현수막 등)
     · 미확인 무대는 중립적 제목 + "확인 중" 표기로만 묶는다 */
  recaps: [
    {
      date: "2025. 2. 16.", year: "2025",
      title: "한터뮤직어워즈",
      en: { title: "Hanteo Music Awards", place: "Jangchung Arena, Seoul", desc: "A night at the Hanteo Music Awards. Trophy, flowers, and a green-dress stage greeting, captured by family." },
      place: "장충체육관",
      desc: "한터뮤직어워즈의 밤. 트로피와 꽃다발, 초록 드레스의 무대 인사까지 — 가족의 카메라로 남긴 기록.",
      bg: "assets/img/photos/hanteo-1.jpg",
      photos: [
        { img: "assets/img/photos/hanteo-1.jpg", w: 1200, h: 1600, caption: "트로피와 꽃다발" },
        { img: "assets/img/photos/hanteo-2.jpg", w: 1200, h: 1600, caption: "트로피를 들어 올리며" },
        { img: "assets/img/photos/hanteo-3.jpg", w: 1600, h: 1227, caption: "무대 인사" },
        { img: "assets/img/photos/hanteo-4.jpg", w: 900, h: 1600, caption: "스크린 속 초록 드레스" },
        { img: "assets/img/photos/hanteo-5.jpg", w: 1600, h: 1200, caption: "한터뮤직어워즈 무대" }
      ]
    },
    {
      date: "2025. 1. 21.", year: "2025",
      title: "열린음악회 녹화",
      en: { title: "Open Concert Taping", place: "KBS - Ep.1514 aired Feb 23, 2025", desc: "A yellow flower on a black dress, laughter with the bassist backstage, and the stage rehearsal on taping day." },
      place: "KBS · 1514회 방송 2025. 2. 23.",
      desc: "노란 꽃을 꽂은 검은 드레스, 베이시스트와 웃던 대기실, 그리고 무대 리허설까지 — 녹화일의 백스테이지 기록.",
      bg: "assets/img/photos/openc-1.jpg",
      photos: [
        { img: "assets/img/photos/openc-1.jpg", w: 1200, h: 1600, caption: "무대 리허설" },
        { img: "assets/img/photos/openc-2.jpg", w: 1200, h: 1600, caption: "베이시스트와 함께" },
        { img: "assets/img/photos/openc-3.jpg", w: 1200, h: 1600, caption: "대기실의 웃음" },
        { img: "assets/img/photos/openc-4.jpg", w: 1200, h: 1600, caption: "출연 대기" },
        { img: "assets/img/photos/openc-5.jpg", w: 1232, h: 1600, caption: "노란 꽃, 검은 드레스" },
        { img: "assets/img/photos/openc-6.jpg", w: 1268, h: 1600, caption: "백스테이지 포트레이트" }
      ]
    },
    {
      date: "2024. 12. 30.", year: "2024",
      title: "2024 인순이 디너쇼",
      en: { title: "2024 Insooni Dinner Show", place: "Grand InterContinental Seoul Parnas", desc: "The first year-end dinner show in five years, and the weeks of dance practice behind it." },
      place: "그랜드 인터컨티넨탈 서울 파르나스",
      desc: "5년 만의 연말 디너쇼. 무대 뒤에는 몇 주간의 안무 연습이 있었습니다 — 연습실의 기록.",
      video: "assets/media/dinner-practice.mp4",
      poster: "assets/img/photos/dsprac-1.jpg",
      bg: "assets/img/photos/dsprac-1.jpg",
      photos: [
        { img: "assets/img/photos/dsprac-1.jpg", w: 1600, h: 900, caption: "안무 연습실에서" },
        { img: "assets/img/photos/dsprac-2.jpg", w: 900, h: 1600, caption: "거울 앞의 시간" }
      ]
    },
    {
      date: "", year: "",
      title: "재즈 라이브",
      en: { title: "Jazz Live", place: "", desc: "Date and venue being confirmed. A small-theater night with a jazz band." },
      place: "",
      desc: "일자·장소 확인 중 [공식 확인 필요]. 소극장의 밤, 재즈 밴드와 함께한 라이브 기록.",
      video: "assets/media/jazz-live.mp4",
      poster: "assets/img/photos/jazzc-1.jpg",
      bg: "assets/img/photos/jazzc-1.jpg",
      photos: [
        { img: "assets/img/photos/jazzc-1.jpg", w: 1600, h: 900, caption: "스포트라이트 아래, 재즈 밴드와" },
        { img: "assets/img/photos/jazzc-2.jpg", w: 1200, h: 1600, caption: "객석에서 본 무대" },
        { img: "assets/img/photos/jazzc-3.jpg", w: 900, h: 1600, caption: "소극장의 밤" }
      ]
    },

    {
      year: "2025",
      title: "Woman of Influence 2025",
      en: { title: "Woman of Influence 2025", place: "Pearl S. Buck International, USA (2025)", desc: "Award ceremony highlights: the trophy moment, a flag presentation, the acceptance speech, and a surprise song among the guests." },
      place: "Pearl S. Buck International 시상식 · 미국 (2025)",
      desc: "펄벅 인터내셔널 '올해의 여성상' 수상 현장. 시상과 성조기 전달, 수상 연설, 객석 사이에서 부른 축하 무대까지 — 가족의 카메라로 남긴 실황.",
      video: "assets/media/woi2025.mp4",
      poster: "assets/img/photos/woi-award.jpg",
      bg: "assets/img/photos/woi-award.jpg",
      photos: [
        { img: "assets/img/photos/woi-award.jpg", w: 1074, h: 1542, caption: "'올해의 여성상' 시상 순간" },
        { img: "assets/img/photos/woi-flag.jpg", w: 900, h: 1600, caption: "기념 성조기 전달" },
        { img: "assets/img/photos/woi-speech.jpg", w: 900, h: 1600, caption: "수상 연설, 연단에서" },
        { img: "assets/img/photos/woi-podium.jpg", w: 900, h: 1600, caption: "Woman of Influence 2025 로고 앞에서" },
        { img: "assets/img/photos/woi-song.jpg", w: 900, h: 1600, caption: "객석 사이에서 부른 축하 무대" },
        { img: "assets/img/photos/woi-audience.jpg", w: 900, h: 1600, caption: "객석에서, 박수와 함께" }
      ]
    },
    {
      year: "2025",
      title: "성수동 버스킹",
      en: { title: "Seongsu-dong Busking", place: "Seongsu-dong, Seoul", desc: "A street stage in Seongsu-dong, singing 'Silly Fool Puppy'." },
      place: "서울 성수동",
      desc: "성수동 거리 무대. '바보 멍청이 똥개'를 부른 현장.",
      youtubeId: "AHGXsBvkVVI",
      bg: "assets/img/thumbs/busking.jpg",
      photos: []
    },
    {
      year: "2025",
      title: "BOYNEXTDOOR와 함께",
      en: { title: "With BOYNEXTDOOR", place: "", desc: "A cross-generation collaboration on 'Silly Fool Puppy'." },
      desc: "'바보 멍청이 똥개' 세대를 넘은 컬래버 무대.",
      youtubeId: "neUVzSyKCn8",
      bg: "assets/img/thumbs/bnd.jpg",
      photos: []
    },
    {
      year: "2025",
      title: "콜미 (CALL ME) 커버",
      en: { title: "'CALL ME' Cover", place: "", desc: "'CALL ME' sung the Insooni way." },
      desc: "'콜미(CALL ME)'를 인순이 스타일로 부른 커버 무대.",
      youtubeId: "9wwtxL2TLJQ",
      bg: "assets/img/thumbs/callme.jpg",
      photos: []
    },
    {
      year: "",
      title: "시어트리컬 콘서트 실황",
      en: { title: "Theatrical Concert Live", place: "", desc: "Show name and year being confirmed. A grand stage with orchestra, rococo costumes and sequined jazz numbers." },
      place: "",
      desc: "공연명·연도 확인 중 [공식 확인 필요]. 오케스트라 협연, 로코코 의상극, 스팽글 재즈 넘버 — 같은 카메라 시리즈로 전해진 대형 무대 기록.",
      bg: "assets/img/photos/dsc0628.jpg",
      photos: [
        { img: "assets/img/photos/dsc0427.jpg", w: 1600, h: 1065, caption: "깃털 장식 흰 의상, 오케스트라와 함께" },
        { img: "assets/img/photos/dsc0628.jpg", w: 1600, h: 1063, caption: "댄서들과 함께한 스팽글 무대" },
        { img: "assets/img/photos/dsc0284.jpg", w: 1600, h: 1063, caption: "순백의 무대 세트" },
        { img: "assets/img/photos/dsc0369.jpg", w: 1600, h: 1063, caption: "흰 의상의 군무와 함께" },
        { img: "assets/img/photos/dsc0081.jpg", w: 1063, h: 1600, caption: "쏟아지는 조명 아래, 스팽글 드레스" },
        { img: "assets/img/photos/dsc9427.jpg", w: 1600, h: 1063, caption: "원색의 무대, 폭발하는 에너지" }
      ]
    },
    {
      year: "",
      title: "네온 시티 무대",
      en: { title: "Neon City Stage", place: "", desc: "Show name and year being confirmed. A live record on an LED cityscape stage." },
      place: "",
      desc: "공연명·연도 확인 중 [공식 확인 필요]. 도시의 불빛을 닮은 LED 무대 실황 기록.",
      bg: "assets/img/photos/kakao21.jpg",
      photos: [
        { img: "assets/img/photos/kakao21.jpg", w: 1600, h: 1067, caption: "네온 조명의 대형 무대" },
        { img: "assets/img/photos/kakao22.jpg", w: 1600, h: 1067, caption: "도시의 불빛을 닮은 무대 세트" }
      ]
    }
  ],

  /* ---------- 지난 공연 아카이브 (플레이DB·보도 검증, 2026.7 리서치) ---------- */
  pastShows: [
    { date: "2025-07-09", city: "서울", venue: "국립극장 하늘극장", title: "여우락 페스티벌 '두 사랑 이야기'", en: { title: "Yeowoorak Festival 'Two Love Stories'", city: "Seoul", en: { title: "Yeowoorak Festival 'Two Love Stories'", excerpt: "Two nights with Yoo Ji-sook at the National Theater of Korea." } }, poster: "assets/img/posters/p217362.jpg", pw: 300, phh: 400 },
    { date: "2024-05-18", city: "인천", venue: "송도컨벤시아", title: "골든걸스 콘서트", en: { title: "Golden Girls Concert", city: "Incheon" }, poster: "assets/img/posters/p201859.jpg", pw: 300, phh: 400 },
    { date: "2024-04-20", city: "부산", venue: "KBS부산홀", title: "골든걸스 전국투어", en: { title: "Golden Girls National Tour", city: "Busan" }, poster: "assets/img/posters/p200936.jpg", pw: 300, phh: 400 },
    { date: "2024-03-02", city: "성남", venue: "성남아트센터", title: "골든걸스 콘서트", en: { title: "Golden Girls Concert", city: "Seongnam" }, poster: "assets/img/posters/p198416.jpg", pw: 230, phh: 280 },
    { date: "2023-12-14", city: "안성", venue: "안성맞춤아트홀", title: "인순이 콘서트", en: { title: "Insooni Concert", city: "Anseong" }, poster: "assets/img/posters/p196015.jpg", pw: 230, phh: 280 },
    { date: "2023-02-18", city: "캘리포니아", venue: "페창가 리조트", title: "인순이 단독 라이브", en: { title: "Insooni Live", city: "California" } },
    { date: "2022-12-30", city: "전주", venue: "삼성문화회관", title: "인순이 콘서트", en: { title: "Insooni Concert", city: "Jeonju" }, poster: "assets/img/posters/p181291.jpg", pw: 230, phh: 280 },
    { date: "2019-12-21", city: "서울", venue: "파르나스 그랜드볼룸", title: "연말 디너쇼", en: { title: "Year-End Dinner Show", city: "Seoul" }, poster: "assets/img/posters/p150958.jpg", pw: 230, phh: 280 },
    { date: "2019-01-12", city: "부산", venue: "부산문화회관", title: "인순이 콘서트", en: { title: "Insooni Concert", city: "Busan" }, poster: "assets/img/posters/p135462.jpg", pw: 230, phh: 280 },
    { date: "2018-12-23", city: "서울", venue: "롯데호텔 크리스탈볼룸", title: "인순이 디너쇼", en: { title: "Insooni Dinner Show", city: "Seoul" }, poster: "assets/img/posters/p133246.jpg", pw: 230, phh: 280 },
    { date: "2018-03-31", city: "서울", venue: "올림픽홀", title: "데뷔 40주년 해 단독 공연", en: { title: "Solo Concert, 40th Anniversary Year", city: "Seoul" }, poster: "assets/img/posters/p121047.jpg", pw: 230, phh: 280 },
    { date: "2017-12-29", city: "김해", venue: "김해문화의전당", title: "인순이 콘서트", en: { title: "Insooni Concert", city: "Gimhae" }, poster: "assets/img/posters/p116909.jpg", pw: 230, phh: 280 },
    { date: "2017-12-22", city: "서울", venue: "롯데호텔 크리스탈볼룸", title: "인순이 디너쇼", en: { title: "Insooni Dinner Show", city: "Seoul" }, poster: "assets/img/posters/p116348.jpg", pw: 230, phh: 280 },
    { date: "2017-09-16", city: "부산", venue: "벡스코 오디토리움", title: "인순이 콘서트", en: { title: "Insooni Concert", city: "Busan" }, poster: "assets/img/posters/p112242.jpg", pw: 230, phh: 280 },
    { date: "2016-12-21", city: "서울", venue: "그랜드하얏트 그랜드볼룸", title: "인순이 디너쇼", en: { title: "Insooni Dinner Show", city: "Seoul" }, poster: "assets/img/posters/p100315.jpg", pw: 230, phh: 280 },
    { date: "2016-02-16", city: "서울", venue: "세종문화회관 대극장", title: "인순이 콘서트", en: { title: "Insooni Concert", city: "Seoul" }, poster: "assets/img/posters/p87087.jpg", pw: 230, phh: 280 },
    { date: "2015-12-22", city: "서울", venue: "그랜드하얏트 그랜드볼룸", title: "인순이 디너쇼", en: { title: "Insooni Dinner Show", city: "Seoul" }, poster: "assets/img/posters/p84878.jpg", pw: 230, phh: 280 },
    { date: "2015-01-24", city: "수원", venue: "경기아트센터", title: "인순이 콘서트", en: { title: "Insooni Concert", city: "Suwon" }, poster: "assets/img/posters/p72397.jpg", pw: 230, phh: 280 },
    { date: "2014-12-24", city: "서울", venue: "그랜드하얏트 그랜드볼룸", title: "인순이 디너쇼", en: { title: "Insooni Dinner Show", city: "Seoul" }, poster: "assets/img/posters/p68680.jpg", pw: 230, phh: 280 },
    { date: "2013-12-28", city: "서울", venue: "그랜드하얏트 그랜드볼룸", title: "인순이 디너쇼", en: { title: "Insooni Dinner Show", city: "Seoul" }, poster: "assets/img/posters/p54963.jpg", pw: 230, phh: 280 },
    { date: "2013-07-06", city: "서울", venue: "국립극장 해오름극장", title: "뮤지컬 '시카고' 벨마 켈리", en: { title: "Musical CHICAGO, Velma Kelly", city: "Seoul" }, poster: "assets/img/posters/p46887.jpg", pw: 230, phh: 280 },
    { date: "2012-12-23", city: "서울", venue: "63빌딩 컨벤션센터", title: "인순이 디너쇼", en: { title: "Insooni Dinner Show", city: "Seoul" }, poster: "assets/img/posters/p42065.jpg", pw: 230, phh: 280 },
    { date: "2012-06-09", city: "서울", venue: "디큐브아트센터", title: "뮤지컬 '시카고' 벨마 켈리", en: { title: "Musical CHICAGO, Velma Kelly", city: "Seoul" }, poster: "assets/img/posters/p34835.jpg", pw: 230, phh: 280 },
    { date: "2012-05-19", city: "성남", venue: "성남아트센터", title: "콘서트 '판타지아'", en: { title: "Concert 'Fantasia'", city: "Seongnam" }, poster: "assets/img/posters/p33438.jpg", pw: 230, phh: 280 },
    { date: "2012-05-09", city: "부산", venue: "롯데호텔 크리스탈볼룸", title: "인순이 디너쇼", en: { title: "Insooni Dinner Show", city: "Busan" }, poster: "assets/img/posters/p33439.jpg", pw: 230, phh: 280 },
    { date: "2011-12-22", city: "서울", venue: "센트럴시티 밀레니엄홀", title: "인순이 디너쇼", en: { title: "Insooni Dinner Show", city: "Seoul" }, poster: "assets/img/posters/p29737.jpg", pw: 230, phh: 280 },
    { date: "2011-10-12", city: "멜버른", venue: "시드니 마이어 뮤직 볼", title: "'나는 가수다' 호주 특별공연", en: { title: "'I Am a Singer' Special, Australia", city: "Melbourne" } },
    { date: "2011-09-17", city: "서울", venue: "샤롯데씨어터", title: "뮤지컬 '캣츠' 그리자벨라", en: { title: "Musical CATS, Grizabella", city: "Seoul" } },
    { date: "2010-11-20", city: "청주", venue: "청주 실내체육관", title: "콘서트 '판타지아'", en: { title: "Concert 'Fantasia'", city: "Cheongju" }, poster: "assets/img/posters/p18774.jpg", pw: 230, phh: 280 },
    { date: "2010-02-01", city: "뉴욕", venue: "카네기홀 아이작 스턴 홀", title: "두 번째 카네기홀 콘서트", en: { title: "Second Carnegie Hall Concert", city: "New York" } },
    { date: "2009-12-30", city: "서울", venue: "63빌딩 컨벤션센터", title: "아듀 2009 송년 디너쇼", en: { title: "Adieu 2009 Dinner Show", city: "Seoul" }, poster: "assets/img/posters/p13761.jpg", pw: 230, phh: 280 },
    { date: "2009-12-27", city: "서울", venue: "올림픽홀", title: "콘서트 'LEGEND & FOREVER'", en: { title: "'LEGEND & FOREVER' Concert", city: "Seoul" }, poster: "assets/img/posters/p13743.jpg", pw: 230, phh: 280 },
    { date: "2009-10-24", city: "안산", venue: "안산문화예술의전당", title: "데뷔 30주년 'Legend'", en: { title: "30th Anniversary 'Legend'", city: "Ansan" }, poster: "assets/img/posters/p12592.jpg", pw: 230, phh: 280 },
    { date: "2008-12-19", city: "서울", venue: "그랜드하얏트 그랜드볼룸", title: "송년 디너쇼 '뜨거운 만남'", en: { title: "Year-End Dinner Show 'Hot Encounter'", city: "Seoul" }, poster: "assets/img/posters/p6851.jpg", pw: 230, phh: 280 },
    { date: "2008-04-03", city: "서울", venue: "세종문화회관 대극장", title: "데뷔 30주년 전국투어", en: { title: "30th Anniversary National Tour", city: "Seoul" }, poster: "assets/img/posters/p3429.jpg", pw: 230, phh: 280 },
    { date: "2007-12-22", city: "서울", venue: "스위스 그랜드 호텔", title: "인순이 콘서트", en: { title: "Insooni Concert", city: "Seoul" }, poster: "assets/img/posters/p503.jpg", pw: 300, phh: 204 },
    { date: "2007-06-02", city: "부산", venue: "부산 KBS홀", title: "콘서트 '드리머'", en: { title: "Concert 'Dreamer'", city: "Busan" } },
    { date: "2006-12-22", city: "서울", venue: "63빌딩 국제회의장", title: "송년 디너쇼", en: { title: "Year-End Dinner Show", city: "Seoul" }, poster: "assets/img/posters/p2590.jpg", pw: 300, phh: 204 },
    { date: "2005-12-22", city: "서울", venue: "롯데호텔 크리스탈볼룸", title: "송년 디너쇼", en: { title: "Year-End Dinner Show", city: "Seoul" }, poster: "assets/img/posters/p2469.jpg", pw: 300, phh: 204 },
    { date: "2004-12-22", city: "서울", venue: "롯데호텔 크리스탈볼룸", title: "송년 디너쇼", en: { title: "Year-End Dinner Show", city: "Seoul" }, poster: "assets/img/posters/p3028.jpg", pw: 300, phh: 204 },
    { date: "1999-01-01", city: "뉴욕", venue: "카네기홀", title: "첫 카네기홀 무대", en: { title: "First Carnegie Hall Concert", city: "New York" } }
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
    { date: "2026-03-10", type: "공연", title: "5월 9일 안동 '두 사랑 이야기' 예매 오픈", excerpt: "어버이날 특별기획 — 인순이 & 유지숙. 안동문화예술의전당 웅부홀, 티켓링크에서 예매할 수 있습니다.", en: { title: "Andong 'Two Love Stories' on sale for May 9", excerpt: "A Parents' Day special with Yoo Ji-sook at Andong Culture & Arts Center. Tickets on Ticketlink." } },
    { date: "2025-11-28", type: "발매", title: "새 싱글 '그래도 꿈은 흐른다' 발매", excerpt: "실패 속에서도 계속되는 꿈. 공식 뮤직비디오가 유튜브에 공개되었습니다.", en: { title: "New single 'Still, the Dream Flows' released", excerpt: "A dream that keeps flowing through failure. The official music video is on YouTube." } },
    { date: "2025-08-21", type: "수상", title: "펄벅 인터내셔널 '올해의 여성상' 수상", excerpt: "Woman of Influence 2025. 노래와 나눔이 함께 만든 자리 — 시상식 리캡을 라이브에서 볼 수 있습니다.", en: { title: "Woman of Influence 2025, Pearl S. Buck International", excerpt: "An award where song and giving met. See the ceremony recap on the Tour page." } },
    { date: "2025-07-09", type: "공연", title: "여우락 페스티벌 '두 사랑 이야기'", excerpt: "국립극장 하늘극장, 인순이 x 유지숙. 이틀간의 무대." },
    { date: "2025-02-23", type: "방송", title: "열린음악회 1514회 피날레 무대", excerpt: "1월 21일 녹화 — 백스테이지 기록은 라이브 페이지 리캡에.", en: { title: "Open Concert Ep.1514 finale", excerpt: "Taped January 21 - backstage records in the Tour page recap." } },
    { date: "2025-02-19", type: "발매", title: "《인순이, 아름다운 우리나라》 발매", excerpt: "1984년 원곡 앨범을 다시 부른 아홉 곡.", en: { title: "'Insooni, Beautiful Korea' released", excerpt: "Nine songs revisiting the 1984 original album." } },
    { date: "2024-12-30", type: "공연", title: "5년 만의 연말 디너쇼", excerpt: "그랜드 인터컨티넨탈 서울 파르나스, 이틀간의 밤.", en: { title: "First year-end dinner show in five years", excerpt: "Two nights at Grand InterContinental Seoul Parnas." } }
  ],

  /* ---------- 일정 (kind: 공연 | 방송 | 행사) ---------- */
  events: [
    {
      date: "2026-05-09",
      kind: "공연",
      status: "onsale",
      title: "어버이날 특별기획 '두 사랑 이야기' — 인순이 & 유지숙",
      en: { title: "Parents' Day Special 'Two Love Stories' - Insooni & Yoo Ji-sook", place: "Andong Culture & Arts Center, Woongbu Hall" },
      place: "안동문화예술의전당 웅부홀",
      note: "공식 예매: 티켓링크",
      link: "https://www.ticketlink.co.kr/product/61356"
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
    { title: "성수동 버스킹", desc: "성수동 거리 무대. '바보 멍청이 똥개'를 부른 현장.", year: "2025", youtubeId: "AHGXsBvkVVI", thumb: "assets/img/thumbs/busking.jpg" },
    { title: "BOYNEXTDOOR와 함께", desc: "'바보 멍청이 똥개' 세대를 넘은 컬래버 무대.", year: "2025", youtubeId: "neUVzSyKCn8", thumb: "assets/img/thumbs/bnd.jpg" },
    { title: "콜미 (CALL ME) 커버", desc: "'콜미(CALL ME)'를 인순이 스타일로 부른 커버 무대.", year: "2025", youtubeId: "9wwtxL2TLJQ", thumb: "assets/img/thumbs/callme.jpg" },
    { title: "거위의 꿈", desc: "1997년 카니발 원곡을 2007년 리메이크해 세대를 넘어 위로가 된 노래.", year: "2007", youtubeId: null },
    { title: "밤이면 밤마다", desc: "1983년 발표, 인순이표 에너지의 원점이 된 히트곡.", year: "1983", youtubeId: null },
    { title: "아버지", desc: "2009년 정규 17집 《인순이》 수록곡.", year: "2009", youtubeId: null }
  ],

  /* ---------- 디스코그래피 (검증된 주요 발표작) ---------- */
  albums: [
    { featured: true, art: "assets/img/covers/cover1978.jpg", year: "1978", title: "희자매 1집", kind: "그룹", note: "타이틀곡 '실버들'로 TBC 가요차트 7주 연속 1위 데뷔.",
      tracks: ["실버들", "우리는 사랑해요", "이제는 모두 잊어요", "앵두", "말도 안돼", "아리랑 내님아", "어찌합니까", "달무리", "사랑만은 않겠어요", "오동잎"],
      credits: "'실버들' — 작사 김소월(시) · 작곡 안치행 · 1978 힛트레코드 (희자매: 김인순·김재희·이영숙)",
      links: [
        { label: "YouTube Music", url: "https://music.youtube.com/playlist?list=OLAK5uy_lYCOexP5qLe9Sev4jwO-bWr81sBLu0NNg" },
        { label: "Apple Music", url: "https://music.apple.com/kr/album/silvers-arirang-my-love/1699110167" },
        { label: "Spotify", url: "https://open.spotify.com/track/6TufjMtsLO7W8tilip8BMr" }
      ] },
    { year: "1979", title: "Disco", kind: "희자매 2집", note: "현대음향 발매." },
    { art: "assets/img/photos/press-105959.jpg", year: "1979", title: "희자매 3집", kind: "희자매 3집", note: "현대음향 발매." },
    { art: "assets/img/photos/album01.jpg", year: "1980", title: "인연 (Fate)", kind: "솔로 1집", note: "솔로 가수 인순이의 첫걸음.",
      tracks: ["인연", "웃어주세요", "재수생", "풍문으로 들었어", "정말로 모르시나", "조용한 이별", "차표한장 (One Way Ticket)", "춤을 춰요 (I Was Made For Dancing)", "꿈이였나봐", "복돌이", "내마음 흔들려", "빨간 마후라"],
      credits: "1980년 10월 현대음향 발매. 곡별 작사·작곡 크레딧은 공식 자료 확인 후 추가됩니다. [자료 필요]",
      links: [] },
    { year: "1981", title: "떠나야 할 그 사람 / 누가", kind: "정규 2집", note: "대표곡 '떠나야 할 그 사람'. 지구레코드. [연도 표기 자료별 상이]" },
    { year: "1982", title: "슬픔만 남아 있어요 / 울지도 못합니다", kind: "정규 3집", note: "대표곡 '슬픔만 남아 있어요'. 지구레코드." },
    { featured: true, art: "assets/img/photos/album04.jpg", year: "1983", title: "밤이면 밤마다", kind: "대표곡", note: "디바의 시대를 연 폭발적 히트곡. 독집 제4집 수록.",
      tracks: ["밤이면 밤마다", "슬픈 아침", "한밤중", "내 고향집", "왜 나를 떠나셨나요", "손모아 마음모아", "욕망", "하늘 날고파라", "그리운 내사랑아", "다른 사람 말처럼 들리네", "고독", "고독 (경음악)"],
      credits: "'밤이면 밤마다' — 작사·작곡·편곡 김정택 · 1983 독집 제4집. 이 곡의 히트로 1984 KBS 7대가수상 수상.",
      links: [
        { label: "멜론(곡)", url: "https://www.melon.com/song/detail.htm?songId=60847" }
      ] },
    { year: "1984", title: "아름다운 우리나라 / 여기가 어디냐", kind: "정규 5집", note: "원곡 '아름다운 우리나라' 수록 (2025년 신보와 별개). HKR." },
    { year: "1985", title: "눈물의 편지 / 잊지 못하고", kind: "정규 6집", note: "대표곡 '눈물의 편지'. HKR." },
    { art: "assets/img/photos/album07.jpg", year: "1987", title: "에레나라 불리운 여인", kind: "정규 7집", note: "대표곡 '에레나라 불리운 여인'. 지구레코드.", links: [{ label: "YT", url: "https://music.youtube.com/browse/MPREb_XhYDf1DeQ5q" }, { label: "APPLE", url: "https://music.apple.com/kr/album/1827889007" }, { label: "SPOTIFY", url: "https://open.spotify.com/album/38uPzmw0Vb0TrsXI2n78Bm" }] },
    { year: "1988", title: "그 어느 거리로", kind: "정규 8집", note: "대표곡 '그 어느 거리로'. HKR." },
    { art: "assets/img/photos/album09.jpg", year: "1989", title: "Turning Point", kind: "정규 9집", note: "대표곡 '갈망'. 현대음향.", links: [{ label: "YT", url: "https://music.youtube.com/browse/MPREb_XxANP35JtFE" }, { label: "APPLE", url: "https://music.apple.com/kr/album/1636175668" }, { label: "SPOTIFY", url: "https://open.spotify.com/album/3L4FyfXeluTYdpfvgQtLYX" }] },
    { art: "assets/img/photos/album10.jpg", year: "1991", title: "여자 (女子)", kind: "정규 10집", note: "대표곡 '하늘을 바라보소'. 가야음반.", links: [{ label: "YT", url: "https://music.youtube.com/browse/MPREb_B17LgGY0VdF" }, { label: "APPLE", url: "https://music.apple.com/kr/album/1636175683" }, { label: "SPOTIFY", url: "https://open.spotify.com/album/45fhjAADfcsykXkFLv1C6y" }] },
    { year: "1992", title: "인순이 골든 앨범", kind: "컴필레이션", note: "Oasis 발매." },
    { art: "assets/img/photos/album11.jpg", year: "1996", title: "The Queen Of Soul", kind: "정규 11집", note: "'또' 수록. 소울의 여왕이라는 이름을 새긴 앨범.",
      tracks: ["또", "이별연습", "밀애", "너의 곁에 나", "이별을 준비할꺼야", "그대가 말하는 사랑", "혼자가 아닌 나", "White Christmas For You"],
      credits: "'또'·'밀애'·'그대가 말하는 사랑' — 작사·작곡 박진영 · '이별연습'·'이별을 준비할꺼야' — 작사·작곡 김형석 · '너의 곁에 나' — 작사 노영심, 작곡 김형석 · 1996년 5월 세원음반",
      links: [
        { label: "YouTube Music", url: "https://music.youtube.com/playlist?list=OLAK5uy_kgDfVDMgA0LAkpbOh2W9Sy85WBg1FBlsM" },
        { label: "Apple Music", url: "https://music.apple.com/kr/album/the-queen-of-soul/1538223938" },
        { label: "Spotify", url: "https://open.spotify.com/album/7odz1LsIS2ltX2tQZe41Q7" }
      ] },
    { year: "1997", title: "가스펠 1 (내 영혼의 그윽히 깊은 데서)", kind: "정규 12집", note: "CCM 앨범. CREAM/국제음반." },
    { art: "assets/img/photos/album13.jpg", year: "1997", title: "Future & Memories", kind: "정규 13집", note: "CREAM 발매.", links: [{ label: "YT", url: "https://music.youtube.com/browse/MPREb_JguH4xWBRaZ" }, { label: "SPOTIFY", url: "https://open.spotify.com/album/3zJnoqg4pzpHHXky9bXcvk" }] },
    { year: "2000", title: "인순이 복음성가 I·II", kind: "컴필레이션", note: "가스펠 모음." },
    { art: "assets/img/photos/album15.jpg", year: "2001", title: "My Turn", kind: "정규 14집", note: "CREAM 발매.", links: [{ label: "YT", url: "https://music.youtube.com/browse/MPREb_1OOVQSv3qHB" }, { label: "SPOTIFY", url: "https://open.spotify.com/album/6Sz903UNY6BNRnFXdeMIeC" }] },
    { art: "assets/img/photos/jazz-album.jpg", year: "2003", title: "Jazz", kind: "정규 15집", note: "재즈 앨범. C&C Media.", links: [{ label: "YT", url: "https://music.youtube.com/browse/MPREb_aPAnEhl0hmm" }, { label: "APPLE", url: "https://music.apple.com/kr/album/1839343758" }, { label: "SPOTIFY", url: "https://open.spotify.com/album/5Fr9MCvgdDFcFgxLhnqTcy" }] },
    { art: "assets/img/photos/album16.jpg", year: "2004", title: "A To Z", kind: "정규 16집", note: "'친구여'(feat. 조PD) 수록. 2004년 9월 9일 발매.",
      tracks: ["Tonight", "Higher", "웃고 있지만", "My Life", "연가", "여정", "Swing My Baby", "연인", "여자이니까", "잠깐", "첫사랑", "비에 스친 날들", "친구여 (feat. 조PD)", "비상"],
      credits: "'친구여' — 작사 조PD, 작곡·편곡 박근태 · 타이틀곡 'Tonight' — 작사 김민지, 작곡 박해운, 편곡 한태수 · 프로듀서 김도형",
      links: [
        { label: "YouTube Music", url: "https://music.youtube.com/playlist?list=OLAK5uy_ngnowajTfdkaACKoTPeWLLcnyMVbfha-8" },
        { label: "Apple Music", url: "https://music.apple.com/kr/album/16th-a-to-z/1269489854" },
        { label: "Spotify", url: "https://open.spotify.com/album/7hdxullH6yeBjneaZ9rRDD" },
        { label: "멜론", url: "https://www.melon.com/album/detail.htm?albumId=35502" }
      ] },
    { year: "2004", title: "올림픽 응원가 - 비상", kind: "싱글", note: "BES기획." },
    { art: "assets/img/photos/press-149006.jpg", year: "2006", title: "열정 (Can You Feel It)", kind: "싱글", note: "서커스엔터테인먼트.", links: [{ label: "YT", url: "https://music.youtube.com/browse/MPREb_YkFUKoP9SYH" }, { label: "APPLE", url: "https://music.apple.com/kr/album/1655672126" }, { label: "SPOTIFY", url: "https://open.spotify.com/album/2Oy7xhoxRhZhXiMyo4bJdU" }] },
    { year: "2006", title: "Amazing Grace", kind: "라이브", note: "라이브 콘서트 앨범. C&C Media." },
    { featured: true, art: "assets/img/covers/cover2007.jpg", year: "2007", title: "거위의 꿈", kind: "대표곡", note: "카니발 원곡(1997) 리메이크. 위로의 상징이 된 노래.",
      tracks: ["거위의 꿈 (Original)", "거위의 꿈 (Inst.)", "거위의 꿈 (Radio Edit)", "거위의 꿈 (Director's Edit)", "하늘이여...제발 (주몽 OST)"],
      credits: "작사 이적 · 작곡 김동률 (원곡 카니발, 1997) · 2007. 1. 22. 디지털 싱글, 2007. 2. 1. 디지털 음반 《거위의 꿈, 꿈을 꾸는 모든 이들에게》",
      links: [
        { label: "YouTube Music", url: "https://music.youtube.com/playlist?list=OLAK5uy_l28ucxxiGHAHyAYLmH9H_ZPr-946BcbNY" },
        { label: "Apple Music", url: "https://music.apple.com/kr/album/gooses-dream-to-all-dreamers-ep/1423480473" },
        { label: "Spotify", url: "https://open.spotify.com/album/7t69eXfrQb8fY51q8EvMQe" },
        { label: "멜론", url: "https://www.melon.com/album/detail.htm?albumId=342766" }
      ] },
    { year: "2008", title: "Anthology 97-08", kind: "컴필레이션", note: "Vitamin Entertainment.", links: [{ label: "YT", url: "https://music.youtube.com/browse/MPREb_irlBEs0Fv5S" }] },
    { art: "assets/img/covers/cover2009.jpg", year: "2009", title: "인순이 (17집)", kind: "정규", note: "타이틀곡 'Fantasia', '아버지' 수록. 데뷔 31주년 기념작.",
      tracks: ["Fantasia", "Cry", "향수", "아버지", "기회", "일어나", "뿌리 (Prologue)", "나무", "딸에게", "사랑가", "Merry Merry", "Fantasia (Inst.)"],
      credits: "'아버지' — 작사·작곡·편곡 이현승 · 'Fantasia' — 작사 나비, 작곡·편곡 이현승 · '향수' — 시 정지용, 작곡 김희갑 · 총괄 프로듀서 이현승 · 2009. 5. 8. 발매",
      links: [
        { label: "YouTube Music", url: "https://music.youtube.com/playlist?list=OLAK5uy_krDMMbBGD0-KLrHm3xLHcBf241i247gXI" },
        { label: "Apple Music", url: "https://music.apple.com/kr/album/insooni/1641834078" },
        { label: "Spotify", url: "https://open.spotify.com/album/2fdeLt66Qis4rWCYxWI8ro" },
        { label: "멜론", url: "https://www.melon.com/album/detail.htm?albumId=557957" }
      ] },
    { year: "2010", title: "꿈, 날개를 달다", kind: "싱글", note: "임태경 듀엣." },
    { art: "assets/img/photos/press-35024303.jpg", year: "2011", title: "어퍼컷", kind: "싱글", note: "지앤지프로덕션/KT뮤직.", links: [{ label: "YT", url: "https://music.youtube.com/browse/MPREb_Gil3bGu6Rs9" }, { label: "APPLE", url: "https://music.apple.com/kr/album/421981237" }] },
    { year: "2011", title: "Legend (30주년 기념 콘서트 실황)", kind: "라이브", note: "2CD 실황. 소솝/Vitamin Entertainment." },
    { year: "2011", title: "디스코 걸스: 안타 레코드 이어스 앤쏠로지 1978-1980", kind: "희자매 컴필", note: "2011 리마스터. Beatball." },
    { year: "2013", title: "Umbrella", kind: "정규 18집", note: "Sony 발매." },
    { year: "2013", title: "나무", kind: "EP", note: "소솝/Sony." },
    { year: "2015", title: "피노키오", kind: "디지털 싱글", note: "소솝/휴맵컨텐츠.", links: [{ label: "APPLE", url: "https://music.apple.com/kr/album/1024467825" }] },
    { year: "2015", title: "이토록 아름다웠음을 (엄마 OST)", kind: "OST 싱글", note: "Warner Music Korea." },
    { year: "2016", title: "선물 (기억 OST Part 2)", kind: "OST 싱글", note: "CJ E&M." },
    { year: "2016", title: "하나의 꿈 (One K 콘서트 테마곡)", kind: "싱글", note: "코리안드림." },
    { year: "2017", title: "2018 평창 동계올림픽 성화봉송 주제가", kind: "디지털 싱글", note: "평창 동계올림픽 조직위원회." },
    { year: "2019", title: "행복", kind: "디지털 싱글", note: "휴맵컨텐츠/지니뮤직.", links: [{ label: "YT", url: "https://music.youtube.com/browse/MPREb_IjZ2HxCHSnV" }, { label: "APPLE", url: "https://music.apple.com/kr/album/1685893978" }, { label: "SPOTIFY", url: "https://open.spotify.com/album/6jwzT0MFVj2RhRdhIq5MZN" }] },
    { year: "2021", title: "드림오더", kind: "디지털 싱글", note: "글로벌오더/다날." },
    { year: "2022", title: "내일이 빛날 테니까 (You will shine)", kind: "디지털 싱글", note: "박보람 듀엣. 제나두엔터테인먼트.", links: [{ label: "YT", url: "https://music.youtube.com/browse/MPREb_pBepLk5Myq6" }, { label: "APPLE", url: "https://music.apple.com/kr/album/1622759706" }, { label: "SPOTIFY", url: "https://open.spotify.com/album/74hfH7A2FyGp7R5SR0m0wG" }] },
    { year: "2022", title: "긴 편지", kind: "디지털 싱글", note: "휴맵컨텐츠/YG PLUS." },
    { featured: true, art: "assets/img/covers/cover2023.jpg", year: "2023", title: "One Last Time", kind: "골든걸스", note: "KBS2 '골든걸스' 프로젝트 그룹 데뷔곡 (박진영 프로듀싱).",
      tracks: ["One Last Time"],
      credits: "작사 박진영 'The Asiansoul' · 작곡 박진영, Deza · 편곡 박진영, 이해솔 · 제작 ZEMMIX C&B · 유통 워너뮤직코리아 · 2023. 12. 1. 디지털 싱글 (인순이·박미경·신효범·이은미)",
      links: [
        { label: "YouTube Music", url: "https://music.youtube.com/playlist?list=OLAK5uy_naMN4pkC2SuC8hArJouy_4KJMQU_WtVBc" },
        { label: "Apple Music", url: "https://music.apple.com/kr/album/one-last-time-single/1719039298" },
        { label: "Spotify", url: "https://open.spotify.com/track/0OYq4lcsCvC3aVWVt3lFTK" },
        { label: "멜론", url: "https://www.melon.com/album/detail.htm?albumId=11376398" }
      ] },
    { year: "2023", title: "처음 이야기 (어쩌다 사장3 OST)", kind: "OST 싱글", note: "류민희와 함께." },
    { year: "2024", title: "토닥토닥", kind: "디지털 싱글", note: "리코브/NHN벅스.", links: [{ label: "YT", url: "https://music.youtube.com/browse/MPREb_NLJbxXX6J3X" }, { label: "APPLE", url: "https://music.apple.com/kr/album/1787119633" }, { label: "SPOTIFY", url: "https://open.spotify.com/album/61AP6USxC0sDcxr3ktVbTK" }] },
    { year: "2024", title: "너의 이름을 세상이 부를 때", kind: "디지털 싱글", note: "리코브/NHN벅스.", links: [{ label: "YT", url: "https://music.youtube.com/browse/MPREb_SUq773Q9j40" }, { label: "APPLE", url: "https://music.apple.com/kr/album/1771373716" }, { label: "SPOTIFY", url: "https://open.spotify.com/album/3pDNQzz4RtG7LVOatoPreJ" }] },
    { featured: true, art: "assets/img/covers/cover2025.jpg", year: "2025", title: "인순이, 아름다운 우리나라", kind: "앨범", note: "2025년 2월 발매, 9곡 수록.",
      tracks: ["광주 광주", "밤이면 밤마다", "아름다운 우리나라", "야속한 내 님", "흔들리는 갈대", "너와 나", "욕망", "이별의 눈동자", "길섶에 핀 꽃"],
      credits: "정규 9곡 · 2025. 2. 19. 발매 · 기획 탑뮤직 · 유통 RIAK · 타이틀곡 '아름다운 우리나라'(원곡 1984년 발표). 곡별 세부 크레딧은 공식 자료 확인 후 추가됩니다.",
      links: [
        { label: "YouTube Music", url: "https://music.youtube.com/playlist?list=OLAK5uy_lg_F0ktj5nBUzEGoHZfANShrTMmUkL9xg" },
        { label: "Apple Music", url: "https://music.apple.com/kr/album/%EC%9D%B8%EC%88%9C%EC%9D%B4-%EC%95%84%EB%A6%84%EB%8B%A4%EC%9A%B4-%EC%9A%B0%EB%A6%AC%EB%82%98%EB%9D%BC/1797462838" },
        { label: "Spotify", url: "https://open.spotify.com/album/5ErPwrIgz4dd8y6wEhXnwU" }
      ] },
    { art: "assets/img/covers/coverDream.jpg", year: "2025", title: "그래도 꿈은 흐른다", kind: "싱글", note: "2025년 11월 발매. 여전히 꿈을 노래합니다.",
      tracks: ["그래도 꿈은 흐른다"],
      credits: "작사 Ashbun, 인순이 · 작곡 Ashbun · 편곡·프로듀싱 Ethan · 코프로듀싱 박세인 · 보컬 디렉팅 이현승 · 믹싱·마스터링 김석민 · 기획 주식회사 소솝 · 유통 NHN벅스 · 2025. 11. 28. 싱글",
      links: [
        { label: "YouTube Music", url: "https://music.youtube.com/playlist?list=OLAK5uy_niL1gSBUE-O3GKhYqSvAR8Kp_TjcutfWE" },
        { label: "Apple Music", url: "https://music.apple.com/kr/album/dream-single/1856589303" },
        { label: "Spotify", url: "https://open.spotify.com/album/6SnGs2WHjOOQko8116mIu8" },
        { label: "멜론", url: "https://www.melon.com/album/detail.htm?albumId=12411745" },
        { label: "공식 MV", url: "https://www.youtube.com/watch?v=6joBf4xW6Qs" }
      ] },
    { year: "2025", title: "바보 멍청이 똥개", kind: "디지털 싱글", note: "주식회사 소솝/NHN벅스. 성수동 버스킹으로 알려진 곡.", links: [{ label: "YT", url: "https://music.youtube.com/browse/MPREb_JHtphkLfUlU" }, { label: "APPLE", url: "https://music.apple.com/kr/album/1813115436" }, { label: "SPOTIFY", url: "https://open.spotify.com/album/0xq8CwhUOkFhFG8jZLp87q" }] }
  ],

  /* ---------- 연혁 타임라인 (milestone: 굵은 표시 / 검증 완료 항목 중심) ---------- */
  timeline: [
    { year: "1957", event: "4월 5일 출생 (본명 김인순)", note: "" },
    { year: "1978", event: "걸그룹 '희자매'로 데뷔", note: "타이틀곡 '실버들' TBC 가요차트 7주 1위", milestone: true },
    { year: "1980", event: "솔로 1집 《인연》으로 홀로서기", note: "" },
    { year: "1983", event: "'밤이면 밤마다' 발표", note: "디바의 시대 개막", milestone: true },
    { year: "1996", event: "《The Queen Of Soul》 발매", note: "'또'(박진영 곡) 수록, 정규 11집" },
    { year: "1999", event: "뉴욕 카네기홀 첫 공연", note: "", milestone: true },
    { year: "2004", event: "'친구여' (조PD 피처링) 히트", note: "정규 16집 《A To Z》 수록 (2004. 9. 9. 발매)" },
    { year: "2007", event: "'거위의 꿈' 발표", note: "위로와 도전의 아이콘이 되다", milestone: true },
    { year: "2009", event: "'아버지' 발표", note: "정규 17집 《인순이》 수록 (작사·작곡 이현승)" },
    { year: "2010", event: "카네기홀 두 번째 단독 콘서트", note: "" },
    { year: "2012", event: "사단법인 '인순이와 좋은 사람들' 설립", note: "" },
    { year: "2013", event: "다문화 대안학교 '해밀학교' 개교", note: "강원 홍천. 무대 밖의 또 다른 무대", milestone: true },
    { year: "2023", event: "KBS2 '골든걸스' 출연, 'One Last Time' 발표", note: "인순이·박미경·신효범·이은미", milestone: true },
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
