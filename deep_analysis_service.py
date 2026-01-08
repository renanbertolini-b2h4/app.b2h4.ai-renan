"""
Serviço de Análise Profunda usando Refine Chain
Cada chunk é processado considerando o contexto acumulado dos anteriores
"""
import time
import json
import logging
from typing import Dict, List, Optional, Any, AsyncGenerator
from datetime import datetime
from sqlalchemy.orm import Session
from uuid import UUID

from app.models.deep_analysis import (
    DeepAnalysisJob, 
    DeepAnalysisChunkResult,
    ANALYSIS_TYPE_INFO
)
from app.models.pii import PIIProcessingJob, PIIVault
from app.services.llm_service import get_llm_service

logger = logging.getLogger(__name__)

CHUNK_SIZE_CHARS = 25000

EXTRACTION_PROMPTS = {
    "topic_map": """Analise este trecho de conversa pseudonimizada e extraia de forma estruturada:

## Instruções:
1. **Tópicos discutidos**: Liste cada tópico com título curto
2. **Participantes ativos**: Quem falou neste trecho
3. **Pontos-chave**: Argumentos e ideias principais
4. **Citações relevantes**: Trechos importantes entre aspas
5. **Status**: Para cada tópico marque (resolvido/pendente/em_debate)
6. **Pistas de continuidade**: Identifique tópicos que parecem continuar de antes ou para depois

## Formato de saída (JSON):
```json
{
  "topics": [{"title": "", "description": "", "status": "", "participants": []}],
  "key_points": [""],
  "quotes": [""],
  "continuity_hints": [""]
}
```

## Trecho da conversa:
{chunk_text}""",

    "executive": """Analise este trecho de conversa para um relatório executivo C-level:

## Extraia:
1. **Decisões tomadas**: O que foi decidido?
2. **Ações acordadas**: Quem vai fazer o quê?
3. **Riscos identificados**: Problemas ou preocupações levantadas
4. **Oportunidades**: Ideias positivas ou possibilidades
5. **Métricas mencionadas**: Números, prazos, valores
6. **Próximos passos**: O que precisa acontecer?

## Formato JSON:
```json
{
  "decisions": [""],
  "actions": [{"action": "", "responsible": "", "deadline": ""}],
  "risks": [""],
  "opportunities": [""],
  "metrics": [""],
  "next_steps": [""]
}
```

## Trecho:
{chunk_text}""",

    "stakeholder": """Analise os participantes desta conversa:

## Extraia para cada participante:
1. **Identificador**: O pseudônimo usado
2. **Papel aparente**: Líder, técnico, decisor, observador, etc.
3. **Posição**: O que defende ou argumenta
4. **Nível de engajamento**: Alto, médio, baixo
5. **Relações**: Com quem concorda/discorda
6. **Citações características**: Frases que mostram seu estilo

## Formato JSON:
```json
{
  "stakeholders": [
    {
      "id": "",
      "role": "",
      "position": "",
      "engagement": "",
      "relations": {"agrees_with": [], "disagrees_with": []},
      "quotes": []
    }
  ]
}
```

## Trecho:
{chunk_text}""",

    "timeline": """Extraia a cronologia de decisões e eventos desta conversa:

## Identifique:
1. **Eventos/decisões**: O que aconteceu ou foi decidido
2. **Momento relativo**: Início, meio ou fim do trecho
3. **Participantes envolvidos**: Quem participou
4. **Impacto**: Alto, médio ou baixo
5. **Dependências**: Decisões que dependem de outras
6. **Status**: Concluído, em andamento, pendente

## Formato JSON:
```json
{
  "events": [
    {
      "description": "",
      "position": "",
      "participants": [],
      "impact": "",
      "dependencies": [],
      "status": ""
    }
  ]
}
```

## Trecho:
{chunk_text}"""
}

REFINE_PROMPT = """Você recebeu uma extração do chunk atual e o contexto acumulado dos chunks anteriores.

## Contexto Acumulado (chunks anteriores):
{accumulated_context}

## Extração do Chunk Atual:
{current_extraction}

## Sua tarefa:
1. **Identifique CONTINUIDADES**: Tópicos/eventos que já apareceram antes e continuam
2. **Identifique NOVIDADES**: Elementos que aparecem pela primeira vez
3. **UNIFIQUE** participantes que aparecem em múltiplos chunks
4. **MARQUE CONEXÕES** entre chunks (ex: "decisão X do chunk 1 é referenciada aqui")
5. **ATUALIZE status** de itens anteriores se houver mudança

## Retorne JSON refinado que integra o contexto anterior com as novas informações:
"""

