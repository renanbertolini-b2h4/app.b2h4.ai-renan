"""
Módulo de criptografia para proteger dados sensíveis.
Usa Fernet (AES-128 CBC + HMAC) para criptografia simétrica.
"""
import os
import logging
from typing import Optional
from cryptography.fernet import Fernet, InvalidToken
import base64

logger = logging.getLogger(__name__)


class EncryptionService:
    """Serviço de criptografia para dados sensíveis."""
    
    _fernet: Optional[Fernet] = None
    _initialized = False
    
    @classmethod
    def initialize(cls) -> None:
        """
        Inicializa o serviço de criptografia com a chave do ambiente.
        
        Raises:
            RuntimeError: Se ENCRYPTION_KEY não estiver configurada ou for inválida
        """
        if cls._initialized:
            return
            
        encryption_key = os.getenv("ENCRYPTION_KEY")
        
        if not encryption_key:
            error_msg = (
                "❌ ENCRYPTION_KEY não configurada! "
                "Sistema requer criptografia para proteger dados sensíveis. "
                "Execute 'python app/core/crypto.py' para gerar uma chave e configure como secret."
            )
            logger.error(error_msg)
            raise RuntimeError(error_msg)
        
        try:
            key_bytes = encryption_key.encode('utf-8')
            if len(key_bytes) != 44:
                error_msg = (
                    f"❌ ENCRYPTION_KEY inválida! "
                    f"Tamanho atual: {len(key_bytes)} bytes, esperado: 44 bytes. "
                    f"Execute 'python app/core/crypto.py' para gerar uma chave válida."
                )
                logger.error(error_msg)
                raise ValueError(error_msg)
            
            cls._fernet = Fernet(key_bytes)
            cls._initialized = True
            logger.info("✅ Serviço de criptografia inicializado com sucesso")
            
        except Exception as e:
            if isinstance(e, (RuntimeError, ValueError)):
                raise
            error_msg = f"❌ Erro ao inicializar criptografia: {e}"
            logger.error(error_msg)
            raise RuntimeError(error_msg) from e
    
    @classmethod
    def encrypt_value(cls, plaintext: str) -> str:
        """
        Criptografa um valor de texto.
        
        Args:
            plaintext: Texto em claro para criptografar
            
        Returns:
            Texto criptografado (base64)
            
        Raises:
            RuntimeError: Se a criptografia não estiver disponível
        """
        if not cls._initialized:
            cls.initialize()
        
        if not plaintext:
            return plaintext
        
        if cls._fernet is None:
            raise RuntimeError(
                "❌ Criptografia não disponível! "
                "Configure ENCRYPTION_KEY antes de usar o sistema."
            )
        
        try:
            encrypted_bytes = cls._fernet.encrypt(plaintext.encode('utf-8'))
            return encrypted_bytes.decode('utf-8')
        except Exception as e:
            error_msg = f"❌ Erro ao criptografar valor: {e}"
            logger.error(error_msg)
            raise RuntimeError(error_msg) from e
    
    @classmethod
    def decrypt_value(cls, ciphertext: str) -> str:
        """
        Descriptografa um valor criptografado.
        Suporta migração automática: se o valor não estiver criptografado, retorna como está.
        
        Args:
            ciphertext: Texto criptografado (base64)
            
        Returns:
            Texto em claro
            
        Raises:
            RuntimeError: Se a criptografia não estiver disponível
        """
        if not cls._initialized:
            cls.initialize()
        
        if not ciphertext:
            return ciphertext
        
        if cls._fernet is None:
            raise RuntimeError(
                "❌ Criptografia não disponível! "
                "Configure ENCRYPTION_KEY antes de usar o sistema."
            )
        
        try:
            decrypted_bytes = cls._fernet.decrypt(ciphertext.encode('utf-8'))
            return decrypted_bytes.decode('utf-8')
        except InvalidToken:
            logger.debug("Valor não criptografado detectado - retornando como texto plano (migração automática)")
            return ciphertext
        except Exception as e:
            logger.warning(f"⚠️  Erro ao descriptografar (retornando original): {e}")
            return ciphertext
    
    @classmethod
    def is_encrypted(cls, value: str) -> bool:
        """
        Verifica se um valor está criptografado.
        
        Args:
            value: Valor para verificar
            
        Returns:
            True se o valor está criptografado, False caso contrário
        """
        if not value or cls._fernet is None:
            return False
        
        try:
            cls._fernet.decrypt(value.encode('utf-8'))
            return True
        except:
            return False
    
    @classmethod
    def generate_key(cls) -> str:
        """
        Gera uma nova chave de criptografia Fernet (para uso em setup).
        
        Returns:
            Chave de criptografia em formato base64 (44 caracteres)
        """
        key = Fernet.generate_key()
        return key.decode('utf-8')


def generate_encryption_key() -> str:
    """Helper function para gerar chave de criptografia."""
    return EncryptionService.generate_key()


if __name__ == "__main__":
    print("🔑 Gerando nova ENCRYPTION_KEY...")
    print()
    key = generate_encryption_key()
    print(f"ENCRYPTION_KEY={key}")
    print()
    print("💡 Adicione esta chave como secret no Replit ou no arquivo .env")
