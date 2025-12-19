from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes import router
from database import create_db_and_tables

app = FastAPI(title="PDF Translator API")

# CORS Configuration
origins = [
    "http://localhost:5173",  # Vite default port
    "http://localhost:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Range", "Accept-Ranges", "Content-Length", "Content-Disposition"],
)



@app.on_event("startup")
def on_startup():
    create_db_and_tables()

app.include_router(router)

@app.get("/")
def read_root():
    return {"message": "PDF Translator API is running"}


# uvicorn main:app --reload --port 8001