CONSOLIDATION_PROMPTS = {
    "topic_map": """Consolide todas as extrações em um MAPA DE TÓPICOS DETALHADO.

## Extrações de todos os chunks:
{all_extractions}

## Gere um relatório em Markdown com:

# 🗺️ Mapa de Tópicos Detalhado

## 📋 Sumário Executivo
(Parágrafo resumindo os principais temas da conversa)

## 📊 Estatísticas
- Total de tópicos identificados: X
- Tópicos principais: X
- Threads identificadas: X

## 🎯 Tópicos Principais (ordenados por relevância)

### 1. [Nome do Tópico]
**Relevância**: 🔴 Alta / 🟡 Média / 🟢 Baixa
**Status**: Resolvido / Pendente / Em Debate

(Descrição detalhada do tópico)

**Participantes envolvidos**:
- PARTICIPANTE_X: (papel/posição)

**Pontos-chave**:
- Ponto 1
- Ponto 2

**Citações relevantes**:
> "citação importante"

**Conexões**: Liga-se aos tópicos X, Y, Z

---

(Repita para cada tópico principal)

## 🔗 Mapa de Conexões
(Descreva como os tópicos se relacionam)

## 💡 Insights e Recomendações
(O que essa análise revela? Sugestões de ação)
""",

    "executive": """Consolide todas as extrações em um RELATÓRIO EXECUTIVO para C-level.

## Extrações:
{all_extractions}

## Gere um relatório em Markdown:

# 📊 Relatório Executivo

## 🎯 Resumo Executivo
(2-3 parágrafos com os pontos mais importantes para um executivo)

## ✅ Decisões Tomadas
| # | Decisão | Responsável | Impacto |
|---|---------|-------------|---------|
| 1 | ... | ... | Alto/Médio/Baixo |

## 📋 Plano de Ação
| Ação | Responsável | Prazo | Status |
|------|-------------|-------|--------|
| ... | ... | ... | ... |

## ⚠️ Riscos Identificados
1. **Risco**: (descrição)
   - **Probabilidade**: Alta/Média/Baixa
   - **Impacto**: Alto/Médio/Baixo
   - **Mitigação sugerida**: ...

## 💡 Oportunidades
1. **Oportunidade**: (descrição)
   - **Potencial**: Alto/Médio/Baixo

## 📈 Métricas Mencionadas
- Métrica 1: valor
- Métrica 2: valor

## ➡️ Próximos Passos Recomendados
1. Passo 1
2. Passo 2

## 🔍 Conclusão
(Parágrafo final com visão geral)
""",

    "stakeholder": """Consolide todas as extrações em uma ANÁLISE DE STAKEHOLDERS.

## Extrações:
{all_extractions}

## Gere um relatório em Markdown:

# 👥 Análise de Stakeholders

## 📋 Visão Geral
(Parágrafo sobre a dinâmica geral do grupo)

## 📊 Estatísticas
- Total de participantes: X
- Participantes mais ativos: X
- Níveis de engajamento: X alto, X médio, X baixo

## 🎭 Perfil dos Participantes

### PARTICIPANTE_X
**Papel**: (Líder/Técnico/Decisor/Observador/etc.)
**Engajamento**: 🔴 Alto / 🟡 Médio / 🟢 Baixo
**Posição principal**: (o que defende)

**Características**:
- Característica 1
- Característica 2

**Relações**:
- 👍 Concorda com: PARTICIPANTE_Y, Z
- 👎 Diverge de: PARTICIPANTE_W

**Citações características**:
> "citação 1"
> "citação 2"

---

## 🗺️ Mapa de Influência
(Quem influencia quem? Quem são os decisores?)

## ⚡ Pontos de Tensão
(Onde há desacordos? Entre quem?)

## 🤝 Alianças Identificadas
(Quem trabalha junto? Quem compartilha visões?)

## 💡 Recomendações
(Como trabalhar melhor com esse grupo?)
""",

    "timeline": """Consolide todas as extrações em uma TIMELINE DE DECISÕES.

## Extrações:
{all_extractions}

## Gere um relatório em Markdown:

# 📅 Timeline de Decisões

## 📋 Visão Geral
(Resumo da evolução da conversa)

## 📊 Estatísticas
- Total de eventos/decisões: X
- Decisões concluídas: X
- Decisões pendentes: X
- Decisões em andamento: X

## 🕐 Cronologia

### Fase 1: [Nome da Fase]
**Período**: Início da conversa

#### Evento 1.1
- **Descrição**: ...
- **Participantes**: PARTICIPANTE_X, Y
- **Impacto**: 🔴 Alto / 🟡 Médio / 🟢 Baixo
- **Status**: ✅ Concluído / 🔄 Em andamento / ⏳ Pendente

#### Evento 1.2
...

---

### Fase 2: [Nome da Fase]
**Período**: Meio da conversa
...

---

## 🔗 Dependências
```
Decisão A → Decisão B → Decisão C
            ↘ Decisão D
```

## ⏳ Itens Pendentes
| # | Item | Responsável | Dependência |
|---|------|-------------|-------------|
| 1 | ... | ... | ... |

## ✅ Decisões Concluídas
| # | Decisão | Impacto |
|---|---------|---------|
| 1 | ... | ... |

## 💡 Análise de Padrões
(O que a timeline revela sobre o processo de decisão do grupo?)
"""
}


