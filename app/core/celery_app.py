import os
import logging

logger = logging.getLogger(__name__)

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6000/0")
CELERY_ENABLED = os.getenv("CELERY_ENABLED", "true").lower() == "true"

celery_app = None
celery_status = {
    "enabled": False,
    "redis_connected": False,
    "mode": "sync",
    "message": "Celery não inicializado"
}


def test_redis_connection(redis_url: str, timeout: int = 2) -> bool:
    """Testa se o Redis está acessível"""
    try:
        import redis
        client = redis.from_url(redis_url, socket_timeout=timeout, socket_connect_timeout=timeout)
        client.ping()
        client.close()
        return True
    except Exception as e:
        logger.warning(f"Redis não está acessível em {redis_url}: {e}")
        return False


def get_celery_status() -> dict:
    """Retorna o status atual do Celery/Redis"""
    return celery_status.copy()


if CELERY_ENABLED:
    if test_redis_connection(REDIS_URL):
        try:
            from celery import Celery
            
            celery_app = Celery(
                "posicionometro",
                broker=REDIS_URL,
                backend=REDIS_URL,
                include=["app.tasks.flowwise_tasks", "app.tasks.pii_tasks"]
            )

            celery_app.conf.update(
                task_serializer="json",
                accept_content=["json"],
                result_serializer="json",
                timezone="America/Sao_Paulo",
                enable_utc=True,
                task_track_started=True,
                task_time_limit=30 * 60,
                task_soft_time_limit=25 * 60,
                worker_prefetch_multiplier=1,
                worker_max_tasks_per_child=50,
            )

            celery_app.autodiscover_tasks(["app.tasks"])
            
            celery_status.update({
                "enabled": True,
                "redis_connected": True,
                "mode": "async",
                "message": "Celery configurado - tarefas executam de forma assíncrona"
            })
            logger.info("✅ Celery inicializado com sucesso - modo assíncrono ativo")
            
        except Exception as e:
            logger.warning(f"⚠️ Falha ao inicializar Celery: {e}. Continuando em modo síncrono.")
            celery_app = None
            celery_status.update({
                "enabled": False,
                "redis_connected": True,
                "mode": "sync",
                "message": f"Erro ao inicializar Celery: {str(e)}"
            })
    else:
        logger.info("⚠️ Redis não disponível. Celery desabilitado - tarefas executarão de forma síncrona.")
        celery_status.update({
            "enabled": False,
            "redis_connected": False,
            "mode": "sync",
            "message": "Redis não configurado ou inacessível. Configure REDIS_URL para habilitar modo assíncrono."
        })
else:
    logger.info("ℹ️ Celery desabilitado via CELERY_ENABLED=false - tarefas executarão de forma síncrona.")
    celery_status.update({
        "enabled": False,
        "redis_connected": False,
        "mode": "sync",
        "message": "Celery desabilitado por configuração (CELERY_ENABLED=false)"
    })
