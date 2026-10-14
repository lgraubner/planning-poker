#!/bin/sh
# Usage: verify.sh launch|doctor|drive <journey.spec.ts> [playwright args]|cleanup
set -eu

repo=$(cd "$(dirname "$0")/../../.." && pwd)
skill="$repo/.claude/skills/verify-planning-poker"
tmp=${TMPDIR:-/tmp}
base="${VERIFY_BASE:-${tmp%/}/planning-poker-verify}"
run="$base/${RUN:-default}"
state="$run/state"
evidence="$run/evidence"

alive() { [ -f "$state/pid" ] && kill -0 "$(cat "$state/pid")" 2>/dev/null; }

launch() {
  if alive; then
    echo "already running: $(cat "$state/url") (pid $(cat "$state/pid")); run cleanup first" >&2
    exit 1
  fi

  rm -rf "$state"
  mkdir -p "$state" "$evidence"

  # Writes internal/webui/dist, which go:embed bakes into the binary below
  npm --prefix "$repo/web" run build >"$state/build.log" 2>&1 || { tail -30 "$state/build.log"; exit 1; }
  (cd "$repo" && CGO_ENABLED=0 go build -o "$state/planning-poker" ./cmd/server) || exit 1

  port=$(node -e "const s=require('net').createServer().listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close()})")
  url="http://127.0.0.1:$port"
  PORT=$port DATABASE_PATH="$state/rooms.db" CLIENT_IP_HEADER=X-Forwarded-For \
    LEGAL_NOTICE_URL=https://example.com/legal-notice \
    PRIVACY_POLICY_URL='https://example.com/privacy?lang=en&v=2' \
    nohup "$state/planning-poker" >"$state/server.log" 2>&1 &
  echo $! >"$state/pid"
  echo "$url" >"$state/url"
  git -C "$repo" rev-parse --short HEAD >"$state/rev"

  i=0
  until curl -fs "$url/healthz" >/dev/null; do
    i=$((i + 1))
    if [ $i -ge 50 ] || ! alive; then
      cat "$state/server.log"
      exit 1
    fi

    sleep 0.2
  done

  curl -fs "$url/" | grep -q '<title>Planning Poker</title>'
  code=$(curl -fs -H 'Content-Type: application/json' -d '{"title":"Launch probe"}' "$url/api/rooms" | sed -n 's/.*"code":"\([^"]*\)".*/\1/p')
  curl -fs "$url/api/rooms/$code" | grep -q '"available":true'
  echo "ready: $url  run: $run"
}

doctor() {
  ok=1
  say() { printf '%-8s %s\n' "$1" "$2"; [ "$1" = OK ] || ok=0; }

  if ! alive; then
    say FAIL "no live instance for RUN=${RUN:-default} ($state)"
    exit 1
  fi

  pid=$(cat "$state/pid")
  url=$(cat "$state/url")
  port=${url##*:}
  ps -p "$pid" -o command= | grep -q "^$state/planning-poker" && say OK "pid $pid is our binary" || say FAIL "pid $pid is not $state/planning-poker"
  lsof -nP -a -p "$pid" -iTCP:"$port" -sTCP:LISTEN >/dev/null && say OK "pid $pid owns port $port" || say FAIL "port $port not owned by pid $pid"
  curl -fs "$url/healthz" | grep -q '"ok"' && say OK "$url/healthz" || say FAIL "$url/healthz"
  served=$(curl -fs "$url/" | grep -o 'assets/index-[^"]*\.js' | head -1)
  grep -q "$served" "$repo/internal/webui/dist/index.html" && say OK "serves current dist ($served)" || say STALE "serves $served, dist differs; relaunch"
  newer=$(find "$repo/cmd" "$repo/internal" "$repo/web/src" -type f \( -name '*.go' -o -name '*.ts' -o -name '*.tsx' -o -name '*.css' \) ! -name '*_test.go' ! -name '*.test.ts' ! -name 'routeTree.gen.ts' -newer "$state/planning-poker" | head -3)
  [ -z "$newer" ] && say OK "binary newer than sources (rev $(cat "$state/rev"))" || say STALE "sources changed since launch: $newer"
  echo "url $url  evidence $evidence"
  [ $ok = 1 ]
}

drive() {
  journey=$(cd "$(dirname "$1")" && pwd)/$(basename "$1")
  shift
  alive || { echo "no live instance; run launch" >&2; exit 1; }

  out="$evidence/$(basename "$journey" .spec.ts)-$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$out"
  echo "evidence: $out"
  VERIFY_URL=$(cat "$state/url") VERIFY_OUT="$out" VERIFY_TESTDIR=$(dirname "$journey") \
    npx --prefix "$repo/web" playwright test -c "$skill/playwright.config.ts" "$(basename "$journey")" "$@"
}

cleanup() {
  if alive; then
    pid=$(cat "$state/pid")
    kill "$pid"
    i=0
    while kill -0 "$pid" 2>/dev/null && [ $i -lt 50 ]; do
      i=$((i + 1))
      sleep 0.2
    done

    kill -9 "$pid" 2>/dev/null || true
  fi

  rm -rf "$state"
  echo "stopped; evidence kept in $evidence"
}

cmd=${1:-}
[ $# -gt 0 ] && shift
case "$cmd" in
launch) launch ;;
doctor) doctor ;;
drive) [ $# -ge 1 ] || { echo "usage: verify.sh drive <journey.spec.ts> [playwright args]" >&2; exit 2; }; drive "$@" ;;
cleanup) cleanup ;;
*) sed -n '2,4p' "$0" >&2; exit 2 ;;
esac
