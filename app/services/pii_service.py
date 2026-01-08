"""
Serviço de Detecção e Masking de PII
Arquivo: app/services/pii_service.py
"""

import re
import hashlib
import math
from typing import List, Dict, Tuple, Optional
from sqlalchemy.orm import Session
from app.models.pii import PIIProcessingJob, PIIMessage, PIIPattern, PIIVault
from app.models.user import User
from app.services.presidio_service import PresidioService, deanonymize_with_mapping
import uuid


DEFAULT_PII_PATTERNS = [
    {
        "name": "CPF",
        "regex": r"\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{11}\b",
        "pii_type": "document",
        "strategy": "redaction",
        "description": "Número de CPF brasileiro"
    },
    {
        "name": "Email",
        "regex": r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b",
        "pii_type": "contact",
        "strategy": "redaction",
        "description": "Endereço de email"
    },
    {
        "name": "Telefone",
        "regex": r"\b(?:\+55\s?)?(?:\(?\d{2}\)?[\s-]?)?\d{4,5}[\s-]?\d{4}\b",
        "pii_type": "contact",
        "strategy": "redaction",
        "description": "Número de telefone"
    },
    {
        "name": "Cartão de Crédito",
        "regex": r"\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b",
        "pii_type": "financial",
        "strategy": "redaction",
        "description": "Número de cartão de crédito"
    },
    {
        "name": "URL",
        "regex": r"https?://[^\s]+",
        "pii_type": "online",
        "strategy": "hash",
        "description": "URL/Link"
    },
    {
        "name": "IP",
        "regex": r"\b(?:\d{1,3}\.){3}\d{1,3}\b",
        "pii_type": "online",
        "strategy": "hash",
        "description": "Endereço IP"
    },
    {
        "name": "Data de Nascimento",
        "regex": r"\b(?:0?[1-9]|[12]\d|3[01])[/-](?:0?[1-9]|1[0-2])[/-](?:19|20)?\d{2}\b",
        "pii_type": "personal",
        "strategy": "redaction",
        "description": "Data de nascimento"
    },
    {
        "name": "Conta Bancária",
        "regex": r"\b(?:conta|agência|ag\.?)[\s:]*(?:\d{4,8}|\d{1,4}[\s-]?\d{1,4}[\s-]?\d{1,4})\b",
        "pii_type": "financial",
        "strategy": "redaction",
        "description": "Número de conta bancária"
    },
]


class PIIDetector:
    """Detecta PIIs em textos usando padrões regex"""

    def __init__(self, patterns: List[Dict] = None):
        self.patterns = patterns or DEFAULT_PII_PATTERNS

    def detect(self, text: str) -> List[Dict]:
        findings = []
        for pattern in self.patterns:
            try:
                matches = re.finditer(pattern["regex"], text, re.IGNORECASE)
                for match in matches:
                    findings.append({
                        "type": pattern["name"],
                        "pii_type": pattern["pii_type"],
                        "value": match.group(),
                        "start": match.start(),
                        "end": match.end(),
                        "strategy": pattern["strategy"],
                        "description": pattern["description"]
                    })
            except re.error:
                continue
        return findings


class PIIMasker:
    """Aplica técnicas de masking para PII"""

    def __init__(self):
        self.mask_cache = {}

    @staticmethod
    def mask_redaction(value: str, show_chars: int = 3) -> str:
        if len(value) <= show_chars * 2:
            return "*" * len(value)
        first = value[:show_chars]
        last = value[-show_chars:]
        middle = "*" * (len(value) - show_chars * 2)
        return f"{first}{middle}{last}"

    def mask_hash(self, value: str) -> str:
        if value in self.mask_cache:
            return self.mask_cache[value]
        hash_obj = hashlib.sha256(value.encode())
        masked = f"[HASH:{hash_obj.hexdigest()[:8]}]"
        self.mask_cache[value] = masked
        return masked

    @staticmethod
    def mask_substitution(value: str, replacement: str = "[REDACTED]") -> str:
        return replacement

    def apply_mask(self, value: str, strategy: str) -> str:
        if strategy == "hash":
            return self.mask_hash(value)
        elif strategy == "substitution":
            return self.mask_substitution(value)
        else:
            return self.mask_redaction(value)


