#!/bin/bash
# Daily update script - run after market close (after 2:30 PM)
# Usage: ./scripts/update.sh [YYYY-MM-DD]
cd "$(dirname "$0")/.."
PYTHONPATH=. python scripts/classify_and_save.py "$@"
echo ""
echo "Done! Data saved. Run 'vercel --prod' to deploy."
