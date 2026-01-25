#!/usr/bin/env bash
#
# Benchmark: nxz vs native xz
#
# Usage: ./scripts/benchmark.sh [options]
#
# Options:
#   -s, --sizes      Comma-separated sizes in MB (default: 1,10,100)
#   -p, --presets    Comma-separated presets (default: 0,6,9)
#   -r, --runs       Number of runs per test (default: 3)
#   -o, --output     Output format: table, csv, json (default: table)
#   -k, --keep       Keep generated test files
#   -h, --help       Show this help
#
# Examples:
#   ./scripts/benchmark.sh                    # Default benchmark
#   ./scripts/benchmark.sh -s 1,50 -p 6       # Custom sizes and preset
#   ./scripts/benchmark.sh -o csv > results.csv
#

set -euo pipefail

# Colors (disabled if not a terminal)
if [[ -t 1 ]]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[0;33m'
    BLUE='\033[0;34m'
    BOLD='\033[1m'
    NC='\033[0m'
else
    RED='' GREEN='' YELLOW='' BLUE='' BOLD='' NC=''
fi

# Defaults
SIZES="1,10,100"
PRESETS="0,6,9"
RUNS=3
OUTPUT="table"
KEEP_FILES=false
TEMP_DIR=""

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
NXZ="$PROJECT_ROOT/lib/cli/nxz.js"

usage() {
    head -24 "$0" | tail -21 | sed 's/^#//' | sed 's/^ //'
    exit 0
}

log() { echo -e "${BLUE}==>${NC} $*" >&2; }
warn() { echo -e "${YELLOW}warning:${NC} $*" >&2; }
error() { echo -e "${RED}error:${NC} $*" >&2; exit 1; }

cleanup() {
    if [[ -n "$TEMP_DIR" && -d "$TEMP_DIR" && "$KEEP_FILES" == "false" ]]; then
        rm -rf "$TEMP_DIR"
    fi
}
trap cleanup EXIT

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -s|--sizes) SIZES="$2"; shift 2 ;;
        -p|--presets) PRESETS="$2"; shift 2 ;;
        -r|--runs) RUNS="$2"; shift 2 ;;
        -o|--output) OUTPUT="$2"; shift 2 ;;
        -k|--keep) KEEP_FILES=true; shift ;;
        -h|--help) usage ;;
        *) error "Unknown option: $1" ;;
    esac
done

# Check dependencies
command -v xz &>/dev/null || error "xz not found in PATH"
command -v node &>/dev/null || error "node not found in PATH"
[[ -f "$NXZ" ]] || error "nxz not found at $NXZ (run 'pnpm build' first)"

# Check /usr/bin/time for memory measurement
TIME_CMD=""
if [[ -x /usr/bin/time ]]; then
    TIME_CMD="/usr/bin/time -v"
fi

# Create temp directory
TEMP_DIR=$(mktemp -d -t nxz-benchmark-XXXXXX)
log "Temp directory: $TEMP_DIR"

# Generate test file with compressible data
generate_test_file() {
    local size_mb=$1
    local file="$TEMP_DIR/test_${size_mb}mb.bin"

    if [[ -f "$file" ]]; then
        echo "$file"
        return
    fi

    log "Generating ${size_mb}MB test file..."

    # Mix of compressible patterns for realistic benchmark
    # ~70% zeros, ~20% repeated text, ~10% random
    local size_bytes=$((size_mb * 1024 * 1024))
    local zeros=$((size_bytes * 70 / 100))
    local text=$((size_bytes * 20 / 100))
    local random=$((size_bytes - zeros - text))

    {
        dd if=/dev/zero bs=1M count=$((zeros / 1024 / 1024)) 2>/dev/null
        yes "The quick brown fox jumps over the lazy dog. " | head -c "$text"
        dd if=/dev/urandom bs=1M count=$((random / 1024 / 1024 + 1)) 2>/dev/null | head -c "$random"
    } > "$file"

    # Truncate to exact size
    truncate -s "${size_mb}M" "$file"

    echo "$file"
}

# Run a single benchmark and return time in milliseconds
run_benchmark() {
    local cmd="$1"
    local start end duration

    start=$(date +%s%N)
    eval "$cmd" &>/dev/null
    end=$(date +%s%N)

    duration=$(( (end - start) / 1000000 ))
    echo "$duration"
}

# Run multiple times and return average
run_benchmark_avg() {
    local cmd="$1"
    local runs="$2"
    local total=0
    local duration

    for ((i=1; i<=runs; i++)); do
        duration=$(run_benchmark "$cmd")
        total=$((total + duration))
    done

    echo $((total / runs))
}

# Get file size in bytes
file_size() {
    stat -c%s "$1" 2>/dev/null || stat -f%z "$1" 2>/dev/null
}

# Format milliseconds as human readable
format_time() {
    local ms=$1
    if ((ms < 1000)); then
        echo "${ms}ms"
    elif ((ms < 60000)); then
        printf "%.2fs" "$(echo "scale=2; $ms/1000" | bc)"
    else
        printf "%.1fm" "$(echo "scale=1; $ms/60000" | bc)"
    fi
}

