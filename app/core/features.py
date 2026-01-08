from typing import List, Dict, Optional

AVAILABLE_FEATURES = [
    {"key": "courseAccess", "name": "Curso", "description": "Acesso aos materiais do curso"},
    {"key": "courseManagement", "name": "Gerenciar Materiais", "description": "Criar, editar e excluir materiais do curso"},
    {"key": "flowiseAccess", "name": "Flowise", "description": "Acesso ao assistente Flowise AI"},
    {"key": "gammaAccess", "name": "Gamma", "description": "Acesso ao Gamma para criação de apresentações"},
    {"key": "settingsAccess", "name": "Configurações", "description": "Acesso às configurações do sistema"},
    {"key": "healthCheckAccess", "name": "Status", "description": "Acesso ao status dos serviços"},
    {"key": "piiAccess", "name": "PII Masking", "description": "Acesso ao módulo de mascaramento de dados pessoais"},
]

def get_feature_keys() -> List[str]:
    """Retorna a lista de chaves de features disponíveis"""
    return [f["key"] for f in AVAILABLE_FEATURES]

def get_default_features() -> Dict[str, bool]:
    """Retorna o dicionário padrão de features com todos os valores False"""
    return {f["key"]: False for f in AVAILABLE_FEATURES}

def get_all_features_enabled() -> Dict[str, bool]:
    """Retorna o dicionário de features com todos os valores True (para super admin)"""
    return {f["key"]: True for f in AVAILABLE_FEATURES}

def normalize_features(features: Optional[Dict[str, bool]]) -> Dict[str, bool]:
    """
    Normaliza um dicionário de features garantindo que todas as chaves
    de AVAILABLE_FEATURES existam com valor False por padrão.
    """
    defaults = get_default_features()
    if features:
        for key in get_feature_keys():
            if key in features:
                defaults[key] = bool(features[key])
    return defaults
