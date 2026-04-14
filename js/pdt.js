// ── PDT CALCULATION LOGIC ─────────────────────────────────
// Pure functions — no side effects, no DOM, no imports.

// Returns an array of n trading-day date strings going back from fromDateStr
// (inclusive), skipping Saturday (6) and Sunday (0).
export function getTradingDaysBack(fromDateStr, n) {
  const dates = [];
  const d = new Date(fromDateStr + 'T12:00:00');
  while (dates.length < n) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) {
      dates.push(d.toISOString().split('T')[0]);
    }
    d.setDate(d.getDate() - 1);
  }
  return dates;
}

// Count of day trades in the rolling 5-trading-day window as of asOfDate.
export function getRollingDayTrades(trades, asOfDate) {
  const window5 = getTradingDaysBack(asOfDate, 5);
  return trades.filter(t => t.isDayTrade && window5.includes(t.date)).length;
}

// Returns { count, window5, dtTrades } for today's date.
// count     — number of day trades in the window
// window5   — the 5 trading-day date strings (most recent first)
// dtTrades  — the matching trade objects
export function getPDTStatus(trades) {
  const today = new Date().toISOString().split('T')[0];
  const window5 = getTradingDaysBack(today, 5);
  const dtTrades = trades.filter(t => t.isDayTrade && window5.includes(t.date));
  return { count: dtTrades.length, window5, dtTrades };
}
