#!/bin/bash
# SECRET_SCAN.sh — Historical secret scanning with gitleaks
# Usage: ./scripts/SECRET_SCAN.sh [--full | --recent N]

set -euo pipefail

REPO="."
SINCE="${1:-all}"

echo "🔍 GITLEAKS SECRET SCAN"
echo "========================"
echo "Mode: $SINCE"
echo ""

# Check if gitleaks is installed
if ! command -v gitleaks &> /dev/null; then
    echo "❌ gitleaks not found. Installing..."
    # Try to install
    if command -v brew &> /dev/null; then
        brew install gitleaks
    elif command -v apt &> /dev/null; then
        sudo apt-get install -y gitleaks
    else
        echo "Please install gitleaks: https://github.com/gitleaks/gitleaks"
        exit 1
    fi
fi

# Determine scan scope
case "$SINCE" in
    --full)
        echo "📊 Scanning FULL history..."
        GITLEAKS_CMD="gitleaks detect --source . --verbose"
        ;;
    --recent)
        DAYS="${2:-30}"
        echo "📊 Scanning last $DAYS days..."
        SINCE_DATE=$(date -d "$DAYS days ago" +%Y-%m-%d 2>/dev/null || date -v-${DAYS}d +%Y-%m-%d)
        GITLEAKS_CMD="gitleaks detect --source . --verbose --since-commit $(git log --reverse --format=%H --after=$SINCE_DATE | head -1)"
        ;;
    *)
        echo "📊 Scanning recent commits (last 100)..."
        GITLEAKS_CMD="gitleaks detect --source . --verbose -b HEAD~100"
        ;;
esac

# Run scan
echo ""
echo "Running: $GITLEAKS_CMD"
echo ""

REPORT_FILE="gitleaks-report-$(date +%Y%m%d-%H%M%S).json"

if $GITLEAKS_CMD -r "$REPORT_FILE"; then
    echo ""
    echo "✅ No secrets found!"
    rm -f "$REPORT_FILE"
else
    EXIT_CODE=$?
    echo ""
    echo "❌ SECRETS DETECTED!"
    echo ""
    echo "Report saved to: $REPORT_FILE"
    echo ""
    echo "=== SECRETS FOUND ==="
    cat "$REPORT_FILE" | head -100 || true
    echo ""
    echo "=== CATEGORIZATION ==="
    echo "Review the report and:"
    echo "1. Rotate any exposed secrets IMMEDIATELY"
    echo "2. Add false positives to .gitleaks.toml allowlist"
    echo "3. Document findings in docs/INCIDENT_SECURITY_TOKEN_2026-07-26.md"
    exit $EXIT_CODE
fi
