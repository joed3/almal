from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api.routes.agent import router as agent_router
from src.api.routes.chat import router as chat_router
from src.api.routes.health import router as health_router
from src.api.routes.market import router as market_router
from src.api.routes.optimizer import router as optimizer_router
from src.api.routes.portfolio import router as portfolio_router

app = FastAPI(title="Almal API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5200"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(market_router)
app.include_router(portfolio_router)
app.include_router(optimizer_router)
app.include_router(agent_router)
app.include_router(chat_router)
