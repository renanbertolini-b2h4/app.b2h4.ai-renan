from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


DEFAULT_PROMPT_STYLE = """Corporate background for digital certificate, abstract technology theme. Central focal point: glowing AI digital brain with neural pathways and circuit patterns, positioned prominently in the center. Vibrant cyan (#00BCD4) and dark blue (#1A1F3A) gradients radiating from the central brain. Data flows and neural network connections emanating outward from the brain. Minimalist clean style, symmetrical composition, the AI brain should be the clear centerpiece surrounded by negative space for text overlay. High quality 8k render, professional business aesthetic, futuristic holographic effect on the brain element."""


class InstructorInfo(BaseModel):
    name: str = Field(..., description="Nome do instrutor")
    role: str = Field(default="Instrutor", description="Cargo ou função do instrutor")


class CertificateParams(BaseModel):
    prompt_style: str = Field(
        default=DEFAULT_PROMPT_STYLE,
        description="Prompt de estilo para geração do fundo"
    )
    aspect_ratio: str = Field(default="16:9", description="Proporção da imagem")
    output_format: str = Field(default="png", description="Formato de saída")
    certificate_title: str = Field(
        default="CERTIFICADO DE CONCLUSÃO",
        description="Título do certificado"
    )
    certificate_subtitle: str = Field(
        default="Conferido a",
        description="Subtítulo antes do nome"
    )
    conclusion_message: str = Field(
        default="Pela participação na Imersão de Transformação Digital & IA.",
        description="Mensagem de conclusão"
    )
    event_date: Optional[str] = Field(
        default=None,
        description="Data da imersão/evento (ex: 15 de Dezembro de 2024)"
    )
    primary_color: str = Field(default="#00BCD4", description="Cor primária (ciano)")
    background_color: str = Field(default="#1A1F3A", description="Cor de fundo")
    text_color: str = Field(default="#FFFFFF", description="Cor do texto principal")
    instructors: List[InstructorInfo] = Field(default=[], description="Lista de instrutores")


class CertificateParamsUpdate(BaseModel):
    organization_id: str = Field(..., description="ID da organização")
    prompt_style: Optional[str] = None
    aspect_ratio: Optional[str] = None
    certificate_title: Optional[str] = None
    certificate_subtitle: Optional[str] = None
    conclusion_message: Optional[str] = None
    event_date: Optional[str] = None
    primary_color: Optional[str] = None
    background_color: Optional[str] = None
    text_color: Optional[str] = None


class CertificateParamsResponse(CertificateParams):
    id: str
    organization_id: str
    organization_name: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


class CertificateGenerateRequest(BaseModel):
    participant_name: str = Field(..., description="Nome do participante")
    use_ai_background: bool = Field(
        default=True,
        description="Usar IA para gerar fundo ou usar fundo padrão"
    )


class CertificateGenerateResponse(BaseModel):
    success: bool
    message: str
    certificate_url: Optional[str] = None
    participant_name: str
    generated_at: datetime


class CertificateBatchRequest(BaseModel):
    participant_names: List[str] = Field(..., description="Lista de nomes dos participantes")
    use_ai_background: bool = Field(default=True)


class CertificateBatchResponse(BaseModel):
    success: bool
    message: str
    total_requested: int
    certificates: List[CertificateGenerateResponse]
