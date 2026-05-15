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

// Parse a single CSV row, handling quoted fields that may contain commas.
function parseCSVRow(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

// Parse CSV text into a Portfolio object (ticker, shares columns required).
export function parseCSV(text: string): Portfolio {
  const lines = text.trim().split('\n');
  if (lines.length < 2) throw new Error('CSV must have a header and at least one data row.');

  const headers = parseCSVRow(lines[0]).map((h) => h.toLowerCase());
  const tickerIdx = headers.findIndex((h) => h === 'ticker' || h === 'symbol');
  const sharesIdx = headers.findIndex((h) => h === 'shares' || h === 'quantity');

  if (tickerIdx === -1) throw new Error('CSV must have a "ticker" or "symbol" column.');
  if (sharesIdx === -1) throw new Error('CSV must have a "shares" or "quantity" column.');

  const holdingsMap: Record<string, number> = {};
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVRow(lines[i]);
    if (!cols[tickerIdx]) continue;
    // BofA and similar exports put "SYMBOL Full Company Name" in the symbol column;
    // take only the first whitespace-separated token as the ticker.
    const ticker = cols[tickerIdx].toUpperCase().split(/\s+/)[0];
    if (!ticker) continue;
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
