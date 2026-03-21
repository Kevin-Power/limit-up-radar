from scraper.twse import parse_daily_quotes, is_limit_up

SAMPLE_TWSE_RESPONSE = {
    "stat": "OK",
    "date": "20260320",
    "data9": [
        ["2330", "台積電", "45,678,901", "23,456", "29,876,543,210",
         "650.00", "660.00", "648.00", "658.00", "+",
         "8.00", "658.00", "100", "659.00", "200", "25.30"],
        ["2002", "中鋼", "142,876,000", "45,678", "4,634,385,200",
         "30.50", "32.45", "30.20", "32.45", "+",
         "2.95", "32.45", "500", "32.50", "300", "15.20"],
    ]
}

def test_parse_daily_quotes_extracts_fields():
    quotes = parse_daily_quotes(SAMPLE_TWSE_RESPONSE, "2026-03-20")
    assert len(quotes) == 2
    tsmc = quotes[0]
    assert tsmc["stock_code"] == "2330"
    assert tsmc["stock_name"] == "台積電"
    assert tsmc["close"] == 658.0
    assert tsmc["change"] == 8.0
    assert tsmc["volume"] == 45678901

def test_parse_daily_quotes_handles_commas_in_numbers():
    quotes = parse_daily_quotes(SAMPLE_TWSE_RESPONSE, "2026-03-20")
    assert quotes[1]["volume"] == 142876000

def test_is_limit_up():
    assert is_limit_up(close=32.45, prev_close=29.50) is True
    assert is_limit_up(close=32.00, prev_close=29.50) is False

def test_parse_daily_quotes_bad_stat():
    bad_response = {"stat": "ERROR", "data9": []}
    quotes = parse_daily_quotes(bad_response, "2026-03-20")
    assert quotes == []
