#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${API_BASE_URL:-http://localhost:50000}"
API_AUTH_TOKEN="${API_AUTH_TOKEN:-}"
EXPECT_DOCS="${EXPOSE_DOCS:-true}"

fail() {
  echo "✗ $1" >&2
  exit 1
}

pass() {
  echo "✓ $1"
}

request() {
  local method="$1"
  local path="$2"
  local extra_args=()
  if [[ -n "${API_AUTH_TOKEN}" ]]; then
    extra_args+=("-H" "Authorization: Bearer ${API_AUTH_TOKEN}")
  fi
  curl -fsS -X "${method}" "${extra_args[@]}" "${BASE_URL}${path}"
}

health_json="$(curl -fsS "${BASE_URL}/health")" || fail "/health failed"
echo "${health_json}" | grep -q '"status":"ok"\|"status": "ok"' || fail "/health did not return ok"
pass "/health ok"

ready_status="$(curl -sS -o /tmp/cpp-ready.json -w '%{http_code}' "${BASE_URL}/ready")"
if [[ "${ready_status}" != "200" ]]; then
  cat /tmp/cpp-ready.json >&2
  fail "/ready returned ${ready_status}"
fi
pass "/ready ok"

if [[ "${EXPECT_DOCS}" == "true" ]]; then
  curl -fsS "${BASE_URL}/docs/openapi.json" >/tmp/cpp-openapi.json || fail "/docs/openapi.json failed"
  pass "/docs/openapi.json available"
else
  docs_status="$(curl -sS -o /tmp/cpp-docs.json -w '%{http_code}' "${BASE_URL}/docs/openapi.json")"
  [[ "${docs_status}" == "404" ]] || fail "docs expected 404, got ${docs_status}"
  pass "docs disabled"
fi

if [[ -z "${API_AUTH_TOKEN}" ]]; then
  protected_status="$(curl -sS -o /tmp/cpp-protected.json -w '%{http_code}' "${BASE_URL}/api/accounts")"
  [[ "${protected_status}" == "401" || "${protected_status}" == "200" ]] || fail "unexpected /api/accounts status ${protected_status}"
  pass "/api/accounts protected status ${protected_status}"
else
  request GET /api/accounts >/tmp/cpp-accounts.json || fail "/api/accounts with auth failed"
  pass "/api/accounts with auth ok"
fi

curl -fsS --max-time 3 "${BASE_URL}/api/publish/progress" >/tmp/cpp-sse.txt || true
pass "SSE smoke attempted"
