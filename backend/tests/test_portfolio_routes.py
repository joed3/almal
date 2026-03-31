"""Tests for the portfolio upload endpoint."""

import io

from httpx import AsyncClient


async def test_upload_valid_csv_returns_portfolio(client: AsyncClient) -> None:
    csv_content = b"ticker,shares\nAAPL,10\nMSFT,5\n"
    response = await client.post(
        "/portfolio/upload",
        files={"file": ("portfolio.csv", io.BytesIO(csv_content), "text/csv")},
    )
    assert response.status_code == 200
    data = response.json()
    assert "holdings" in data
    assert "uploaded_at" in data
    tickers = {h["ticker"] for h in data["holdings"]}
    assert tickers == {"AAPL", "MSFT"}


async def test_upload_csv_with_multiple_lots(client: AsyncClient) -> None:
    csv_content = b"ticker,shares,cost\nAAPL,10,150.0\nAAPL,5,160.0\nMSFT,20,300.0\n"
    response = await client.post(
        "/portfolio/upload",
        files={"file": ("portfolio.csv", io.BytesIO(csv_content), "text/csv")},
    )
    assert response.status_code == 200
    data = response.json()
    aapl = next(h for h in data["holdings"] if h["ticker"] == "AAPL")
    assert len(aapl["lots"]) == 2
    assert aapl["total_shares"] == 15.0


async def test_upload_invalid_csv_no_ticker_column(client: AsyncClient) -> None:
    csv_content = b"quantity,price\n10,100.0\n"
    response = await client.post(
        "/portfolio/upload",
        files={"file": ("bad.csv", io.BytesIO(csv_content), "text/csv")},
    )
    assert response.status_code == 422


async def test_upload_csv_total_cost_computed(client: AsyncClient) -> None:
    csv_content = b"ticker,shares,cost basis\nAAPL,10,100.0\n"
    response = await client.post(
        "/portfolio/upload",
        files={"file": ("portfolio.csv", io.BytesIO(csv_content), "text/csv")},
    )
    assert response.status_code == 200
    data = response.json()
    holding = data["holdings"][0]
    assert holding["total_cost"] == 1000.0