# Format bytes as human readable
format_size() {
    local bytes=$1
    if ((bytes < 1024)); then
        echo "${bytes}B"
    elif ((bytes < 1048576)); then
        printf "%.1fKB" "$(echo "scale=1; $bytes/1024" | bc)"
    elif ((bytes < 1073741824)); then
        printf "%.1fMB" "$(echo "scale=1; $bytes/1048576" | bc)"
    else
        printf "%.2fGB" "$(echo "scale=2; $bytes/1073741824" | bc)"
    fi
}

# Calculate speed in MB/s
calc_speed() {
    local bytes=$1
    local ms=$2
    if ((ms == 0)); then
        echo "N/A"
    else
        printf "%.1f" "$(echo "scale=1; $bytes / 1048576 / ($ms / 1000)" | bc)"
    fi
}

# Store results
declare -A RESULTS

# Run benchmarks
run_benchmarks() {
    local sizes presets
    IFS=',' read -ra sizes <<< "$SIZES"
    IFS=',' read -ra presets <<< "$PRESETS"

    log "Starting benchmark..."
    log "Sizes: ${sizes[*]} MB"
    log "Presets: ${presets[*]}"
    log "Runs per test: $RUNS"
    echo ""

    for size in "${sizes[@]}"; do
        local test_file
        test_file=$(generate_test_file "$size")
        local original_size
        original_size=$(file_size "$test_file")

        for preset in "${presets[@]}"; do
            log "Testing ${size}MB @ preset $preset..."

            local xz_out="$TEMP_DIR/xz_${size}mb_p${preset}.xz"
            local nxz_out="$TEMP_DIR/nxz_${size}mb_p${preset}.xz"

            # Compression benchmarks
            local xz_comp_time nxz_comp_time
            xz_comp_time=$(run_benchmark_avg "xz -${preset} -k -f -c '$test_file' > '$xz_out'" "$RUNS")
            nxz_comp_time=$(run_benchmark_avg "node '$NXZ' -${preset} -k -c '$test_file' > '$nxz_out'" "$RUNS")

            local xz_size nxz_size
            xz_size=$(file_size "$xz_out")
            nxz_size=$(file_size "$nxz_out")

            # Decompression benchmarks
            local xz_decomp_time nxz_decomp_time
            xz_decomp_time=$(run_benchmark_avg "xz -d -k -f -c '$xz_out' > /dev/null" "$RUNS")
            nxz_decomp_time=$(run_benchmark_avg "node '$NXZ' -d -c '$xz_out' > /dev/null" "$RUNS")

            # Store results
            local key="${size}_${preset}"
            RESULTS["${key}_original"]=$original_size
            RESULTS["${key}_xz_comp_time"]=$xz_comp_time
            RESULTS["${key}_nxz_comp_time"]=$nxz_comp_time
            RESULTS["${key}_xz_size"]=$xz_size
            RESULTS["${key}_nxz_size"]=$nxz_size
            RESULTS["${key}_xz_decomp_time"]=$xz_decomp_time
            RESULTS["${key}_nxz_decomp_time"]=$nxz_decomp_time

            # Cleanup compressed files for next iteration
            rm -f "$xz_out" "$nxz_out"
        done
    done
}

