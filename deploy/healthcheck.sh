#!/usr/bin/env bash
# Production health check - run on the Linux cloud server (cd /opt/saloonchains first).
# Verifies the API and both frontend ports are listening and returning HTTP 200,
# and that the frontend -> backend nginx proxy is wired.
#
#   ./deploy/healthcheck.sh                 # checks localhost
#   ./deploy/healthcheck.sh 198.245.65.114  # checks the public IP
set -u

HOST="${1:-localhost}"
FAIL=0

http_code() { curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$1" 2>/dev/null || echo 000; }

check() {  # name url [expected=200]
    local name="$1" url="$2" want="${3:-200}" code
    code=$(http_code "$url")
    if [ "$code" = "$want" ]; then
        echo "  OK    $name  ($code)  $url"
    else
        echo "  FAIL  $name  ($code, want $want)  $url"; FAIL=1
    fi
}

check_wired() {  # name url  -- pass on any real backend response, fail on gateway errors
    local name="$1" url="$2" code
    code=$(http_code "$url")
    case "$code" in
        000|502|503|504) echo "  FAIL  $name  ($code - proxy/backend down)  $url"; FAIL=1 ;;
        *)               echo "  OK    $name  ($code - proxy reaches backend)  $url" ;;
    esac
}

echo "== Containers =="
docker compose ps 2>/dev/null || { echo "  FAIL docker compose ps"; FAIL=1; }

echo "== Listening ports (host) =="
for p in 5127 5173 5174; do
    if ss -ltnH "sport = :$p" 2>/dev/null | grep -q LISTEN; then
        echo "  OK    port $p listening"
    else
        echo "  FAIL  port $p not listening"; FAIL=1
    fi
done

echo "== HTTP endpoints =="
check       "backend /health"        "http://${HOST}:5127/health"
check       "adminportal  /"         "http://${HOST}:5173/"
check       "clientportal /"         "http://${HOST}:5174/"
check_wired "adminportal  -> /api/"  "http://${HOST}:5173/api/"
check_wired "clientportal -> /api/"  "http://${HOST}:5174/api/"

echo
if [ "$FAIL" = 0 ]; then echo "ALL HEALTHY"; else echo "UNHEALTHY"; exit 1; fi
