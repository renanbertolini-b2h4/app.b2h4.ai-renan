from app.core.database import SessionLocal
from app.models.analise import Analise
from app.models.org_credential import OrgCredential
from app.services.flowwise_service import FlowiseService
from app.services.config_service import ConfigService
from datetime import datetime
import logging
import asyncio
import uuid

logger = logging.getLogger(__name__)


def get_flowwise_config(organization_id=None, db=None):
    """
    Lê as configurações do Flowwise.
    Prioridade:
    1. Credenciais da organização (se organization_id fornecido)
    2. Credenciais globais do ConfigService
    """
    org_url = None
    org_key = None
    
    if organization_id and db:
        try:
            org_uuid = uuid.UUID(str(organization_id)) if isinstance(organization_id, str) else organization_id
            
            url_cred = db.query(OrgCredential).filter(
                OrgCredential.organization_id == org_uuid,
                OrgCredential.key == "FLOWISE_API_URL",
                OrgCredential.is_active == True
            ).first()
            
            key_cred = db.query(OrgCredential).filter(
                OrgCredential.organization_id == org_uuid,
                OrgCredential.key == "FLOWISE_API_KEY",
                OrgCredential.is_active == True
            ).first()
            
            if url_cred and url_cred.is_configured:
                org_url = url_cred.value
            
            if key_cred and key_cred.is_configured:
                org_key = key_cred.value
        except Exception as e:
            logger.warning(f"Error getting org credentials: {e}")
    
    if org_url and org_key:
        logger.info(f"Using org-specific Flowise credentials for org {organization_id}")
        return {
            "url": org_url,
            "key": org_key
        }
    
    repldb_config = ConfigService.get_flowwise_config()
    global_url = (repldb_config.get("flowise_url", "") or "").strip()
    global_key = (repldb_config.get("flowise_key", "") or "").strip()
    return {
        "url": global_url,
        "key": global_key
    }


def _execute_analise_logic(analise_id: str, db=None):
    """
    Lógica principal de execução de análise política.
    Usada tanto no modo síncrono quanto assíncrono.
    """
    close_db = False
    if db is None:
        db = SessionLocal()
        close_db = True
    
    try:
        analise = db.query(Analise).filter(Analise.id == analise_id).first()
        
        if not analise:
            logger.error(f"Análise {analise_id} não encontrada")
            return {"success": False, "error": "Análise não encontrada"}
        
        analise.status = "processando"
        analise.started_at = datetime.utcnow()
        db.commit()
        
        logger.info(f"🔄 Iniciando análise {analise_id}")
        logger.info(f"   Político: {analise.politico}")
        logger.info(f"   Lei: {analise.lei}")
        
        question = f"""Analise a coerência política do político {analise.politico} em relação à lei/projeto: {analise.lei}.

Forneça uma análise detalhada sobre:
1. Posicionamento histórico do político
2. Relação com a lei/projeto específico
3. Análise de coerência
4. Conclusão"""
        
        config = get_flowwise_config(organization_id=analise.organization_id, db=db)
        
        url_parts = config["url"].rsplit("/", 1)
        if len(url_parts) == 2:
            base_url = url_parts[0].replace("/api/v1/prediction", "")
            flow_id = url_parts[1]
        else:
            base_url = config["url"]
            flow_id = ""
        
        flowwise_service = FlowiseService(
            base_url=base_url,
            api_key=config["key"] if config["key"] else None
        )
        
        async def run_flow():
            return await flowwise_service.execute_flow(
                flow_id=flow_id,
                question=question,
                streaming=True
            )
        
        result = asyncio.run(run_flow())
        
        if not result.get("success", False):
            error_msg = result.get("error", "Erro desconhecido")
            logger.error(f"❌ Erro ao executar flow: {error_msg}")
            
            analise.status = "erro"
            analise.error_message = error_msg
            analise.completed_at = datetime.utcnow()
            db.commit()
            
            return {"success": False, "error": error_msg}
        
        output = result.get("output", "") or result.get("text", "")
        session_id = result.get("sessionId")
        execution_time = result.get("execution_time", 0)
        estimated_tokens = result.get("estimated_tokens", 0)
        
        if not output or len(output.strip()) == 0:
            error_msg = "Flowwise retornou resposta vazia. Verifique se o flow está configurado corretamente."
            logger.warning(f"⚠️ Análise {analise_id} concluiu mas sem resultado")
            
            analise.status = "erro"
            analise.error_message = error_msg
            analise.completed_at = datetime.utcnow()
            analise.execution_time = execution_time
            analise.flowwise_session_id = session_id
            db.commit()
            
            return {
                "success": False,
                "error": error_msg,
                "analise_id": str(analise_id)
            }
        
        analise.resultado = output
        analise.status = "concluido"
        analise.completed_at = datetime.utcnow()
        analise.execution_time = execution_time
        analise.tokens_used = estimated_tokens
        analise.flowwise_session_id = session_id
        db.commit()
        
        logger.info(f"✅ Análise {analise_id} concluída")
        logger.info(f"   Tempo: {execution_time:.2f}s")
        logger.info(f"   Tokens: {estimated_tokens}")
        logger.info(f"   Output: {len(output)} chars")
        
        return {
            "success": True,
            "analise_id": str(analise_id),
            "resultado": output,
            "execution_time": execution_time,
            "tokens_used": estimated_tokens
        }
    
    except Exception as e:
        logger.error(f"❌ Erro inesperado ao processar análise {analise_id}: {str(e)}")
        
        try:
            analise = db.query(Analise).filter(Analise.id == analise_id).first()
            if analise:
                analise.status = "erro"
                analise.error_message = str(e)
                analise.completed_at = datetime.utcnow()
                db.commit()
        except:
            pass
        
        return {"success": False, "error": str(e)}
    
    finally:
        if close_db:
            db.close()


