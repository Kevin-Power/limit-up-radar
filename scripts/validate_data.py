"""
Validate all daily data files for sanity issues.
Returns exit code 1 if any file has problems (use in CI to block deployment).

Usage:
    python scripts/validate_data.py           # validate all files
    python scripts/validate_data.py 2026-04-24  # validate specific date
"""
import json
import os
import sys


# Sanity ranges
TAIEX_MIN, TAIEX_MAX = 5000, 100000
CHG_MAX = 10  # ±10% Taiwan limit
TOTAL_STOCKS_MIN, TOTAL_STOCKS_MAX = 1000, 3000
LIMIT_UP_MAX = 500
FOREIGN_NET_MAX = 500_000_000_000  # ±500B TWD
GROUP_COUNT_MAX = 30


def validate_file(filepath: str) -> list[str]:
    """Return list of error strings; empty list = OK."""
    errors = []
    try:
        with open(filepath, encoding="utf-8") as f:
            d = json.load(f)
    except Exception as e:
        return [f"JSON parse error: {e}"]

    ms = d.get("market_summary", {})
    gs = d.get("groups", [])

    taiex = ms.get("taiex_close") or 0
    chg = ms.get("taiex_change_pct") or 0
    adv = ms.get("advance") or 0
    dec = ms.get("decline") or 0
    unc = ms.get("unchanged") or 0
    f_net = ms.get("foreign_net") or 0
    total_lu = sum(len(g.get("stocks", [])) for g in gs)

    if not (TAIEX_MIN <= taiex <= TAIEX_MAX):
        errors.append(f"TAIEX={taiex} (expect {TAIEX_MIN}-{TAIEX_MAX})")
    if abs(chg) > CHG_MAX:
        errors.append(f"chg%={chg} (expect ±{CHG_MAX}%)")

    total = adv + dec + unc
    if not (TOTAL_STOCKS_MIN <= total <= TOTAL_STOCKS_MAX):
        errors.append(f"total_stocks={total} (expect {TOTAL_STOCKS_MIN}-{TOTAL_STOCKS_MAX})")
    if total_lu > LIMIT_UP_MAX:
        errors.append(f"limit_up={total_lu} (expect ≤{LIMIT_UP_MAX})")
    if abs(f_net) > FOREIGN_NET_MAX:
        errors.append(f"foreign_net={f_net/1e8:.0f}億 (expect ±{FOREIGN_NET_MAX/1e8:.0f}億)")
    if len(gs) > GROUP_COUNT_MAX:
        errors.append(f"groups={len(gs)} (expect ≤{GROUP_COUNT_MAX})")

    return errors


def main():
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    data_dir = os.path.join(project_root, "data", "daily")

    if len(sys.argv) > 1:
        date = sys.argv[1]
        files = [f"{date}.json"]
    else:
        files = sorted([f for f in os.listdir(data_dir) if f.endswith(".json")])

    total_errors = 0
    for f in files:
        filepath = os.path.join(data_dir, f)
        if not os.path.exists(filepath):
            print(f"FAIL {f}: file not found")
            total_errors += 1
            continue

        errors = validate_file(filepath)
        if errors:
            total_errors += len(errors)
            print(f"FAIL {f}:")
            for e in errors:
                print(f"  - {e}")
        else:
            print(f"OK   {f}")

    print(f"\n{'=' * 50}")
    if total_errors > 0:
        print(f"TOTAL: {total_errors} error(s) across {len(files)} file(s)")
        sys.exit(1)
    print(f"All {len(files)} file(s) passed validation")


if __name__ == "__main__":
    main()
