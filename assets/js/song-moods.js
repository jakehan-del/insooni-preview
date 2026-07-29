/* ============================================================
   오늘의 날씨·계절 → 인순이 곡 큐레이션
   ------------------------------------------------------------
   제목은 사이트 곡 색인과 정확히 일치해야 한다 (직결 재생 연결).
   reason은 가사 인용 없이 곡의 정서와 날씨를 잇는 한 문장.
   ============================================================ */
window.SONG_MOODS = {
  rain: [
    { title: "우산", reason: "비 오는 날의 노래. 누군가 씌워 준 우산 아래의 마음을 부릅니다.",
      en: "A song made for rainy days - the feeling of someone holding an umbrella over you." },
    { title: "비에 스친 날들", reason: "창밖에 비가 그을 때, 지나온 날들이 함께 스쳐 갑니다.",
      en: "As the rain streaks the window, the days you've walked through pass by with it." },
    { title: "무지개", reason: "비 갠 뒤를 기다리는 마음으로 듣기 좋은 곡입니다.",
      en: "For the heart that waits for what comes after the rain." }
  ],
  monsoon: [
    { title: "우산", reason: "장맛비가 길어지는 날, 낮은 목소리가 방 안을 채웁니다.",
      en: "When the monsoon settles in, this low voice fills the room." },
    { title: "Lullaby Birdland", reason: "빗소리와 함께 듣는 재즈 한 곡. 15집 《Jazz》의 밤입니다.",
      en: "Jazz to pair with the rain - a night from the 2003 album 'Jazz'." }
  ],
  storm: [
    { title: "일어나", reason: "천둥이 지나가는 하늘 아래, 다시 일어서라 말해 주는 노래.",
      en: "Under a thundering sky, a song that tells you to rise again." },
    { title: "거위의 꿈", reason: "거센 날씨에도 꿈은 흔들리지 않는다고, 이 노래가 대신 말해 줍니다.",
      en: "Even in rough weather, this song insists the dream still stands." }
  ],
  snow: [
    { title: "Merry Merry", reason: "눈이 내리면 어울리는 17집의 겨울 곡입니다.",
      en: "A winter song from the 2009 album, made for falling snow." },
    { title: "향수", reason: "눈 쌓인 창가에서 고향을 떠올리게 하는 노래.",
      en: "By a snow-covered window, a song that turns your mind toward home." }
  ],
  fog: [
    { title: "Smile", reason: "안개처럼 흐릿한 아침, 그래도 웃어 보자는 재즈 넘버.",
      en: "On a morning as hazy as fog, a jazz number that still asks you to smile." },
    { title: "흔들리는 갈대", reason: "뿌옇게 잠긴 풍경 속, 흔들리면서도 꺾이지 않는 노래.",
      en: "In a blurred landscape, a song that sways but never breaks." }
  ],
  hot: [
    { title: "Caravan", reason: "더운 날엔 오히려 뜨거운 재즈로. 15집의 열기입니다.",
      en: "On a hot day, meet it with hotter jazz - the heat of the 2003 album." },
    { title: "밤이면 밤마다", reason: "한낮의 열기가 식으면, 이 노래의 밤이 시작됩니다.",
      en: "When the day's heat fades, this song's night begins." }
  ],
  "cold-winter": [
    { title: "아버지", reason: "추운 날일수록 더 사무치는, 아버지를 부르는 노래.",
      en: "The colder the day, the deeper this song for a father cuts." },
    { title: "토닥토닥", reason: "언 손을 녹이듯 어깨를 두드려 주는 곡입니다.",
      en: "Like warming frozen hands - a song that pats you on the shoulder." }
  ],
  cloudy: [
    { title: "행복", reason: "흐린 하늘 아래에서도 행복을 이야기하는 노래.",
      en: "A song that speaks of happiness even under a grey sky." },
    { title: "또", reason: "구름이 낮게 깔린 날, 소울의 여왕이라 불리게 한 그 목소리로.",
      en: "On a low-clouded day, the voice that earned her the title Queen of Soul." }
  ],
  dawn: [
    { title: "내게 강같은 평화", reason: "아직 어두운 새벽, 12집 가스펠이 조용히 하루를 엽니다.",
      en: "In the dark before dawn, the 1997 gospel album opens the day quietly." },
    { title: "나의 기도", reason: "새벽에 어울리는 기도 같은 노래입니다.",
      en: "A song like a prayer, made for the earliest hours." }
  ],
  morning: [
    { title: "아침이 오면", reason: "아침에 듣기 좋은 14집 《My Turn》의 곡.",
      en: "A morning song from the 2001 album 'My Turn'." },
    { title: "그래도 꿈은 흐른다", reason: "새 하루의 시작에, 가장 최근의 노래로.",
      en: "For the start of a new day - her most recent song." }
  ],
  night: [
    { title: "밤이면 밤마다", reason: "밤이 오면 이 노래. 디바의 시대를 연 곡입니다.",
      en: "When night falls, this one - the song that opened the diva's era." },
    { title: "Lullaby Birdland", reason: "재즈로 마무리하는 밤. 15집 《Jazz》 수록곡.",
      en: "A night that ends in jazz, from the 2003 album." }
  ],
  "clear-spring": [
    { title: "실버들", reason: "봄버들이 늘어지는 계절, 1978년 데뷔곡을 다시 부른 버전입니다.",
      en: "As spring willows droop - her 1978 debut song, sung again." },
    { title: "길섶에 핀꽃", reason: "길가에 꽃이 피는 날 듣기 좋은 5집의 곡.",
      en: "For the days flowers open by the roadside - from the 1984 album." },
    { title: "나무", reason: "새잎이 돋는 계절에 어울리는, 뿌리내림에 대한 노래.",
      en: "A song about taking root, for the season of new leaves." }
  ],
  "clear-summer": [
    { title: "Higher", reason: "환한 여름날, 목소리가 그대로 높이 올라가는 곡입니다.",
      en: "On a bright summer day, a song that climbs as high as her voice." },
    { title: "바보 멍청이 똥개", reason: "여름의 유쾌함에 어울리는 최근 싱글.",
      en: "A recent single that matches summer's mischief." }
  ],
  "clear-autumn": [
    { title: "Autumn Leaves", reason: "가을엔 역시 이 곡. 15집 《Jazz》의 대표 트랙입니다.",
      en: "Autumn calls for this one - the signature track of the 2003 jazz album." },
    { title: "친구여", reason: "선선한 바람이 불면 친구가 떠오릅니다.",
      en: "When the cool wind starts, you think of a friend." },
    { title: "향수", reason: "가을 저녁, 고향 쪽으로 마음이 기우는 노래.",
      en: "An autumn evening song that leans toward home." }
  ]
};
