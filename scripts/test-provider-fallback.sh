#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
FAKEBIN="$TMP/bin"
mkdir -p "$FAKEBIN"
RECORD="$TMP/codex-args.txt"

cat >"$FAKEBIN/claude" <<'EOF'
#!/bin/bash
case "${FAKE_CLAUDE_MODE:-success}" in
  success)
    printf '%s\n' '{"summary":"claude plan"}'
    exit 0
    ;;
  limit)
    printf '%s\n' '{"is_error":true,"api_error_status":429,"result":"You have hit your session limit · resets 7pm"}' >&2
    exit 1
    ;;
  error)
    printf '%s\n' 'authentication failed' >&2
    exit 2
    ;;
esac
EOF
chmod +x "$FAKEBIN/claude"

cat >"$FAKEBIN/codex" <<'EOF'
#!/bin/bash
printf '%s\n' "$*" >"$FAKE_CODEX_RECORD"
printf '%s\n' '{"summary":"Codex read-only planner fallback: safe plan"}'
EOF
chmod +x "$FAKEBIN/codex"

run_wrapper() {
  PATH="$ROOT/scripts/bin:$FAKEBIN:/usr/bin:/bin" FAKE_CODEX_RECORD="$RECORD" FAKE_CLAUDE_MODE="$1" \
    "$ROOT/scripts/bin/claude" -p 'Return JSON only: {"summary":"plan"}' --output-format json --permission-mode plan
}

rm -f "$RECORD"
SUCCESS_OUTPUT="$(run_wrapper success)"
grep -q 'claude plan' <<<"$SUCCESS_OUTPUT"
[[ ! -e "$RECORD" ]]

rm -f "$RECORD"
LIMIT_OUTPUT="$(run_wrapper limit 2>"$TMP/limit-stderr.txt")"
grep -q 'Codex read-only planner fallback' <<<"$LIMIT_OUTPUT"
grep -q -- '--sandbox read-only' "$RECORD"
if grep -Eq -- 'workspace-write|--approve-for-me|--not-so-yolo' "$RECORD"; then
  echo 'fallback Codex invocation was not read-only' >&2
  exit 1
fi
grep -q 'Claude session limit detected' "$TMP/limit-stderr.txt"

rm -f "$RECORD"
set +e
run_wrapper error >"$TMP/error-stdout.txt" 2>"$TMP/error-stderr.txt"
ERROR_STATUS=$?
set -e
[[ $ERROR_STATUS -eq 2 ]]
grep -q 'authentication failed' "$TMP/error-stderr.txt"
[[ ! -e "$RECORD" ]]

printf '%s\n' 'provider fallback tests passed'
