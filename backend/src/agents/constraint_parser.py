"""Constraint parser agent for the Almal multi-agent system.

Parses free-text portfolio constraints into a structured ConstraintSet using Claude.
"""

import json

from anthropic import AsyncAnthropic

from src.config.settings import get_settings
from src.models.optimizer import ConstraintSet, LotData

CONSTRAINT_PARSER_SYSTEM_PROMPT = """\
You are a constraint parser for a portfolio optimization tool. Parse the user's \
natural language portfolio constraint into structured JSON.

You will receive a JSON object with:
- "constraint_text": the user's free-text input
- "available_tickers": list of tickers in their candidate universe
- "lots": list of { ticker, shares, purchase_date, cost_basis } lot objects

Return a JSON object with EXACTLY this structure (no markdown, no explanation):
{
  "constraints": {
    "max_weights": {},
    "min_weights": {},
    "min_shares": {},
    "portfolio_reduction_target": null,
    "tax_aware": false,
    "tax_aware_weight": 0.5
  },
  "chips": [],
  "clarification_needed": null
}

Parsing rules:
- "no single position larger than X%" or "cap X at Y%" → max_weights: {TICKER: 0.Y}
- "at least X% in TICKER" or "minimum X% TICKER" → min_weights: {TICKER: 0.X}
- "keep at least N shares of TICKER" or "don't sell more than \
half my TICKER" → min_shares
- "reduce portfolio by $X" or "free up $X" or "raise $X cash" → \
portfolio_reduction_target: X
- "tax-efficient" / "minimize capital gains" / "avoid selling gains" → \
tax_aware: true
- tax_aware_weight: 0.5 (moderate) by default; use 0.25 for "slightly" \
or 0.9 for "strongly prefer"
- Convert percentages to decimals (15% → 0.15)
- "half my TICKER shares" → compute 50% of the holding from lots if available
- chips: concise labels like "AAPL: max 15%", "Hold ≥ 50 MSFT", \
"Reduce by $10,000", "Tax-aware (moderate)"
- Only set clarification_needed when you genuinely cannot determine the intent after \
  reasonable inference — use it sparingly
"""


class ConstraintParserAgent:
    """Parses natural language into a ConstraintSet using Claude."""

    def __init__(self) -> None:
        """Initialise the ConstraintParserAgent."""
        settings = get_settings()
        self._anthropic = AsyncAnthropic(api_key=settings.anthropic_api_key)

    async def parse(
        self,
        text: str,
        tickers: list[str],
        lots: list[LotData],
    ) -> tuple[ConstraintSet, list[str], str | None]:
        """Parse free-text into a ConstraintSet, chips, and clarification.

        Args:
            text: The user's natural language constraint.
            tickers: Available ticker symbols in the candidate universe.
            lots: Lot-level holding data for min_shares computation.

        Returns:
            Tuple of (ConstraintSet, chips, clarification_needed).
        """
        settings = get_settings()
        payload = {
            "constraint_text": text,
            "available_tickers": tickers,
            "lots": [lot.model_dump(mode="json") for lot in lots],
        }

        msg = await self._anthropic.messages.create(
            model=settings.default_model,
            max_tokens=600,
            system=CONSTRAINT_PARSER_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": json.dumps(payload)}],
        )

        raw = msg.content[0].text.strip()  # type: ignore[union-attr]
        # Strip markdown code fences if present
        if raw.startswith("```"):
            lines = raw.split("\n")
            raw = "\n".join(lines[1:-1] if lines[-1] == "```" else lines[1:])

        data = json.loads(raw)
        constraints = ConstraintSet(**data.get("constraints", {}))
        chips: list[str] = data.get("chips", [])
        clarification: str | None = data.get("clarification_needed")
        return constraints, chips, clarification
