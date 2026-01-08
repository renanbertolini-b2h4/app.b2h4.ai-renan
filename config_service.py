"""
Serviço para gerenciar configurações usando PostgreSQL.
"""
import logging
from typing import Dict, Optional
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models.app_config import AppConfig
from app.core.crypto import EncryptionService

logger = logging.getLogger(__name__)


class ConfigService:
    """Gerencia configurações de forma persistente usando PostgreSQL."""
    
    @staticmethod
    def _get_db() -> Session:
        """Retorna uma sessão do banco de dados."""
        return SessionLocal()
    
    @staticmethod
    def get_flowwise_config() -> Dict[str, str]:
        """Obtém configuração do Flowwise do banco de dados."""
        db = ConfigService._get_db()
        try:
            url_config = db.query(AppConfig).filter(
                AppConfig.key == "flowwise_url"
            ).first()
            key_config = db.query(AppConfig).filter(
                AppConfig.key == "flowwise_key"
            ).first()
            
            encrypted_key = key_config.value if key_config else ""
            decrypted_key = EncryptionService.decrypt_value(encrypted_key) if encrypted_key else ""
            
            return {
                "flowise_url": url_config.value if url_config else "",
                "flowise_key": decrypted_key
            }
        except Exception as e:
            logger.error(f"Erro ao ler configuração do Flowwise: {e}")
            db.rollback()
            return {"flowise_url": "", "flowise_key": ""}
        finally:
            db.close()
    
    @staticmethod
    def save_flowwise_config(flowise_url: str, flowise_key: str = "") -> bool:
        """Salva configuração do Flowwise no banco de dados."""
        if not flowise_url:
            raise ValueError("URL do Flowwise é obrigatória")
        
        db = ConfigService._get_db()
        try:
            # Salvar URL
            url_config = db.query(AppConfig).filter(
                AppConfig.key == "flowwise_url"
            ).first()
            
            if url_config:
                url_config.value = flowise_url
            else:
                url_config = AppConfig(
                    key="flowwise_url",
                    value=flowise_url,
                    description="URL da API Flowwise para análises políticas"
                )
                db.add(url_config)
            
            # Salvar ou limpar Key
            key_config = db.query(AppConfig).filter(
                AppConfig.key == "flowwise_key"
            ).first()
            
            if flowise_key:
                encrypted_key = EncryptionService.encrypt_value(flowise_key)
                
                # Atualizar ou criar
                if key_config:
                    key_config.value = encrypted_key
                else:
                    key_config = AppConfig(
                        key="flowwise_key",
                        value=encrypted_key,
                        description="Chave de API do Flowwise (opcional, criptografada)"
                    )
                    db.add(key_config)
            else:
                # Limpar se vazio
                if key_config:
                    db.delete(key_config)
            
            db.commit()
            logger.info("✅ Configuração do Flowwise salva com sucesso")
            return True
        except Exception as e:
            logger.error(f"❌ Erro ao salvar configuração: {e}")
            db.rollback()
            raise
        finally:
            db.close()
    
    @staticmethod
    def get_masked_flowwise_config() -> Dict[str, str]:
        """Obtém configuração do Flowwise com chave mascarada (para exposição)."""
        config = ConfigService.get_flowwise_config()
        return {
            "flowise_url": config.get("flowise_url", ""),
            "flowise_key": "***" if config.get("flowise_key") else ""
        }
