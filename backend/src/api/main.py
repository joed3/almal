from fastapi import FastAPI

from src.api.routes.health import router as health_router
from src.api.routes.market import router as market_router
from src.api.routes.portfolio import router as portfolio_router

app = FastAPI(title="Almal API", version="0.1.0")
app.include_router(health_router)
app.include_router(market_router)
app.include_router(portfolio_router)
