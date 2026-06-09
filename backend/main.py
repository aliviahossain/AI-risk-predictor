from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes.deg import router as deg_router

app = FastAPI(title="DEG Analysis API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(deg_router)

@app.get("/")
def root():
    return {"message": "DEG Analysis backend is running!"}