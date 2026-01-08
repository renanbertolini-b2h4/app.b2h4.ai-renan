"""
Tarefas Celery para processamento de PII em chunks
Arquivo: app/tasks/pii_tasks.py
"""

import logging
import time
import asyncio
import re
from datetime import datetime, timedelta
from typing import List, Dict, Optional

from app.core.database import SessionLocal
from app.models.pii import PIIAnalysis, PIIAnalysisChunk, PIIProcessingJob
from app.services.llm_service import get_llm_service

logger = logging.getLogger(__name__)

MAX_RETRIES = 3
RETRY_DELAY = 5
RATE_LIMIT_BASE_DELAY = 35

MODEL_CHUNK_SIZES = {
    "gpt-3.5-turbo": {"size": 12000, "overlap": 2000},
    "gpt-4-turbo": {"size": 60000, "overlap": 10000},
    "gpt-4o": {"size": 60000, "overlap": 10000},
    "gpt-4o-mini": {"size": 60000, "overlap": 10000},
    "claude-3-opus": {"size": 80000, "overlap": 15000},
    "claude-3-sonnet": {"size": 80000, "overlap": 15000},
    "claude-3-haiku": {"size": 40000, "overlap": 8000},
}
DEFAULT_CHUNK_SIZE = 60000
DEFAULT_CHUNK_OVERLAP = 10000


def extract_rate_limit_info(error_message: str) -> Dict:
    """Extract rate limit info from OpenAI error message."""
    info = {
        "is_rate_limit": False,
        "wait_seconds": RATE_LIMIT_BASE_DELAY,
        "limit": None,
        "used": None,
        "requested": None
    }
    
    if "429" in str(error_message) or "rate_limit" in str(error_message).lower():
        info["is_rate_limit"] = True
        
        wait_match = re.search(r'try again in (\d+(?:\.\d+)?)\s*s', str(error_message))
        if wait_match:
            info["wait_seconds"] = int(float(wait_match.group(1))) + 5
        
        limit_match = re.search(r'Limit (\d+)', str(error_message))
        if limit_match:
            info["limit"] = int(limit_match.group(1))
            
        used_match = re.search(r'Used (\d+)', str(error_message))
        if used_match:
            info["used"] = int(used_match.group(1))
            
        requested_match = re.search(r'Requested (\d+)', str(error_message))
        if requested_match:
            info["requested"] = int(requested_match.group(1))
    
    return info


def update_analysis_timing(db, analysis, chunk_times: List[int]):
    """Update analysis timing estimates based on chunk processing times."""
    if not chunk_times:
        return
    
    avg_time_ms = sum(chunk_times) / len(chunk_times)
    analysis.avg_chunk_time_ms = str(int(avg_time_ms))
    
    total_chunks = int(analysis.total_chunks or 0)
    completed = int(analysis.completed_chunks or 0)
    remaining = total_chunks - completed
    
    if remaining > 0 and avg_time_ms > 0:
        remaining_ms = remaining * avg_time_ms
        remaining_seconds = remaining_ms / 1000
        analysis.estimated_completion = datetime.utcnow() + timedelta(seconds=remaining_seconds)
    
    db.commit()


