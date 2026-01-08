"""
Script de migração para criptografar dados existentes em texto plano.
Este script é idempotente - pode ser executado múltiplas vezes com segurança.
"""
import sys
sys.path.insert(0, '.')

import logging
from app.core.database import SessionLocal
from app.models.app_config import AppConfig
from app.core.crypto import EncryptionService

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def migrate_flowwise_keys():
    """Migra chaves do Flowwise de texto plano para criptografado."""
    EncryptionService.initialize()
    
    db = SessionLocal()
    try:
        key_config = db.query(AppConfig).filter(
            AppConfig.key == "flowwise_key"
        ).first()
        
        if not key_config:
            logger.info("ℹ️  Nenhuma chave do Flowwise encontrada no banco")
            return
        
        current_value = key_config.value
        
        if EncryptionService.is_encrypted(current_value):
            logger.info("✅ Chave do Flowwise já está criptografada")
            return
        
        logger.info("🔄 Migrando chave do Flowwise para formato criptografado...")
        
        encrypted_value = EncryptionService.encrypt_value(current_value)
        key_config.value = encrypted_value
        
        db.commit()
        logger.info("✅ Migração concluída com sucesso!")
        logger.info(f"   Valor original: {current_value[:10]}... ({len(current_value)} chars)")
        logger.info(f"   Valor criptografado: {encrypted_value[:20]}... ({len(encrypted_value)} chars)")
        
    except Exception as e:
        logger.error(f"❌ Erro durante migração: {e}")
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    print("=" * 60)
    print("  Migração de Criptografia - Flowwise Configuration")
    print("=" * 60)
    print()
    
    migrate_flowwise_keys()
    
    print()
    print("=" * 60)
