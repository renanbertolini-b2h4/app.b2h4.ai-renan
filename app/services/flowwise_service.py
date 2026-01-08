import httpx
import time
import json
import uuid
from typing import Dict, Any, Optional, Callable
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


def mask_api_key(api_key: Optional[str]) -> str:
    """Mascara API key para logs seguros"""
    if not api_key:
        return "None"
    if len(api_key) <= 8:
        return "***"
    return f"{api_key[:4]}...{api_key[-4:]}"


class FlowiseService:
    """
    Serviço para interagir com a API do Flowwise.
    Suporta execução de flows, streaming SSE e rastreamento de tokens.
    """
    
    def __init__(self, base_url: str, api_key: Optional[str] = None):
        self.base_url = base_url.rstrip('/')
        self.api_key = api_key
        self.headers = {"Content-Type": "application/json"}
        if api_key:
            self.headers["Authorization"] = f"Bearer {api_key}"
    
    async def execute_flow(
        self,
        flow_id: str,
        question: str,
        override_config: Optional[Dict[str, Any]] = None,
        streaming: bool = True,
        session_id_callback: Optional[Callable] = None,
        custom_session_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Executa um flow do Flowwise e retorna o resultado.
        
        Args:
            flow_id: ID do flow a executar
            question: Pergunta/prompt de entrada
            override_config: Configurações opcionais
            streaming: Se deve usar streaming SSE
            session_id_callback: Callback para salvar sessionId
            custom_session_id: SessionId customizado (gera UUID se não fornecido)
        
        Returns:
            Dict com resultados incluindo tokens e output
        """
        url = f"{self.base_url}/api/v1/prediction/{flow_id}"
        
        # Gerar ou usar sessionId customizado
        if not custom_session_id:
            custom_session_id = str(uuid.uuid4())
        
        logger.info(f"🆔 SessionId gerado: {custom_session_id}")
        
        payload = {
            "question": question,
            "streaming": streaming,
            "sessionId": custom_session_id
        }
        
        if override_config:
            payload["overrideConfig"] = override_config
        
        start_time = time.time()
        
        try:
            async with httpx.AsyncClient(timeout=900.0) as client:
                logger.info(f"🔄 Executando Flowwise flow {flow_id}")
                logger.info(f"   URL: {url}")
                logger.info(f"   Question: {question[:100]}...")
                logger.info(f"   API Key: {mask_api_key(self.api_key)}")
                
                response = await client.post(url, json=payload, headers=self.headers)
                
                logger.info(f"✅ Stream iniciado - Status: {response.status_code}")
                response.raise_for_status()
                
                # Processar SSE (Server-Sent Events) stream
                full_text = ""
                session_id = custom_session_id
                flowise_returned_session_id = None
                chat_id = None
                session_id_captured = False
                current_event = None
                line_count = 0
                error_message = None
                all_sse_events = []
                
                logger.info(f"🔄 Processando stream SSE...")
                logger.info(f"🆔 Usando sessionId: {custom_session_id}")
                
                async for line in response.aiter_lines():
                    line_count += 1
                    line = line.strip()
                    all_sse_events.append(line)
                    
                    if not line:
                        continue
                    
                    # DEBUG: Log primeiras linhas
                    if line_count <= 20:
                        logger.info(f"📥 SSE Line {line_count}: {line[:200]}")
                    
                    # Detectar tipo de evento SSE
                    if line.startswith("event:"):
                        current_event = line.split(":", 1)[1].strip()
                        if line_count <= 20:
                            logger.info(f"🏷️  Event type: {current_event}")
                        continue
                    
                    # Processar dados SSE
                    if line.startswith("data:"):
                        data_str = line.split(":", 1)[1].strip()
                        
                        if data_str == "[DONE]":
                            logger.info(f"🏁 Stream finalizado com [DONE]")
                            break
                        
                        try:
                            data = json.loads(data_str)
                            
                            # FIX: Flowwise envia event type DENTRO do JSON
                            # Formato: {"event":"metadata","data":{"sessionId":"...","chatId":"..."}}
                            event_type = data.get("event", current_event)
                            
                            if line_count <= 20:
                                logger.info(f"📦 Parsed JSON - Event: {event_type}, Keys: {list(data.keys())}")
                            
                            # Capturar ERRO do Flowwise
                            if event_type == "error":
                                error_message = data.get("data", str(data))
                                logger.error(f"❌ ERRO DO FLOWWISE: {error_message}")
                            
                            # Capturar metadata (sessionId, chatId) 
                            elif event_type == "metadata":
                                # Flowwise envia nested structure
                                metadata_data = data.get("data", data)
                                
                                if "sessionId" in metadata_data:
                                    flowise_returned_session_id = metadata_data["sessionId"]
                                    logger.info(f"🎯 Flowwise retornou SessionID: {flowise_returned_session_id}")
                                    logger.info(f"🆔 Nosso custom SessionID: {custom_session_id}")
                                    
                                    # IMPORTANTE: Usar o sessionId RETORNADO pelo Flowwise
                                    session_id = flowise_returned_session_id
                                    session_id_captured = True
                                    
                                    # Validar se Flowwise usou nosso custom sessionId
                                    if flowise_returned_session_id == custom_session_id:
                                        logger.info(f"✅ SUCESSO! Flowwise usou nosso custom sessionId!")
                                    else:
                                        logger.warning(f"⚠️ Flowwise retornou sessionId diferente!")
                                        logger.warning(f"   Esperado: {custom_session_id}")
                                        logger.warning(f"   Recebido: {flowise_returned_session_id}")
                                
                                if "chatId" in metadata_data or "chatMessageId" in metadata_data:
                                    chat_id = metadata_data.get("chatId") or metadata_data.get("chatMessageId")
                                    logger.info(f"✅ ChatId capturado: {chat_id}")
                            
                            # Capturar tokens do stream
                            elif event_type == "token":
                                token = data.get("data", "") if isinstance(data.get("data"), str) else data.get("token", "")
                                if token and line_count <= 20:
                                    logger.info(f"🔤 Token recebido: {token[:50]}")
                                full_text += token
                            
                            # Capturar resposta final (fallback)
                            elif "text" in data:
                                logger.info(f"📝 Text field encontrado: {data['text'][:100]}")
                                full_text = data["text"]
                            
                            # Detectar fim do stream
                            elif event_type == "end":
                                logger.info(f"🏁 Stream finalizado via evento 'end'")
                                break
                            
                        except json.JSONDecodeError:
                            # Dados não-JSON (texto puro)
                            if line_count <= 20:
                                logger.info(f"📄 Non-JSON data: {data_str[:100]}")
                            full_text += data_str
                
                end_time = time.time()
                execution_time = end_time - start_time
                
                # Calcular tokens aproximados (1 token ≈ 4 caracteres)
                estimated_tokens = len(full_text) // 4
                
                # SALVAR DEBUG LOG (como no código original)
                try:
                    import os
                    os.makedirs("/tmp/logs", exist_ok=True)
                    sse_debug_path = f"/tmp/logs/sse_debug_{custom_session_id[:8]}.txt"
                    with open(sse_debug_path, "w") as f:
                        f.write(f"=== FLOWWISE SSE DEBUG LOG ===\n")
                        f.write(f"Custom SessionID: {custom_session_id}\n")
                        f.write(f"Flowise returned SessionID: {flowise_returned_session_id}\n")
                        f.write(f"ChatID: {chat_id}\n")
                        f.write(f"Execution Time: {execution_time:.2f}s\n")
                        f.write(f"Output Length: {len(full_text)} chars\n")
                        f.write(f"Error: {error_message}\n")
                        f.write(f"\n=== SSE EVENTS ({len(all_sse_events)} events) ===\n")
                        f.write("\n".join(all_sse_events))
                    logger.info(f"💾 SSE debug log saved: {sse_debug_path}")
                except Exception as debug_error:
                    logger.warning(f"⚠️ Failed to save SSE debug log: {debug_error}")
                
                logger.info(f"✅ Flow concluído em {execution_time:.2f}s")
                logger.info(f"   Custom Session ID: {custom_session_id}")
                logger.info(f"   Flowise returned Session ID: {flowise_returned_session_id}")
                logger.info(f"   Chat ID: {chat_id}")
                logger.info(f"   Tokens estimados: {estimated_tokens}")
                logger.info(f"   Output length: {len(full_text)} chars")
                
                # Se houve erro do Flowwise, retornar com erro
                if error_message:
                    # FIX: Sempre retornar um sessionId (Flowwise ou nosso custom)
                    final_session_id = flowise_returned_session_id or custom_session_id
                    logger.info(f"❌ Retornando erro com sessionId: {final_session_id}")
                    
                    return {
                        "output": "",
                        "text": "",
                        "error": error_message,
                        "sessionId": final_session_id,
                        "chatId": chat_id,
                        "execution_time": execution_time,
                        "estimated_tokens": 0,
                        "success": False
                    }
                
                # FIX: Se stream não retornou texto, buscar via API GET
                if not full_text and flowise_returned_session_id:
                    logger.info(f"⚠️ Stream não retornou texto, buscando via API GET...")
                    logger.info(f"   SessionID: {flowise_returned_session_id}")
                    
                    # Buscar mensagens via GET API
                    messages_result = await self.get_chat_messages(
                        flow_id=flow_id,
                        session_id=flowise_returned_session_id,
                        limit=10  # Pegar mais mensagens para filtrar
                    )
                    
                    if messages_result.get("success") and messages_result.get("messages"):
                        messages = messages_result["messages"]
                        logger.info(f"📨 Total de mensagens: {len(messages)}")
                        
                        # FIX: Buscar mensagem do ASSISTANT (resposta), não do USER (pergunta)
                        for msg in messages:
                            role = msg.get("role", "").lower()
                            logger.info(f"   - Role: {role}, Content: {str(msg.get('content', ''))[:100]}")
                            
                            if role == "assistant" or role == "apiMessage":
                                full_text = msg.get("content") or msg.get("text") or ""
                                logger.info(f"✅ Resultado recuperado via API (role={role}): {len(full_text)} chars")
                                break
                        
                        if not full_text:
                            logger.warning(f"⚠️ Nenhuma mensagem do assistant encontrada, usando primeira mensagem")
                            full_text = messages[0].get("content") or messages[0].get("text") or ""
                    else:
                        logger.warning(f"❌ Não foi possível recuperar resultado via API")
                
                # Recalcular tokens se conseguiu texto via API
                estimated_tokens = len(full_text) // 4
                
                result = {
                    "output": full_text,
                    "text": full_text,
                    "sessionId": flowise_returned_session_id or session_id,
                    "chatId": chat_id,
                    "execution_time": execution_time,
                    "estimated_tokens": estimated_tokens,
                    "success": True
                }
                
                return result
        
        except httpx.TimeoutException:
            logger.error("❌ Timeout ao executar flow")
            return {
                "output": "",
                "text": "",
                "error": "Timeout ao executar flow (15 minutos)",
                "success": False
            }
        
        except httpx.HTTPStatusError as e:
            logger.error(f"❌ Erro HTTP: {e.response.status_code}")
            logger.error(f"   Response: {e.response.text}")
            return {
                "output": "",
                "text": "",
                "error": f"Erro HTTP {e.response.status_code}: {e.response.text}",
                "success": False
            }
        
        except Exception as e:
            logger.error(f"❌ Erro inesperado: {str(e)}")
            return {
                "output": "",
                "text": "",
                "error": f"Erro inesperado: {str(e)}",
                "success": False
            }
    
    async def get_chat_messages(
        self,
        flow_id: str,
        session_id: Optional[str] = None,
        limit: int = 10
    ) -> Dict[str, Any]:
        """
        Retrieve chat messages from Flowwise for a specific flow.
        
        Args:
            flow_id: The ID of the flow
            session_id: Optional session ID to filter messages
            limit: Maximum number of messages to retrieve
            
        Returns:
            Dict with success status and messages
        """
        url = f"{self.base_url}/api/v1/chatmessage/{flow_id}"
        params = {}
        
        if session_id:
            params["sessionId"] = session_id
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                logger.info(f"🔍 Buscando mensagens do flow {flow_id}")
                if session_id:
                    logger.info(f"   Session ID: {session_id}")
                
                response = await client.get(url, params=params, headers=self.headers)
                response.raise_for_status()
                
                messages = response.json()
                logger.info(f"✅ Encontradas {len(messages)} mensagens")
                
                # Limit results
                if len(messages) > limit:
                    messages = messages[:limit]
                
                return {
                    "success": True,
                    "messages": messages,
                    "count": len(messages)
                }
                
        except httpx.HTTPStatusError as e:
            logger.error(f"❌ HTTP error {e.response.status_code}")
            return {
                "success": False,
                "error": f"HTTP {e.response.status_code}",
                "messages": []
            }
        except Exception as e:
            logger.error(f"❌ Error retrieving messages: {e}")
            return {
                "success": False,
                "error": str(e),
                "messages": []
            }