TASK_PROMPTS = {
    "sentiment": {
        "chunk": """Você é um psicólogo organizacional analisando dinâmicas de grupo.

## CONTEXTO
Esta é a PARTE {chunk_num} de {total_chunks} de uma conversa de WhatsApp profissional.

## FRAMEWORK DE ANÁLISE

### Dimensões do Sentimento
1. **Valência**: positivo / negativo / neutro / misto
2. **Intensidade**: forte / moderada / leve
3. **Direção**: geral / entre pessoas específicas / sobre tópico específico

### Indicadores

**POSITIVO**: "ótimo", "perfeito", "adorei", "excelente", "parabéns", emojis 👏🎉✅💪🙌😊
**NEGATIVO**: "problema", "difícil", "infelizmente", "péssimo", "absurdo", emojis 😤😢😡👎
**TENSÃO**: discordância explícita, silêncio após confronto, mudança brusca de assunto
**NEUTRO**: compartilhamento de fatos, perguntas objetivas, links sem comentário

## INSTRUÇÕES
1. Identifique o sentimento geral desta parte
2. Mapeie a evolução temporal (início, meio, fim)
3. Analise o sentimento por participante
4. Identifique tensões entre pessoas
5. Destaque momentos-chave (picos positivos/negativos)
6. Cite evidências textuais para cada observação

## FORMATO DE RESPOSTA

### Sentimento Geral
**Valência**: [positivo/negativo/neutro/misto]
**Intensidade**: [forte/moderada/leve]

### Evolução Temporal
- **Início**: [sentimento] - "[citação]"
- **Meio**: [sentimento] - "[citação]"
- **Fim**: [sentimento] - "[citação]"

### Por Participante
[Para cada participante ativo, descrever sentimento predominante com citações]

### Tensões Identificadas
[Descrever conflitos entre pessoas com evidências]

### Momentos-Chave
[Picos emocionais positivos e negativos com citações]

### Clima Geral
[Uma frase resumindo o clima emocional desta parte]""",
        "consolidate": """Você é um diretor de RH consolidando uma análise de clima de uma conversa longa.

## DADOS RECEBIDOS
{chunk_results}

## TAREFA
Criar RELATÓRIO DE CLIMA EMOCIONAL consolidado.

## REGRAS
1. DEDUPLICAR: Tensões repetidas → manter descrição mais completa
2. EVOLUÇÃO: Mostrar como o clima mudou ao longo da conversa
3. EVIDÊNCIAS: Incluir citações para cada conclusão
4. PRIORIZAR: Tensões não resolvidas > resolvidas

## ESTRUTURA OBRIGATÓRIA

# 💭 Análise de Sentimento

## 📌 Resumo Executivo
[2-3 frases sobre o clima geral]

## 🎭 Sentimento Geral
| Dimensão | Avaliação | Confiança |
|----------|-----------|-----------|
| Valência | [pos/neg/neutro/misto] | [alta/média/baixa] |
| Intensidade | [forte/moderada/leve] | [alta/média/baixa] |

## 📈 Evolução Temporal
```
[Início] ➜ [Meio] ➜ [Fim]
[emoji] ➜ [emoji] ➜ [emoji]
```
**Análise**: [como e por que o sentimento evoluiu]

## 👥 Análise por Participante
| Participante | Sentimento | Momentos Destaque |
|--------------|------------|-------------------|
| [nome] | [descrição] | "[citação positiva]" / "[citação negativa]" |

## ⚠️ Tensões Identificadas
### [Tensão 1]
- **Entre**: [pessoa1] e [pessoa2]
- **Sobre**: [tópico]
- **Intensidade**: [alta/média/baixa]
- **Resolvida**: [sim/não]
- **Evidência**: "[citação]"

## 🌟 Momentos de Destaque
### Picos Positivos
- [descrição] - "[citação]"

### Picos Negativos
- [descrição] - "[citação]"

## 💡 Recomendações
[Sugestões para melhorar o clima do grupo]"""
    },
    "summary": {
        "chunk": """Você é um analista de comunicação corporativa com 15 anos de experiência em grupos de WhatsApp empresariais.

## CONTEXTO
Esta é a PARTE {chunk_num} de {total_chunks} de uma conversa de WhatsApp.

## TAREFA
Analise esta parte e extraia informações estruturadas.

## INSTRUÇÕES ESPECÍFICAS

### Participantes
- Liste participantes que aparecem nesta parte
- Identifique papel/expertise aparente
- Note frequência: muito ativo / moderado / pontual

### Tópicos
Para cada tópico SUBSTANTIVO discutido:
- Ignore: saudações, "bom dia", emojis isolados, "<mídia oculta>"
- Inclua: discussões com 3+ mensagens sobre o mesmo assunto
- Classifique: técnico / negócio / social / administrativo

### Decisões e Compromissos
APENAS inclua se houver:
- Verbo de compromisso: "vou", "fico de", "me comprometo"
- Confirmação: "fechado", "combinado", "ok, faço"
- Prazo mencionado

### Informações Valiosas
- Links compartilhados (URL + contexto)
- Eventos mencionados (nome + data)
- Documentos referenciados
- Dados/estatísticas citados

## FORMATO DE RESPOSTA

### Participantes desta Parte
| Nome | Papel/Expertise | Atividade |
|------|-----------------|-----------|
| [nome] | [descrição] | [alta/média/baixa] |

### Tópicos Discutidos
**[Nome do Tópico]**
- Tipo: [técnico/negócio/social/admin]
- Status: [resolvido/pendente/em debate]
- Participantes: [nomes]
- Resumo: [3-4 frases]
- Mensagens relevantes: [quantidade]

### Decisões e Compromissos
| Decisão | Responsável | Prazo | Evidência |
|---------|-------------|-------|-----------|
| [descrição] | [nome] | [data] | "[citação exata]" |

### Informações Valiosas
- [Tipo]: [conteúdo] - Contexto: [explicação]

### Pontos de Tensão
- [descrição de conflitos ou desacordos]

### Resumo para Contexto
[3-4 frases resumindo esta parte para servir de contexto]""",
        "consolidate": """Você é um diretor executivo que precisa de uma síntese clara de uma longa conversa de WhatsApp.

## DADOS RECEBIDOS
{chunk_results}

## TAREFA
Criar RELATÓRIO EXECUTIVO que seja:
- Acionável (o que fazer com essa informação?)
- Conciso (máximo 1500 palavras)
- Priorizado (mais importante primeiro)

## REGRAS DE CONSOLIDAÇÃO

### Deduplicação
- Mesmo tópico em múltiplos chunks → unifique, mantenha evolução
- Mesmo participante → consolide informações

### Priorização
- Decisões tomadas > Discussões em andamento > Menções breves
- Com prazo > Sem prazo
- Com responsável > Sem responsável

## ESTRUTURA OBRIGATÓRIA

# 📋 Análise da Conversa

## 📌 TL;DR
[2-3 frases capturando o essencial. Um executivo ocupado leria SÓ isso.]

## 👥 Participantes-Chave
| Nome | Papel/Expertise | Atividade |
|------|-----------------|-----------|
| [nome] | [descrição] | 🟢 Alto / 🟡 Médio / 🔴 Baixo |

## 📅 Linha do Tempo
- **[Data/Período]**: [Evento/Marco importante]
- **[Data/Período]**: [Evento/Marco importante]

## 🎯 Tópicos Principais

### 1. [Tópico mais discutido]
- **Status**: ✅ Resolvido / ⏳ Pendente / 💬 Em debate
- **Resumo**: [3-4 frases]
- **Participantes-chave**: [nomes]
- **Conclusão/Próximos passos**: [se houver]

### 2. [Segundo tópico]
[mesma estrutura]

## ✅ Decisões e Compromissos
| Ação | Responsável | Prazo | Status | Evidência |
|------|-------------|-------|--------|-----------|
| [descrição] | [nome] | [data] | ⏳/✅ | "[citação]" |

## ⚠️ Pendências Críticas
1. [Algo que precisa de atenção/decisão]
2. [...]

## 🚨 Alertas
- [Tensões identificadas]
- [Riscos mencionados]
- [Urgências]

## 📎 Recursos Mencionados
- [Links, documentos, eventos com contexto]"""
    },
    "topics": {
        "chunk": """Você é um analista de conteúdo especializado em mapear discussões em grupos profissionais.

## CONTEXTO
Esta é a PARTE {chunk_num} de {total_chunks} de uma conversa de WhatsApp.

## O QUE É UM TÓPICO

### ✅ INCLUIR
- Assunto discutido por 2+ pessoas com 3+ mensagens
- Tem substância (informação, debate, decisão)
- Exemplos: "Implementação de chatbot", "Evento de networking", "Regulamentação de IA"

### ❌ IGNORAR
- Saudações: "bom dia", "oi pessoal"
- Meta-conversa: "o grupo tá quieto", "alguém aí?"
- Mídia sem contexto: "<mídia oculta>" sozinha
- Reações isoladas: emojis, "kkk", "haha"

## TAXONOMIA DE TÓPICOS
- **tecnico**: Código, ferramentas, arquitetura, bugs, implementação
- **negocio**: Estratégia, mercado, clientes, vendas, parcerias
- **evento**: Meetups, conferências, webinars, encontros
- **regulatorio**: Leis, compliance, ética, políticas
- **carreira**: Vagas, oportunidades, networking, desenvolvimento
- **social**: Conversas pessoais, humor, off-topic
- **administrativo**: Regras do grupo, organização, avisos

## MÉTRICAS DE RELEVÂNCIA
**ALTA**: 10+ mensagens OU decisão tomada OU múltiplos participantes engajados
**MÉDIA**: 5-10 mensagens OU debate sem conclusão
**BAIXA**: 3-5 mensagens OU menção passageira

## FORMATO DE RESPOSTA

### Tópicos Identificados

**[Nome do Tópico]**
- ID: T{chunk_num}.[sequência]
- Categoria: [técnico/negócio/evento/regulatório/carreira/social/admin]
- Relevância: [🔴 Alta / 🟡 Média / 🟢 Baixa]
- Mensagens: [quantidade estimada]
- Participantes: [nomes]
- Status: [✅ Resolvido / ⏳ Pendente / 💬 Em debate / ℹ️ Informativo]
- Descrição: [3-4 frases]
- Citação-chave: "[frase que captura a essência]"
- Sentimento: [positivo/negativo/neutro/controverso]

### Conexões entre Tópicos
[Descrever como os tópicos se relacionam]

### Resumo para Contexto
[2-3 frases para servir de contexto para próximas partes]""",
        "consolidate": """Você é um curador de conhecimento criando um mapa de tópicos de uma conversa longa.

## DADOS RECEBIDOS
{chunk_results}

## TAREFA
Criar MAPA DE TÓPICOS consolidado e hierarquizado.

## REGRAS

### Agrupamento
- Tópicos relacionados → agrupar sob tema pai
- Ex: "Chatbot para vendas" + "Chatbot para suporte" → "Implementação de Chatbots"

### Deduplicação
- Mesmo tópico em chunks diferentes → unificar
- Manter evolução temporal

## ESTRUTURA OBRIGATÓRIA

# 🗺️ Mapa de Tópicos

## 📊 Visão Geral
- **Total de tópicos identificados**: [X]
- **Temas principais**: [Y]

## 📈 Distribuição por Categoria
| Categoria | Quantidade | % do Total |
|-----------|------------|------------|
| Técnico | [X] | [Y%] |
| Negócio | [X] | [Y%] |
| [outros] | [X] | [Y%] |

---

## 🎯 Temas Principais

### 1. [Tema Principal]
**Relevância**: 🔴 Alta | **Status Geral**: ⏳ Em andamento

#### Contexto
[2-3 frases sobre o tema]

#### Tópicos Relacionados

##### 1.1 [Tópico]
- **Status**: ✅ Resolvido / ⏳ Pendente / 💬 Em debate
- **Participantes-chave**: [nomes]
- **Resumo**: [3-4 frases]
- **Citação-chave**: "[frase]"
- **Conclusão**: [se houver]

### 2. [Segundo Tema Principal]
[mesma estrutura]

---

## 📌 Tópicos Não Resolvidos
1. [Tópico] - Última discussão sobre [assunto]
2. [Tópico] - Aguardando [o quê]

## 💡 Insights
- [Padrão observado]
- [Tendência identificada]"""
    },
    "intent": {
        "chunk": """Você é um analista de comunicação classificando intenções em mensagens.

## CONTEXTO
Esta é a PARTE {chunk_num} de {total_chunks} de uma conversa de WhatsApp.

## TAXONOMIA DE INTENÇÕES

### Primárias
- **informar**: Compartilhar notícia, dado, conhecimento (sem pedir nada)
- **perguntar**: Buscar informação, tirar dúvida
- **solicitar**: Pedir ação específica de alguém
- **oferecer**: Disponibilizar ajuda, recurso, tempo
- **decidir**: Propor ou confirmar decisão
- **debater**: Argumentar posição, discordar, defender ponto

### Secundárias
- **networking**: Conectar pessoas, apresentar
- **promover**: Divulgar evento, produto, serviço próprio
- **reclamar**: Expressar insatisfação
- **agradecer**: Reconhecer contribuição
- **socializar**: Manter relacionamento (saudações, humor)
- **moderar**: Gerenciar grupo (regras, organização)

## ANÁLISE SOLICITADA
1. Identifique a intenção predominante desta parte
2. Mapeie a distribuição de intenções (%)
3. Analise intenção por participante
4. Identifique fluxos de intenção (pergunta → resposta)
5. Liste intenções não atendidas

## FORMATO DE RESPOSTA

### Intenção Predominante
**Tipo**: [intenção]
**Confiança**: [alta/média/baixa]
**Evidência**: "[citação representativa]"

### Distribuição de Intenções
| Intenção | Percentual |
|----------|------------|
| Informar | [X%] |
| Perguntar | [X%] |
| Solicitar | [X%] |
| [outros] | [X%] |

### Por Participante
| Nome | Intenção Principal | Perfil | Exemplos |
|------|-------------------|--------|----------|
| [nome] | [intenção] | [contribuidor/questionador/moderador/observador/promotor] | "[citação]" |

### Fluxos de Intenção
- [Pergunta de João] → [Resposta de Maria] → [Resultado: resolvido/pendente]

### Intenções Não Atendidas
- [Tipo]: [descrição] - De: [pessoa] - Status: [sem resposta/parcialmente atendida]""",
        "consolidate": """Você é um analista sênior consolidando um mapa de intenções de uma conversa longa.

## DADOS RECEBIDOS
{chunk_results}

## TAREFA
Determinar o MAPA DE INTENÇÕES consolidado.

## ESTRUTURA OBRIGATÓRIA

# 🎯 Análise de Intenções

## 📌 Resumo Executivo
[2-3 frases sobre as intenções dominantes]

## 🏆 Intenção Principal
**Tipo**: [intenção]
**Evidência**: "[citação]"
**Análise**: [por que esta é a intenção dominante]

## 📊 Distribuição Geral
| Intenção | % | Tendência |
|----------|---|-----------|
| [intenção] | [X%] | ↑ Crescente / ↓ Decrescente / → Estável |

## 👥 Perfil por Participante
| Participante | Papel | Intenção Principal | Contribuição |
|--------------|-------|-------------------|--------------|
| [nome] | [contribuidor/questionador/moderador] | [intenção] | [descrição] |

## 🔄 Fluxos de Intenção
### Perguntas e Respostas
| Pergunta | De | Resposta | Por | Status |
|----------|-----|----------|-----|--------|
| [resumo] | [nome] | [resumo] | [nome] | ✅/⏳ |

## ⚠️ Intenções Não Atendidas
1. **[Tipo]**: [descrição]
   - De: [pessoa]
   - Desde: [momento/parte]
   - Impacto: [alto/médio/baixo]

## 💡 Recomendações
[Sugestões para melhorar o fluxo de intenções]"""
    },
    "quality": {
        "chunk": """Você é um consultor de comunicação corporativa avaliando qualidade de interações.

## CONTEXTO
Esta é a PARTE {chunk_num} de {total_chunks} de uma conversa de WhatsApp.

## CRITÉRIOS DE AVALIAÇÃO (1-10)

### 1. Clareza (as mensagens são compreensíveis?)
- 9-10: Mensagens claras, bem estruturadas, sem ambiguidade
- 7-8: Majoritariamente claras, algumas precisam contexto
- 5-6: Mistura de claras e confusas
- 3-4: Frequentemente confusas ou incompletas
- 1-2: Incompreensíveis, muito fragmentadas

### 2. Profissionalismo (tom adequado ao contexto?)
- 9-10: Tom consistentemente profissional e respeitoso
- 7-8: Profissional com momentos de informalidade apropriada
- 5-6: Mistura de profissional e casual
- 3-4: Muito informal ou ocasionalmente inadequado
- 1-2: Inadequado, ofensivo ou muito desleixado

### 3. Eficiência (objetividade nas mensagens?)
- 9-10: Direto ao ponto, sem redundância
- 7-8: Majoritariamente eficiente
- 5-6: Algumas mensagens poderiam ser mais concisas
- 3-4: Muita redundância ou dispersão
- 1-2: Extremamente prolixo ou desorganizado

### 4. Engajamento (participação e interação?)
- 9-10: Alto engajamento, múltiplos participantes ativos
- 7-8: Bom engajamento, algumas conversas bilaterais
- 5-6: Engajamento moderado
- 3-4: Pouco engajamento, muitas mensagens sem resposta
- 1-2: Quase monólogo ou grupo inativo

### 5. Resolução (problemas são resolvidos?)
- 9-10: Questões levantadas são respondidas/resolvidas
- 7-8: Maioria resolvida, algumas pendentes
- 5-6: Metade resolvida
- 3-4: Maioria fica pendente
- 1-2: Nada é resolvido, conversas abandonadas

## FORMATO DE RESPOSTA

### Notas desta Parte

| Critério | Nota | Justificativa |
|----------|------|---------------|
| Clareza | [X]/10 | [explicação] |
| Profissionalismo | [X]/10 | [explicação] |
| Eficiência | [X]/10 | [explicação] |
| Engajamento | [X]/10 | [explicação] |
| Resolução | [X]/10 | [explicação] |

**Média**: [X.X]/10

### Mensagens Exemplares
| Autor | Mensagem | Por que é boa |
|-------|----------|---------------|
| [nome] | "[citação]" | [explicação] |

### Mensagens Problemáticas
| Autor | Mensagem | Problema | Sugestão |
|-------|----------|----------|----------|
| [nome] | "[citação]" | [problema] | [como melhorar] |

### Pontos Fortes
- [ponto forte com evidência]

### Oportunidades de Melhoria
- [oportunidade com sugestão]""",
        "consolidate": """Você é um consultor sênior criando um relatório de qualidade de comunicação.

## DADOS RECEBIDOS
{chunk_results}

## TAREFA
Criar RELATÓRIO DE QUALIDADE consolidado.

## ESTRUTURA OBRIGATÓRIA

# 📊 Relatório de Qualidade da Comunicação

## 📌 Resumo Executivo
[2-3 frases sobre a qualidade geral]

## 🏆 Nota Geral: [X.X]/10

## 📈 Detalhamento por Critério

| Critério | Nota | Tendência | Análise |
|----------|------|-----------|---------|
| Clareza | [X]/10 | ↑↓→ | [resumo] |
| Profissionalismo | [X]/10 | ↑↓→ | [resumo] |
| Eficiência | [X]/10 | ↑↓→ | [resumo] |
| Engajamento | [X]/10 | ↑↓→ | [resumo] |
| Resolução | [X]/10 | ↑↓→ | [resumo] |

## 🌟 Pontos Fortes
1. **[Ponto]**: [descrição com evidência]
2. **[Ponto]**: [descrição com evidência]

## ⚠️ Oportunidades de Melhoria
1. **[Área]**: [descrição do problema]
   - **Impacto**: [alto/médio/baixo]
   - **Sugestão**: [como melhorar]

## 👑 Destaques Positivos
| Participante | Contribuição | Exemplo |
|--------------|--------------|---------|
| [nome] | [descrição] | "[citação]" |

## 📋 Recomendações Práticas
1. [Recomendação acionável]
2. [Recomendação acionável]
3. [Recomendação acionável]"""
    },
    "action_items": {
        "chunk": """Você é um gerente de projetos PMI-certificado especializado em extrair compromissos de comunicação informal.

## CONTEXTO
Esta é a PARTE {chunk_num} de {total_chunks} de uma conversa de WhatsApp.

## CLASSIFICAÇÃO DE AÇÕES

### 🟢 COMPROMISSO FIRME (alta confiança)
Critérios - TODOS devem estar presentes:
- Verbo de primeira pessoa: "vou", "faço", "fico de", "assumo"
- OU confirmação explícita: "ok", "fechado", "combinado", "pode deixar"
- Ação específica e verificável

Exemplos:
✅ "Fico de mandar o relatório até sexta" → compromisso firme
✅ "Ok, eu reviso amanhã" → compromisso firme
❌ "Seria bom alguém revisar" → NÃO é compromisso

### 🟡 SOLICITAÇÃO (média confiança)
Critérios:
- Pedido direcionado a pessoa específica
- Usa @menção ou nome
- Aguarda confirmação

### 🟠 SUGESTÃO (baixa confiança)
Critérios:
- Sem responsável definido
- Linguagem condicional: "seria bom", "precisamos", "alguém poderia"

### ⚪ IGNORAR
- Perguntas retóricas
- Desejos sem ação: "queria muito que..."
- Comentários sobre ações de terceiros

## PRIORIZAÇÃO
**ALTA**: Prazo explícito ≤ 7 dias OU palavras "urgente", "crítico", "bloqueado"
**MÉDIA**: Prazo explícito > 7 dias OU sem prazo mas com responsável
**BAIXA**: Sem prazo e sem responsável claro

## FORMATO DE RESPOSTA

### Ações Identificadas

**Ação A{chunk_num}.1**
- Descrição: [verbo + objeto + contexto]
- Responsável: [nome ou "indefinido"]
- Prazo: [data específica ou "não mencionado"]
- Prioridade: [🔴 Alta / 🟡 Média / 🟢 Baixa]
- Tipo: [compromisso/solicitação/sugestão]
- Confiança: [alta/média/baixa]
- Evidência: "[citação EXATA]"
- Contexto: [por que essa ação surgiu]
- Dependência: [outra ação ou "nenhuma"]

### Aguardando Confirmação
[Lista de solicitações feitas mas sem resposta]

### Resumo desta Parte
- Total de ações: [X]
- Compromissos firmes: [Y]
- Solicitações: [Z]
- Sugestões: [W]""",
        "consolidate": """Você é um PMO (Project Management Officer) consolidando ações de uma conversa longa.

## DADOS RECEBIDOS
{chunk_results}

## TAREFA
Criar PLANO DE AÇÃO consolidado e deduplicado.

## REGRAS DE CONSOLIDAÇÃO

### Deduplicação
- Mesma ação mencionada em chunks diferentes → manter a mais recente/completa
- Ação que evoluiu (de sugestão para compromisso) → manter status final

### Resolução
- Se ação foi concluída em chunk posterior → marcar como ✅
- Se ação foi cancelada/substituída → remover ou marcar

## ESTRUTURA OBRIGATÓRIA

# 📋 Plano de Ação

## 📌 Resumo Executivo
- **Total de ações identificadas**: [X]
- **Compromissos firmes**: [Y]
- **Pendentes de confirmação**: [Z]

## 🔴 Ações de Alta Prioridade

| # | Ação | Responsável | Prazo | Status | Evidência |
|---|------|-------------|-------|--------|-----------|
| 1 | [descrição] | [nome] | [data] | ⏳/✅ | "[citação]" |

### Dependências
- A1 → A3 (A3 depende de A1)

## 🟡 Ações de Média Prioridade

| # | Ação | Responsável | Prazo | Status | Evidência |
|---|------|-------------|-------|--------|-----------|
| ... |

## 🟢 Ações de Baixa Prioridade / Sugestões

| # | Sugestão | Possível Responsável | Contexto |
|---|----------|---------------------|----------|
| ... |

## ⏳ Aguardando Confirmação
| Solicitação | Para Quem | Desde |
|-------------|-----------|-------|
| [descrição] | [nome] | [parte/momento] |

## ⚠️ Riscos Identificados
- [Ação X sem responsável definido]
- [Prazo Y pode conflitar com Z]

## 📅 Linha do Tempo de Entregas
```
Semana 1: [ações]
Semana 2: [ações]
```"""
    }
}


