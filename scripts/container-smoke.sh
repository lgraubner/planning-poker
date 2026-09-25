#!/bin/sh
set -eu

container_id=$(docker run --rm -d -p 127.0.0.1::8080 planning-poker:smoke)
trap 'docker stop "$container_id" >/dev/null' EXIT HUP INT TERM
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
curl --fail --silent "http://$address/" | grep -q '<title>Planning Poker</title>'
curl --fail --silent -H 'Content-Type: application/json' -d '{"title":"Container smoke test"}' "http://$address/api/rooms" | grep -q '"code"'
echo 'Container health, embedded SPA, and room creation passed.'
