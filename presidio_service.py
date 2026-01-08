"""
Serviço de Pseudonimização Reversível usando Microsoft Presidio
Arquivo: app/services/presidio_service.py
Suporta 3 modos: masking (asteriscos), tags (semânticas), faker (dados sintéticos)
"""
import json
import logging
import re
from typing import Dict, List, Optional, Tuple, Any
from faker import Faker

logger = logging.getLogger(__name__)

try:
    from presidio_analyzer import AnalyzerEngine, PatternRecognizer, Pattern
    from presidio_anonymizer import AnonymizerEngine
    from presidio_anonymizer.entities import OperatorConfig
    PRESIDIO_AVAILABLE = True
except ImportError:
    PRESIDIO_AVAILABLE = False
    logger.warning("Presidio não disponível. Usando fallback.")


TYPE_NAMES_PT = {
    "PERSON": "PESSOA",
    "PHONE_NUMBER": "TELEFONE",
    "EMAIL_ADDRESS": "EMAIL",
    "LOCATION": "LOCAL",
    "ORGANIZATION": "EMPRESA",
    "DATE_TIME": "DATA",
    "URL": "LINK",
    "BR_CPF": "CPF",
    "BR_CNPJ": "CNPJ",
    "CREDIT_CARD": "CARTAO",
    "IP_ADDRESS": "IP",
    "NRP": "REGISTRO",
    "OTHER": "DADO",
}

PORTUGUESE_ALLOW_LIST = [
    "Olá", "Oi", "Ola", "Bom", "Boa", "Obrigado", "Obrigada", "Tchau", "Bye",
    "Sim", "Não", "Nao", "Ok", "OK", "Tudo", "Bem", "Legal", "Certo", "Claro",
    "Pode", "Vamos", "Bora", "Valeu", "Top", "Show", "Beleza", "Blz",
    "Eu", "Tu", "Ele", "Ela", "Nós", "Vocês", "Eles", "Elas",
    "Quem", "Qual", "Quanto", "Quantos", "Quantas", "Como", "Onde", "Quando",
    "Galera", "Pessoal", "Gente", "Turma", "Time", "Equipe",
    "Admin", "Adm", "Moderador", "Mod",
    "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo",
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
    "Bom dia", "Boa tarde", "Boa noite", "Até", "Abraço", "Abraços",
    "IA", "AI", "API", "Bot", "App", "Web", "Cloud", "Data", "Tech",
    "Grupo", "Chat", "Mensagem", "Aqui", "Agora", "Hoje", "Ontem", "Amanhã",
]


class FakerOperators:
    """Operadores Faker para gerar dados fake realistas"""
    
    def __init__(self, locale: str = "pt_BR", seed: Optional[int] = None):
        self.fake = Faker(locale)
        if seed:
            Faker.seed(seed)
            self.fake = Faker(locale)
    
    def get_fake_value(self, entity_type: str, original_value: str) -> str:
        """Gera valor fake baseado no tipo de entidade"""
        generators = {
            "PERSON": lambda: self.fake.name(),
            "PHONE_NUMBER": lambda: self.fake.phone_number(),
            "EMAIL_ADDRESS": lambda: self.fake.email(),
            "LOCATION": lambda: self.fake.city(),
            "BR_CPF": lambda: self.fake.cpf(),
            "BR_CNPJ": lambda: self.fake.cnpj(),
            "CREDIT_CARD": lambda: self.fake.credit_card_number(),
            "DATE_TIME": lambda: self.fake.date(),
            "URL": lambda: f"https://{self.fake.domain_name()}",
            "IP_ADDRESS": lambda: self.fake.ipv4(),
            "ORGANIZATION": lambda: self.fake.company(),
        }
        
        generator = generators.get(entity_type)
        if generator:
            return generator()
        return f"[{entity_type}_{self.fake.random_int(1000, 9999)}]"


