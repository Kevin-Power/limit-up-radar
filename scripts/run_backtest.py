"""
真實勝率回測 - 用 TWSE 抓真實隔日 OHLC，存到 data/backtest.json
每日由 GitHub Actions 跑一次。
"""
import json
import os
import sys
import time
import requests

REV_FILE = 'data/revenue/2026-03.json'
DAILY_DIR = 'data/daily'
OUT_FILE = 'data/backtest.json'
DAYS_TO_BACKTEST = 10
MAX_PICKS_PER_DAY = 20


def score_stock(s, group, trending, leader, rev_yoy, is_disposal=False, consecutive_up_days=1):
    """Mirror src/lib/scoring.ts scoreStock() exactly."""
    score = 0

    # === Negative signals (must come first) ===
    if is_disposal:
        score -= 50
    lots = s['volume'] / 1000
    if lots < 500:
        score -= 30
    elif lots < 2000:
        score -= 15

    # === Positive signals ===
    if group['name'] in trending:
        score += 30
    if rev_yoy is not None and rev_yoy > 20:
        score += 25
        if rev_yoy > 50:
            score += 10
    if s['major_net'] > 0:
        score += 20
    if s.get('streak', 1) >= 2:
        score += 15
    if s['volume'] > 5_000_000:
        score += 5
    if leader == s['code']:
        score += 10
    # consecutive_up_days >= 3 is a tag-only warning; no score change
    return score


def fetch_stock_ohlc(code, date):
    """Fetch OHLC for one stock on one date (TWSE then TPEx fallback)."""
    yyyymm = date.replace('-', '')[:6] + '01'
    target_roc = f"{int(date[:4])-1911}/{date[5:7]}/{date[8:10]}"

    # TWSE
    try:
        r = requests.get(
            'https://www.twse.com.tw/exchangeReport/STOCK_DAY',
            params={'response': 'json', 'date': yyyymm, 'stockNo': code},
            headers={'User-Agent': 'Mozilla/5.0'}, timeout=10,
        )
        if r.status_code == 200:
            d = r.json()
            if d.get('stat') == 'OK':
                for row in d.get('data', []):
                    if row[0].strip() == target_roc:
                        try:
                            return {
                                'open': float(row[3].replace(',', '')) if row[3] else None,
                                'close': float(row[6].replace(',', '')) if row[6] else None,
                            }
                        except (ValueError, IndexError):
                            return None
    except Exception:
        pass

    # TPEx fallback (new endpoint: /www/zh-tw/afterTrading/tradingStock)
    # Returns single-day OHLC. Fields: ['日期','成交張數','成交仟元','開盤','最高','最低','收盤','漲跌']
    try:
        r = requests.get(
            'https://www.tpex.org.tw/www/zh-tw/afterTrading/tradingStock',
            params={'date': date.replace('-', '/'), 'code': code, 'response': 'json'},
            headers={'User-Agent': 'Mozilla/5.0'}, timeout=10,
        )
        if r.status_code == 200:
            d = r.json()
            for t in d.get('tables', []) or []:
                for row in t.get('data', []) or []:
                    if str(row[0]).strip() == target_roc:
                        try:
                            o = str(row[3]).replace(',', '').strip()
                            c = str(row[6]).replace(',', '').strip()
                            return {
                                'open': float(o) if o not in ('--', '') else None,
                                'close': float(c) if c not in ('--', '') else None,
                            }
                        except (ValueError, IndexError):
                            return None
    except Exception:
        pass

    return None


