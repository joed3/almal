export interface Lot {
  ticker: string;
  shares: number;
  purchase_date: string | null;
  cost_basis: number | null;
}

export interface Holding {
  ticker: string;
  lots: Lot[];
  total_shares: number;
  total_cost: number | null;
}

export interface Portfolio {
  holdings: Holding[];
  uploaded_at: string;
}

// Parse CSV text into a Portfolio object (ticker, shares columns required).
export function parseCSV(text: string): Portfolio {
  const lines = text.trim().split('\n');
  if (lines.length < 2) throw new Error('CSV must have a header and at least one data row.');

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const tickerIdx = headers.findIndex((h) => h === 'ticker' || h === 'symbol');
  const sharesIdx = headers.findIndex((h) => h === 'shares' || h === 'quantity');

  if (tickerIdx === -1) throw new Error('CSV must have a "ticker" or "symbol" column.');
  if (sharesIdx === -1) throw new Error('CSV must have a "shares" or "quantity" column.');

  const holdingsMap: Record<string, number> = {};
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim());
    if (!cols[tickerIdx]) continue;
    const ticker = cols[tickerIdx].toUpperCase();
    const shares = parseFloat(cols[sharesIdx]);
    if (isNaN(shares)) continue;
    holdingsMap[ticker] = (holdingsMap[ticker] ?? 0) + shares;
  }

  const holdings: Holding[] = Object.entries(holdingsMap).map(([ticker, shares]) => ({
    ticker,
    lots: [{ ticker, shares, purchase_date: null, cost_basis: null }],
    total_shares: shares,
    total_cost: null,
  }));

  return {
    holdings,
    uploaded_at: new Date().toISOString(),
  };
}
