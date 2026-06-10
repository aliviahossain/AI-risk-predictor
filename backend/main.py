from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from backend.routes.deg import router as deg_router
from backend.routes.geo import router as geo_router
import os

app = FastAPI(title="DEG Analysis API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

app.include_router(deg_router)
app.include_router(geo_router)

@app.get("/")
def root():
    return {"message": "DEG Analysis API is running!"}