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
    { img: "assets/img/photos/kakao26.webp", w: 1600, h: 1067, year: "2024", cat: "화보", caption: "블랙 크롭 수트, 무대 뒤 안개 속에서" , en: { caption: "Black cropped suit, in the backstage haze" } },
    { img: "assets/img/photos/seasons-1.webp", w: 1281, h: 1600, year: "2024", cat: "화보", caption: "은빛 페인팅 재킷 — '더 시즌즈' 대기실에서 (2024. 12.)" , en: { caption: "Silver-painted jacket — backstage at 'The Seasons' (Dec 2024)" } },
    { img: "assets/img/photos/seasons-2.webp", w: 1277, h: 1600, year: "2024", cat: "화보", caption: "무대 직전의 프로필 — '더 시즌즈' 대기실에서 (2024. 12.)" , en: { caption: "A profile just before the stage — backstage at 'The Seasons' (Dec 2024)" } },
    { img: "assets/img/photos/hinkchi5.webp", w: 1067, h: 1600, year: "2025", cat: "화보", caption: "데님 수트, 스텝을 밟으며" , en: { caption: "Denim suit, mid-step" } },
    { img: "assets/img/photos/hm-3.webp", w: 1280, h: 824, year: "", cat: "기록", caption: "해밀학교 건축 후원자 벽 앞에서" , en: { caption: "At Haemil School's donor wall" } },
    { img: "assets/img/hero.webp", w: 1280, h: 720, year: "2025", cat: "무대", caption: "'그래도 꿈은 흐른다' MV, 합창단과 함께" , en: { caption: "'Still, the Dream Flows' MV, with the choir" } },
    { img: "assets/img/story.webp", w: 720, h: 720, year: "2025", cat: "포트레이트", caption: "'그래도 꿈은 흐른다' 세션 스틸" , en: { caption: "'Still, the Dream Flows' session still" } },
    { img: "assets/img/photos/press-03.webp", w: 420, h: 396, year: "1970년대", cat: "화보", caption: "장미와 함께한 젊은 날의 포트레이트" , en: { caption: "A young portrait with roses", year: "The 1970s" } },
    { img: "assets/img/photos/musical-chicago.webp", w: 480, h: 649, year: "", cat: "무대", caption: "뮤지컬 '시카고' 벨마 켈리 (2012·2013)" , en: { caption: "Velma Kelly in the musical 'Chicago' (2012-2013)" } },
    { img: "assets/img/photos/kakao25.webp", w: 1600, h: 1067, year: "", cat: "화보", caption: "붉은 빛망울 사이의 실루엣" , en: { caption: "A silhouette among red bokeh lights" } },
    { img: "assets/img/photos/press-1723.webp", w: 500, h: 333, year: "", cat: "무대", caption: "흰 모자와 베일, 순백의 퍼포먼스" , en: { caption: "White hat and veil, a performance in white" } },
    { img: "assets/img/photos/hinkchi1.webp", w: 1067, h: 1600, year: "", cat: "화보", caption: "오버사이즈 수트 스튜디오 화보" , en: { caption: "Oversized-suit studio editorial" } },
    { img: "assets/img/photos/haemill-2013.webp", w: 1024, h: 681, year: "2013", cat: "기록", caption: "해밀학교 교사 앞, 학생들과 하트" , en: { caption: "Hearts with students in front of Haemil School" } },
    { img: "assets/img/photos/haemill-hanbok.webp", w: 600, h: 458, year: "", cat: "기록", caption: "해밀학교, 한복 입은 졸업생들과" , en: { caption: "With graduates in hanbok at Haemil School" } },
    { img: "assets/img/photos/haemill-class.webp", w: 600, h: 400, year: "", cat: "기록", caption: "해밀학교 교실에서 학생들과" , en: { caption: "In a Haemil School classroom with students" } },
    { img: "assets/img/photos/haemill-halloween.webp", w: 600, h: 400, year: "", cat: "기록", caption: "해밀학교 한옥 교정의 핼러윈 파티" , en: { caption: "Halloween at Haemil School's hanok campus" } },
    { img: "assets/img/photos/haemill-wall.webp", w: 450, h: 658, year: "", cat: "기록", caption: "건축 후원자의 이름이 새겨진 해밀학교 나무 벽 앞에서" , en: { caption: "By Haemil School's wooden donor wall" } },
    { img: "assets/img/photos/haemill-library.webp", w: 650, h: 364, year: "", cat: "기록", caption: "해밀학교 서가 계단에서 학생들과" , en: { caption: "On the library steps with Haemil students" } },
    { img: "assets/img/stills/s5.webp", w: 1280, h: 720, year: "2025", cat: "무대", caption: "스포트라이트 아래, 두 팔을 펴며" , en: { caption: "Arms open under the spotlight" } },
  ],

  /* ---------- 지난 무대 리캡 (VIEW RECAP: 사진 갤러리 + 영상) ----------
     · 공연명은 사진·영상 안에서 검증된 것만 표기 (로고·현수막 등)
     · 미확인 무대는 중립적 제목 + "확인 중" 표기로만 묶는다 */
  recaps: [
    {
      date: "2025. 2. 15.", year: "2025",
      title: "한터뮤직어워즈",
      en: { title: "Hanteo Music Awards", place: "Jangchung Arena, Seoul", desc: "Two days at the Hanteo Music Awards (Feb 15-16) — 'A Goose's Dream' with Kim Jae-joong, trophy and flowers, and a green-dress stage greeting, captured by family." },
      place: "장충체육관",
      desc: "한터뮤직어워즈의 이틀(2. 15.–16.) — 김재중과 함께 부른 '거위의 꿈' 무대, 트로피와 꽃다발, 초록 드레스의 무대 인사까지. 가족의 카메라로 남긴 기록.",
      bg: "assets/img/photos/hanteo-1.webp",
      photos: [
        { img: "assets/img/photos/hanteo-1.webp", w: 1200, h: 1600, caption: "트로피와 꽃다발", en: { caption: "With trophy and flowers" } },
        { img: "assets/img/photos/hanteo-2.webp", w: 1200, h: 1600, caption: "트로피를 들어 올리며", en: { caption: "Raising the trophy" } },
        { img: "assets/img/photos/hanteo-3.webp", w: 1600, h: 1227, caption: "무대 인사", en: { caption: "A stage greeting" } },
        { img: "assets/img/photos/hanteo-4.webp", w: 900, h: 1600, caption: "스크린 속 초록 드레스", en: { caption: "Green dress, on the screen" } },
        { img: "assets/img/photos/hanteo-5.webp", w: 1600, h: 1200, caption: "한터뮤직어워즈 무대", en: { caption: "On the Hanteo Music Awards stage" } }
      ]
    },
    {
      date: "2025. 1. 21.", year: "2025",
      title: "열린음악회 녹화",
      en: { title: "Open Concert Taping", place: "KBS — Ep.1514 aired Feb 23, 2025", desc: "A yellow flower on a black dress, laughter with the bassist backstage, and the stage rehearsal on taping day." },
      place: "KBS · 1514회 방송 2025. 2. 23.",
      desc: "노란 꽃을 꽂은 검은 드레스, 베이시스트와 웃던 대기실, 그리고 무대 리허설까지 — 녹화일의 백스테이지 기록.",
      bg: "assets/img/photos/openc-1.webp",
      photos: [
        { img: "assets/img/photos/openc-1.webp", w: 1200, h: 1600, caption: "무대 리허설", en: { caption: "Stage rehearsal" } },
        { img: "assets/img/photos/openc-2.webp", w: 1200, h: 1600, caption: "베이시스트와 함께", en: { caption: "With the bassist" } },
        { img: "assets/img/photos/openc-3.webp", w: 1200, h: 1600, caption: "대기실의 웃음", en: { caption: "Laughter in the green room" } },
        { img: "assets/img/photos/openc-4.webp", w: 1200, h: 1600, caption: "출연 대기", en: { caption: "Waiting to go on" } },
        { img: "assets/img/photos/openc-5.webp", w: 1232, h: 1600, caption: "노란 꽃, 검은 드레스", en: { caption: "A yellow flower, a black dress" } },
        { img: "assets/img/photos/openc-6.webp", w: 1268, h: 1600, caption: "백스테이지 포트레이트", en: { caption: "A backstage portrait" } }
      ]
    },
    {
      date: "2024. 12. 30.", year: "2024",
      title: "2024 인순이 디너쇼",
      en: { title: "2024 Insooni Dinner Show", place: "Grand InterContinental Seoul Parnas", desc: "The first year-end dinner show in five years, and the weeks of dance practice behind it." },
      place: "그랜드 인터컨티넨탈 서울 파르나스",
      desc: "5년 만의 연말 디너쇼. 무대 뒤에는 몇 주간의 안무 연습이 있었습니다 — 연습실의 기록.",
      video: "assets/media/dinner-practice.mp4",
      poster: "assets/img/photos/dsprac-1.webp",
      bg: "assets/img/photos/dsprac-1.webp",
      photos: [
        { img: "assets/img/photos/dsprac-1.webp", w: 1600, h: 900, caption: "안무 연습실에서", en: { caption: "In the dance studio" } },
        { img: "assets/img/photos/dsprac-2.webp", w: 900, h: 1600, caption: "거울 앞의 시간", en: { caption: "Time before the mirror" } }
      ]
    },
    {
      date: "", year: "",
      title: "재즈 라이브",
      en: { title: "Jazz Live", place: "", desc: "Date and venue being confirmed. A small-theater night with a jazz band." },
      place: "",
      desc: "소극장의 밤. 재즈 밴드와 함께한 라이브의 기록입니다.",
      video: "assets/media/jazz-live.mp4",
      poster: "assets/img/photos/jazzc-1.webp",
      bg: "assets/img/photos/jazzc-1.webp",
      photos: [
        { img: "assets/img/photos/jazzc-1.webp", w: 1600, h: 900, caption: "스포트라이트 아래, 재즈 밴드와", en: { caption: "Under the spotlight, with the jazz band" } },
        { img: "assets/img/photos/jazzc-2.webp", w: 1200, h: 1600, caption: "객석에서 본 무대", en: { caption: "The stage, seen from the audience" } },
        { img: "assets/img/photos/jazzc-3.webp", w: 900, h: 1600, caption: "소극장의 밤", en: { caption: "A night at the small theater" } }
      ]
    },

    {
      year: "2025",
      title: "Woman of Influence 2025",
      en: { title: "Woman of Influence 2025", place: "Pearl S. Buck International, USA (2025)", desc: "Award ceremony highlights: the trophy moment, a flag presentation, the acceptance speech, and a surprise song among the guests." },
      place: "Pearl S. Buck International 시상식 · 미국 (2025)",
      desc: "펄벅 인터내셔널 '올해의 여성상' 수상 현장. 시상과 성조기 전달, 수상 연설, 객석 사이에서 부른 축하 무대까지 — 가족의 카메라로 남긴 실황.",
      video: "assets/media/woi2025.mp4",
      poster: "assets/img/photos/woi-award.webp",
      bg: "assets/img/photos/woi-award.webp",
      photos: [
        { img: "assets/img/photos/woi-award.webp", w: 1074, h: 1542, caption: "'올해의 여성상' 시상 순간", en: { caption: "The 'Woman of Influence' award moment" } },
        { img: "assets/img/photos/woi-flag.webp", w: 900, h: 1600, caption: "기념 성조기 전달", en: { caption: "A commemorative flag presentation" } },
        { img: "assets/img/photos/woi-speech.webp", w: 900, h: 1600, caption: "수상 연설, 연단에서", en: { caption: "The acceptance speech, at the podium" } },
        { img: "assets/img/photos/woi-podium.webp", w: 900, h: 1600, caption: "Woman of Influence 2025 로고 앞에서", en: { caption: "In front of the Woman of Influence 2025 logo" } },
        { img: "assets/img/photos/woi-song.webp", w: 900, h: 1600, caption: "객석 사이에서 부른 축하 무대", en: { caption: "A celebratory song among the guests" } },
        { img: "assets/img/photos/woi-audience.webp", w: 900, h: 1600, caption: "객석에서, 박수와 함께", en: { caption: "From the audience, amid applause" } }
      ]
    },
    {
      year: "2025",
      title: "성수동 버스킹",
      en: { title: "Seongsu-dong Busking", place: "Seongsu-dong, Seoul", desc: "A street stage in Seongsu-dong, singing 'Silly Fool Puppy'." },
      place: "서울 성수동",
      desc: "성수동 거리 무대. '바보 멍청이 똥개'를 부른 현장.",
      youtubeId: "AHGXsBvkVVI",
      bg: "assets/img/thumbs/busking.webp",
      photos: []
    },
    {
      year: "2025",
      title: "BOYNEXTDOOR와 함께",
      en: { title: "With BOYNEXTDOOR", place: "", desc: "A cross-generation collaboration on 'Silly Fool Puppy'." },
      desc: "'바보 멍청이 똥개' 세대를 넘은 컬래버 무대.",
      youtubeId: "neUVzSyKCn8",
      bg: "assets/img/thumbs/bnd.webp",
      photos: []
    },
    {
      year: "2025",
      title: "콜미 (CALL ME) 커버",
      en: { title: "'CALL ME' Cover", place: "", desc: "'CALL ME' sung the Insooni way." },
      desc: "'콜미(CALL ME)'를 인순이 스타일로 부른 커버 무대.",
      youtubeId: "9wwtxL2TLJQ",
      bg: "assets/img/thumbs/callme.webp",
      photos: []
    },
    {
      year: "",
      title: "시어트리컬 콘서트 실황",
      en: { title: "Theatrical Concert Live", place: "", desc: "Show name and year being confirmed. A grand stage with orchestra, rococo costumes and sequined jazz numbers." },
      place: "",
      desc: "오케스트라 협연, 로코코 의상극, 스팽글 재즈 넘버까지 — 하나의 카메라가 따라간 대형 무대의 밤입니다.",
      bg: "assets/img/photos/dsc0628.webp",
      photos: [
        { img: "assets/img/photos/dsc0427.webp", w: 1600, h: 1065, caption: "깃털 장식 흰 의상, 오케스트라와 함께", en: { caption: "White feathered costume, with the orchestra" } },
        { img: "assets/img/photos/dsc0628.webp", w: 1600, h: 1063, caption: "댄서들과 함께한 스팽글 무대", en: { caption: "A sequined number with the dancers" } },
        { img: "assets/img/photos/dsc0284.webp", w: 1600, h: 1063, caption: "순백의 무대 세트", en: { caption: "A pure-white stage set" } },
        { img: "assets/img/photos/dsc0369.webp", w: 1600, h: 1063, caption: "흰 의상의 군무와 함께", en: { caption: "With a corps in white" } },
        { img: "assets/img/photos/dsc0081.webp", w: 1063, h: 1600, caption: "쏟아지는 조명 아래, 스팽글 드레스", en: { caption: "A sequined dress under pouring light" } },
        { img: "assets/img/photos/dsc9427.webp", w: 1600, h: 1063, caption: "원색의 무대, 폭발하는 에너지", en: { caption: "A vivid stage, explosive energy" } }
      ]
    },
    {
      year: "",
      title: "네온 시티 무대",
      en: { title: "Neon City Stage", place: "", desc: "Show name and year being confirmed. A live record on an LED cityscape stage." },
      place: "",
      desc: "도시의 불빛을 닮은 LED 무대. 그날의 실황 기록입니다.",
      bg: "assets/img/photos/kakao21.webp",
      photos: [
        { img: "assets/img/photos/kakao21.webp", w: 1600, h: 1067, caption: "네온 조명의 대형 무대", en: { caption: "A large stage in neon light" } },
        { img: "assets/img/photos/kakao22.webp", w: 1600, h: 1067, caption: "도시의 불빛을 닮은 무대 세트", en: { caption: "A stage set like city lights" } }
      ]
    }
  ],

  /* ---------- 지난 공연 아카이브 (플레이DB·보도 검증, 2026.7 리서치) ---------- */
  pastShows: [
    { date: "2026-07-28", city: "", venue: "tvN", title: "'킬잇' 파이널 깜짝 무대", en: { title: "Surprise stage on tvN 'Kill It' finale" },
      recap: { desc: "tvN '킬잇: 스타일 크리에이터 대전쟁' 파이널 — 요요의 퍼스널 쇼케이스에 깜짝 조력자로 등장해 'This Is Me'를 불렀습니다. tvN 공식 클립.", en: { desc: "A surprise appearance on the finale of tvN's 'Kill It' — joining Yoyo's personal showcase with 'This Is Me'. Official tvN clips." },
        clips: [
          { id: "08uaw8xIVtg", title: "요요의 쇼케이스 — 깜짝 등장", en: { title: "Yoyo's showcase — the surprise entrance" } },
          { id: "XVFE7KN9KVE", title: "인순이가 왜 여기서 나와?", en: { title: "'Why is Insooni here?'" } }
        ] } },
    { date: "2026-07-26", city: "서울", venue: "고척스카이돔", title: "불꽃야구 생중계 애국가 열창", en: { venue: "Gocheok Sky Dome", title: "National anthem at Gocheok Sky Dome", city: "Seoul" },
      recap: { desc: "돔을 가득 채운 애국가. 현장 관객의 기록으로 남은 그날의 목소리.", en: { desc: "The national anthem filling the dome — captured by a fan in the stands." },
        clips: [{ id: "0dz08JtS3MQ", title: "애국가 열창 (현장 기록)", en: { title: "National anthem (fan video)" } }] } },
    { date: "2026-07-22", city: "서울", venue: "하나금융 명동사옥", title: "하나다문화가정대상 축하공연", en: { title: "Hana Multicultural Awards performance", city: "Seoul" } },
    { date: "2026-07-12", city: "서울", venue: "KBS홀", title: "열린음악회 1581회 피날레", en: { venue: "KBS Hall", title: "Open Concert Ep.1581 finale", city: "Seoul" },
      recap: { desc: "1581회 피날레 무대. KBS 공식 클립.", en: { desc: "Finale stages from Ep.1581 — official KBS clips." },
        clips: [
          { id: "9uP_XhjG5z8", title: "Higher (with Rap.D.Y)" },
          { id: "lfIUDMKHBPM", title: "Let Everyone Shine" }
        ] } },
    { date: "2026-06-21", city: "", venue: "KBS", title: "열린음악회 김구 탄생 150주년 특집", en: { title: "Open Concert, Kim Koo 150th special" },
      recap: { desc: "김구 탄생 150주년 특집 무대. KBS 공식 클립.", en: { desc: "Kim Koo 150th anniversary special — official KBS clip." },
        clips: [{ id: "Djq4n3j6Vv0", title: "친구여 (with Rap.D.Y)", en: { title: "Chinguyeo (with Rap.D.Y)" } }] } },
    { date: "2026-06-05", city: "경주", venue: "봉황대 광장 특설무대", title: "봉황대 뮤직스퀘어 개막공연", en: { venue: "Bonghwangdae Square stage", title: "Bonghwangdae Music Square opening", city: "Gyeongju" },
      recap: { desc: "경주 봉황대 아래에서 김태우와 함께 연 개막 무대. 공식 뉴스 리포트와 현장 기록.", en: { desc: "Opening night beneath Gyeongju's Bonghwangdae mound, opened with Kim Tae-woo — official news report and fan videos." },
        clips: [
          { id: "kaPBHZMMSpw", title: "개막 뉴스 리포트 (헬로tv뉴스)", en: { title: "Opening news report (HelloTV News)" } },
          { id: "MB_yMYiURN4", title: "거위의 꿈", en: { title: "A Goose's Dream" } },
          { id: "7pTvvV8YhIk", title: "밤이면 밤마다", en: { title: "Night After Night" } },
          { id: "A5nEuLnfPy0", title: "행복", en: { title: "Happiness" } },
          { id: "8FBdAqvFFxI", title: "풀 영상", en: { title: "Full set" } }
        ] } },
    { date: "2026-05-09", city: "안동", venue: "안동문화예술의전당 웅부홀", title: "어버이날 특별기획 '두 사랑 이야기'", en: { venue: "Andong Arts Center, Ungbu Hall", title: "Parents' Day Special 'Two Love Stories'", city: "Andong" },
      poster: "assets/img/posters/andong2026.webp", pw: 721, phh: 1000,
      recap: { desc: "명창 유지숙과 함께한 어버이날 특별기획 — 2025 국립극장 여우락 초연작의 안동 무대. 한웅원·박범태 참여.", en: { desc: "A Parents' Day special with master singer Yoo Ji-sook — the Yeowoorak premiere brought to Andong, with Han Woong-won and Park Beom-tae." } } },
    { date: "2026-04-07", city: "양산", venue: "웅상체육공원", title: "열린음악회 양산 특집 녹화", en: { venue: "Ungsang Sports Park", title: "Open Concert Yangsan special taping", city: "Yangsan" },
      recap: { desc: "양산 특집 무대 (4월 26일 방송). KBS 공식 클립.", en: { desc: "Yangsan special, aired April 26 — official KBS clip." },
        clips: [{ id: "LLHR9WWBIAg", title: "밤이면 밤마다", en: { title: "Night After Night" } }] } },
    { date: "2026-03-16", city: "", venue: "TV조선", title: "'조선의 사랑꾼' 고정 합류 첫 방송", en: { venue: "TV Chosun", title: "Joined TV Chosun 'Love Interventions'" },
      recap: { desc: "일상을 처음 공개한 고정 합류 첫 방송. TV조선 공식 클립.", en: { desc: "Her first episode as a regular cast member — official TV Chosun clips." },
        clips: [
          { id: "OIKqhdBojRo", title: "라디오 생방송 공개 고백", en: { title: "A surprise on-air confession" } },
          { id: "FGrEZTiozxI", title: "인순이 부부의 이야기 (풀버전)", en: { title: "The couple's story (full)" } }
        ] } },
    { date: "2026-02-22", city: "인천", venue: "", title: "열린음악회 1562회 피날레", en: { title: "Open Concert Ep.1562 finale", city: "Incheon" },
      recap: { desc: "1562회 피날레 무대. KBS 공식 클립.", en: { desc: "Finale stage from Ep.1562 — official KBS clip." },
        clips: [{ id: "g0ChQ6VTYaI", title: "열정 (with Rap.D.Y)", en: { title: "Passion (with Rap.D.Y)" } }] } },
    { date: "2025-12-27", city: "밀양", venue: "밀양아리랑아트센터", title: "인순이 스페셜 송년 콘서트", en: { title: "Insooni Special Year-End Concert", city: "Miryang" } },
    { date: "2025-12-01", city: "", venue: "", title: "뷰티플 비전콘서트 — 신곡 첫 무대", en: { title: "Beautiful Vision Concert — new single debut" } },
    { date: "2025-11-05", city: "", venue: "MBN", title: "'언포게터블 듀엣' 출연", en: { title: "MBN 'Unforgettable Duet'" },
      recap: { desc: "1회 무대. MBN MUSIC 공식 클립.", en: { desc: "From the premiere episode — official MBN MUSIC clip." },
        clips: [{ id: "Eexbh5AeSIs", title: "선물", en: { title: "The Gift" } }] } },
    { date: "2025-10-25", city: "양산", venue: "황산공원", title: "낙동강 시월愛 콘서트", en: { venue: "Hwangsan Park", title: "Nakdong River October Concert", city: "Yangsan" },
      recap: { desc: "황산공원을 채운 1만 관중. KNN 공식 스케치와 현장 기록.", en: { desc: "Ten thousand by the Nakdong river — official KNN coverage and fan videos." },
        clips: [
          { id: "_W71GxdH5AY", title: "KNN 현장 스케치", en: { title: "KNN highlights" } },
          { id: "k-0SzKmfWRk", title: "거위의 꿈 (현장 기록)", en: { title: "A Goose's Dream (fan video)" } },
          { id: "X2N-AIxwCnI", title: "친구여 (현장 기록)", en: { title: "Chinguyeo (fan video)" } }
        ] } },
    { date: "2025-09-27", city: "경산", venue: "DYC 특설무대", title: "DYC 음악회 — 교향악단 협연", en: { title: "DYC Concert with symphony orchestra", city: "Gyeongsan" } },
    { date: "2025-09-26", city: "울주", venue: "영남알프스 웰컴센터", title: "울주세계산악영화제 개막 축하공연", en: { venue: "Yeongnam Alps Welcome Center", title: "Ulju Mountain Film Festival opening", city: "Ulju" },
      recap: { desc: "영남알프스 아래 개막 축하 무대. 현장 관객의 기록 영상.", en: { desc: "Opening celebration beneath the Yeongnam Alps — fan video." },
        clips: [
          { id: "mxRGpqyy-yE", title: "개막 축하 무대 (현장 기록)", en: { title: "Opening stage (fan video)" } },
          { id: "Pq3OJR_hen8", title: "인순이 인사 영상 (영화제 공식)", en: { title: "Greeting video (festival official)" } }
        ] } },
    { date: "2025-09-21", city: "서울", venue: "마루공원", title: "국악한마당 — 인순이×유지숙 '지음'", en: { venue: "Maru Park", title: "KBS Gugak Hanmadang with Yoo Ji-sook", city: "Seoul" },
      recap: { desc: "서도민요 명창 유지숙과의 '지음' 무대 (10월 25일 방송). KBS 공식 클립.", en: { desc: "With master singer Yoo Ji-sook, aired October 25 — official KBS clips." },
        clips: [
          { id: "mZahvsE3mtk", title: "긴 편지", en: { title: "A Long Letter" } },
          { id: "id_fzJtGWvI", title: "사설난봉가–친구여 (듀엣)", en: { title: "Saseol-nanbongga / Chinguyeo (duet)" } },
          { id: "9ZwwSPiwCNw", title: "싸름타령", en: { title: "Ssareum-taryeong" } }
        ] } },
    { date: "2025-09-14", city: "인천", venue: "송도 트라이보울", title: "송도 재즈 페스티벌 피날레", en: { venue: "Songdo Tri-bowl", title: "Songdo Jazz Festival finale", city: "Incheon" },
      recap: { desc: "재즈 쿼텟과 함께한 피날레. 현장 관객의 기록 영상.", en: { desc: "Festival finale with a jazz quartet — fan videos." },
        clips: [
          { id: "LpkGaVPA2d4", title: "공식 애프터무비 (인천문화재단)", en: { title: "Official aftermovie (IFAC)" } },
          { id: "IgIIVNg8sP8", title: "Mr. Saturday Night" },
          { id: "kAk1C7MoVWk", title: "Besame Mucho" },
          { id: "GumUiPNx6Hw", title: "거위의 꿈", en: { title: "A Goose's Dream" } }
        ] } },
    { date: "2026-07", city: "", venue: "SBS러브FM", title: "'인생은 오디션' 특별 심사", en: { title: "Radio 'Life is Audition' guest judge" } },
    { date: "2025-07-09", city: "서울", venue: "국립극장 하늘극장", title: "여우락 페스티벌 '두 사랑 이야기'", en: { title: "Yeowoorak Festival 'Two Love Stories'", city: "Seoul" }, poster: "assets/img/posters/p217362.webp", pw: 300, phh: 400 },
    { date: "2024-05-18", city: "인천", venue: "송도컨벤시아", title: "골든걸스 콘서트", en: { title: "Golden Girls Concert", city: "Incheon" }, poster: "assets/img/posters/p201859.webp", pw: 300, phh: 400 },
    { date: "2024-04-20", city: "부산", venue: "KBS부산홀", title: "골든걸스 전국투어", en: { title: "Golden Girls National Tour", city: "Busan" }, poster: "assets/img/posters/p200936.webp", pw: 300, phh: 400 },
    { date: "2024-03-02", city: "성남", venue: "성남아트센터", title: "골든걸스 콘서트", en: { title: "Golden Girls Concert", city: "Seongnam" }, poster: "assets/img/posters/p198416.webp", pw: 230, phh: 280 },
    { date: "2023-12-14", city: "안성", venue: "안성맞춤아트홀", title: "인순이 콘서트", en: { title: "Insooni Concert", city: "Anseong" }, poster: "assets/img/posters/p196015.webp", pw: 230, phh: 280 },
    { date: "2023-02-18", city: "캘리포니아", venue: "페창가 리조트", title: "인순이 단독 라이브", en: { title: "Insooni Live", city: "California" } },
    { date: "2022-12-30", city: "전주", venue: "삼성문화회관", title: "인순이 콘서트", en: { title: "Insooni Concert", city: "Jeonju" }, poster: "assets/img/posters/p181291.webp", pw: 230, phh: 280 },
    { date: "2019-12-21", city: "서울", venue: "파르나스 그랜드볼룸", title: "연말 디너쇼", en: { title: "Year-End Dinner Show", city: "Seoul" }, poster: "assets/img/posters/p150958.webp", pw: 230, phh: 280 },
    { date: "2019-01-12", city: "부산", venue: "부산문화회관", title: "인순이 콘서트", en: { title: "Insooni Concert", city: "Busan" }, poster: "assets/img/posters/p135462.webp", pw: 230, phh: 280 },
    { date: "2018-12-23", city: "서울", venue: "롯데호텔 크리스탈볼룸", title: "인순이 디너쇼", en: { title: "Insooni Dinner Show", city: "Seoul" }, poster: "assets/img/posters/p133246.webp", pw: 230, phh: 280 },
    { date: "2018-03-31", city: "서울", venue: "올림픽홀", title: "데뷔 40주년 해 단독 공연", en: { title: "Solo Concert, 40th Anniversary Year", city: "Seoul" }, poster: "assets/img/posters/p121047.webp", pw: 230, phh: 280 },
    { date: "2017-12-29", city: "김해", venue: "김해문화의전당", title: "인순이 콘서트", en: { title: "Insooni Concert", city: "Gimhae" }, poster: "assets/img/posters/p116909.webp", pw: 230, phh: 280 },
    { date: "2017-12-22", city: "서울", venue: "롯데호텔 크리스탈볼룸", title: "인순이 디너쇼", en: { title: "Insooni Dinner Show", city: "Seoul" }, poster: "assets/img/posters/p116348.webp", pw: 230, phh: 280 },
    { date: "2017-09-16", city: "부산", venue: "벡스코 오디토리움", title: "인순이 콘서트", en: { title: "Insooni Concert", city: "Busan" }, poster: "assets/img/posters/p112242.webp", pw: 230, phh: 280 },
    { date: "2016-12-21", city: "서울", venue: "그랜드하얏트 그랜드볼룸", title: "인순이 디너쇼", en: { title: "Insooni Dinner Show", city: "Seoul" }, poster: "assets/img/posters/p100315.webp", pw: 230, phh: 280 },
    { date: "2016-02-16", city: "서울", venue: "세종문화회관 대극장", title: "인순이 콘서트", en: { title: "Insooni Concert", city: "Seoul" }, poster: "assets/img/posters/p87087.webp", pw: 230, phh: 280 },
    { date: "2015-12-22", city: "서울", venue: "그랜드하얏트 그랜드볼룸", title: "인순이 디너쇼", en: { title: "Insooni Dinner Show", city: "Seoul" }, poster: "assets/img/posters/p84878.webp", pw: 230, phh: 280 },
    { date: "2015-01-24", city: "수원", venue: "경기아트센터", title: "인순이 콘서트", en: { title: "Insooni Concert", city: "Suwon" }, poster: "assets/img/posters/p72397.webp", pw: 230, phh: 280 },
    { date: "2014-12-24", city: "서울", venue: "그랜드하얏트 그랜드볼룸", title: "인순이 디너쇼", en: { title: "Insooni Dinner Show", city: "Seoul" }, poster: "assets/img/posters/p68680.webp", pw: 230, phh: 280 },
    { date: "2013-12-28", city: "서울", venue: "그랜드하얏트 그랜드볼룸", title: "인순이 디너쇼", en: { title: "Insooni Dinner Show", city: "Seoul" }, poster: "assets/img/posters/p54963.webp", pw: 230, phh: 280 },
    { date: "2013-07-06", city: "서울", venue: "국립극장 해오름극장", title: "뮤지컬 '시카고' 벨마 켈리", en: { title: "Musical CHICAGO, Velma Kelly", city: "Seoul" }, poster: "assets/img/posters/p46887.webp", pw: 230, phh: 280 },
    { date: "2012-12-23", city: "서울", venue: "63빌딩 컨벤션센터", title: "인순이 디너쇼", en: { title: "Insooni Dinner Show", city: "Seoul" }, poster: "assets/img/posters/p42065.webp", pw: 230, phh: 280 },
    { date: "2012-06-10", city: "서울", venue: "디큐브아트센터", title: "뮤지컬 '시카고' 벨마 켈리", en: { title: "Musical CHICAGO, Velma Kelly", city: "Seoul" }, poster: "assets/img/posters/p34835.webp", pw: 230, phh: 280 },
    { date: "2012-05-19", city: "성남", venue: "성남아트센터", title: "콘서트 '판타지아'", en: { title: "Concert 'Fantasia'", city: "Seongnam" }, poster: "assets/img/posters/p33438.webp", pw: 230, phh: 280 },
    { date: "2012-05-09", city: "부산", venue: "롯데호텔 크리스탈볼룸", title: "인순이 디너쇼", en: { title: "Insooni Dinner Show", city: "Busan" }, poster: "assets/img/posters/p33439.webp", pw: 230, phh: 280 },
    { date: "2011-12-22", city: "서울", venue: "센트럴시티 밀레니엄홀", title: "인순이 디너쇼", en: { title: "Insooni Dinner Show", city: "Seoul" }, poster: "assets/img/posters/p29737.webp", pw: 230, phh: 280 },
    { date: "2011-10-12", city: "멜버른", venue: "시드니 마이어 뮤직 볼", title: "'나는 가수다' 호주 특별공연", en: { title: "'I Am a Singer' Special, Australia", city: "Melbourne" } },
    { date: "2011-09-17", city: "서울", venue: "샤롯데씨어터", title: "뮤지컬 '캣츠' 그리자벨라", en: { title: "Musical CATS, Grizabella", city: "Seoul" } },
    { date: "2010-11-20", city: "청주", venue: "청주 실내체육관", title: "콘서트 '판타지아'", en: { title: "Concert 'Fantasia'", city: "Cheongju" }, poster: "assets/img/posters/p18774.webp", pw: 230, phh: 280 },
    { date: "2010-02-05", city: "뉴욕", venue: "카네기홀 아이작 스턴 홀", title: "두 번째 카네기홀 콘서트", en: { title: "Second Carnegie Hall Concert", city: "New York" } },
    { date: "2009-12-30", city: "서울", venue: "63빌딩 컨벤션센터", title: "아듀 2009 송년 디너쇼", en: { title: "Adieu 2009 Dinner Show", city: "Seoul" }, poster: "assets/img/posters/p13761.webp", pw: 230, phh: 280 },
    { date: "2009-12-27", city: "서울", venue: "올림픽홀", title: "콘서트 'LEGEND & FOREVER'", en: { title: "'LEGEND & FOREVER' Concert", city: "Seoul" }, poster: "assets/img/posters/p13743.webp", pw: 230, phh: 280 },
    { date: "2009-10-24", city: "안산", venue: "안산문화예술의전당", title: "데뷔 30주년 'Legend'", en: { title: "30th Anniversary 'Legend'", city: "Ansan" }, poster: "assets/img/posters/p12592.webp", pw: 230, phh: 280 },
    { date: "2008-12-19", city: "서울", venue: "그랜드하얏트 그랜드볼룸", title: "송년 디너쇼 '뜨거운 만남'", en: { title: "Year-End Dinner Show 'Hot Encounter'", city: "Seoul" }, poster: "assets/img/posters/p6851.webp", pw: 230, phh: 280 },
    { date: "2008-04-03", city: "서울", venue: "세종문화회관 대극장", title: "데뷔 30주년 전국투어", en: { title: "30th Anniversary National Tour", city: "Seoul" }, poster: "assets/img/posters/p3429.webp", pw: 230, phh: 280 },
    { date: "2007-12-22", city: "서울", venue: "스위스 그랜드 호텔", title: "인순이 콘서트", en: { title: "Insooni Concert", city: "Seoul" }, poster: "assets/img/posters/p503.webp", pw: 300, phh: 204 },
    { date: "2007-06-02", city: "부산", venue: "부산 KBS홀", title: "콘서트 '드리머'", en: { title: "Concert 'Dreamer'", city: "Busan" } },
    { date: "2006-12-22", city: "서울", venue: "63빌딩 국제회의장", title: "송년 디너쇼", en: { title: "Year-End Dinner Show", city: "Seoul" }, poster: "assets/img/posters/p2590.webp", pw: 300, phh: 204 },
    { date: "2005-12-22", city: "서울", venue: "롯데호텔 크리스탈볼룸", title: "송년 디너쇼", en: { title: "Year-End Dinner Show", city: "Seoul" }, poster: "assets/img/posters/p2469.webp", pw: 300, phh: 204 },
    { date: "2004-12-22", city: "서울", venue: "롯데호텔 크리스탈볼룸", title: "송년 디너쇼", en: { title: "Year-End Dinner Show", city: "Seoul" }, poster: "assets/img/posters/p3028.webp", pw: 300, phh: 204 },
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
    image: "assets/img/stills/s6.webp"
  },

  /* ---------- 소식 (type: 공지 | 공연 | 방송 | 보도) ---------- */
  news: [
    { date: "2026-07-28", type: "방송", title: "tvN '킬잇' 파이널 깜짝 무대", excerpt: "파이널 쇼케이스의 깜짝 조력자 — 'This Is Me'로 다름의 가치를 노래했습니다.", en: { title: "Surprise stage on tvN 'Kill It' finale", excerpt: "A surprise helper on the finale showcase — singing 'This Is Me' for everyone born different." } },
    { date: "2026-07-26", type: "방송", title: "고척스카이돔에서 애국가 열창", excerpt: "특집 불꽃야구 생중계 무대. 돔을 채운 목소리.", en: { title: "National anthem at Gocheok Sky Dome", excerpt: "A live broadcast moment that filled the dome." } },
    { date: "2026-06-05", type: "공연", title: "경주 봉황대 뮤직스퀘어 개막", excerpt: "봉황대 광장 특설무대, 2026 시즌의 문을 열다.", en: { title: "Opening Bonghwangdae Music Square, Gyeongju", excerpt: "Opening the 2026 season on the open-air stage." } },
    { date: "2026-03-16", type: "방송", title: "TV조선 '조선의 사랑꾼' 고정 합류", excerpt: "113회부터 새 멤버로 합류해 고정 출연 중입니다.", en: { title: "Joined TV Chosun 'Love Interventions'", excerpt: "A regular cast member since episode 113." } },
    { date: "2026-03-10", type: "공연", title: "5월 9일 안동 '두 사랑 이야기' 예매 오픈", excerpt: "어버이날 특별기획 — 인순이 & 유지숙. 안동문화예술의전당 웅부홀, 티켓링크에서 예매할 수 있습니다.", en: { title: "Andong 'Two Love Stories' on sale for May 9", excerpt: "A Parents' Day special with Yoo Ji-sook at Andong Culture & Arts Center. Tickets on Ticketlink." } },
    { date: "2025-11-28", type: "발매", title: "새 싱글 '그래도 꿈은 흐른다' 발매", excerpt: "실패 속에서도 계속되는 꿈. 공식 뮤직비디오가 유튜브에 공개되었습니다.", en: { title: "New single 'Still, the Dream Flows' released", excerpt: "A dream that keeps flowing through failure. The official music video is on YouTube." } },
    { date: "2025-08-21", type: "수상", title: "펄벅 인터내셔널 '올해의 여성상' 수상", excerpt: "Woman of Influence 2025. 노래와 나눔이 함께 만든 자리 — 시상식 리캡을 라이브에서 볼 수 있습니다.", en: { title: "Woman of Influence 2025, Pearl S. Buck International", excerpt: "An award where song and giving met. See the ceremony recap on the Tour page." } },
    { date: "2025-07-09", type: "공연", title: "여우락 페스티벌 '두 사랑 이야기'", excerpt: "국립극장 하늘극장, 인순이 x 유지숙. 이틀간의 무대.", en: { title: "Yeowoorak Festival 'Two Love Stories'", excerpt: "Two nights with Yoo Ji-sook at the National Theater of Korea." } },
    { date: "2025-02-23", type: "방송", title: "열린음악회 1514회 피날레 무대", excerpt: "1월 21일 녹화 — 백스테이지 기록은 라이브 페이지 리캡에.", en: { title: "Open Concert Ep.1514 finale", excerpt: "Taped January 21 — backstage records in the Tour page recap." } },
    { date: "2025-02-19", type: "발매", title: "《인순이, 아름다운 우리나라》 발매", excerpt: "1984년 정규 5집의 곡들을 다시 부른 아홉 곡.", en: { title: "'Insooni, Beautiful Korea' released", excerpt: "Nine songs revisiting the 1984 original album." } },
    { date: "2024-12-30", type: "공연", title: "5년 만의 연말 디너쇼", excerpt: "그랜드 인터컨티넨탈 서울 파르나스, 이틀간의 밤.", en: { title: "First year-end dinner show in five years", excerpt: "Two nights at Grand InterContinental Seoul Parnas." } }
  ],

  /* ---------- 일정 (kind: 공연 | 방송 | 행사) ---------- */
  events: [
    {
      recurring: true,
      kind: "방송", status: "broadcast",
      title: "'조선의 사랑꾼' 고정 출연 중",
      en: { title: "Weekly on TV Chosun 'Love Interventions'", place: "TV Chosun", rlabel: "Mondays" },
      rlabel: "매주 월요일",
      place: "TV조선",
      link: "https://www.youtube.com/watch?v=OIKqhdBojRo"
    }
  ],

  /* ---------- 무대 영상 (공식 유튜브 @insooni8081 실제 영상 · 2026.7 RSS 확인) ---------- */
  videos: [
    { title: "그래도 꿈은 흐른다", desc: "2025년 겨울에 발표한 신곡 공식 뮤직비디오. 여전히 꿈을 노래합니다.", year: "2025", youtubeId: "6joBf4xW6Qs", thumb: "assets/img/thumbs/mv.webp" },
    { title: "성수동 버스킹", desc: "성수동 거리 무대. '바보 멍청이 똥개'를 부른 현장.", year: "2025", youtubeId: "AHGXsBvkVVI", thumb: "assets/img/thumbs/busking.webp" },
    { title: "BOYNEXTDOOR와 함께", desc: "'바보 멍청이 똥개' 세대를 넘은 컬래버 무대.", year: "2025", youtubeId: "neUVzSyKCn8", thumb: "assets/img/thumbs/bnd.webp" },
    { title: "콜미 (CALL ME) 커버", desc: "'콜미(CALL ME)'를 인순이 스타일로 부른 커버 무대.", year: "2025", youtubeId: "9wwtxL2TLJQ", thumb: "assets/img/thumbs/callme.webp" },
    { title: "거위의 꿈", desc: "1997년 카니발 원곡을 2007년 리메이크해 세대를 넘어 위로가 된 노래.", year: "2007", youtubeId: null },
    { title: "밤이면 밤마다", desc: "1983년 발표, 인순이표 에너지의 원점이 된 히트곡.", year: "1983", youtubeId: null },
    { title: "아버지", desc: "2009년 정규 17집 《인순이》 수록곡.", year: "2009", youtubeId: null }
  ],

  /* ---------- 디스코그래피 (검증된 주요 발표작) ---------- */
  albums: [
    { featured: true, art: "assets/img/covers/cover1978.webp", year: "1978", title: "희자매 1집", kind: "그룹", note: "타이틀곡 '실버들'로 TBC 가요차트 7주 1위 데뷔.",
      tracks: ["실버들", "우리는 사랑해요", "이제는 모두 잊어요", "앵두", "말도 안돼", "아리랑 내님아", "어찌합니까", "달무리", "사랑만은 않겠어요", "오동잎"],
      credits: "'실버들' — 작사 김소월(시) · 작곡 안치행 · 1978 힛트레코드 (희자매: 김인순·김재희·이영숙)",
      links: [
        { label: "YouTube", url: "https://www.youtube.com/playlist?list=OLAK5uy_lYCOexP5qLe9Sev4jwO-bWr81sBLu0NNg" },
        { label: "Apple Music", url: "https://music.apple.com/kr/album/silvers-arirang-my-love/1699110167" },
        { label: "Spotify", url: "https://open.spotify.com/track/6TufjMtsLO7W8tilip8BMr" }
      ] },
    { year: "1979", title: "Disco", kind: "희자매 2집", note: "현대음향 발매." },
    { art: "assets/img/photos/press-105959.webp", year: "1979", title: "희자매 3집", kind: "희자매 3집", note: "현대음향 발매." },
    { art: "assets/img/photos/album01.webp", year: "1980", title: "인연", kind: "솔로 1집", note: "솔로 가수 인순이의 첫걸음.",
      tracks: ["인연", "웃어주세요", "재수생", "풍문으로 들었어", "정말로 모르시나", "조용한 이별", "차표한장 (One Way Ticket)", "춤을 춰요 (I Was Made For Dancing)", "꿈이였나봐", "복돌이", "내마음 흔들려", "빨간 마후라"],
      credits: "1980년 10월, 현대음향 발매. 솔로 가수 인순이의 첫 앨범입니다.",
      links: [] },
    { year: "1981", title: "떠나야 할 그 사람 / 누가", kind: "정규 2집", note: "대표곡 '떠나야 할 그 사람'. 지구레코드." },
    { year: "1982", title: "슬픔만 남아 있어요 / 울지도 못합니다", kind: "정규 3집", note: "대표곡 '슬픔만 남아 있어요'. 지구레코드." },
    { featured: true, art: "assets/img/photos/album04.webp", year: "1983", title: "밤이면 밤마다 — 독집 제4집", kind: "정규 4집", note: "디바의 시대를 연 폭발적 히트곡 '밤이면 밤마다' 수록. 1983년 5월 발매.",
      tracks: ["밤이면 밤마다", "슬픈 아침", "한밤중", "내 고향집", "왜 나를 떠나셨나요", "손모아 마음모아", "욕망", "하늘 날고파라", "그리운 내사랑아", "다른 사람 말처럼 들리네", "고독", "고독 (경음악)"],
      credits: "'밤이면 밤마다' — 작사·작곡·편곡 김정택 · 1983 독집 제4집. 이 곡의 히트로 1984 KBS 7대가수상 수상.",
      links: [
        { label: "YouTube", url: "https://www.youtube.com/results?search_query=%EC%9D%B8%EC%88%9C%EC%9D%B4%20%EC%9D%B8%EC%88%9C%EC%9D%B4" },
        { label: "Apple Music", url: "https://music.apple.com/kr/album/1802774457" },
        { label: "멜론(곡)", url: "https://www.melon.com/song/detail.htm?songId=60847" },
        { label: "Spotify(2025 재녹음)", url: "https://open.spotify.com/album/5ErPwrIgz4dd8y6wEhXnwU" }
      ] },
    { year: "1984", title: "아름다운 우리나라 / 여기가 어디냐", kind: "정규 5집", note: "원곡 '아름다운 우리나라' 수록. HKR. 2025년에 이 앨범의 곡들을 다시 불렀습니다." },
    { year: "1985", title: "눈물의 편지 / 잊지 못하고", kind: "정규 6집", note: "대표곡 '눈물의 편지'. HKR." },
    { art: "assets/img/photos/album07.webp", year: "1987", title: "에레나라 불리운 여인", kind: "정규 7집", note: "대표곡 '에레나라 불리운 여인'. 지구레코드.", links: [{ label: "YT", url: "https://www.youtube.com/results?search_query=%EC%9D%B8%EC%88%9C%EC%9D%B4%20%EC%97%90%EB%A0%88%EB%82%98%EB%9D%BC%20%EB%B6%88%EB%A6%AC%EC%9A%B4%20%EC%97%AC%EC%9D%B8" }, { label: "APPLE", url: "https://music.apple.com/kr/album/1827889007" }, { label: "SPOTIFY", url: "https://open.spotify.com/album/38uPzmw0Vb0TrsXI2n78Bm" }] },
    { year: "1988", title: "그 어느 거리로", kind: "정규 8집", note: "대표곡 '그 어느 거리로'. HKR." },
    { art: "assets/img/photos/album09.webp", year: "1989", title: "Turning Point", kind: "정규 9집", note: "대표곡 '갈망'. 현대음향.", links: [{ label: "YT", url: "https://www.youtube.com/results?search_query=%EC%9D%B8%EC%88%9C%EC%9D%B4%20Turning%20Point" }, { label: "APPLE", url: "https://music.apple.com/kr/album/1636175668" }, { label: "SPOTIFY", url: "https://open.spotify.com/album/3L4FyfXeluTYdpfvgQtLYX" }] },
    { art: "assets/img/photos/album10.webp", year: "1991", title: "여자 (女子)", kind: "정규 10집", note: "대표곡 '하늘을 바라보소'. 가야음반.", links: [{ label: "YT", url: "https://www.youtube.com/results?search_query=%EC%9D%B8%EC%88%9C%EC%9D%B4%20%EC%97%AC%EC%9E%90%20%20%E5%A5%B3%E5%AD%90" }, { label: "APPLE", url: "https://music.apple.com/kr/album/1636175683" }, { label: "SPOTIFY", url: "https://open.spotify.com/album/45fhjAADfcsykXkFLv1C6y" }] },
    { year: "1992", title: "인순이 골든 앨범", kind: "컴필레이션", note: "Oasis 발매.", links: [ { label: "Apple Music", url: "https://music.apple.com/kr/album/golden-album/1627796744" } ] },
    { art: "assets/img/photos/album11.webp", year: "1996", title: "The Queen Of Soul", kind: "정규 11집", note: "'또' 수록. 소울의 여왕이라는 이름을 새긴 앨범.",
      tracks: ["또", "이별연습", "밀애", "너의 곁에 나", "이별을 준비할꺼야", "그대가 말하는 사랑", "혼자가 아닌 나", "White Christmas For You"],
      credits: "'또'·'밀애'·'그대가 말하는 사랑' — 작사·작곡 박진영 · '이별연습'·'이별을 준비할꺼야' — 작사·작곡 김형석 · '너의 곁에 나' — 작사 노영심, 작곡 김형석 · 1996년 5월 세원음반",
      links: [
        { label: "YouTube", url: "https://www.youtube.com/playlist?list=OLAK5uy_kgDfVDMgA0LAkpbOh2W9Sy85WBg1FBlsM" },
        { label: "Apple Music", url: "https://music.apple.com/kr/album/the-queen-of-soul/1538223938" },
        { label: "Spotify", url: "https://open.spotify.com/album/7odz1LsIS2ltX2tQZe41Q7" }
      ] },
    { year: "1997", title: "가스펠 1 (내 영혼의 그윽히 깊은 데서)", kind: "정규 12집", note: "CCM 앨범. CREAM/국제음반." },
    { art: "assets/img/photos/album13.jpg", year: "1997", title: "Future & Memories", kind: "정규 13집", note: "CREAM 발매.", links: [{ label: "YT", url: "https://www.youtube.com/results?search_query=%EC%9D%B8%EC%88%9C%EC%9D%B4%20Future%20%26%20Memories" }, { label: "SPOTIFY", url: "https://open.spotify.com/album/3zJnoqg4pzpHHXky9bXcvk" }] },
    { year: "2000", title: "인순이 복음성가 I·II", kind: "컴필레이션", note: "가스펠 모음." },
    { art: "assets/img/photos/album15.webp", year: "2001", title: "My Turn", kind: "정규 14집", note: "CREAM 발매.", links: [{ label: "YT", url: "https://www.youtube.com/results?search_query=%EC%9D%B8%EC%88%9C%EC%9D%B4%20My%20Turn" }, { label: "SPOTIFY", url: "https://open.spotify.com/album/6Sz903UNY6BNRnFXdeMIeC" }] },
    { art: "assets/img/photos/jazz-album.webp", year: "2003", title: "Jazz", kind: "정규 15집", note: "재즈 앨범. C&C Media.", links: [{ label: "YT", url: "https://www.youtube.com/results?search_query=%EC%9D%B8%EC%88%9C%EC%9D%B4%20Jazz" }, { label: "APPLE", url: "https://music.apple.com/kr/album/1839343758" }, { label: "SPOTIFY", url: "https://open.spotify.com/album/5Fr9MCvgdDFcFgxLhnqTcy" }] },
    { art: "assets/img/photos/album16.webp", year: "2004", title: "A To Z", kind: "정규 16집", note: "'친구여'(feat. 조PD) 수록. 2004년 9월 9일 발매.",
      tracks: ["Tonight", "Higher", "웃고 있지만", "My Life", "연가", "여정", "Swing My Baby", "연인", "여자이니까", "잠깐", "첫사랑", "비에 스친 날들", "친구여 (feat. 조PD)", "비상"],
      credits: "'친구여' — 작사 조PD, 작곡·편곡 박근태 · 타이틀곡 'Tonight' — 작사 김민지, 작곡 박해운, 편곡 한태수 · 프로듀서 김도형",
      links: [
        { label: "YouTube", url: "https://www.youtube.com/playlist?list=OLAK5uy_ngnowajTfdkaACKoTPeWLLcnyMVbfha-8" },
        { label: "Apple Music", url: "https://music.apple.com/kr/album/16th-a-to-z/1269489854" },
        { label: "Spotify", url: "https://open.spotify.com/album/7hdxullH6yeBjneaZ9rRDD" },
        { label: "멜론", url: "https://www.melon.com/album/detail.htm?albumId=35502" }
      ] },
    { year: "2004", title: "올림픽 응원가 — 비상", kind: "싱글", note: "BES기획." },
    { art: "assets/img/photos/press-149006.webp", year: "2006", title: "열정 (Can You Feel It)", kind: "싱글", note: "서커스엔터테인먼트.", links: [{ label: "YT", url: "https://www.youtube.com/results?search_query=%EC%9D%B8%EC%88%9C%EC%9D%B4%20%EC%97%B4%EC%A0%95%20%20Can%20You%20Feel%20It" }, { label: "APPLE", url: "https://music.apple.com/kr/album/1655672126" }, { label: "SPOTIFY", url: "https://open.spotify.com/album/2Oy7xhoxRhZhXiMyo4bJdU" }] },
    { year: "2006", title: "Amazing Grace", kind: "라이브", note: "라이브 콘서트 앨범. C&C Media." },
    { featured: true, art: "assets/img/covers/cover2007.webp", year: "2007", title: "거위의 꿈", kind: "대표곡", note: "카니발 원곡(1997) 리메이크. 위로의 상징이 된 노래.",
      tracks: ["거위의 꿈 (Original)", "거위의 꿈 (Inst.)", "거위의 꿈 (Radio Edit)", "거위의 꿈 (Director's Edit)", "하늘이여...제발 (주몽 OST)"],
      credits: "작사 이적 · 작곡 김동률 (원곡 카니발, 1997) · 2007. 1. 22. 디지털 싱글, 2007. 2. 1. 디지털 음반 《거위의 꿈, 꿈을 꾸는 모든 이들에게》",
      links: [
        { label: "YouTube", url: "https://www.youtube.com/playlist?list=OLAK5uy_l28ucxxiGHAHyAYLmH9H_ZPr-946BcbNY" },
        { label: "Apple Music", url: "https://music.apple.com/kr/album/gooses-dream-to-all-dreamers-ep/1423480473" },
        { label: "Spotify", url: "https://open.spotify.com/album/7t69eXfrQb8fY51q8EvMQe" },
        { label: "멜론", url: "https://www.melon.com/album/detail.htm?albumId=342766" }
      ] },
    { year: "2008", title: "Anthology 97-08", kind: "컴필레이션", note: "Vitamin Entertainment.", links: [{ label: "YT", url: "https://www.youtube.com/results?search_query=%EC%9D%B8%EC%88%9C%EC%9D%B4%20Anthology%2097-08" }] },
    { art: "assets/img/covers/cover2009.webp", year: "2009", title: "인순이 (17집)", kind: "정규", note: "타이틀곡 'Fantasia', '아버지' 수록.",
      tracks: ["Fantasia", "Cry", "향수", "아버지", "기회", "일어나", "뿌리 (Prologue)", "나무", "딸에게", "사랑가", "Merry Merry", "Fantasia (Inst.)"],
      credits: "'아버지' — 작사·작곡·편곡 이현승 · 'Fantasia' — 작사 나비, 작곡·편곡 이현승 · '향수' — 시 정지용, 작곡 김희갑 · 총괄 프로듀서 이현승 · 2009. 5. 8. 발매",
      links: [
        { label: "YouTube", url: "https://www.youtube.com/playlist?list=OLAK5uy_krDMMbBGD0-KLrHm3xLHcBf241i247gXI" },
        { label: "Apple Music", url: "https://music.apple.com/kr/album/insooni/1641834078" },
        { label: "Spotify", url: "https://open.spotify.com/album/2fdeLt66Qis4rWCYxWI8ro" },
        { label: "멜론", url: "https://www.melon.com/album/detail.htm?albumId=557957" }
      ] },
    { year: "2010", title: "꿈, 날개를 달다", kind: "참여", note: "여러 아티스트가 함께한 컴필레이션 — 인순이 버전 수록. 후너스크리에이티브." },
    { art: "assets/img/photos/press-35024303.webp", year: "2011", title: "어퍼컷", kind: "싱글", note: "지앤지프로덕션/KT뮤직.", links: [{ label: "YT", url: "https://www.youtube.com/results?search_query=%EC%9D%B8%EC%88%9C%EC%9D%B4%20%EC%96%B4%ED%8D%BC%EC%BB%B7" }, { label: "APPLE", url: "https://music.apple.com/kr/album/421981237" }] },
    { year: "2011", title: "Legend (30주년 기념 콘서트 실황)", kind: "라이브", note: "2CD 실황. 소솝/Vitamin Entertainment." },
    { year: "2011", title: "디스코 걸스: 안타 레코드 이어스 앤쏠로지 1978-1980", kind: "희자매 컴필", note: "2011 리마스터. Beatball." },
    { year: "2013", title: "Umbrella", kind: "정규 18집", note: "Sony 발매." },
    { year: "2013", title: "나무", kind: "EP", note: "소솝/Sony." },
    { year: "2015", title: "피노키오", kind: "디지털 싱글", note: "소솝/휴맵컨텐츠.", links: [{ label: "APPLE", url: "https://music.apple.com/kr/album/1024467825" }] },
    { year: "2015", title: "이토록 아름다웠음을 (엄마 OST)", kind: "OST 싱글", note: "Warner Music Korea." },
    { year: "2016", title: "선물 (기억 OST Part 2)", kind: "OST 싱글", note: "CJ E&M." },
    { year: "2016", title: "하나의 꿈 (One K 콘서트 테마곡)", kind: "싱글", note: "코리안드림." },
    { year: "2017", title: "2018 평창 동계올림픽 성화봉송 주제가", kind: "디지털 싱글", note: "평창 동계올림픽 조직위원회." },
    { year: "2019", title: "행복", kind: "디지털 싱글", note: "휴맵컨텐츠/지니뮤직.", links: [{ label: "YT", url: "https://www.youtube.com/results?search_query=%EC%9D%B8%EC%88%9C%EC%9D%B4%20%ED%96%89%EB%B3%B5" }, { label: "APPLE", url: "https://music.apple.com/kr/album/1685893978" }, { label: "SPOTIFY", url: "https://open.spotify.com/album/6jwzT0MFVj2RhRdhIq5MZN" }] },
    { year: "2021", title: "드림오더", kind: "디지털 싱글", note: "글로벌오더/다날." },
    { year: "2022", title: "내일이 빛날 테니까 (You will shine)", kind: "디지털 싱글", note: "박보람 듀엣. 제나두엔터테인먼트.", links: [{ label: "YT", url: "https://www.youtube.com/results?search_query=%EC%9D%B8%EC%88%9C%EC%9D%B4%20%EB%82%B4%EC%9D%BC%EC%9D%B4%20%EB%B9%9B%EB%82%A0%20%ED%85%8C%EB%8B%88%EA%B9%8C%20%20You%20will%20shine" }, { label: "APPLE", url: "https://music.apple.com/kr/album/1622759706" }, { label: "SPOTIFY", url: "https://open.spotify.com/album/74hfH7A2FyGp7R5SR0m0wG" }] },
    { year: "2022", title: "긴 편지", kind: "디지털 싱글", note: "휴맵컨텐츠/NHN벅스." },
    { featured: true, art: "assets/img/covers/cover2023.webp", year: "2023", title: "One Last Time", kind: "골든걸스", note: "KBS2 '골든걸스' 프로젝트 그룹 데뷔곡 (박진영 프로듀싱).",
      tracks: ["One Last Time"],
      credits: "작사 박진영 'The Asiansoul' · 작곡 박진영, Deza · 편곡 박진영, 이해솔 · 제작 ZEMMIX C&B · 유통 워너뮤직코리아 · 2023. 12. 1. 디지털 싱글 (인순이·박미경·신효범·이은미)",
      links: [
        { label: "YouTube", url: "https://www.youtube.com/playlist?list=OLAK5uy_naMN4pkC2SuC8hArJouy_4KJMQU_WtVBc" },
        { label: "Apple Music", url: "https://music.apple.com/kr/album/one-last-time-single/1719039298" },
        { label: "Spotify", url: "https://open.spotify.com/track/0OYq4lcsCvC3aVWVt3lFTK" },
        { label: "멜론", url: "https://www.melon.com/album/detail.htm?albumId=11376398" }
      ] },
    { year: "2023", title: "처음 이야기 (어쩌다 사장3 OST)", kind: "OST 싱글", note: "류민희와 함께." },
    { year: "2024", title: "토닥토닥", kind: "디지털 싱글", note: "리코브/NHN벅스.", links: [{ label: "YT", url: "https://www.youtube.com/results?search_query=%EC%9D%B8%EC%88%9C%EC%9D%B4%20%ED%86%A0%EB%8B%A5%ED%86%A0%EB%8B%A5" }, { label: "APPLE", url: "https://music.apple.com/kr/album/1787119633" }, { label: "SPOTIFY", url: "https://open.spotify.com/album/61AP6USxC0sDcxr3ktVbTK" }] },
    { year: "2024", title: "너의 이름을 세상이 부를 때", kind: "디지털 싱글", note: "리코브/NHN벅스.", links: [{ label: "YT", url: "https://www.youtube.com/results?search_query=%EC%9D%B8%EC%88%9C%EC%9D%B4%20%EB%84%88%EC%9D%98%20%EC%9D%B4%EB%A6%84%EC%9D%84%20%EC%84%B8%EC%83%81%EC%9D%B4%20%EB%B6%80%EB%A5%BC%20%EB%95%8C" }, { label: "APPLE", url: "https://music.apple.com/kr/album/1771373716" }, { label: "SPOTIFY", url: "https://open.spotify.com/album/3pDNQzz4RtG7LVOatoPreJ" }] },
    /* 이것은 새 정규 앨범이 아니라 1984년 정규 5집을 다시 부른 재녹음반이다.
       '정규 앨범'으로 적으면 18집 다음의 새 앨범처럼 읽힌다.
       커버도 1984년 원반 아트를 그대로 쓴 것이라 이 자리에 걸지 않는다. */
    { year: "2025", title: "인순이, 아름다운 우리나라", kind: "재녹음", note: "2025년 2월 발매, 9곡. 1984년 정규 5집의 곡들을 다시 불렀습니다.",
      tracks: ["광주 광주", "밤이면 밤마다", "아름다운 우리나라", "야속한 내 님", "흔들리는 갈대", "너와 나", "욕망", "이별의 눈동자", "길섶에 핀 꽃"],
      credits: "재녹음 9곡 · 2025. 2. 19. 발매 · ℗ RIAK · 1984년 정규 5집 《아름다운 우리나라 / 여기가 어디냐》의 곡들입니다.",
      links: [
        { label: "YouTube", url: "https://www.youtube.com/playlist?list=OLAK5uy_lg_F0ktj5nBUzEGoHZfANShrTMmUkL9xg" },
        { label: "Apple Music", url: "https://music.apple.com/kr/album/%EC%9D%B8%EC%88%9C%EC%9D%B4-%EC%95%84%EB%A6%84%EB%8B%A4%EC%9A%B4-%EC%9A%B0%EB%A6%AC%EB%82%98%EB%9D%BC/1797462838" },
        { label: "Spotify", url: "https://open.spotify.com/album/5ErPwrIgz4dd8y6wEhXnwU" }
      ] },
    { art: "assets/img/covers/coverDream.webp", year: "2025", title: "그래도 꿈은 흐른다", kind: "싱글", note: "2025년 11월 발매. 여전히 꿈을 노래합니다.",
      tracks: ["그래도 꿈은 흐른다"],
      credits: "작사 Ashbun, 인순이 · 작곡 Ashbun · 편곡·프로듀싱 Ethan · 코프로듀싱 박세인 · 보컬 디렉팅 이현승 · 믹싱·마스터링 김석민 · 기획 주식회사 소솝 · 유통 NHN벅스 · 2025. 11. 28. 싱글",
      links: [
        { label: "YouTube", url: "https://www.youtube.com/playlist?list=OLAK5uy_niL1gSBUE-O3GKhYqSvAR8Kp_TjcutfWE" },
        { label: "Apple Music", url: "https://music.apple.com/kr/album/dream-single/1856589303" },
        { label: "Spotify", url: "https://open.spotify.com/album/6SnGs2WHjOOQko8116mIu8" },
        { label: "멜론", url: "https://www.melon.com/album/detail.htm?albumId=12411745" },
        { label: "공식 MV", url: "https://www.youtube.com/watch?v=6joBf4xW6Qs" }
      ] },
    { year: "2025", title: "바보 멍청이 똥개", kind: "디지털 싱글", note: "주식회사 소솝/NHN벅스. 성수동 버스킹으로 알려진 곡.", links: [{ label: "YT", url: "https://www.youtube.com/results?search_query=%EC%9D%B8%EC%88%9C%EC%9D%B4%20%EB%B0%94%EB%B3%B4%20%EB%A9%8D%EC%B2%AD%EC%9D%B4%20%EB%98%A5%EA%B0%9C" }, { label: "APPLE", url: "https://music.apple.com/kr/album/1813115436" }, { label: "SPOTIFY", url: "https://open.spotify.com/album/0xq8CwhUOkFhFG8jZLp87q" }] }
  ],

  /* ---------- 연혁 타임라인 (milestone: 굵은 표시 / 검증 완료 항목 중심) ---------- */
  timeline: [
    { year: "1957", event: "4월 5일 출생 (본명 김인순)", note: "", en: { event: "Born Kim In-soon, April 5" } },
    { year: "1978", event: "걸그룹 '희자매'로 데뷔", note: "타이틀곡 '실버들' TBC 가요차트 7주 1위", milestone: true, en: { event: "Debut with the trio Hee Sisters", note: "'Silvers' topped the TBC chart for 7 weeks" } },
    { year: "1980", event: "솔로 1집 《인연》으로 홀로서기", note: "", en: { event: "Going solo with the first album Fate" } },
    { year: "1983", event: "'밤이면 밤마다' 발표", note: "디바의 시대 개막", milestone: true, en: { event: "'Night After Night' released", note: "The diva era begins" } },
    { year: "1996", event: "《The Queen Of Soul》 발매", note: "'또'(박진영 곡) 수록, 정규 11집", en: { event: "The Queen Of Soul released", note: "11th studio album — with a Park Jin-young title track" } },
    { year: "1999", event: "뉴욕 카네기홀 첫 공연", note: "", milestone: true, en: { event: "First Carnegie Hall concert, New York" } },
    { year: "2004", event: "'친구여' (조PD 피처링) 히트", note: "정규 16집 《A To Z》 수록 (2004. 9. 9. 발매)", en: { event: "'Chinguyeo' (feat. Cho PD) becomes a hit", note: "On the 16th album A To Z (Sept 9, 2004)" } },
    { year: "2007", event: "'거위의 꿈' 발표", note: "위로와 도전의 아이콘이 되다", milestone: true, en: { event: "'A Goose's Dream' released", note: "An anthem of comfort and challenge" } },
    { year: "2009", event: "'아버지' 발표", note: "정규 17집 《인순이》 수록 (작사·작곡 이현승)", en: { event: "'Father' released", note: "On the 17th album Insooni (written by Lee Hyun-seung)" } },
    { year: "2010", event: "카네기홀 두 번째 단독 콘서트", note: "", en: { event: "Second solo concert at Carnegie Hall" } },
    { year: "2012", event: "사단법인 '인순이와 좋은 사람들' 설립", note: "", en: { event: "Founded the nonprofit 'Insooni and Good People'" } },
    { year: "2013", event: "다문화 대안학교 '해밀학교' 개교", note: "강원 홍천. 무대 밖의 또 다른 무대", milestone: true, en: { event: "Opened Haemil School for multicultural youth", note: "Hongcheon, Gangwon — another stage beyond the stage" } },
    { year: "2023", event: "KBS2 '골든걸스' 출연, 'One Last Time' 발표", note: "인순이·박미경·신효범·이은미", milestone: true, en: { event: "KBS2 'Golden Girls' — 'One Last Time' released", note: "Insooni, Park Mi-kyung, Shin Hyo-bum, Lee Eun-mi" } },
    { year: "2025", event: "《인순이, 아름다운 우리나라》 발매", note: "2월, 9곡 수록", en: { event: "'Insooni, Beautiful Korea' released", note: "February — nine songs" } },
    { year: "2025", event: "펄벅 인터내셔널 '올해의 여성상' 수상", note: "Woman of Influence 2025", en: { event: "Woman of Influence, Pearl S. Buck International", note: "Woman of Influence 2025" } },
    { year: "2026", event: "데뷔 48주년, 그리고 계속되는 이야기", note: "새로운 기록이 이곳에 쌓입니다", en: { event: "48 years on stage — and the story continues", note: "New records will be added here" } }
  ],


  /* ---------- 사랑방: 인순이의 편지 ----------
     본인이 직접 쓴 글만 이 자리에 올린다. 비어 있으면 섹션 자체가 표시되지 않는다.
     대신 쓰거나 예시로 채워 넣지 않는다 — 이곳은 공식 사이트이고, 이건 그의 목소리다.

     실제 편지를 게재할 때:
       artistLetter = { date: "2026. 8.", body: "...", sign: "인순이 드림",
                        signature: "assets/img/signature.png",   // 친필 스캔이 있을 때만
                        en: { body: "...", sign: "..." } }
  */
  artistLetter: null,

  /* ---------- 인순이 연대기 (검증된 날짜만) ----------
     '오늘의 기념일 / N년 전 오늘'과 다음 기념일 카운트다운에 쓴다.
     date는 MM-DD, since는 연도. 전부 앨범 크레딧·보도로 확인된 날짜다. */
  milestones: [
    { d: "04-05", y: 1957, ko: "인순이 탄생", en: "Insooni was born" },
    { d: "10-01", y: 1980, ko: "솔로 1집 《인연》 발매 — 홀로서기의 시작", en: "Solo debut album '인연' — the start of her own path" },
    { d: "05-07", y: 1981, ko: "정규 2집 발매", en: "2nd studio album released" },
    { d: "06-15", y: 1985, ko: "정규 6집 발매", en: "6th studio album released" },
    { d: "06-25", y: 2001, ko: "정규 14집 《My Turn》 발매", en: "14th album 'My Turn' released" },
    { d: "09-24", y: 2003, ko: "재즈 앨범 《Jazz》 발매", en: "The jazz album 'Jazz' released" },
    { d: "09-09", y: 2004, ko: "정규 16집 《A To Z》 발매 — '친구여'", en: "16th album 'A To Z' — 'Chinguyeo'" },
    { d: "02-01", y: 2007, ko: "《거위의 꿈》 — 위로가 된 노래", en: "'A Goose's Dream' — the song that became comfort" },
    { d: "05-08", y: 2009, ko: "정규 17집 《인순이》 발매 — 'Fantasia'·'아버지'", en: "17th album released — 'Fantasia', 'Father'" },
    { d: "09-25", y: 2013, ko: "정규 18집 《Umbrella》 발매", en: "18th album 'Umbrella' released" },
    { d: "02-19", y: 2025, ko: "《인순이, 아름다운 우리나라》 발매", en: "'Insooni, Beautiful Korea' released" },
    { d: "11-28", y: 2025, ko: "싱글 《그래도 꿈은 흐른다》 발매", en: "Single 'Still, the Dream Flows' released" }
  ],
  cheerPresets: [
    { ko: "오늘도 응원합니다", en: "Cheering for you today" },
    { ko: "거위의 꿈 듣고 갑니다", en: "Listened to A Goose's Dream today" },
    { ko: "늘 건강하세요", en: "Stay healthy always" },
    { ko: "다음 공연 기다릴게요", en: "Waiting for the next show" }
  ],

};
