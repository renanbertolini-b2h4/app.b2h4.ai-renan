from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os
import logging

from app.api.routes import auth, analises, config, health, materiais, admin, nps, certificates, credentials, org_credentials, gamma, pii, deep_analysis
from app.core.database import engine, Base
from app.core.crypto import EncryptionService

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

Base.metadata.create_all(bind=engine)

EncryptionService.initialize()

app = FastAPI(
    title="Plataforma B2H4",
    description="Plataforma de cursos e automação com IA",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["Autenticação"])
app.include_router(materiais.router, prefix="/api", tags=["Materiais"])
app.include_router(analises.router, prefix="/api", tags=["Análises"])
app.include_router(config.router, prefix="/api/config", tags=["Configurações"])
app.include_router(health.router, prefix="/api", tags=["Health Check"])
app.include_router(admin.router, tags=["Administração"])
app.include_router(nps.router, prefix="/api", tags=["NPS"])
app.include_router(certificates.router, prefix="/api", tags=["Certificados"])
app.include_router(credentials.router, prefix="/api", tags=["Credenciais"])
app.include_router(org_credentials.router, prefix="/api", tags=["Credenciais de Organização"])
app.include_router(gamma.router, prefix="/api", tags=["Gamma"])
app.include_router(pii.router, prefix="/api", tags=["PII Masking"])
app.include_router(deep_analysis.router, prefix="/api", tags=["Deep Analysis"])

if os.path.exists("client/public/materiais"):
    app.mount("/materiais", StaticFiles(directory="client/public/materiais"), name="materiais")

if os.path.exists("client/dist"):
    app.mount("/assets", StaticFiles(directory="client/dist/assets"), name="assets")
    
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if full_path.startswith("materiais/"):
            return FileResponse(f"client/public/{full_path}")
        file_path = f"client/dist/{full_path}"
        if os.path.exists(file_path) and os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(
            "client/dist/index.html",
            headers={"Cache-Control": "no-cache, no-store, must-revalidate"}
        )

