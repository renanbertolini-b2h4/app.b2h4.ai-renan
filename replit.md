# Plataforma B2H4 - Imersão C-Level em IA Generativa

## Overview
A Plataforma B2H4 é um sistema B2B multi-tenant projetado para a imersão C-Level em IA Generativa. Ela oferece acesso seguro a materiais de curso, com funcionalidades de multi-tenancy e controle granular de features por tenant. O sistema suporta uma ampla gama de mídias (documentos, fotos, vídeos), um visualizador de PDF embutido, e um robusto sistema de permissões por material. A plataforma integra-se opcionalmente com Flowise AI e possui um sistema de administração completo para super admins, permitindo o gerenciamento de organizações, usuários e recursos.

## User Preferences
- Idioma: Português (BR)
- Sistema multi-tenant com isolamento de dados
- Preferência por código limpo e documentado
- Design: Tema escuro com acentos cyan (#06b6d4)

## System Architecture

### UI/UX Decisions
O frontend utiliza um tema claro com uma sidebar vertical fixa de 200px (dark slate #1e2a3b), e a área de conteúdo principal tem fundo branco. Cartões possuem fundo branco, bordas cinzas e sombras sutis. Badges de status usam cores semânticas (emerald, amber, red) e botões slate-800 são a cor primária. A interface é consistente em todas as páginas, incluindo Materiais, AdminDashboard, AdminOrgs, AdminUsers, Flowise, Settings e HealthCheck.

### Technical Implementations
A plataforma é construída com **Python 3.11** e **FastAPI** para o backend, utilizando **SQLAlchemy ORM** e **PostgreSQL** com Neon. **Redis** é empregado para filas, e **Celery** para processamento assíncrono. A segurança é garantida por **JWT** para autenticação, **Bcrypt** para senhas, e **Fernet** para criptografia de dados sensíveis. O frontend é desenvolvido em **React 18** com **TypeScript**, **Vite** para build, **Tailwind CSS 4**, e componentes **shadcn/ui**. O roteamento é feito com **Wouter**, e **Axios** para requisições HTTP.

### Feature Specifications
- **Multi-tenancy com Feature Flags:** Cada organização possui um campo `features` (JSONB) para controle granular de acesso a funcionalidades como `flowiseAccess`, `gammaAccess` e `courseAccess`.
- **Sistema de Controle de Acesso (RBAC):** Três níveis de acesso: Super Admin (acesso total), Admin de Organização (limitado às features da organização), e Membro (acesso pela interseção de features da organização e do usuário).
- **Gestão Unificada de Mídia:** A tabela `materials` unifica documentos, fotos e vídeos, com `media_type`, `collection` e `extra_data` (JSONB). O armazenamento é reorganizado em `storage/media/{documents,photos,videos,thumbnails}/`.
- **Visualizador de PDF e Markdown:** PDFs são abertos em um modal com `iframe` via endpoint protegido, e arquivos Markdown são renderizados com opção de exportação para PDF via `html2pdf.js`.
- **Permissões em Massa para Materiais:** Permite selecionar múltiplos materiais e aplicar permissões de acesso (adicionar, remover, substituir) para organizações ou usuários, com filtros avançados.
- **Sistema de Administração para Super Admins:** Inclui um Dashboard, gerenciamento de organizações (CRUD e toggle de features), gerenciamento de usuários (CRUD e toggle de super admin), e rotas administrativas protegidas.
- **Segurança:** Arquivos estáticos são movidos para `storage/` e servidos via endpoint autenticado com verificação de permissões. Validações de upload incluem limite de tamanho e tipos de arquivo permitidos.

### System Design Choices
O design adota uma arquitetura de microsserviços lógicos com FastAPI servindo tanto a API REST quanto o frontend React em uma única porta (5000), facilitando a implantação em ambientes como Replit. O uso de JSONB para `features` em modelos de organização e usuário permite flexibilidade e extensibilidade no controle de acesso e funcionalidades. O sistema de cache com Redis e processamento assíncrono com Celery otimiza o desempenho para tarefas em background.

## External Dependencies
- **PostgreSQL com Neon:** Banco de dados relacional para armazenamento persistente.
- **Redis:** Servidor de cache e broker de mensagens para Celery.
- **Celery:** Sistema de fila de tarefas distribuídas para processamento assíncrono.
- **Flowise AI:** Integração opcional para funcionalidades de IA conversacional.
- **Gamma AI:** Integração completa para criação de apresentações com IA, incluindo:
  - Backend: `app/services/gamma_service.py` (cliente HTTP) e `app/api/routes/gamma.py` (endpoints)
  - Frontend: `client/src/pages/Gamma.tsx` com UI completa para geração de apresentações
  - API Client: `gammaAPI` em `client/src/lib/apiClient.ts`
  - Features: geração de apresentações, documentos e páginas web, seleção de temas, configurações avançadas
  - Visualizador embutido: apresentações são exibidas diretamente na plataforma via iframe embed do Gamma
  - Exportação: PDF e PowerPoint via editor do Gamma (API não suporta exportação direta de imagens)
  - Histórico: apresentações recentes com menu de ações (visualizar, exportar, abrir no Gamma)
  - Integração com Materiais: opção de salvar apresentações na biblioteca de materiais da plataforma
- **ElevenLabs Conversational AI:** Widget de IA conversacional presente em todas as páginas.
- **html2pdf.js:** Biblioteca para exportação de conteúdo Markdown para PDF.
- **PII Masking Module:** Módulo completo para mascaramento de dados pessoais em conversas do WhatsApp, incluindo:
  - Backend: `app/models/pii.py` (4 modelos SQLAlchemy: PIIProcessingJob, PIIMessage, PIIAnalysis, PIIPattern)
  - Serviços: `app/services/pii_service.py` (detector, masker, WhatsApp processor) e `app/services/llm_service.py` (OpenAI/Claude)
  - Endpoints: `app/api/routes/pii.py` com 14 rotas protegidas por `piiAccess`
  - Frontend: `client/src/pages/PII.tsx` com upload, histórico e análise com LLM
  - Tipos de PII detectados: CPF, email, telefone, cartão de crédito, URL, IP, data de nascimento, conta bancária
  - Estratégias de masking: redaction (parcial), hash, substituição
  - Tarefas de análise LLM: sentimento, resumo, tópicos, intenção, qualidade, itens de ação (com prompts estruturados e detalhados)
  - Suporte a padrões customizados por organização
  - Feature flag: `piiAccess` no campo features de organizations/users
  - Métricas de processamento: caracteres originais/mascarados, taxa de compressão, contagem de chunks, tokens estimados
  - Chat conversacional: endpoint `/chat` para perguntas sobre análises concluídas usando contexto mascarado
  - Visualização privilegiada: endpoint `/privileged-view` para Super Admins acessarem dados originais com justificativa obrigatória e log de auditoria
  - **Sistema de Progress Tracking (novo):**
    - Endpoint `GET /api/pii/analyses/{id}/progress` para monitoramento em tempo real
    - Barra de progresso com percentual, chunks completados/falhados/pendentes
    - Estimativa de tempo restante baseada na média de tempo por chunk
    - Detecção inteligente de rate limits (HTTP 429) com extração do tempo de espera
    - Pausa automática com countdown quando rate limit é atingido
    - Endpoint `POST /api/pii/analyses/{id}/resume` para retomar análises pausadas/parciais
    - Troca de modelo durante retomada (ex: GPT-4 para GPT-3.5-turbo)
    - Preservação de chunks já processados ao retomar
    - Endpoint `GET /api/pii/analyses/{id}/suggestions` com recomendações automáticas
    - Frontend com polling a cada 3s, painel de progresso detalhado, e botão de retomar
  - **Pseudonimização com 3 Modos via Microsoft Presidio:**
    - Serviço: `app/services/presidio_service.py` com PresidioService configurável por modo
    - **3 Modos de Pseudonimização:**
      - 🔒 **Masking** (masking): Asteriscos irreversíveis - Ex: `Jo** ***va` - Ideal para compartilhar com terceiros
      - 🏷️ **Tags Semânticas** (tags): Placeholders reversíveis - Ex: `[PESSOA_1]` - Recomendado para análise com IA
      - 🎭 **Dados Sintéticos** (faker): Dados fake realistas - Ex: `Carlos Santos` - Mantém texto natural
    - Modelo: `PIIVault` em `app/models/pii.py` armazena mapeamentos bidirecionais (somente tags e faker)
    - Coluna: `pseudonymization_mode` em PIIProcessingJob para rastrear modo usado
    - Endpoint: `POST /api/pii/upload-presidio?mode={masking|tags|faker}` para upload configurável
    - Endpoint: `GET /api/pii/modes` retorna lista de modos disponíveis com descrições
    - Endpoint: `GET /api/pii/analyses/{id}/deanonymize` para restaurar dados originais (tags e faker)
    - Recognizers brasileiros: CPF, CNPJ, telefones BR, CEP, RG
    - Frontend: Seletor visual com 3 cards coloridos mostrando exemplos e recomendações
    - Badges de modo: Histórico mostra badge colorido indicando modo usado (🔒🏷️🎭)
    - Botão "Re-hidratar": Desabilitado para modo masking (irreversível), disponível para tags/faker
    - Vault JSONB: `anonymizer_mapping` (original→pseudônimo) e `deanonymizer_mapping` (pseudônimo→original)
    - API Client: `piiAPI.uploadPresidio(file, mode)` e `piiAPI.deanonymizeAnalysis()` em `apiClient.ts`
- **Deep Analysis Module (Análise Profunda):** Módulo separado para análise detalhada usando técnica Refine Chain, incluindo:
  - Backend: `app/models/deep_analysis.py` (DeepAnalysisJob, DeepAnalysisChunkResult)
  - Serviço: `app/services/deep_analysis_service.py` com pipeline Refine Chain (extração → refinamento → consolidação)
  - Endpoints: `app/api/routes/deep_analysis.py` com streaming SSE para progresso em tempo real
  - Frontend: `client/src/pages/DeepAnalysis.tsx` com UI completa
  - **4 Tipos de Análise:**
    - 🗺️ **Mapa de Tópicos** (topic_map): Identifica tópicos com conexões e threads entre chunks
    - 📊 **Relatório Executivo** (executive): Sumário para C-level com insights e recomendações
    - 👥 **Análise de Stakeholders** (stakeholder): Mapeia participantes, papéis e influência
    - 📅 **Timeline de Decisões** (timeline): Cronologia de decisões e eventos
  - **3 Níveis de Detalhe:** Resumido, Normal, Detalhado
  - Refine Chain: Cada chunk analisado com contexto acumulado dos anteriores para manter conexões
  - Re-hidratação: Usa PIIVault existente para restaurar dados originais (modos tags/faker)
  - Feature flags: `deepAnalysisAccess` ou `piiAccess` para acesso
  - SSE com autenticação via query param para streaming de progresso
  - API Client: `deepAnalysisAPI` em `apiClient.ts`