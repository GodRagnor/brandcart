from dotenv import load_dotenv
load_dotenv()

import asyncio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import get_db

# ENV
from config.env import ENV, CORS_ALLOWED_ORIGINS

# ROUTES
from routes.auth import router as auth_router
from routes.products import router as products_router
from routes.orders import router as orders_router
from routes.admin import router as admin_router
from routes.seller import router as seller_router
from routes.public import router as public_router
from routes.reviews import router as reviews_router
from routes.webhooks import router as webhook_router
from routes.address import router as address_router
from routes.brands import router as brands_router
from routes.uploads import router as uploads_router

# WORKERS
from utils.cod_settlement_worker import cod_settlement_worker
from utils.reserve_release_worker import reserve_release_worker
from utils.return_worker import return_worker
from workers.order_expiry_worker import order_expiry_worker
from workers.return_deadline_worker import return_deadline_worker
from workers.audit_cleanup_worker import audit_cleanup_worker

print("ENV:", ENV)

app = FastAPI(
    title="Brandcart API",
    version="1.0.0",
    docs_url=None if ENV == "production" else "/docs",
    redoc_url=None if ENV == "production" else "/redoc",
    openapi_url=None if ENV == "production" else "/openapi.json",
)

# -----------------------------
# CORS
# -----------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

# -----------------------------
# ROUTES
# -----------------------------

app.include_router(auth_router, prefix="/api")
app.include_router(products_router, prefix="/api")
app.include_router(orders_router, prefix="/api")
app.include_router(admin_router, prefix="/api")
app.include_router(seller_router, prefix="/api")
app.include_router(public_router, tags=["Public"])
app.include_router(reviews_router, prefix="/api")
app.include_router(webhook_router, prefix="/api")
app.include_router(address_router, prefix="/api")
app.include_router(uploads_router, prefix="/api")
app.include_router(brands_router, prefix="/api")

# -----------------------------
# HEALTH CHECKS
# -----------------------------

@app.get("/api/health")
async def health():

    return {"status": "ok"}

@app.get("/api/health/db")
async def health_db():
    db = get_db()
    await db.command("ping")
    return {"status": "mongodb connected"}

# -----------------------------
# STARTUP WORKERS (ONE PLACE ONLY)
# -----------------------------

@app.on_event("startup")
async def start_background_workers():
    asyncio.create_task(cod_settlement_worker())
    asyncio.create_task(reserve_release_worker())
    asyncio.create_task(return_worker())
    asyncio.create_task(order_expiry_worker())
    asyncio.create_task(return_deadline_worker())
    asyncio.create_task(audit_cleanup_worker())
