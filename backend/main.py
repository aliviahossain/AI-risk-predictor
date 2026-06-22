from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from routes.deg import router as deg_router
from routes.geo import router as geo_router
import os

app = FastAPI(title="DEG Analysis API")

# Allow ALL origins so other devices on network can access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
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