# Output results as table
output_table() {
    local sizes presets
    IFS=',' read -ra sizes <<< "$SIZES"
    IFS=',' read -ra presets <<< "$PRESETS"

    echo ""
    echo -e "${BOLD}Benchmark Results: nxz vs xz${NC}"
    echo -e "${BOLD}==============================${NC}"
    echo ""

    # Header
    printf "%-8s %-6s | %-12s %-12s %-8s | %-12s %-12s %-8s | %-8s %-8s\n" \
        "Size" "Preset" "xz comp" "nxz comp" "Δ" "xz decomp" "nxz decomp" "Δ" "xz size" "nxz size"
    printf "%s\n" "$(printf '%.0s-' {1..115})"

    for size in "${sizes[@]}"; do
        for preset in "${presets[@]}"; do
            local key="${size}_${preset}"

            local xz_comp=${RESULTS["${key}_xz_comp_time"]}
            local nxz_comp=${RESULTS["${key}_nxz_comp_time"]}
            local xz_decomp=${RESULTS["${key}_xz_decomp_time"]}
            local nxz_decomp=${RESULTS["${key}_nxz_decomp_time"]}
            local xz_size=${RESULTS["${key}_xz_size"]}
            local nxz_size=${RESULTS["${key}_nxz_size"]}

            # Calculate deltas (positive = nxz slower)
            local comp_delta decomp_delta
            if ((xz_comp > 0)); then
                comp_delta=$(echo "scale=1; ($nxz_comp - $xz_comp) * 100 / $xz_comp" | bc)
            else
                comp_delta="N/A"
            fi
            if ((xz_decomp > 0)); then
                decomp_delta=$(echo "scale=1; ($nxz_decomp - $xz_decomp) * 100 / $xz_decomp" | bc)
            else
                decomp_delta="N/A"
            fi

            # Format delta with color
            local comp_delta_fmt decomp_delta_fmt
            if [[ "$comp_delta" != "N/A" ]]; then
                if (( $(echo "$comp_delta > 0" | bc -l) )); then
                    comp_delta_fmt="${RED}+${comp_delta}%${NC}"
                else
                    comp_delta_fmt="${GREEN}${comp_delta}%${NC}"
                fi
            else
                comp_delta_fmt="N/A"
            fi
            if [[ "$decomp_delta" != "N/A" ]]; then
                if (( $(echo "$decomp_delta > 0" | bc -l) )); then
                    decomp_delta_fmt="${RED}+${decomp_delta}%${NC}"
                else
                    decomp_delta_fmt="${GREEN}${decomp_delta}%${NC}"
                fi
            else
                decomp_delta_fmt="N/A"
            fi

            printf "%-8s %-6s | %-12s %-12s %-18b | %-12s %-12s %-18b | %-8s %-8s\n" \
                "${size}MB" "$preset" \
                "$(format_time "$xz_comp")" "$(format_time "$nxz_comp")" "$comp_delta_fmt" \
                "$(format_time "$xz_decomp")" "$(format_time "$nxz_decomp")" "$decomp_delta_fmt" \
                "$(format_size "$xz_size")" "$(format_size "$nxz_size")"
        done
    done

    echo ""
    echo -e "${BOLD}Legend:${NC}"
    echo "  comp    = compression time (average of $RUNS runs)"
    echo "  decomp  = decompression time (average of $RUNS runs)"
    echo "  Δ       = difference vs native xz (negative = nxz faster)"
    echo ""
    echo -e "${BOLD}System:${NC}"
    echo "  Node.js: $(node --version)"
    echo "  xz:      $(xz --version | head -1)"
    echo "  OS:      $(uname -s) $(uname -r)"
    echo "  CPU:     $(grep -m1 'model name' /proc/cpuinfo 2>/dev/null | cut -d: -f2 | xargs || sysctl -n machdep.cpu.brand_string 2>/dev/null || echo 'unknown')"
}

# Output results as CSV
output_csv() {
    local sizes presets
    IFS=',' read -ra sizes <<< "$SIZES"
    IFS=',' read -ra presets <<< "$PRESETS"

    echo "size_mb,preset,xz_comp_ms,nxz_comp_ms,xz_decomp_ms,nxz_decomp_ms,xz_size_bytes,nxz_size_bytes"

    for size in "${sizes[@]}"; do
        for preset in "${presets[@]}"; do
            local key="${size}_${preset}"
            echo "$size,$preset,${RESULTS["${key}_xz_comp_time"]},${RESULTS["${key}_nxz_comp_time"]},${RESULTS["${key}_xz_decomp_time"]},${RESULTS["${key}_nxz_decomp_time"]},${RESULTS["${key}_xz_size"]},${RESULTS["${key}_nxz_size"]}"
        done
    done
}

# Output results as JSON
output_json() {
    local sizes presets
    IFS=',' read -ra sizes <<< "$SIZES"
    IFS=',' read -ra presets <<< "$PRESETS"

    echo "{"
    echo '  "meta": {'
    echo "    \"node_version\": \"$(node --version)\","
    echo "    \"xz_version\": \"$(xz --version | head -1)\","
    echo "    \"os\": \"$(uname -s) $(uname -r)\","
    echo "    \"runs\": $RUNS,"
    echo "    \"timestamp\": \"$(date -Iseconds)\""
    echo '  },'
    echo '  "results": ['

    local first=true
    for size in "${sizes[@]}"; do
        for preset in "${presets[@]}"; do
            local key="${size}_${preset}"
            [[ "$first" == "true" ]] || echo ","
            first=false
            cat <<EOF
    {
      "size_mb": $size,
      "preset": $preset,
      "xz": {
        "compress_ms": ${RESULTS["${key}_xz_comp_time"]},
        "decompress_ms": ${RESULTS["${key}_xz_decomp_time"]},
        "compressed_bytes": ${RESULTS["${key}_xz_size"]}
      },
      "nxz": {
        "compress_ms": ${RESULTS["${key}_nxz_comp_time"]},
        "decompress_ms": ${RESULTS["${key}_nxz_decomp_time"]},
        "compressed_bytes": ${RESULTS["${key}_nxz_size"]}
      }
    }
EOF
        done
    done

    echo ""
    echo "  ]"
    echo "}"
}

# Main
main() {
    run_benchmarks

    case "$OUTPUT" in
        table) output_table ;;
        csv) output_csv ;;
        json) output_json ;;
        *) error "Unknown output format: $OUTPUT" ;;
    esac

    if [[ "$KEEP_FILES" == "true" ]]; then
        log "Test files kept at: $TEMP_DIR"
    fi
}

main