def get_chunk_settings(model: str) -> Dict:
    """Get chunk size settings based on model."""
    return MODEL_CHUNK_SIZES.get(model, {"size": DEFAULT_CHUNK_SIZE, "overlap": DEFAULT_CHUNK_OVERLAP})


def create_chunks(text: str, model: str = "gpt-4-turbo") -> List[Dict]:
    """Divide o texto em chunks com overlap, baseado no modelo."""
    settings = get_chunk_settings(model)
    chunk_size = settings["size"]
    chunk_overlap = settings["overlap"]
    
    chunks = []
    text_length = len(text)
    
    if text_length <= chunk_size:
        return [{
            "index": 0,
            "start": 0,
            "end": text_length,
            "text": text
        }]
    
    start = 0
    chunk_index = 0
    
    while start < text_length:
        end = min(start + chunk_size, text_length)
        
        chunks.append({
            "index": chunk_index,
            "start": start,
            "end": end,
            "text": text[start:end]
        })
        
        if end >= text_length:
            break
            
        start = start + chunk_size - chunk_overlap
        chunk_index += 1
    
    return chunks


def run_async(coro):
    """Helper to run async code in sync context."""
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop.run_until_complete(coro)


try:
    from app.core.celery_app import celery_app
    
    if celery_app:
        @celery_app.task(bind=True, max_retries=MAX_RETRIES)
        def process_pii_analysis_chunked(self, analysis_id: str):
            """
            Processa uma análise de PII dividida em chunks com rate limit handling.
            """
            db = SessionLocal()
            chunk_times = []
            
            try:
                analysis = db.query(PIIAnalysis).filter(PIIAnalysis.id == analysis_id).first()
                if not analysis:
                    logger.error(f"Analysis {analysis_id} not found")
                    return {"error": "Analysis not found"}
                
                job = db.query(PIIProcessingJob).filter(PIIProcessingJob.id == analysis.job_id).first()
                if not job:
                    logger.error(f"Job not found for analysis {analysis_id}")
                    return {"error": "Job not found"}
                
                model = analysis.llm_model or "gpt-4-turbo"
                chat_text = job.masked_chat_text or ""
                chunks = create_chunks(chat_text, model)
                total_chunks = len(chunks)
                logger.info(f"Created {total_chunks} chunks for model {model} (chunk_size: {get_chunk_settings(model)['size']})")
                
                analysis.is_chunked = True
                analysis.total_chunks = str(total_chunks)
                analysis.completed_chunks = "0"
                analysis.failed_chunks = "0"
                analysis.status = "processing"
                analysis.started_at = datetime.utcnow()
                analysis.is_paused = False
                analysis.pause_reason = None
                db.commit()
                
                from sqlalchemy import cast, Integer
                existing_chunks = db.query(PIIAnalysisChunk).filter(
                    PIIAnalysisChunk.analysis_id == analysis.id
                ).count()
                
                if existing_chunks == 0:
                    for chunk_data in chunks:
                        chunk = PIIAnalysisChunk(
                            analysis_id=analysis.id,
                            chunk_index=str(chunk_data["index"]),
                            total_chunks=str(total_chunks),
                            start_char=str(chunk_data["start"]),
                            end_char=str(chunk_data["end"]),
                            status="pending",
                            max_retries=str(MAX_RETRIES)
                        )
                        db.add(chunk)
                    db.commit()
                
                llm_service = get_llm_service()
                task_type = analysis.task_type
                delay_between = int(analysis.delay_between_chunks or "2")
                
                chunk_records = db.query(PIIAnalysisChunk).filter(
                    PIIAnalysisChunk.analysis_id == analysis.id,
                    PIIAnalysisChunk.status.in_(["pending", "processing", "failed"])
                ).order_by(cast(PIIAnalysisChunk.chunk_index, Integer)).all()
                
                for chunk_record in chunk_records:
                    i = int(chunk_record.chunk_index)
                    chunk_text = chat_text[int(chunk_record.start_char):int(chunk_record.end_char)]
                    
                    prompt_template = TASK_PROMPTS.get(task_type, {}).get("chunk", "")
                    chunk_prompt = prompt_template.format(
                        chunk_num=i + 1,
                        total_chunks=total_chunks
                    )
                    
                    full_prompt = f"""{chunk_prompt}

Conversa (Parte {i + 1} de {total_chunks}):
{chunk_text}

Resposta:"""
                    
                    chunk_record.prompt = full_prompt
                    chunk_record.status = "processing"
                    chunk_record.started_at = datetime.utcnow()
                    db.commit()
                    
                    retry_count = int(chunk_record.retry_count or "0")
                    max_retries = int(chunk_record.max_retries or str(MAX_RETRIES))
                    success = False
                    last_error = None
                    chunk_start_time = time.time()
                    
                    while retry_count < max_retries and not success:
                        try:
                            response = run_async(llm_service.analyze(
                                prompt=full_prompt,
                                model=model,
                                temperature=0.7,
                                max_tokens=1000
                            ))
                            
                            chunk_end_time = time.time()
                            processing_time_ms = int((chunk_end_time - chunk_start_time) * 1000)
                            chunk_times.append(processing_time_ms)
                            
                            chunk_record.llm_response = response
                            chunk_record.status = "completed"
                            chunk_record.retry_count = str(retry_count)
                            chunk_record.completed_at = datetime.utcnow()
                            chunk_record.processing_time_ms = str(processing_time_ms)
                            chunk_record.result_data = {"response": response[:500] if response else None}
                            chunk_record.error_message = None
                            chunk_record.error_code = None
                            
                            analysis.completed_chunks = str(int(analysis.completed_chunks or "0") + 1)
                            update_analysis_timing(db, analysis, chunk_times)
                            db.commit()
                            success = True
                            
                            remaining_chunks = db.query(PIIAnalysisChunk).filter(
                                PIIAnalysisChunk.analysis_id == analysis.id,
                                PIIAnalysisChunk.status.in_(["pending", "processing"])
                            ).count()
                            
                            if remaining_chunks > 0:
                                time.sleep(delay_between)
                                
                        except Exception as e:
                            retry_count += 1
                            last_error = e
                            error_str = str(e)
                            
                            rate_info = extract_rate_limit_info(error_str)
                            
                            chunk_record.retry_count = str(retry_count)
                            chunk_record.last_retry_at = datetime.utcnow()
                            chunk_record.error_message = error_str[:500]
                            
                            if rate_info["is_rate_limit"]:
                                chunk_record.error_code = "RATE_LIMIT"
                                chunk_record.rate_limit_delay_s = str(rate_info["wait_seconds"])
                                
                                analysis.pause_reason = f"Rate limit atingido. Aguardando {rate_info['wait_seconds']}s..."
                                analysis.rate_limit_wait_until = datetime.utcnow() + timedelta(seconds=rate_info["wait_seconds"])
                                db.commit()
                                
                                logger.warning(f"Rate limit hit on chunk {i}, waiting {rate_info['wait_seconds']}s")
                                time.sleep(rate_info["wait_seconds"])
                                
                                analysis.pause_reason = None
                                analysis.rate_limit_wait_until = None
                                db.commit()
                            else:
                                chunk_record.error_code = "UNKNOWN"
                                db.commit()
                                
                                logger.error(f"Error processing chunk {i} (attempt {retry_count}/{max_retries}): {e}")
                                
                                if retry_count < max_retries:
                                    time.sleep(RETRY_DELAY)
                    
                    if not success:
                        chunk_record.status = "failed"
                        chunk_record.error_message = str(last_error)[:500]
                        analysis.failed_chunks = str(int(analysis.failed_chunks or "0") + 1)
                        db.commit()
                        
                        rate_info = extract_rate_limit_info(str(last_error))
                        if rate_info["is_rate_limit"]:
                            analysis.is_paused = True
                            analysis.pause_reason = f"Pausado: rate limit após {max_retries} tentativas. Considere usar GPT-3.5-turbo."
                            analysis.status = "paused"
                            db.commit()
                            return {
                                "status": "paused",
                                "reason": "rate_limit",
                                "analysis_id": str(analysis.id),
                                "failed_chunk": i,
                                "suggestion": "Use gpt-3.5-turbo for faster processing"
                            }
                
                failed_count = int(analysis.failed_chunks or "0")
                if failed_count > 0:
                    completed_count = int(analysis.completed_chunks or "0")
                    if completed_count > 0:
                        analysis.status = "partial"
                        analysis.pause_reason = f"{failed_count} chunks falharam. Pode continuar com outro modelo."
                        db.commit()
                        return {
                            "status": "partial",
                            "analysis_id": str(analysis.id),
                            "completed": completed_count,
                            "failed": failed_count
                        }
                
                consolidate_pii_analysis.delay(str(analysis.id))
                
                return {"status": "chunks_completed", "analysis_id": str(analysis.id)}
                
            except Exception as e:
                logger.error(f"Error in process_pii_analysis_chunked: {e}")
                if analysis:
                    analysis.status = "failed"
                    analysis.llm_response = f"Erro: {str(e)}"
                    db.commit()
                raise
            finally:
                db.close()
        
        
        @celery_app.task(bind=True, max_retries=MAX_RETRIES)
        def consolidate_pii_analysis(self, analysis_id: str):
            """
            Consolida os resultados dos chunks em uma análise final.
            """
            db = SessionLocal()
            
            try:
                analysis = db.query(PIIAnalysis).filter(PIIAnalysis.id == analysis_id).first()
                if not analysis:
                    logger.error(f"Analysis {analysis_id} not found")
                    return {"error": "Analysis not found"}
                
                from sqlalchemy import cast, Integer
                chunks = db.query(PIIAnalysisChunk).filter(
                    PIIAnalysisChunk.analysis_id == analysis.id,
                    PIIAnalysisChunk.status == "completed"
                ).order_by(cast(PIIAnalysisChunk.chunk_index, Integer)).all()
                
                if not chunks:
                    analysis.status = "failed"
                    analysis.llm_response = "Nenhum chunk processado com sucesso"
                    db.commit()
                    return {"error": "No completed chunks"}
                
                chunk_results = "\n\n---\n\n".join([
                    f"Parte {c.chunk_index}: {c.llm_response}" for c in chunks
                ])
                
                task_type = analysis.task_type
                consolidate_template = TASK_PROMPTS.get(task_type, {}).get("consolidate", "")
                
                consolidate_prompt = consolidate_template.format(chunk_results=chunk_results)
                
                llm_service = get_llm_service()
                model = analysis.llm_model or "gpt-4-turbo"
                
                try:
                    final_response = run_async(llm_service.analyze(
                        prompt=consolidate_prompt,
                        model=model,
                        temperature=0.7,
                        max_tokens=2000
                    ))
                    
                    analysis.consolidated_response = final_response
                    analysis.llm_response = final_response
                    analysis.status = "completed"
                    db.commit()
                    
                    return {"status": "completed", "analysis_id": str(analysis.id)}
                    
                except Exception as e:
                    logger.error(f"Error consolidating analysis: {e}")
                    analysis.status = "failed"
                    analysis.llm_response = f"Erro ao consolidar: {str(e)}"
                    db.commit()
                    raise
                    
            finally:
                db.close()
                
        logger.info("✅ PII Celery tasks registered successfully")
        
