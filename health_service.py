import httpx
import logging
from typing import Dict, Any
from app.core.celery_app import celery_app, REDIS_URL
from app.services.config_service import ConfigService

logger = logging.getLogger(__name__)

try:
    import redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False
    logger.warning("Redis package not available")


class HealthCheckService:
    """
    Serviço para verificar a saúde dos serviços externos:
    - Redis (broker de mensagens)
    - Celery (processamento assíncrono)
    - Flowwise (API de análise política)
    """
    
    @staticmethod
    def check_redis() -> Dict[str, Any]:
        """
        Verifica conectividade com Redis.
        
        Returns:
            Dict com status e detalhes da conexão
        """
        if not REDIS_AVAILABLE:
            return {
                "status": "not_configured",
                "message": "Redis não disponível neste ambiente"
            }
        
        try:
            broker_url = celery_app.conf.broker_url if celery_app else REDIS_URL
            redis_client = redis.from_url(
                broker_url,
                socket_connect_timeout=2,
                socket_timeout=2
            )
            redis_client.ping()
            redis_client.close()
            
            return {
                "status": "healthy",
                "message": "Redis conectado e respondendo",
                "url": broker_url.split('//')[0] + '//***'
            }
        except redis.ConnectionError as e:
            logger.error(f"Redis connection failed: {e}")
            return {
                "status": "unhealthy",
                "message": "Não foi possível conectar ao Redis",
                "error": str(e)
            }
        except Exception as e:
            logger.error(f"Redis health check failed: {e}")
            return {
                "status": "unhealthy",
                "message": "Erro ao verificar Redis",
                "error": str(e)
            }
    
    @staticmethod
    def check_celery() -> Dict[str, Any]:
        """
        Verifica se workers do Celery estão ativos.
        
        Returns:
            Dict com status e número de workers ativos
        """
        if celery_app is None:
            return {
                "status": "not_configured",
                "message": "Celery não disponível neste ambiente"
            }
        
        try:
            inspect = celery_app.control.inspect(timeout=2.0)
            active_workers = inspect.active()
            
            if active_workers:
                worker_count = len(active_workers)
                return {
                    "status": "healthy",
                    "message": f"{worker_count} worker(s) ativo(s)",
                    "workers": list(active_workers.keys())
                }
            else:
                return {
                    "status": "unhealthy",
                    "message": "Nenhum worker Celery ativo encontrado",
                    "workers": []
                }
        except Exception as e:
            logger.error(f"Celery health check failed: {e}")
            return {
                "status": "unhealthy",
                "message": "Erro ao verificar Celery workers",
                "error": str(e)
            }
    
    @staticmethod
    async def check_flowwise() -> Dict[str, Any]:
        """
        Verifica conectividade com API do Flowwise.
        
        Returns:
            Dict com status e detalhes da conexão
        """
        try:
            config = ConfigService.get_flowwise_config()
            
            if not config.get("flowise_url"):
                return {
                    "status": "not_configured",
                    "message": "Flowwise não configurado"
                }
            
            # Extrair base_url da URL completa
            url = config["flowise_url"]
            url_parts = url.rsplit("/", 2)
            if len(url_parts) >= 2:
                base_url = url_parts[0]
            else:
                base_url = url
            
            # Tentar fazer um health check na URL base
            headers = {}
            if config.get("flowise_key"):
                headers["Authorization"] = f"Bearer {config['flowise_key']}"
            
            async with httpx.AsyncClient(timeout=5.0) as client:
                try:
                    # Tentar endpoint raiz
                    response = await client.get(base_url, headers=headers)
                    
                    return {
                        "status": "healthy",
                        "message": "Flowwise acessível",
                        "url": base_url.split('//')[1].split('/')[0] if '//' in base_url else base_url,
                        "response_code": response.status_code
                    }
                except httpx.HTTPStatusError as e:
                    # Mesmo com erro HTTP, se conectou, o serviço está UP
                    if e.response.status_code in [401, 403, 404]:
                        return {
                            "status": "healthy",
                            "message": "Flowwise acessível (autenticação/rota esperada)",
                            "url": base_url.split('//')[1].split('/')[0] if '//' in base_url else base_url,
                            "response_code": e.response.status_code
                        }
                    raise
                    
        except httpx.ConnectError as e:
            logger.error(f"Flowwise connection failed: {e}")
            return {
                "status": "unhealthy",
                "message": "Não foi possível conectar ao Flowwise",
                "error": "Timeout ou conexão recusada"
            }
        except Exception as e:
            logger.error(f"Flowwise health check failed: {e}")
            return {
                "status": "unhealthy",
                "message": "Erro ao verificar Flowwise",
                "error": str(e)
            }
    
    @staticmethod
    async def check_all() -> Dict[str, Any]:
        """
        Verifica saúde de todos os serviços.
        
        Returns:
            Dict com status agregado e detalhes de cada serviço
        """
        redis_status = HealthCheckService.check_redis()
        celery_status = HealthCheckService.check_celery()
        flowwise_status = await HealthCheckService.check_flowwise()
        
        redis_ok = redis_status["status"] in ["healthy", "not_configured"]
        celery_ok = celery_status["status"] in ["healthy", "not_configured"]
        flowwise_ok = flowwise_status["status"] in ["healthy", "not_configured"]
        
        all_healthy = redis_ok and celery_ok and flowwise_ok
        
        async_processing_available = (
            redis_status["status"] == "healthy" and
            celery_status["status"] == "healthy"
        )
        
        analysis_available = (
            async_processing_available and
            flowwise_status["status"] == "healthy"
        )
        
        return {
            "status": "healthy" if all_healthy else "degraded",
            "async_processing_available": async_processing_available,
            "analysis_available": analysis_available,
            "services": {
                "redis": redis_status,
                "celery": celery_status,
                "flowwise": flowwise_status
            },
            "message": HealthCheckService._get_status_message(
                async_processing_available,
                analysis_available,
                flowwise_status["status"]
            )
        }
    
    @staticmethod
    def _get_status_message(async_available: bool, analysis_available: bool, flowwise_status: str) -> str:
        """Gera mensagem amigável sobre o status dos serviços"""
        if analysis_available:
            return "Todos os serviços funcionando normalmente"
        elif not async_available:
            return "Processamento assíncrono indisponível. Verifique Redis e Celery."
        elif flowwise_status == "not_configured":
            return "Flowwise não configurado. Configure em Configurações para habilitar análises."
        elif flowwise_status == "unhealthy":
            return "Flowwise indisponível. Análises não podem ser processadas no momento."
        else:
            return "Sistema em modo degradado"
