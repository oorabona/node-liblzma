#!/bin/bash
# Validate WASM output sizes against budget
# Used by build.sh and CI
#
# Exit codes:
#   0 = GO (under 100KB gzipped)
#   1 = NO-GO (over 120KB gzipped)
#   2 = CONDITIONAL (100-120KB, needs review)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

WASM_FILE="$SCRIPT_DIR/liblzma.wasm"
JS_FILE="$SCRIPT_DIR/liblzma.js"

if [ ! -f "$WASM_FILE" ] || [ ! -f "$JS_FILE" ]; then
    echo "ERROR: WASM output not found at $SCRIPT_DIR"
    echo "Expected: liblzma.wasm, liblzma.js"
    exit 1
fi

# Raw sizes
WASM_RAW=$(stat -c%s "$WASM_FILE")
JS_RAW=$(stat -c%s "$JS_FILE")

# Gzipped sizes (temp files)
WASM_GZ=$(gzip -c "$WASM_FILE" | wc -c)
JS_GZ=$(gzip -c "$JS_FILE" | wc -c)

TOTAL_RAW=$((WASM_RAW + JS_RAW))
TOTAL_GZ=$((WASM_GZ + JS_GZ))

to_kb() { echo "scale=2; $1 / 1024" | bc; }

echo "=== WASM Size Report ==="
echo ""
echo "┌──────────────────┬─────────────┬──────────────┐"
echo "│ Component        │    Raw (KB) │ Gzipped (KB) │"
echo "├──────────────────┼─────────────┼──────────────┤"
printf "│ WASM binary      │ %11s │ %12s │\n" "$(to_kb $WASM_RAW)" "$(to_kb $WASM_GZ)"
printf "│ JS glue code     │ %11s │ %12s │\n" "$(to_kb $JS_RAW)" "$(to_kb $JS_GZ)"
echo "├──────────────────┼─────────────┼──────────────┤"
printf "│ TOTAL            │ %11s │ %12s │\n" "$(to_kb $TOTAL_RAW)" "$(to_kb $TOTAL_GZ)"
echo "└──────────────────┴─────────────┴──────────────┘"
echo ""

# Budget: 100KB gzipped
BUDGET=102400  # 100KB
HARD_LIMIT=122880  # 120KB

if [ "$TOTAL_GZ" -lt "$BUDGET" ]; then
    echo "✅ GO: $(to_kb $TOTAL_GZ) KB gzipped — under 100KB budget"
    exit 0
elif [ "$TOTAL_GZ" -lt "$HARD_LIMIT" ]; then
    echo "⚠️  CONDITIONAL: $(to_kb $TOTAL_GZ) KB gzipped — between 100-120KB"
    echo "   Consider further optimizations before release"
    exit 2
else
    echo "❌ NO-GO: $(to_kb $TOTAL_GZ) KB gzipped — exceeds 120KB hard limit"
    exit 1
fi
