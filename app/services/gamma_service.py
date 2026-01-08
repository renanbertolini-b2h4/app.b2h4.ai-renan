import httpx
import logging
from typing import Dict, Any, Optional, List
from sqlalchemy.orm import Session

from app.models.api_credential import ApiCredential

logger = logging.getLogger(__name__)

GAMMA_API_BASE = "https://public-api.gamma.app/v1.0"


def get_gamma_api_key(db: Session) -> Optional[str]:
    """Busca a API Key do Gamma no banco de credenciais."""
    credential = db.query(ApiCredential).filter(
        ApiCredential.key == "GAMMA_API_KEY",
        ApiCredential.is_active == True
    ).first()
    
    if credential and credential.is_configured:
        return credential.value
    return None


class GammaService:
    """Serviço para interagir com a API do Gamma."""
    
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = GAMMA_API_BASE
        self.headers = {
            "X-API-KEY": api_key,
            "Content-Type": "application/json"
        }
    
    async def _request(
        self, 
        endpoint: str, 
        method: str = "GET", 
        data: Optional[Dict[str, Any]] = None,
        timeout: float = 120.0
    ) -> Dict[str, Any]:
        """Faz uma requisição para a API do Gamma."""
        url = f"{self.base_url}{endpoint}"
        
        async with httpx.AsyncClient(timeout=timeout) as client:
            try:
                if method == "GET":
                    response = await client.get(url, headers=self.headers)
                elif method == "POST":
                    response = await client.post(url, json=data, headers=self.headers)
                elif method == "PUT":
                    response = await client.put(url, json=data, headers=self.headers)
                elif method == "DELETE":
                    response = await client.delete(url, headers=self.headers)
                else:
                    raise ValueError(f"Método HTTP inválido: {method}")
                
                response.raise_for_status()
                return response.json()
            except httpx.HTTPStatusError as e:
                logger.error(f"Erro HTTP na API Gamma: {e.response.status_code} - {e.response.text}")
                raise
            except Exception as e:
                logger.error(f"Erro na requisição Gamma: {str(e)}")
                raise
    
    async def health_check(self) -> Dict[str, Any]:
        """Verifica o status da conexão com a API."""
        try:
            await self._request("/themes", timeout=10.0)
            return {
                "status": "connected",
                "api_configured": True
            }
        except Exception as e:
            return {
                "status": "disconnected",
                "api_configured": True,
                "error": str(e)
            }
    
    async def get_themes(self) -> Dict[str, Any]:
        """Retorna a lista de temas disponíveis."""
        return await self._request("/themes")
    
    async def get_folders(self) -> List[Dict[str, Any]]:
        """Retorna a lista de pastas do usuário."""
        return await self._request("/folders")
    
    async def generate(
        self,
        prompt: str,
        mode: str = "presentation",
        language: str = "pt-BR",
        theme: str = "default",
        folder_id: Optional[str] = None,
        response_format: str = "url",
        generate_images: bool = True,
        num_slides: Optional[int] = None,
        tone: Optional[str] = None,
        audience: Optional[str] = None,
        advanced: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Gera uma apresentação, documento ou webpage usando a API v1.0."""
        default_theme_ids = {"modern", "professional", "creative", "academic", "minimal", "bold", "default"}
        
        payload: Dict[str, Any] = {
            "inputText": prompt,
            "format": mode,
            "textMode": "generate"
        }
        
        if theme and theme not in default_theme_ids:
            payload["themeId"] = theme
        
        if num_slides:
            payload["numCards"] = num_slides
        
        if generate_images:
            payload["imageOptions"] = {
                "source": "aiGenerated"
            }
        else:
            payload["imageOptions"] = {
                "source": "none"
            }
        
        if folder_id:
            payload["folderIds"] = [folder_id]
        
        logger.info(f"Gerando apresentação Gamma: format={mode}, inputText length={len(prompt)}")
        return await self._request("/generations", "POST", payload, timeout=180.0)
    
    async def get_generation(self, generation_id: str) -> Dict[str, Any]:
        """Busca o status de uma geração pelo ID."""
        return await self._request(f"/generations/{generation_id}")
    
    async def poll_generation(
        self, 
        generation_id: str, 
        max_attempts: int = 60,
        interval: float = 3.0
    ) -> Dict[str, Any]:
        """Faz polling até a geração estar completa ou falhar."""
        import asyncio
        
        for attempt in range(max_attempts):
            result = await self.get_generation(generation_id)
            status = result.get("status", "").lower()
            
            logger.info(f"Polling geração {generation_id}: status={status}, tentativa={attempt+1}/{max_attempts}")
            
            if status == "completed":
                return result
            elif status in ("failed", "error"):
                raise Exception(f"Geração falhou: {result.get('error', 'Erro desconhecido')}")
            
            await asyncio.sleep(interval)
        
        raise Exception(f"Timeout aguardando geração após {max_attempts * interval} segundos")
    
    async def get_status(self, content_id: str) -> Dict[str, Any]:
        """Verifica o status de uma geração."""
        return await self._request(f"/generations/{content_id}")
    
    async def get_content(self, content_id: str) -> Dict[str, Any]:
        """Retorna os detalhes de um conteúdo gerado."""
        return await self._request(f"/content/{content_id}")
    
    async def update_content(self, content_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        """Atualiza um conteúdo existente."""
        return await self._request(f"/content/{content_id}", "PUT", updates)
    
    async def delete_content(self, content_id: str) -> Dict[str, Any]:
        """Deleta um conteúdo."""
        return await self._request(f"/content/{content_id}", "DELETE")
    
    async def export_content(self, content_id: str, format: str = "pdf") -> Dict[str, Any]:
        """Exporta um conteúdo em diferentes formatos (pdf, pptx, png, html)."""
        return await self._request(f"/export/{content_id}", "POST", {"format": format})
    
    async def export_as_images(self, content_id: str, format: str = "png") -> Dict[str, Any]:
        """Exporta todos os slides/cards como imagens PNG."""
        result = await self._request(f"/export/{content_id}", "POST", {"format": format}, timeout=180.0)
        return result
    
    async def download_export(self, url: str) -> bytes:
        """Faz download do arquivo exportado."""
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.get(url)
            response.raise_for_status()
            return response.content
    
    async def share_content(
        self, 
        content_id: str, 
        access_level: str = "view",
        password: Optional[str] = None,
        expiry_date: Optional[str] = None
    ) -> Dict[str, Any]:
        """Compartilha um conteúdo."""
        payload = {"access_level": access_level}
        if password:
            payload["password"] = password
        if expiry_date:
            payload["expiry_date"] = expiry_date
        
        return await self._request(f"/share/{content_id}", "POST", payload)


def analyze_prompt_for_mode(prompt: str) -> str:
    """Analisa o prompt e sugere o modo de geração."""
    lower_prompt = prompt.lower()
    if "apresentação" in lower_prompt or "slides" in lower_prompt:
        return "presentation"
    elif "documento" in lower_prompt or "relatório" in lower_prompt:
        return "document"
    elif "site" in lower_prompt or "página" in lower_prompt:
        return "webpage"
    return "presentation"


def suggest_theme(category: str) -> str:
    """Sugere um tema baseado na categoria."""
    theme_map = {
        "business": "professional",
        "education": "academic",
        "marketing": "creative",
        "technology": "modern",
        "finance": "minimal"
    }
    return theme_map.get(category, "modern")


def estimate_slide_count(prompt: str) -> int:
    """Estima a quantidade de slides baseado no prompt."""
    word_count = len(prompt.split())
    if word_count < 50:
        return 5
    if word_count < 150:
        return 10
    if word_count < 300:
        return 15
    return 20


def analyze_tone(prompt: str) -> str:
    """Analisa o tom do prompt."""
    lower_prompt = prompt.lower()
    if "formal" in lower_prompt or "executivo" in lower_prompt:
        return "professional"
    elif "criativo" in lower_prompt or "inovador" in lower_prompt:
        return "creative"
    elif "acadêmico" in lower_prompt or "pesquisa" in lower_prompt:
        return "academic"
    return "casual"


def identify_audience(prompt: str) -> str:
    """Identifica o público-alvo do prompt."""
    lower_prompt = prompt.lower()
    if "executivos" in lower_prompt or "diretoria" in lower_prompt:
        return "executive"
    elif "técnico" in lower_prompt or "desenvolvedores" in lower_prompt:
        return "technical"
    elif "estudantes" in lower_prompt or "alunos" in lower_prompt:
        return "educational"
    return "general"
