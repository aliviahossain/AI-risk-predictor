from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes.deg import router as deg_router
from routes.geo import UPLOAD_DIR, cleanup_expired_jobs, router as geo_router
import os

app = FastAPI(title="DEG Analysis API")

cors_origins = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000",
    ).split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)

os.makedirs(UPLOAD_DIR, exist_ok=True)
cleanup_expired_jobs()

app.include_router(deg_router)
app.include_router(geo_router)

@app.get("/")
def root():
    return {"message": "DEG Analysis API is running!"}


@app.get("/health")
def health():
    return {"status": "ok"}