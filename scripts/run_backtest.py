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


def score_stock(s, group, trending, leader, rev_yoy):
    score = 0
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

    # TPEx fallback
    try:
        r = requests.get(
            'https://www.tpex.org.tw/web/stock/aftertrading/daily_trading_info/st43_result.php',
            params={'l': 'zh-tw', 'd': f"{int(date[:4])-1911}/{date[5:7]}", 'stkno': code},
            headers={'User-Agent': 'Mozilla/5.0'}, timeout=10,
        )
        d = r.json()
        for row in d.get('aaData', []):
            if row[0].strip() == target_roc:
                try:
                    return {
                        'open': float(row[3].replace(',', '')) if row[3] not in ('--', '') else None,
                        'close': float(row[6].replace(',', '')) if row[6] not in ('--', '') else None,
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

        # Score and pick (score >= 50)
        picks = []
        for g in td['groups']:
            sorted_g = sorted(g['stocks'], key=lambda s: -s['volume'])
            leader = sorted_g[0]['code'] if sorted_g else None
            for s in g['stocks']:
                r = rev_map.get(s['code'])
                ryoy = r['revYoY'] if r else None
                sc = score_stock(s, g, trending_groups, leader, ryoy)
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
        })

        print(f"  Fetched {len(results)} | open win {open_wins}/{len(results)} ({open_wins/len(results)*100:.0f}%) avg {avg_open:+.2f}% | close win {close_wins}/{len(results)} ({close_wins/len(results)*100:.0f}%) avg {avg_close:+.2f}%")

    # Aggregate
    if history:
        total_fetched = sum(h['fetched'] for h in history)
        avg_owr = sum(h['openWinRate'] for h in history) / len(history)
        avg_cwr = sum(h['closeWinRate'] for h in history) / len(history)
        avg_op = sum(h['avgOpenPct'] for h in history) / len(history)
        avg_cp = sum(h['avgClosePct'] for h in history) / len(history)
    else:
        total_fetched = avg_owr = avg_cwr = avg_op = avg_cp = 0

    output = {
        'updatedAt': files[-1].replace('.json', ''),
        'totalDays': len(history),
        'totalSamples': total_fetched,
        'avgOpenWinRate': round(avg_owr),
        'avgCloseWinRate': round(avg_cwr),
        'avgOpenReturn': round(avg_op, 2),
        'avgCloseReturn': round(avg_cp, 2),
        'methodology': '用 TWSE 真實隔日 OHLC 計算。今日收盤買，隔日開盤/收盤賣。',
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