except Exception as e:
    logger.warning(f"⚠️ Could not register PII Celery tasks: {e}")


def process_pii_analysis_sync(analysis_id: str, db=None) -> Dict:
    """
    Versão síncrona do processamento de análise PII em chunks.
    Usado quando Celery não está disponível.
    """
    close_db = False
    if db is None:
        db = SessionLocal()
        close_db = True
    
    try:
        analysis = db.query(PIIAnalysis).filter(PIIAnalysis.id == analysis_id).first()
        if not analysis:
            return {"error": "Analysis not found"}
        
        job = db.query(PIIProcessingJob).filter(PIIProcessingJob.id == analysis.job_id).first()
        if not job:
            return {"error": "Job not found"}
        
        chat_text = job.masked_chat_text or ""
        chunks = create_chunks(chat_text)
        total_chunks = len(chunks)
        
        analysis.is_chunked = True
        analysis.total_chunks = str(total_chunks)
        analysis.completed_chunks = "0"
        analysis.status = "processing"
        db.commit()
        
        for chunk_data in chunks:
            chunk = PIIAnalysisChunk(
                analysis_id=analysis.id,
                chunk_index=str(chunk_data["index"]),
                total_chunks=str(total_chunks),
                start_char=str(chunk_data["start"]),
                end_char=str(chunk_data["end"]),
                status="pending"
            )
            db.add(chunk)
        db.commit()
        
        llm_service = get_llm_service()
        model = analysis.llm_model or "gpt-4-turbo"
        task_type = analysis.task_type
        
        from sqlalchemy import cast, Integer
        chunk_records = db.query(PIIAnalysisChunk).filter(
            PIIAnalysisChunk.analysis_id == analysis.id
        ).order_by(cast(PIIAnalysisChunk.chunk_index, Integer)).all()
        
        for i, chunk_record in enumerate(chunk_records):
            chunk_text = chat_text[int(chunk_record.start_char):int(chunk_record.end_char)]
            
            prompt_template = TASK_PROMPTS.get(task_type, {}).get("chunk", "")
            chunk_prompt = prompt_template.format(
                chunk_num=i + 1,
                total_chunks=total_chunks
            )
            
            full_prompt = f"""{chunk_prompt}

Conversa (Parte {i + 1} de {total_chunks}):
{chunk_text}

Resposta:"""
            
            chunk_record.prompt = full_prompt
            chunk_record.status = "processing"
            db.commit()
            
            retry_count = 0
            success = False
            last_error = None
            
            while retry_count < MAX_RETRIES and not success:
                try:
                    response = run_async(llm_service.analyze(
                        prompt=full_prompt,
                        model=model,
                        temperature=0.7,
                        max_tokens=1000
                    ))
                    
                    chunk_record.llm_response = response
                    chunk_record.status = "completed"
                    chunk_record.retry_count = str(retry_count)
                    
                    analysis.completed_chunks = str(int(analysis.completed_chunks or "0") + 1)
                    db.commit()
                    success = True
                    
                    if i < len(chunk_records) - 1:
                        time.sleep(2)
                        
                except Exception as e:
                    retry_count += 1
                    last_error = e
                    logger.error(f"Error processing chunk {i} (attempt {retry_count}/{MAX_RETRIES}): {e}")
                    chunk_record.retry_count = str(retry_count)
                    db.commit()
                    
                    if retry_count < MAX_RETRIES:
                        time.sleep(RETRY_DELAY)
            
            if not success:
                chunk_record.status = "failed"
                chunk_record.error_message = str(last_error)
                db.commit()
        
        completed_chunks = db.query(PIIAnalysisChunk).filter(
            PIIAnalysisChunk.analysis_id == analysis.id,
            PIIAnalysisChunk.status == "completed"
        ).order_by(cast(PIIAnalysisChunk.chunk_index, Integer)).all()
        
        if not completed_chunks:
            analysis.status = "failed"
            analysis.llm_response = "Nenhum chunk processado com sucesso"
            db.commit()
            return {"error": "No completed chunks"}
        
        chunk_results = "\n\n---\n\n".join([
            f"Parte {c.chunk_index}: {c.llm_response}" for c in completed_chunks
        ])
        
        consolidate_template = TASK_PROMPTS.get(task_type, {}).get("consolidate", "")
        consolidate_prompt = consolidate_template.format(chunk_results=chunk_results)
        
        try:
            final_response = run_async(llm_service.analyze(
                prompt=consolidate_prompt,
                model=model,
                temperature=0.7,
                max_tokens=2000
            ))
            
            analysis.consolidated_response = final_response
            analysis.llm_response = final_response
            analysis.status = "completed"
            db.commit()
            
            return {"status": "completed", "analysis_id": str(analysis.id)}
            
        except Exception as e:
            logger.error(f"Error consolidating analysis: {e}")
            analysis.status = "failed"
            analysis.llm_response = f"Erro ao consolidar: {str(e)}"
            db.commit()
            return {"error": str(e)}
            
    finally:
        if close_db:
            db.close()
