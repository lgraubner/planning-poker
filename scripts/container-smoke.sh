#!/bin/sh
set -eu

volume=$(docker volume create)
container_id=$(docker run -d -p 127.0.0.1::8080 -v "$volume:/data" -e DATABASE_PATH=/data/rooms.db planning-poker:smoke)
trap 'docker rm -f "$container_id" >/dev/null; docker volume rm "$volume" >/dev/null' EXIT HUP INT TERM
wait_healthy() {
  address=$(docker port "$container_id" 8080/tcp)
  attempt=0
  until curl --fail --silent "http://$address/healthz" >/dev/null; do
    attempt=$((attempt + 1))
    if [ "$attempt" -ge 20 ]; then
      docker logs "$container_id"
      exit 1
    fi
    sleep 1
  done
}
wait_healthy
curl --fail --silent "http://$address/" | grep -q '<title>Planning Poker</title>'
code=$(curl --fail --silent -H 'Content-Type: application/json' -d '{"title":"Container smoke test"}' "http://$address/api/rooms" | sed -n 's/.*"code":"\([^"]*\)".*/\1/p')
test -n "$code"
docker restart "$container_id" >/dev/null
wait_healthy
curl --fail --silent "http://$address/api/rooms/$code" | grep -q 'Container smoke test'
echo 'Container health, embedded SPA, room creation, and persistence across restarts passed.'
