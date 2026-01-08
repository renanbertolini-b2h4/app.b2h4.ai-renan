"""
Serviço de Integração com LLMs
Arquivo: app/services/llm_service.py
"""

import os
import logging
from typing import Optional
from enum import Enum
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.models.api_credential import ApiCredential

logger = logging.getLogger(__name__)


def get_api_key_from_db(key_name: str) -> Optional[str]:
    """Busca uma API Key do banco de credenciais."""
    try:
        db = SessionLocal()
        credential = db.query(ApiCredential).filter(
            ApiCredential.key == key_name,
            ApiCredential.is_active == True
        ).first()
        
        if credential and credential.is_configured:
            value = credential.value
            db.close()
            return value
        db.close()
        return None
    except Exception as e:
        logger.error(f"Erro ao buscar API key {key_name}: {e}")
        return None


class LLMProvider(str, Enum):
    OPENAI = "openai"
    CLAUDE = "claude"
    LOCAL = "local"


class LLMService:
    """Serviço unificado para integração com LLMs"""

    OPENAI_MODELS = [
        "gpt-4-turbo",
        "gpt-4",
        "gpt-3.5-turbo",
    ]

    CLAUDE_MODELS = [
        "claude-3-opus-20240229",
        "claude-3-sonnet-20240229",
        "claude-3-haiku-20240307",
    ]

    def __init__(self):
        self._openai_key = None
        self._claude_key = None

    @property
    def openai_key(self) -> Optional[str]:
        """Busca a chave OpenAI dinamicamente do banco ou env."""
        return get_api_key_from_db("OPENAI_API_KEY") or os.getenv("OPENAI_API_KEY")
    
    @property
    def claude_key(self) -> Optional[str]:
        """Busca a chave Claude dinamicamente do banco ou env."""
        return get_api_key_from_db("ANTHROPIC_API_KEY") or os.getenv("ANTHROPIC_API_KEY")

    async def analyze(
        self,
        prompt: str,
        model: str = "gpt-4-turbo",
        temperature: float = 0.7,
        max_tokens: int = 2000
    ) -> str:
        if any(m in model for m in self.CLAUDE_MODELS) or "claude" in model.lower():
            return await self._analyze_claude(prompt, model, temperature, max_tokens)
        else:
            return await self._analyze_openai(prompt, model, temperature, max_tokens)

    async def _analyze_openai(
        self,
        prompt: str,
        model: str = "gpt-4-turbo",
        temperature: float = 0.7,
        max_tokens: int = 2000
    ) -> str:
        if not self.openai_key:
            raise ValueError("OPENAI_API_KEY não configurada")

        try:
            from openai import AsyncOpenAI
            
            client = AsyncOpenAI(api_key=self.openai_key)
            
            response = await client.chat.completions.create(
                model=model,
                messages=[
                    {
                        "role": "system",
                        "content": "Você é um assistente especializado em análise de conversas. Forneça análises precisas e úteis."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                temperature=temperature,
                max_tokens=max_tokens
            )
            
            return response.choices[0].message.content
            
        except Exception as e:
            logger.error(f"Erro ao chamar OpenAI: {str(e)}")
            raise Exception(f"Erro ao chamar OpenAI: {str(e)}")

    async def _analyze_claude(
        self,
        prompt: str,
        model: str = "claude-3-opus-20240229",
        temperature: float = 0.7,
        max_tokens: int = 2000
    ) -> str:
        if not self.claude_key:
            raise ValueError("ANTHROPIC_API_KEY não configurada")

        try:
            from anthropic import AsyncAnthropic
            
            client = AsyncAnthropic(api_key=self.claude_key)
            
            response = await client.messages.create(
                model=model,
                max_tokens=max_tokens,
                system="Você é um assistente especializado em análise de conversas. Forneça análises precisas e úteis.",
                messages=[
                    {
                        "role": "user",
                        "content": prompt
                    }
                ]
            )
            
            return response.content[0].text
            
        except Exception as e:
            logger.error(f"Erro ao chamar Claude: {str(e)}")
            raise Exception(f"Erro ao chamar Claude: {str(e)}")

    def get_available_models(self) -> dict:
        models = {}
        
        if self.openai_key:
            models["openai"] = self.OPENAI_MODELS
        
        if self.claude_key:
            models["claude"] = self.CLAUDE_MODELS
        
        return models

    def validate_model(self, model: str) -> bool:
        available = self.get_available_models()
        
        for provider_models in available.values():
            if model in provider_models:
                return True
        
        return False


_llm_service_instance: Optional[LLMService] = None


def get_llm_service() -> LLMService:
    global _llm_service_instance
    
    if _llm_service_instance is None:
        _llm_service_instance = LLMService()
    
    return _llm_service_instance