class PresidioService:
    """Serviço de pseudonimização com múltiplas técnicas"""
    
    def __init__(
        self, 
        mode: str = "tags", 
        faker_seed: Optional[int] = None, 
        locale: str = "pt_BR"
    ):
        self.mode = mode
        self.faker_seed = faker_seed or self._generate_seed()
        self.locale = locale
        self._analyzer = None
        self._anonymizer = None
        self._faker_ops = FakerOperators(locale=locale, seed=self.faker_seed)
        
        self._tag_counters: Dict[str, int] = {}
        self._deanonymizer_mapping: Dict[str, Dict[str, str]] = {}
        self._anonymizer_mapping: Dict[str, Dict[str, str]] = {}
        
        if PRESIDIO_AVAILABLE:
            self._setup_engines()
        else:
            logger.warning("Presidio não disponível - usando processamento regex básico")
    
    def reset_counters(self):
        """Resetar contadores para novo job"""
        self._tag_counters = {}
        self._deanonymizer_mapping = {}
        self._anonymizer_mapping = {}
    
    def _generate_seed(self) -> int:
        """Gera seed baseado em timestamp para consistência por sessão"""
        import time
        return int(time.time()) % 1000000
    
    def _setup_engines(self):
        """Configura os engines do Presidio"""
        try:
            from presidio_analyzer.nlp_engine import NlpEngineProvider
            
            nlp_configuration = {
                "nlp_engine_name": "spacy",
                "models": [{"lang_code": "pt", "model_name": "pt_core_news_sm"}]
            }
            nlp_engine = NlpEngineProvider(nlp_configuration=nlp_configuration).create_engine()
            
            self._analyzer = AnalyzerEngine(
                nlp_engine=nlp_engine,
                supported_languages=["pt"]
            )
            self._anonymizer = AnonymizerEngine()
            self._add_brazilian_recognizers()
            logger.info(f"Presidio engines inicializados (modo: {self.mode})")
        except Exception as e:
            logger.error(f"Erro ao inicializar Presidio: {e}")
            self._analyzer = None
    
    def _add_brazilian_recognizers(self):
        """Adiciona reconhecedores para padrões brasileiros"""
        if not self._analyzer:
            return
        
        cpf_pattern = Pattern(
            name="cpf_pattern",
            regex=r"\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b",
            score=0.9
        )
        cpf_recognizer = PatternRecognizer(
            supported_entity="BR_CPF",
            patterns=[cpf_pattern],
            supported_language="pt"
        )
        
        cnpj_pattern = Pattern(
            name="cnpj_pattern",
            regex=r"\b\d{2}\.?\d{3}\.?\d{3}/?\d{4}-?\d{2}\b",
            score=0.9
        )
        cnpj_recognizer = PatternRecognizer(
            supported_entity="BR_CNPJ",
            patterns=[cnpj_pattern],
            supported_language="pt"
        )
        
        br_phone_pattern = Pattern(
            name="br_phone_pattern",
            regex=r"(\+55\s?)?\(?\d{2}\)?\s?\d{4,5}-?\d{4}",
            score=0.85
        )
        br_phone_recognizer = PatternRecognizer(
            supported_entity="PHONE_NUMBER",
            patterns=[br_phone_pattern],
            supported_language="pt"
        )
        
        self._analyzer.registry.add_recognizer(cpf_recognizer)
        self._analyzer.registry.add_recognizer(cnpj_recognizer)
        self._analyzer.registry.add_recognizer(br_phone_recognizer)
    
    def _get_next_tag(self, entity_type: str) -> str:
        """Gera próxima tag sequencial: [PESSOA_1], [PESSOA_2], etc."""
        if entity_type not in self._tag_counters:
            self._tag_counters[entity_type] = 0
        self._tag_counters[entity_type] += 1
        
        type_name = TYPE_NAMES_PT.get(entity_type, entity_type)
        return f"[{type_name}_{self._tag_counters[entity_type]}]"
    
    def _apply_masking(self, original_value: str, entity_type: str) -> str:
        """Aplica mascaramento com asteriscos"""
        length = len(original_value)
        
        if entity_type == "EMAIL_ADDRESS":
            parts = original_value.split("@")
            if len(parts) == 2:
                masked_local = parts[0][:2] + "*" * min(8, len(parts[0]) - 2)
                return f"{masked_local}@*****.***"
            return "*" * min(15, length)
        
        if entity_type == "PHONE_NUMBER":
            digits = re.sub(r'\D', '', original_value)
            if len(digits) >= 4:
                return digits[:2] + "*" * (len(digits) - 4) + digits[-2:]
            return "*" * length
        
        if entity_type in ["BR_CPF", "BR_CNPJ"]:
            digits = re.sub(r'\D', '', original_value)
            return digits[:3] + "*" * (len(digits) - 5) + digits[-2:]
        
        if entity_type == "PERSON":
            words = original_value.split()
            masked_words = []
            for word in words:
                if len(word) > 2:
                    masked_words.append(word[:2] + "*" * (len(word) - 2))
                else:
                    masked_words.append("**")
            return " ".join(masked_words)
        
        chars_to_show = min(3, length // 3)
        return original_value[:chars_to_show] + "*" * (length - chars_to_show)
    
    def _fallback_detect_pii(self, text: str) -> List[Dict]:
        """Detecção de PII via regex (fallback sem Presidio)"""
        patterns = [
            (r"\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b", "BR_CPF"),
            (r"\b\d{2}\.?\d{3}\.?\d{3}/?\d{4}-?\d{2}\b", "BR_CNPJ"),
            (r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}", "EMAIL_ADDRESS"),
            (r"(\+55\s?)?\(?\d{2}\)?\s?\d{4,5}-?\d{4}", "PHONE_NUMBER"),
            (r"\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b", "CREDIT_CARD"),
            (r"https?://[^\s]+", "URL"),
            (r"\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b", "IP_ADDRESS"),
        ]
        
        results = []
        for pattern, entity_type in patterns:
            for match in re.finditer(pattern, text):
                results.append({
                    "entity_type": entity_type,
                    "start": match.start(),
                    "end": match.end(),
                    "text": match.group()
                })
        
        return sorted(results, key=lambda x: x["start"], reverse=True)
    
    def _is_in_allow_list(self, value: str) -> bool:
        """Verifica se valor está na lista de palavras permitidas (case-insensitive)"""
        value_lower = value.lower().strip()
        for allowed in PORTUGUESE_ALLOW_LIST:
            if value_lower == allowed.lower():
                return True
        return False
    
    def anonymize(self, text: str, language: str = "pt") -> str:
        """
        Pseudonimiza o texto usando o modo configurado.
        Ignora palavras da AllowList para evitar falsos positivos.
        """
        if not text:
            return text
        
        detected_entities = []
        
        if self._analyzer:
            try:
                results = self._analyzer.analyze(text=text, language=language[:2])
                for result in results:
                    entity_text = text[result.start:result.end]
                    if self._is_in_allow_list(entity_text):
                        continue
                    detected_entities.append({
                        "entity_type": result.entity_type,
                        "start": result.start,
                        "end": result.end,
                        "text": entity_text
                    })
                detected_entities.sort(key=lambda x: x["start"], reverse=True)
            except Exception as e:
                logger.warning(f"Erro no Presidio analyzer, usando fallback: {e}")
                detected_entities = self._fallback_detect_pii(text)
        else:
            detected_entities = self._fallback_detect_pii(text)
        
        anonymized_text = text
        for entity in detected_entities:
            original_value = entity["text"]
            entity_type = entity["entity_type"]
            
            if entity_type not in self._anonymizer_mapping:
                self._anonymizer_mapping[entity_type] = {}
                self._deanonymizer_mapping[entity_type] = {}
            
            if original_value in self._anonymizer_mapping[entity_type]:
                replacement = self._anonymizer_mapping[entity_type][original_value]
            else:
                if self.mode == "masking":
                    replacement = self._apply_masking(original_value, entity_type)
                elif self.mode == "tags":
                    replacement = self._get_next_tag(entity_type)
                    self._deanonymizer_mapping[entity_type][replacement] = original_value
                else:
                    replacement = self._faker_ops.get_fake_value(entity_type, original_value)
                    self._deanonymizer_mapping[entity_type][replacement] = original_value
                
                self._anonymizer_mapping[entity_type][original_value] = replacement
            
            anonymized_text = (
                anonymized_text[:entity["start"]] + 
                replacement + 
                anonymized_text[entity["end"]:]
            )
        
        return anonymized_text
    
    def deanonymize(self, text: str) -> str:
        """
        Recupera os dados originais no texto (não funciona para masking).
        """
        if not text or self.mode == "masking":
            return text
        
        result = text
        for entity_type, mapping in self._deanonymizer_mapping.items():
            for fake_value, original_value in mapping.items():
                result = result.replace(fake_value, original_value)
        
        return result
    
    def get_deanonymizer_mapping(self) -> Dict:
        """Retorna o mapeamento para deanonimização."""
        return dict(self._deanonymizer_mapping)
    
    def get_anonymizer_mapping(self) -> Dict:
        """Retorna o mapeamento para anonimização."""
        return dict(self._anonymizer_mapping)
    
    def load_mapping(self, deanonymizer_mapping: Dict, anonymizer_mapping: Dict):
        """Carrega mapeamentos existentes"""
        self._deanonymizer_mapping = deanonymizer_mapping or {}
        self._anonymizer_mapping = anonymizer_mapping or {}
    
    def process_whatsapp_chat(
        self, 
        messages: List[Dict], 
        language: str = "pt"
    ) -> Tuple[List[Dict], Dict, Dict]:
        """
        Processa um chat completo do WhatsApp.
        """
        messages_anonymized = []
        
        for msg in messages:
            anonymized_msg = msg.copy()
            
            if msg.get("sender"):
                anonymized_msg["sender_original"] = msg["sender"]
                anonymized_msg["sender"] = self.anonymize(msg["sender"], language)
            
            if msg.get("content"):
                anonymized_msg["content_original"] = msg["content"]
                anonymized_msg["content"] = self.anonymize(msg["content"], language)
            
            messages_anonymized.append(anonymized_msg)
        
        return (
            messages_anonymized,
            self.get_deanonymizer_mapping(),
            self.get_anonymizer_mapping()
        )
    
    def get_stats(self) -> Dict:
        """Retorna estatísticas do processamento"""
        total_entities = 0
        entity_types = []
        
        for entity_type, mapping in self._anonymizer_mapping.items():
            count = len(mapping)
            total_entities += count
            entity_types.append({
                "type": entity_type,
                "count": count
            })
        
        return {
            "total_entities_mapped": total_entities,
            "entity_types": entity_types,
            "faker_seed": self.faker_seed,
            "mode": self.mode
        }
    
    def is_reversible(self) -> bool:
        """Retorna se o modo atual permite re-hidratação"""
        return self.mode != "masking"


_presidio_service_instance: Optional[PresidioService] = None

def get_presidio_service(
    mode: str = "tags",
    faker_seed: Optional[int] = None, 
    reset: bool = False
) -> PresidioService:
    """Retorna instância do serviço. Usa reset=True para nova sessão."""
    global _presidio_service_instance
    if _presidio_service_instance is None or reset or faker_seed is not None:
        _presidio_service_instance = PresidioService(mode=mode, faker_seed=faker_seed)
    return _presidio_service_instance


def deanonymize_with_mapping(text: str, deanonymizer_mapping: Dict) -> str:
    """
    Função utilitária para deanonimizar texto usando mapeamento salvo.
    
    Normaliza para aceitar tags com ou sem colchetes, pois o LLM pode
    remover os colchetes nas suas respostas.
    
    Usa regex com word boundaries para evitar substituições incorretas
    como PESSOA_1 substituindo parte de PESSOA_10.
    
    Exemplo:
    - Vault tem: [PESSOA_1] → João Silva
    - Texto pode ter: [PESSOA_1] ou PESSOA_1
    - Ambos são substituídos corretamente
    """
    if not text or not deanonymizer_mapping:
        return text
    
    all_replacements = []
    for entity_type, mapping in deanonymizer_mapping.items():
        for fake_value, original_value in mapping.items():
            all_replacements.append((fake_value, original_value))
            
            if fake_value.startswith('[') and fake_value.endswith(']'):
                without_brackets = fake_value[1:-1]
                all_replacements.append((without_brackets, original_value))
            else:
                with_brackets = f"[{fake_value}]"
                all_replacements.append((with_brackets, original_value))
    
    all_replacements.sort(key=lambda x: len(x[0]), reverse=True)
    
    result = text
    for fake_value, original_value in all_replacements:
        escaped = re.escape(fake_value)
        pattern = rf'(?<![A-Za-z0-9_]){escaped}(?![A-Za-z0-9_])'
        result = re.sub(pattern, original_value, result)
    
    return result