def execute_analise_sync(analise_id: str):
    """
    Executa análise de forma síncrona (modo fallback quando Celery não está disponível).
    """
    logger.info(f"📋 Executando análise {analise_id} em modo SÍNCRONO")
    return _execute_analise_logic(analise_id)


try:
    from celery import Task
    from app.core.celery_app import celery_app
    
    if celery_app is not None:
        class DatabaseTask(Task):
            """Tarefa base que fornece sessão de banco de dados"""
            _db = None
            
            @property
            def db(self):
                if self._db is None:
                    self._db = SessionLocal()
                return self._db
            
            def after_return(self, *args, **kwargs):
                if self._db is not None:
                    self._db.close()
                    self._db = None

        @celery_app.task(base=DatabaseTask, bind=True)
        def execute_analise_politica(self, analise_id: str):
            """
            Executa uma análise política usando Flowwise de forma assíncrona.
            """
            logger.info(f"📋 Executando análise {analise_id} em modo ASSÍNCRONO (Celery)")
            return _execute_analise_logic(analise_id, db=self.db)
        
        CELERY_AVAILABLE = True
        logger.info("✅ Tarefas Celery registradas com sucesso")
    else:
        CELERY_AVAILABLE = False
        execute_analise_politica = None
        logger.info("⚠️ Celery não disponível - usando modo síncrono")

except ImportError as e:
    CELERY_AVAILABLE = False
    execute_analise_politica = None
    logger.warning(f"⚠️ Celery não pode ser importado: {e} - usando modo síncrono")
except Exception as e:
    CELERY_AVAILABLE = False
    execute_analise_politica = None
    logger.warning(f"⚠️ Erro ao configurar tarefas Celery: {e} - usando modo síncrono")


def dispatch_analise(analise_id: str, async_mode: bool = True):
    """
    Despacha uma análise para execução.
    
    Args:
        analise_id: ID da análise
        async_mode: Se True, tenta usar Celery (assíncrono). Se False, executa síncrono.
    
    Returns:
        Dict com informação sobre como a tarefa foi despachada
    """
    if async_mode and CELERY_AVAILABLE and execute_analise_politica is not None:
        try:
            task = execute_analise_politica.delay(analise_id)
            logger.info(f"📤 Análise {analise_id} despachada para Celery (task_id: {task.id})")
            return {
                "mode": "async",
                "task_id": task.id,
                "message": "Análise enviada para processamento assíncrono"
            }
        except Exception as e:
            logger.warning(f"⚠️ Falha ao despachar para Celery: {e}. Executando síncrono.")
    
    result = execute_analise_sync(analise_id)
    return {
        "mode": "sync",
        "task_id": None,
        "message": "Análise executada de forma síncrona",
        "result": result
    }