class DeepAnalysisService:
    """Serviço para análise profunda com Refine Chain"""
    
    def __init__(self, db: Session):
        self.db = db
        self.llm_service = get_llm_service()
    
    def create_job(
        self,
        pii_job_id: UUID,
        analysis_type: str,
        detail_level: str,
        model: str,
        user_id: UUID,
        organization_id: UUID
    ) -> DeepAnalysisJob:
        """Cria um novo job de análise profunda"""
        
        pii_job = self.db.query(PIIProcessingJob).filter(
            PIIProcessingJob.id == pii_job_id
        ).first()
        
        if not pii_job:
            raise ValueError(f"Job PII {pii_job_id} não encontrado")
        
        if analysis_type not in ANALYSIS_TYPE_INFO:
            raise ValueError(f"Tipo de análise inválido: {analysis_type}")
        
        text_length = len(pii_job.masked_chat_text or "")
        total_chunks = max(1, (text_length + CHUNK_SIZE_CHARS - 1) // CHUNK_SIZE_CHARS)
        
        job = DeepAnalysisJob(
            organization_id=organization_id,
            created_by=user_id,
            pii_job_id=pii_job_id,
            analysis_type=analysis_type,
            detail_level=detail_level,
            model_used=model,
            total_chunks=total_chunks,
            status="pending"
        )
        
        self.db.add(job)
        self.db.commit()
        self.db.refresh(job)
        
        return job
    
    async def process_job(self, job_id: UUID) -> AsyncGenerator[Dict, None]:
        """
        Processa o job usando Refine Chain.
        Yield de progresso para streaming.
        """
        job = self.db.query(DeepAnalysisJob).filter(
            DeepAnalysisJob.id == job_id
        ).first()
        
        if not job:
            raise ValueError(f"Job {job_id} não encontrado")
        
        job.status = "processing"
        job.started_at = datetime.utcnow()
        self.db.commit()
        
        start_time = time.time()
        
        try:
            pii_job = self.db.query(PIIProcessingJob).filter(
                PIIProcessingJob.id == job.pii_job_id
            ).first()
            
            if not pii_job or not pii_job.masked_chat_text:
                raise ValueError("Job PII não possui texto mascarado")
            
            masked_text = pii_job.masked_chat_text
            chunks = self._split_into_chunks(masked_text)
            job.total_chunks = len(chunks)
            self.db.commit()
            
            accumulated_context = ""
            all_extractions = []
            total_tokens = 0
            
            for i, chunk in enumerate(chunks):
                yield {
                    "type": "progress",
                    "step": f"Extraindo chunk {i+1}/{len(chunks)}",
                    "progress": int((i / (len(chunks) + 1)) * 80),
                    "chunk_index": i
                }
                
                chunk_start = time.time()
                
                chunk_result = DeepAnalysisChunkResult(
                    job_id=job.id,
                    chunk_index=i,
                    chunk_content_preview=chunk[:500],
                    status="processing"
                )
                self.db.add(chunk_result)
                self.db.commit()
                
                extraction = await self._extract_chunk(
                    chunk, 
                    job.analysis_type,
                    job.detail_level,
                    job.model_used
                )
                
                chunk_result.extraction_result = extraction
                
                if accumulated_context and i > 0:
                    yield {
                        "type": "progress",
                        "step": f"Refinando chunk {i+1}/{len(chunks)} com contexto",
                        "progress": int((i / (len(chunks) + 1)) * 80) + 5,
                        "chunk_index": i
                    }
                    
                    refined = await self._refine_with_context(
                        extraction,
                        accumulated_context,
                        job.model_used
                    )
                else:
                    refined = extraction
                
                chunk_result.refined_result = refined
                chunk_result.accumulated_context_preview = accumulated_context[:1000] if accumulated_context else None
                chunk_result.processing_time_ms = int((time.time() - chunk_start) * 1000)
                chunk_result.status = "completed"
                
                accumulated_context = self._build_accumulated_context(
                    accumulated_context,
                    refined,
                    i + 1
                )
                
                all_extractions.append(refined)
                
                job.processed_chunks = i + 1
                job.current_step = f"Chunk {i+1}/{len(chunks)} processado"
                self.db.commit()
                
                yield {
                    "type": "chunk_complete",
                    "chunk": i + 1,
                    "total": len(chunks),
                    "progress": int(((i + 1) / (len(chunks) + 1)) * 80)
                }
            
            yield {
                "type": "progress",
                "step": "Consolidando resultados...",
                "progress": 85
            }
            
            final_result = await self._consolidate_results(
                all_extractions,
                job.analysis_type,
                job.detail_level,
                job.model_used
            )
            
            job.final_result = final_result
            job.intermediate_results = all_extractions
            job.status = "completed"
            job.completed_at = datetime.utcnow()
            job.processing_time_seconds = int(time.time() - start_time)
            job.total_tokens_used = total_tokens
            self.db.commit()
            
            yield {
                "type": "complete",
                "progress": 100,
                "result": final_result,
                "processing_time": job.processing_time_seconds
            }
            
        except Exception as e:
            logger.error(f"Erro no processamento deep analysis: {str(e)}")
            job.status = "failed"
            job.error_message = str(e)
            job.completed_at = datetime.utcnow()
            self.db.commit()
            
            yield {
                "type": "error",
                "error": str(e)
            }
    
    def _split_into_chunks(self, text: str) -> List[str]:
        """Divide o texto em chunks menores para análise"""
        chunks = []
        lines = text.split('\n')
        current_chunk = []
        current_size = 0
        
        for line in lines:
            line_size = len(line)
            if current_size + line_size > CHUNK_SIZE_CHARS and current_chunk:
                chunks.append('\n'.join(current_chunk))
                current_chunk = [line]
                current_size = line_size
            else:
                current_chunk.append(line)
                current_size += line_size + 1
        
        if current_chunk:
            chunks.append('\n'.join(current_chunk))
        
        return chunks
    
    async def _extract_chunk(
        self,
        chunk: str,
        analysis_type: str,
        detail_level: str,
        model: str
    ) -> Dict[str, Any]:
        """Extrai informações de um chunk"""
        
        prompt_template = EXTRACTION_PROMPTS.get(analysis_type, EXTRACTION_PROMPTS["topic_map"])
        prompt = prompt_template.format(chunk_text=chunk)
        
        if detail_level == "detalhado":
            prompt += "\n\nSeja extremamente detalhado e inclua todas as informações possíveis."
        elif detail_level == "resumido":
            prompt += "\n\nSeja conciso e foque apenas nos pontos mais importantes."
        
        try:
            response = await self.llm_service.analyze(
                prompt=prompt,
                model=model,
                temperature=0.3,
                max_tokens=2000
            )
            
            try:
                json_match = response
                if "```json" in response:
                    json_match = response.split("```json")[1].split("```")[0]
                elif "```" in response:
                    json_match = response.split("```")[1].split("```")[0]
                
                return json.loads(json_match.strip())
            except:
                return {"raw_response": response}
                
        except Exception as e:
            logger.error(f"Erro na extração: {str(e)}")
            return {"error": str(e)}
    
    async def _refine_with_context(
        self,
        current_extraction: Dict[str, Any],
        accumulated_context: str,
        model: str
    ) -> Dict[str, Any]:
        """Refina a extração atual com o contexto acumulado"""
        
        prompt = REFINE_PROMPT.format(
            accumulated_context=accumulated_context,
            current_extraction=json.dumps(current_extraction, ensure_ascii=False, indent=2)
        )
        
        try:
            response = await self.llm_service.analyze(
                prompt=prompt,
                model=model,
                temperature=0.3,
                max_tokens=2500
            )
            
            try:
                json_match = response
                if "```json" in response:
                    json_match = response.split("```json")[1].split("```")[0]
                elif "```" in response:
                    json_match = response.split("```")[1].split("```")[0]
                
                return json.loads(json_match.strip())
            except:
                return current_extraction
                
        except Exception as e:
            logger.error(f"Erro no refinamento: {str(e)}")
            return current_extraction
    
    def _build_accumulated_context(
        self,
        previous_context: str,
        new_extraction: Dict[str, Any],
        chunk_number: int
    ) -> str:
        """Constrói o contexto acumulado para o próximo chunk"""
        
        new_summary = json.dumps(new_extraction, ensure_ascii=False)[:2000]
        
        new_context = f"\n\n### Chunk {chunk_number}:\n{new_summary}"
        
        max_context_size = 8000
        combined = previous_context + new_context
        
        if len(combined) > max_context_size:
            combined = combined[-max_context_size:]
        
        return combined
    
    async def _consolidate_results(
        self,
        all_extractions: List[Dict[str, Any]],
        analysis_type: str,
        detail_level: str,
        model: str
    ) -> str:
        """Consolida todas as extrações em um relatório final"""
        
        prompt_template = CONSOLIDATION_PROMPTS.get(analysis_type, CONSOLIDATION_PROMPTS["topic_map"])
        
        extractions_text = "\n\n".join([
            f"### Chunk {i+1}:\n{json.dumps(ext, ensure_ascii=False, indent=2)}"
            for i, ext in enumerate(all_extractions)
        ])
        
        prompt = prompt_template.format(all_extractions=extractions_text)
        
        if detail_level == "detalhado":
            prompt += "\n\nGere um relatório extremamente detalhado e abrangente."
        elif detail_level == "resumido":
            prompt += "\n\nGere um relatório conciso focando nos pontos mais importantes."
        
        try:
            response = await self.llm_service.analyze(
                prompt=prompt,
                model=model,
                temperature=0.5,
                max_tokens=4000
            )
            
            return response
            
        except Exception as e:
            logger.error(f"Erro na consolidação: {str(e)}")
            return f"Erro na consolidação: {str(e)}"
    
    def get_job(self, job_id: UUID) -> Optional[DeepAnalysisJob]:
        """Retorna um job pelo ID"""
        return self.db.query(DeepAnalysisJob).filter(
            DeepAnalysisJob.id == job_id
        ).first()
    
    def list_jobs(self, organization_id: UUID, limit: int = 20) -> List[DeepAnalysisJob]:
        """Lista jobs da organização"""
        return self.db.query(DeepAnalysisJob).filter(
            DeepAnalysisJob.organization_id == organization_id
        ).order_by(DeepAnalysisJob.created_at.desc()).limit(limit).all()
    
    async def deanonymize_result(
        self,
        job_id: UUID
    ) -> str:
        """Re-hidrata o resultado usando o vault do job PII"""
        
        job = self.get_job(job_id)
        if not job or not job.final_result:
            raise ValueError("Job não encontrado ou sem resultado")
        
        vault = self.db.query(PIIVault).filter(
            PIIVault.job_id == job.pii_job_id
        ).first()
        
        if not vault or not vault.deanonymizer_mapping:
            raise ValueError("Vault não disponível para este job")
        
        result = job.final_result
        
        mappings = sorted(
            vault.deanonymizer_mapping.items(),
            key=lambda x: len(x[0]),
            reverse=True
        )
        
        import re
        for pseudo, original in mappings:
            escaped = re.escape(pseudo)
            pattern = rf'(?<![A-Za-z0-9_]){escaped}(?![A-Za-z0-9_])'
            result = re.sub(pattern, original, result)
            
            clean_pseudo = pseudo.replace('[', '').replace(']', '')
            if clean_pseudo != pseudo:
                escaped_clean = re.escape(clean_pseudo)
                pattern_clean = rf'(?<![A-Za-z0-9_]){escaped_clean}(?![A-Za-z0-9_])'
                result = re.sub(pattern_clean, original, result)
        
        return result