class WhatsAppChatProcessor:
    """Processa exportações de chat do WhatsApp"""

    WHATSAPP_MESSAGE_PATTERN = re.compile(
        r'^\[?(\d{1,2}/\d{1,2}/\d{2,4}[,\s]+\d{1,2}:\d{2}(?::\d{2})?(?:\s?[AP]M)?)\]?\s*[-–]\s*([^:]+):\s*(.*)$'
    )

    def __init__(self, detector: PIIDetector = None, masker: PIIMasker = None):
        self.detector = detector or PIIDetector()
        self.masker = masker or PIIMasker()
        self.messages: List[Dict] = []

    def parse_content(self, content: str) -> List[Dict]:
        self.messages = []
        lines = content.split('\n')
        current_message = None

        for line in lines:
            line = line.rstrip('\n')
            match = self.WHATSAPP_MESSAGE_PATTERN.match(line)

            if match:
                if current_message:
                    self.messages.append(current_message)

                timestamp, sender, message_text = match.groups()
                current_message = {
                    "timestamp": timestamp,
                    "sender": sender,
                    "original_content": message_text,
                    "masked_content": message_text,
                    "pii_found": []
                }
            elif current_message:
                current_message["original_content"] += "\n" + line
                current_message["masked_content"] += "\n" + line

        if current_message:
            self.messages.append(current_message)

        return self.messages

    def detect_and_mask(self) -> None:
        for message in self.messages:
            pii_findings = self.detector.detect(message["original_content"])
            message["pii_found"] = pii_findings
            message["has_pii"] = len(pii_findings) > 0

            masked_content = message["original_content"]
            for finding in sorted(pii_findings, key=lambda x: x['start'], reverse=True):
                masked_value = self.masker.apply_mask(finding['value'], finding['strategy'])
                masked_content = masked_content.replace(finding['value'], masked_value)

            message["masked_content"] = masked_content

    def get_statistics(self) -> Dict:
        total_messages = len(self.messages)
        messages_with_pii = sum(1 for m in self.messages if m.get("pii_found"))
        total_pii_found = sum(len(m.get("pii_found", [])) for m in self.messages)

        pii_types = {}
        for message in self.messages:
            for finding in message.get("pii_found", []):
                pii_type = finding["type"]
                pii_types[pii_type] = pii_types.get(pii_type, 0) + 1

        return {
            "total_messages": total_messages,
            "messages_with_pii": messages_with_pii,
            "total_pii_found": total_pii_found,
            "pii_types": pii_types
        }


