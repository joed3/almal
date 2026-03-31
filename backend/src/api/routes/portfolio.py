"""Portfolio API routes."""

from fastapi import APIRouter, HTTPException, UploadFile

from src.data.csv_parser import parse_portfolio_csv
from src.models.portfolio import Portfolio

router = APIRouter(prefix="/portfolio", tags=["portfolio"])


@router.post("/upload", response_model=Portfolio)
async def upload_portfolio(file: UploadFile) -> Portfolio:
    """Parse an uploaded CSV file and return a Portfolio.

    Args:
        file: Multipart CSV file upload.

    Returns:
        Parsed Portfolio derived from the CSV contents.

    Raises:
        HTTPException: 422 if the CSV cannot be parsed (e.g. missing
            ticker column).
    """
    content = await file.read()
    try:
        return parse_portfolio_csv(content)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
