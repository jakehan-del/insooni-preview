#!/usr/bin/env bash
#
# 배포에 올릴 것만 dist/ 로 모은다.
#
# 왜 필요한가 — assets.directory 를 저장소 루트로 두면 wrangler 가 .git 까지
# 올리려 든다. Cloudflare 빌드는 매번 git clone 으로 시작하므로 .git 은
# 항상 거기 있고, 우리 pack 파일은 31MB 라 자산 한도(25MB)를 넘겨 배포가 죽는다.
# (.assetsignore 로도 되어야 하지만 실제 빌드에서 듣지 않았다 — 707개를 다 읽었다.
#  "되어야 하는 것"에 기대는 대신 올릴 것만 명시적으로 모은다.)
#
# 멱등하다. 여러 번 돌려도 같은 결과.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/dist"

rm -rf "$DIST"
mkdir -p "$DIST"
cd "$ROOT"

# 웹에 나가는 것만. scripts/ · supabase/ · .github/ · .git/ 는 여기 없다.
cp -R assets "$DIST/"

# 사진 복원 전 원본(-orig)은 저장소에만 둔다. 웹에 올릴 이유가 없고,
# 보정 전 사진이 주소만 알면 열리는 것도 곤란하다.
find "$DIST/assets/img/photos" -name '*-orig.webp' -delete
for f in *.html robots.txt sitemap.xml site.webmanifest; do
  [ -e "$f" ] && cp "$f" "$DIST/"
done

count=$(find "$DIST" -type f | wc -l | tr -d ' ')

# 빈 채로 성공했다고 보고하지 않는다 — 조용한 실패가 가장 나쁘다.
if [ ! -f "$DIST/index.html" ]; then
  echo "실패: dist/index.html 이 없다" >&2
  exit 1
fi
if [ "$count" -lt 500 ]; then
  echo "실패: 파일이 $count 개뿐이다 (500개 이상이어야 정상)" >&2
  exit 1
fi

# 자산 한도를 넘는 파일이 있으면 배포 전에 여기서 잡는다.
big=$(find "$DIST" -type f -size +25M | head -5)
if [ -n "$big" ]; then
  echo "실패: 25MB 를 넘는 파일이 있다" >&2
  echo "$big" >&2
  exit 1
fi

echo "dist 준비 완료 — 파일 ${count}개"