class PIIService:
    """Serviço principal de PII"""

    @staticmethod
    def process_and_save_chat(
        content: str,
        filename: str,
        db: Session,
        current_user: User,
        organization_id
    ) -> Tuple[PIIProcessingJob, List[PIIMessage]]:
        processor = WhatsAppChatProcessor()
        processor.parse_content(content)
        processor.detect_and_mask()

        stats = processor.get_statistics()

        masked_chat_lines = []
        for msg in processor.messages:
            line = f"[{msg['timestamp']}] {msg['sender']}: {msg['masked_content']}"
            masked_chat_lines.append(line)
        masked_chat_text = "\n".join(masked_chat_lines)

        file_hash = hashlib.md5(content.encode()).hexdigest()
        
        import math
        
        original_chars = len(content)
        masked_chars = len(masked_chat_text)
        
        if original_chars > 0 and masked_chars < original_chars:
            compression_ratio = round((1 - masked_chars / original_chars) * 100, 2)
        else:
            compression_ratio = 0
        
        CHUNK_SIZE = 60000
        CHUNK_OVERLAP = 30000
        
        if masked_chars <= CHUNK_SIZE:
            chunk_count = 1
        else:
            chunk_count = 1 + math.ceil((masked_chars - CHUNK_SIZE) / (CHUNK_SIZE - CHUNK_OVERLAP))
        
        estimated_tokens = masked_chars // 4
        
        job = PIIProcessingJob(
            id=uuid.uuid4(),
            organization_id=organization_id,
            created_by=current_user.id,
            original_filename=filename,
            file_hash=file_hash,
            total_messages=str(stats['total_messages']),
            messages_with_pii=str(stats['messages_with_pii']),
            total_pii_found=str(stats['total_pii_found']),
            pii_summary=stats['pii_types'],
            original_chat_preview=content[:500] if len(content) > 500 else content,
            masked_chat_text=masked_chat_text,
            original_chars=str(original_chars),
            masked_chars=str(masked_chars),
            compression_ratio=str(compression_ratio),
            chunk_count=str(chunk_count),
            chunk_size=str(CHUNK_SIZE),
            chunk_overlap=str(CHUNK_OVERLAP),
            estimated_tokens=str(estimated_tokens),
            status="completed"
        )

        db.add(job)
        db.flush()

        pii_messages = []
        for idx, msg in enumerate(processor.messages):
            pii_msg = PIIMessage(
                id=uuid.uuid4(),
                job_id=job.id,
                timestamp=msg['timestamp'],
                sender=msg['sender'],
                original_content=msg['original_content'],
                masked_content=msg['masked_content'],
                pii_found=msg['pii_found'],
                has_pii=msg.get('has_pii', False),
                message_index=str(idx)
            )
            db.add(pii_msg)
            pii_messages.append(pii_msg)

        db.commit()

        return job, pii_messages

    @staticmethod
    def get_organization_patterns(db: Session, organization_id) -> List[Dict]:
        patterns = db.query(PIIPattern).filter(
            PIIPattern.organization_id == organization_id,
            PIIPattern.is_active == True
        ).all()

        return [
            {
                "name": p.name,
                "regex": p.regex,
                "pii_type": p.pii_type,
                "strategy": p.masking_strategy,
                "description": p.description
            }
            for p in patterns
        ]

    @staticmethod
    def create_custom_pattern(
        db: Session,
        organization_id,
        name: str,
        regex: str,
        pii_type: str,
        masking_strategy: str,
        description: str = None
    ) -> PIIPattern:
        pattern = PIIPattern(
            id=uuid.uuid4(),
            organization_id=organization_id,
            name=name,
            regex=regex,
            pii_type=pii_type,
            masking_strategy=masking_strategy,
            description=description
        )
        db.add(pattern)
        db.commit()
        return pattern

    @staticmethod
    def process_with_presidio(
        content: str,
        filename: str,
        db: Session,
        current_user: User,
        organization_id,
        mode: str = "tags"
    ) -> Tuple[PIIProcessingJob, List[PIIMessage], PIIVault]:
        """
        Processa arquivo usando Presidio para pseudonimização configurável.
        
        Modos disponíveis:
        - masking: Asteriscos (irreversível)
        - tags: Tags semânticas [PESSOA_1] (recomendado)
        - faker: Dados sintéticos realistas
        """
        presidio = PresidioService(
            mode=mode,
            faker_seed=hash(str(organization_id)) % 1000000
        )
        
        processor = WhatsAppChatProcessor()
        processor.parse_content(content)
        
        messages_anonymized = []
        for msg in processor.messages:
            anonymized_msg = msg.copy()
            anonymized_msg["sender_original"] = msg["sender"]
            anonymized_msg["sender"] = presidio.anonymize(msg["sender"])
            anonymized_msg["content_original"] = msg["original_content"]
            anonymized_msg["masked_content"] = presidio.anonymize(msg["original_content"])
            sender_changed = anonymized_msg["sender_original"] != anonymized_msg["sender"]
            content_changed = anonymized_msg["content_original"] != anonymized_msg["masked_content"]
            anonymized_msg["has_pii"] = sender_changed or content_changed
            messages_anonymized.append(anonymized_msg)
        
        stats = presidio.get_stats()
        
        masked_chat_lines = []
        for msg in messages_anonymized:
            line = f"[{msg['timestamp']}] {msg['sender']}: {msg['masked_content']}"
            masked_chat_lines.append(line)
        masked_chat_text = "\n".join(masked_chat_lines)
        
        file_hash = hashlib.md5(content.encode()).hexdigest()
        
        original_chars = len(content)
        masked_chars = len(masked_chat_text)
        
        if original_chars > 0 and masked_chars < original_chars:
            compression_ratio = round((1 - masked_chars / original_chars) * 100, 2)
        else:
            compression_ratio = 0
        
        CHUNK_SIZE = 60000
        CHUNK_OVERLAP = 30000
        
        if masked_chars <= CHUNK_SIZE:
            chunk_count = 1
        else:
            chunk_count = 1 + math.ceil((masked_chars - CHUNK_SIZE) / (CHUNK_SIZE - CHUNK_OVERLAP))
        
        estimated_tokens = masked_chars // 4
        
        messages_with_pii = sum(1 for m in messages_anonymized if m.get("has_pii"))
        
        job = PIIProcessingJob(
            id=uuid.uuid4(),
            organization_id=organization_id,
            created_by=current_user.id,
            original_filename=filename,
            file_hash=file_hash,
            total_messages=str(len(messages_anonymized)),
            messages_with_pii=str(messages_with_pii),
            total_pii_found=str(stats["total_entities_mapped"]),
            pii_summary={et["type"]: et["count"] for et in stats["entity_types"]},
            original_chat_preview=content[:500] if len(content) > 500 else content,
            masked_chat_text=masked_chat_text,
            original_chars=str(original_chars),
            masked_chars=str(masked_chars),
            compression_ratio=str(compression_ratio),
            chunk_count=str(chunk_count),
            chunk_size=str(CHUNK_SIZE),
            chunk_overlap=str(CHUNK_OVERLAP),
            estimated_tokens=str(estimated_tokens),
            pseudonymization_mode=mode,
            status="completed"
        )
        
        db.add(job)
        db.flush()
        
        vault = None
        if mode != "masking":
            vault = PIIVault(
                id=uuid.uuid4(),
                job_id=job.id,
                organization_id=organization_id,
                deanonymizer_mapping=presidio.get_deanonymizer_mapping(),
                anonymizer_mapping=presidio.get_anonymizer_mapping(),
                faker_seed=str(presidio.faker_seed),
                processing_method=f"presidio-{mode}",
                total_entities_mapped=str(stats["total_entities_mapped"]),
                entity_types=stats["entity_types"]
            )
            db.add(vault)
        
        pii_messages = []
        for idx, msg in enumerate(messages_anonymized):
            pii_msg = PIIMessage(
                id=uuid.uuid4(),
                job_id=job.id,
                timestamp=msg['timestamp'],
                sender=msg['sender'],
                original_content=msg['content_original'],
                masked_content=msg['masked_content'],
                pii_found=[],
                has_pii=msg.get('has_pii', False),
                message_index=str(idx)
            )
            db.add(pii_msg)
            pii_messages.append(pii_msg)
        
        db.commit()
        
        return job, pii_messages, vault

    @staticmethod
    def deanonymize_text(text: str, job_id, db: Session) -> Optional[str]:
        """
        Re-hidrata texto com dados originais usando vault do job.
        """
        vault = db.query(PIIVault).filter(PIIVault.job_id == job_id).first()
        if not vault:
            return None
        
        return deanonymize_with_mapping(text, vault.deanonymizer_mapping)

    @staticmethod
    def get_vault_info(job_id, db: Session) -> Optional[Dict]:
        """
        Retorna informações do vault sem dados sensíveis.
        """
        vault = db.query(PIIVault).filter(PIIVault.job_id == job_id).first()
        if not vault:
            return None
        
        return {
            "id": str(vault.id),
            "job_id": str(vault.job_id),
            "processing_method": vault.processing_method,
            "total_entities_mapped": vault.total_entities_mapped,
            "entity_types": vault.entity_types,
            "created_at": vault.created_at.isoformat() if vault.created_at else None
        }
