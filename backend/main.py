from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from routes import router
from admin_bd_routes import router as admin_bd_router
from ai_routes import router as ai_router
from ai_estudio_routes import router as ai_estudio_router
from mygroups_oidc import router as mygroups_router
from auto_metadata_routes import router as auto_metadata_router, batch_router as metadata_batch_router
from database import create_db_and_tables
from oauth.codex_routes import router as codex_oauth_router
from oauth.claude_routes import router as claude_oauth_router
import oauth.models  # noqa: F401 — garante que as tabelas entram no metadata

limiter = Limiter(key_func=get_remote_address)
app = FastAPI(title="BibliosHome API")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

#CORS Configuration
origins = [
    "http://localhost:5171",
    "http://localhost:3000",
    "https://library.pxluthor.com.br",
    "https://api-library.pxluthor.com.br",
    # IP LAN 192.168.0.106 removido — era origem de dev, não deve estar em produção
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
app.include_router(admin_bd_router)
app.include_router(ai_router)
app.include_router(ai_estudio_router)
app.include_router(auto_metadata_router)
app.include_router(metadata_batch_router)
app.include_router(mygroups_router)
app.include_router(codex_oauth_router)
app.include_router(claude_oauth_router)

@app.get("/")
def read_root():
    return {"message": "PDF Translator API is running"}


# uvicorn main:app --host 0.0.0.0 --port 8001