def main():
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(project_root)

    with open(REV_FILE, encoding='utf-8') as f:
        rev = json.load(f)
    rev_map = {s['code']: s for s in rev['stocks']}

    files = sorted([f for f in os.listdir(DAILY_DIR) if f.endswith('.json')])
    if len(files) < 3:
        print("Not enough data for backtest")
        sys.exit(1)

    history = []

    # Backtest the last N days (today is files[-1], no next-day for it)
    for i in range(1, min(DAYS_TO_BACKTEST + 1, len(files) - 1)):
        today_f = files[-1 - i]
        next_f = files[-i]
        today_date = today_f.replace('.json', '')
        next_date = next_f.replace('.json', '')

        with open(f'{DAILY_DIR}/{today_f}', encoding='utf-8') as fp:
            td = json.load(fp)

        # Trending groups: today + previous 2 days
        trending_groups = set()
        group_days = {g['name']: 1 for g in td['groups']}
        for j in range(1, 3):
            idx = files.index(today_f) - j
            if idx >= 0:
                with open(f'{DAILY_DIR}/{files[idx]}', encoding='utf-8') as fp:
                    pd = json.load(fp)
                for g in pd['groups']:
                    group_days[g['name']] = group_days.get(g['name'], 0) + 1
        trending_groups = {n for n, d in group_days.items() if d >= 2}

        # Per-stock risk metrics (6-day lookback ending at today_f)
        # ≥3 limit-up days in 6 → TWSE 處置 threshold
        last6_dates = []
        last6_codes_per_day = []
        idx_today = files.index(today_f)
        for j in range(0, 6):
            idx = idx_today - j
            if idx < 0:
                break
            with open(f'{DAILY_DIR}/{files[idx]}', encoding='utf-8') as fp:
                day_data = json.load(fp)
            last6_dates.append(day_data['date'])
            day_codes = set()
            for g in day_data['groups']:
                for s in g['stocks']:
                    day_codes.add(s['code'])
            last6_codes_per_day.append(day_codes)

        consec_map = {}
        disposal_codes = set()
        all_codes_in_window = set()
        for codes in last6_codes_per_day:
            all_codes_in_window |= codes
        for code in all_codes_in_window:
            # consecutive from index 0 (most recent first)
            consec = 0
            for codes in last6_codes_per_day:
                if code in codes:
                    consec += 1
                else:
                    break
            consec_map[code] = consec
            # ≥3 days appearance in last 6
            count = sum(1 for codes in last6_codes_per_day if code in codes)
            if count >= 3:
                disposal_codes.add(code)

        # Score and pick (score >= 50)
        picks = []
        for g in td['groups']:
            sorted_g = sorted(g['stocks'], key=lambda s: -s['volume'])
            leader = sorted_g[0]['code'] if sorted_g else None
            for s in g['stocks']:
                r = rev_map.get(s['code'])
                ryoy = r['revYoY'] if r else None
                sc = score_stock(
                    s, g, trending_groups, leader, ryoy,
                    is_disposal=s['code'] in disposal_codes,
                    consecutive_up_days=consec_map.get(s['code'], 1),
                )
                if sc >= 50:
                    picks.append({
                        'code': s['code'],
                        'name': s['name'],
                        'today_close': s['close'],
                        'score': sc,
                    })

        picks.sort(key=lambda p: -p['score'])
        picks = picks[:MAX_PICKS_PER_DAY]

        print(f"\n{today_date} → {next_date}: {len(picks)} picks, fetching real OHLC...")

        results = []
        for p in picks:
            ohlc = fetch_stock_ohlc(p['code'], next_date)
            time.sleep(0.4)  # rate limit
            if not ohlc or ohlc.get('open') is None or ohlc.get('close') is None:
                continue
            open_pct = (ohlc['open'] - p['today_close']) / p['today_close'] * 100
            close_pct = (ohlc['close'] - p['today_close']) / p['today_close'] * 100
            results.append({
                'code': p['code'],
                'name': p['name'],
                'score': p['score'],
                'today_close': p['today_close'],
                'next_open': ohlc['open'],
                'next_close': ohlc['close'],
                'open_pct': round(open_pct, 2),
                'close_pct': round(close_pct, 2),
            })

        if not results:
            print(f"  No data fetched")
            continue

        open_wins = sum(1 for r in results if r['open_pct'] > 0)
        close_wins = sum(1 for r in results if r['close_pct'] > 0)
        avg_open = sum(r['open_pct'] for r in results) / len(results)
        avg_close = sum(r['close_pct'] for r in results) / len(results)

        # Best stock by close return
        best = max(results, key=lambda r: r['close_pct']) if results else None

        history.append({
            'date': today_date,
            'nextDate': next_date,
            'picks': len(picks),
            'fetched': len(results),
            'openWinRate': round(open_wins / len(results) * 100),
            'closeWinRate': round(close_wins / len(results) * 100),
            'avgOpenPct': round(avg_open, 2),
            'avgClosePct': round(avg_close, 2),
            'bestStock': {
                'code': best['code'],
                'name': best['name'],
                'closePct': best['close_pct'],
            } if best else None,
            # Internal fields for weighted aggregation, stripped before save
            '_open_wins_raw': open_wins,
            '_close_wins_raw': close_wins,
            '_sum_open_pct': sum(r['open_pct'] for r in results),
            '_sum_close_pct': sum(r['close_pct'] for r in results),
        })

        print(f"  Fetched {len(results)} | open win {open_wins}/{len(results)} ({open_wins/len(results)*100:.0f}%) avg {avg_open:+.2f}% | close win {close_wins}/{len(results)} ({close_wins/len(results)*100:.0f}%) avg {avg_close:+.2f}%")

    # Aggregate (SAMPLE-WEIGHTED, not day-averaged)
    # Bug fix: previous version averaged per-day rates, so a 3-pick day
    # counted equally to a 30-pick day. Now we sum across all samples.
    if history:
        total_fetched = sum(h['fetched'] for h in history)
        total_open_wins = sum(h['_open_wins_raw'] for h in history)
        total_close_wins = sum(h['_close_wins_raw'] for h in history)
        sum_open_pct = sum(h['_sum_open_pct'] for h in history)
        sum_close_pct = sum(h['_sum_close_pct'] for h in history)
        avg_owr = total_open_wins / total_fetched * 100
        avg_cwr = total_close_wins / total_fetched * 100
        avg_op = sum_open_pct / total_fetched
        avg_cp = sum_close_pct / total_fetched
        # Strip internal helper fields before saving
        for h in history:
            h.pop('_open_wins_raw', None)
            h.pop('_close_wins_raw', None)
            h.pop('_sum_open_pct', None)
            h.pop('_sum_close_pct', None)
    else:
        total_fetched = total_open_wins = total_close_wins = 0
        avg_owr = avg_cwr = avg_op = avg_cp = 0

    output = {
        'updatedAt': files[-1].replace('.json', ''),
        'totalDays': len(history),
        'totalSamples': total_fetched,
        'totalOpenWins': total_open_wins,
        'totalCloseWins': total_close_wins,
        'avgOpenWinRate': round(avg_owr),
        'avgCloseWinRate': round(avg_cwr),
        'avgOpenReturn': round(avg_op, 2),
        'avgCloseReturn': round(avg_cp, 2),
        'methodology': '用 TWSE 真實隔日 OHLC 計算（樣本加權平均）。今日收盤買，隔日開盤/收盤賣。',
        'history': history,
    }

    with open(OUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\n{'=' * 60}")
    print(f"Backtest complete: {len(history)} days, {total_fetched} samples")
    print(f"  Open  win rate: {avg_owr:.0f}% | avg return {avg_op:+.2f}%")
    print(f"  Close win rate: {avg_cwr:.0f}% | avg return {avg_cp:+.2f}%")
    print(f"Saved to {OUT_FILE}")


if __name__ == '__main__':
    main()
