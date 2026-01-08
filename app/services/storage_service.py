"""
Serviço de armazenamento de arquivos usando Replit Object Storage.
Fornece abstração para upload, download e gerenciamento de arquivos.
"""

import os
import logging
import requests
import tomli
from typing import Optional, Tuple
from io import BytesIO

logger = logging.getLogger(__name__)

STORAGE_AVAILABLE = False
storage_client = None
gcs_client = None
storage_bucket = None
storage_init_error = None

REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106"

def get_bucket_id_from_replit_file() -> Optional[str]:
    """Lê o bucket ID do arquivo .replit"""
    try:
        replit_file = os.path.join(os.getcwd(), ".replit")
        if os.path.exists(replit_file):
            with open(replit_file, "rb") as f:
                config = tomli.load(f)
                bucket_id = config.get("objectStorage", {}).get("defaultBucketID")
                if bucket_id:
                    logger.info(f"Bucket ID encontrado em .replit: {bucket_id}")
                    return bucket_id
    except Exception as e:
        logger.warning(f"Erro ao ler .replit: {e}")
    return None

def init_gcs_storage():
    """Inicializa Google Cloud Storage usando sidecar do Replit"""
    global gcs_client, storage_bucket, STORAGE_AVAILABLE, storage_init_error
    try:
        from google.cloud import storage as gcs
        from google.auth.credentials import Credentials
        
        class ReplitCredentials(Credentials):
            def __init__(self):
                super().__init__()
                self._token_internal = None
                self._expiry = None
            
            def refresh(self, request):
                try:
                    response = requests.get(f"{REPLIT_SIDECAR_ENDPOINT}/credential", timeout=5)
                    if response.ok:
                        data = response.json()
                        self._token_internal = data.get("access_token")
                except Exception as e:
                    logger.warning(f"Erro ao obter token do sidecar: {e}")
            
            @property
            def token(self):
                if not self._token_internal:
                    self.refresh(None)
                return self._token_internal
            
            @token.setter
            def token(self, value):
                self._token_internal = value
            
            @property
            def expiry(self):
                return self._expiry
            
            @expiry.setter
            def expiry(self, value):
                self._expiry = value
            
            @property
            def valid(self):
                return self._token_internal is not None
            
            @property
            def expired(self):
                return False
        
        creds = ReplitCredentials()
        creds.refresh(None)
        
        if not creds.valid:
            storage_init_error = "Não foi possível obter credenciais do sidecar Replit"
            logger.warning(storage_init_error)
            return False
        
        gcs_client = gcs.Client(credentials=creds, project="")
        
        bucket_name = os.environ.get("REPLIT_OBJECT_STORAGE_BUCKET", "")
        if not bucket_name:
            bucket_name = get_bucket_id_from_replit_file()
        
        if bucket_name:
            storage_bucket = gcs_client.bucket(bucket_name)
            STORAGE_AVAILABLE = True
            logger.info(f"GCS Storage inicializado com bucket: {bucket_name}")
            return True
        else:
            storage_init_error = "Bucket não encontrado em env vars ou .replit"
            logger.warning(storage_init_error)
            return False
    except Exception as e:
        storage_init_error = str(e)
        logger.warning(f"Falha ao inicializar GCS: {e}")
        return False

def init_replit_storage():
    """Inicializa usando biblioteca replit-object-storage"""
    global storage_client, STORAGE_AVAILABLE, storage_init_error
    try:
        from replit.object_storage import Client
        storage_client = Client()
        STORAGE_AVAILABLE = True
        logger.info("Object Storage do Replit inicializado com sucesso")
        return True
    except Exception as e:
        storage_init_error = str(e)
        logger.warning(f"Object Storage não disponível: {e}")
        return False

init_replit_storage()
init_gcs_storage()


MEDIA_PREFIXES = {
    "document": "documents/",
    "photo": "photos/",
    "video": "videos/",
    "thumbnail": "thumbnails/"
}

CONTENT_TYPES = {
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    '.mkv': 'video/x-matroska'
}


def is_storage_available() -> bool:
    """Verifica se o Object Storage está disponível"""
    return STORAGE_AVAILABLE and (storage_client is not None or storage_bucket is not None)


def is_gcs_available() -> bool:
    """Verifica se o GCS está disponível (para fallback em produção)"""
    return storage_bucket is not None


def list_all_files(max_retries: int = 3) -> set:
    """
    Lista todos os arquivos no storage.
    Retorna um set para verificação rápida de existência.
    Implementa retry com exponential backoff para rate limits.
    
    Returns:
        set: Conjunto de storage_keys existentes
    """
    import time
    
    if storage_client is not None:
        for attempt in range(max_retries):
            try:
                objects = storage_client.list()
                files = set(obj.name for obj in objects)
                logger.info(f"Listados {len(files)} arquivos do Object Storage")
                return files
            except Exception as e:
                error_str = str(e).lower()
                if "rate limit" in error_str or "too many" in error_str:
                    wait_time = (2 ** attempt) * 1.0
                    logger.warning(f"Rate limit em list_all_files, aguardando {wait_time}s (tentativa {attempt+1}/{max_retries})")
                    time.sleep(wait_time)
                    continue
                logger.warning(f"Erro ao listar arquivos do Replit storage: {e}")
                break
    
    if storage_bucket is not None:
        for attempt in range(max_retries):
            try:
                blobs = storage_bucket.list_blobs()
                files = set(blob.name for blob in blobs)
                logger.info(f"Listados {len(files)} arquivos do GCS")
                return files
            except Exception as e:
                error_str = str(e).lower()
                if "rate limit" in error_str or "429" in error_str:
                    wait_time = (2 ** attempt) * 1.0
                    logger.warning(f"Rate limit em GCS list_all_files, aguardando {wait_time}s")
                    time.sleep(wait_time)
                    continue
                logger.warning(f"Erro ao listar arquivos do GCS: {e}")
                break
    
    local_files = _list_local_files()
    return set(local_files)


def _list_local_files() -> list:
    """Lista arquivos do armazenamento local"""
    files = []
    base_dir = "storage/media"
    
    if not os.path.exists(base_dir):
        return files
    
    for media_type in ["documents", "photos", "videos", "thumbnails"]:
        dir_path = os.path.join(base_dir, media_type)
        if os.path.exists(dir_path):
            for filename in os.listdir(dir_path):
                storage_key = f"{media_type}/{filename}"
                files.append(storage_key)
    
    return files


def get_storage_key(filename: str, media_type: str = "document") -> str:
    """Gera a chave de armazenamento baseada no tipo de mídia"""
    prefix = MEDIA_PREFIXES.get(media_type, "documents/")
    return f"{prefix}{filename}"


def get_content_type(filename: str) -> str:
    """Retorna o content-type baseado na extensão do arquivo"""
    ext = os.path.splitext(filename)[1].lower()
    return CONTENT_TYPES.get(ext, 'application/octet-stream')


last_upload_error: str = None

def upload_file(
    file_content: bytes,
    filename: str,
    media_type: str = "document"
) -> Tuple[bool, str]:
    """
    Faz upload de um arquivo para o Object Storage.
    
    Args:
        file_content: Conteúdo do arquivo em bytes
        filename: Nome do arquivo
        media_type: Tipo de mídia (document, photo, video, thumbnail)
    
    Returns:
        Tuple[bool, str]: (sucesso, mensagem ou caminho)
    """
    global last_upload_error
    storage_key = get_storage_key(filename, media_type)
    
    if storage_client is not None:
        try:
            storage_client.upload_from_bytes(storage_key, file_content)
            logger.info(f"Arquivo '{storage_key}' enviado via replit-object-storage")
            last_upload_error = None
            return True, storage_key
        except Exception as e:
            error_msg = f"Falha replit-object-storage: {str(e)}"
            logger.error(error_msg)
            last_upload_error = error_msg
    
    if storage_bucket is not None:
        try:
            content_type = get_content_type(filename)
            blob = storage_bucket.blob(storage_key)
            blob.upload_from_string(file_content, content_type=content_type)
            logger.info(f"Arquivo '{storage_key}' enviado via GCS")
            last_upload_error = None
            return True, storage_key
        except Exception as e:
            error_msg = f"Falha GCS: {str(e)}"
            logger.error(error_msg)
            last_upload_error = error_msg
            return False, error_msg
    
    if not STORAGE_AVAILABLE:
        return _upload_local_fallback(file_content, filename, media_type)
    
    return False, last_upload_error or "Nenhum método de storage disponível"


def _upload_local_fallback(
    file_content: bytes,
    filename: str,
    media_type: str
) -> Tuple[bool, str]:
    """Fallback para armazenamento local quando Object Storage não está disponível"""
    try:
        base_dir = "storage/media"
        media_dirs = {
            "document": "documents",
            "photo": "photos",
            "video": "videos",
            "thumbnail": "thumbnails"
        }
        
        dir_name = media_dirs.get(media_type, "documents")
        dir_path = os.path.join(base_dir, dir_name)
        os.makedirs(dir_path, exist_ok=True)
        
        file_path = os.path.join(dir_path, filename)
        with open(file_path, "wb") as f:
            f.write(file_content)
        
        storage_key = get_storage_key(filename, media_type)
        logger.info(f"Arquivo '{filename}' salvo localmente em '{file_path}'")
        return True, storage_key
    except Exception as e:
        logger.error(f"Erro ao salvar arquivo localmente: {e}")
        return False, str(e)


def download_file(storage_key: str) -> Optional[bytes]:
    """
    Baixa um arquivo do Object Storage.
    
    Args:
        storage_key: Chave do arquivo no storage (ex: "documents/abc123.pdf")
    
    Returns:
        bytes ou None se não encontrado
    """
    if storage_client is not None:
        try:
            content = storage_client.download_as_bytes(storage_key)
            logger.info(f"Arquivo '{storage_key}' baixado do Object Storage (replit)")
            return content
        except Exception as e:
            logger.warning(f"Erro ao baixar do Object Storage replit: {e}. Tentando GCS...")
    
    if storage_bucket is not None:
        try:
            blob = storage_bucket.blob(storage_key)
            content = blob.download_as_bytes()
            logger.info(f"Arquivo '{storage_key}' baixado via GCS")
            return content
        except Exception as e:
            logger.warning(f"Erro ao baixar do GCS: {e}. Tentando fallback local.")
    
    return _download_local_fallback(storage_key)


def _download_local_fallback(storage_key: str) -> Optional[bytes]:
    """Fallback para leitura local quando Object Storage não está disponível"""
    try:
        local_path = os.path.join("storage/media", storage_key)
        
        if os.path.exists(local_path):
            with open(local_path, "rb") as f:
                content = f.read()
            logger.info(f"Arquivo '{storage_key}' lido do armazenamento local")
            return content
        
        filename = os.path.basename(storage_key)
        possible_paths = [
            os.path.join("storage/media/documents", filename),
            os.path.join("storage/media/photos", filename),
            os.path.join("storage/media/videos", filename),
            os.path.join("storage/media/thumbnails", filename),
            os.path.join("storage/materiais/uploads", filename),
        ]
        
        for path in possible_paths:
            if os.path.exists(path):
                with open(path, "rb") as f:
                    content = f.read()
                logger.info(f"Arquivo encontrado em '{path}'")
                return content
        
        logger.warning(f"Arquivo '{storage_key}' não encontrado localmente")
        return None
    except Exception as e:
        logger.error(f"Erro ao ler arquivo local: {e}")
        return None


def delete_file(storage_key: str) -> bool:
    """
    Deleta um arquivo do Object Storage.
    
    Args:
        storage_key: Chave do arquivo no storage
    
    Returns:
        bool: True se deletado com sucesso
    """
    deleted = False
    
    if storage_client is not None:
        try:
            storage_client.delete(storage_key)
            logger.info(f"Arquivo '{storage_key}' deletado do Object Storage (replit)")
            deleted = True
        except Exception as e:
            logger.warning(f"Erro ao deletar do Object Storage replit: {e}")
    
    if storage_bucket is not None and not deleted:
        try:
            blob = storage_bucket.blob(storage_key)
            blob.delete()
            logger.info(f"Arquivo '{storage_key}' deletado via GCS")
            deleted = True
        except Exception as e:
            logger.warning(f"Erro ao deletar do GCS: {e}")
    
    if not deleted:
        return _delete_local_fallback(storage_key)
    
    return deleted


def _delete_local_fallback(storage_key: str) -> bool:
    """Fallback para deletar arquivo local"""
    try:
        local_path = os.path.join("storage/media", storage_key)
        if os.path.exists(local_path):
            os.remove(local_path)
            logger.info(f"Arquivo '{storage_key}' deletado do armazenamento local")
            return True
        return False
    except Exception as e:
        logger.error(f"Erro ao deletar arquivo local: {e}")
        return False


def file_exists(storage_key: str, max_retries: int = 3) -> bool:
    """
    Verifica se um arquivo existe no storage.
    Implementa retry com exponential backoff para lidar com rate limits.
    
    Args:
        storage_key: Chave do arquivo no storage
        max_retries: Número máximo de tentativas
    
    Returns:
        bool: True se existe
    """
    import time
    
    if storage_client is not None:
        for attempt in range(max_retries):
            try:
                objects = storage_client.list()
                file_names = set(obj.name for obj in objects)
                return storage_key in file_names
            except Exception as e:
                error_str = str(e).lower()
                if "rate limit" in error_str or "too many" in error_str:
                    wait_time = (2 ** attempt) * 0.5
                    logger.warning(f"Rate limit em file_exists, aguardando {wait_time}s (tentativa {attempt+1}/{max_retries})")
                    time.sleep(wait_time)
                    continue
                break
    
    if storage_bucket is not None:
        for attempt in range(max_retries):
            try:
                blob = storage_bucket.blob(storage_key)
                return blob.exists()
            except Exception as e:
                error_str = str(e).lower()
                if "rate limit" in error_str or "429" in error_str:
                    wait_time = (2 ** attempt) * 0.5
                    logger.warning(f"Rate limit em GCS file_exists, aguardando {wait_time}s")
                    time.sleep(wait_time)
                    continue
                break
    
    return _file_exists_local(storage_key)


def get_local_file_path(storage_key: str) -> Optional[str]:
    """
    Retorna o caminho local do arquivo para streaming direto.
    Usado para evitar carregar arquivos grandes na memória.
    
    Args:
        storage_key: Chave do arquivo no storage
    
    Returns:
        str ou None se não encontrado localmente
    """
    local_path = os.path.join("storage/media", storage_key)
    
    if os.path.exists(local_path):
        return local_path
    
    filename = os.path.basename(storage_key)
    possible_paths = [
        os.path.join("storage/media/documents", filename),
        os.path.join("storage/media/photos", filename),
        os.path.join("storage/media/videos", filename),
        os.path.join("storage/media/thumbnails", filename),
        os.path.join("storage/materiais/uploads", filename),
    ]
    
    for path in possible_paths:
        if os.path.exists(path):
            return path
    
    return None


def download_file_to_temp(storage_key: str) -> Optional[str]:
    """
    Baixa arquivo do Object Storage diretamente para um arquivo temporário.
    Usa download_to_filename para evitar carregar arquivos grandes na memória.
    
    Args:
        storage_key: Chave do arquivo no storage
    
    Returns:
        str: Caminho do arquivo temporário ou None se falhou
    """
    import tempfile
    
    local_path = get_local_file_path(storage_key)
    if local_path:
        return local_path
    
    _, ext = os.path.splitext(storage_key)
    
    if storage_client is not None:
        try:
            fd, temp_path = tempfile.mkstemp(suffix=ext)
            os.close(fd)
            storage_client.download_to_filename(storage_key, temp_path)
            logger.info(f"Arquivo '{storage_key}' baixado para temp via replit: {temp_path}")
            return temp_path
        except Exception as e:
            logger.warning(f"Erro ao baixar do replit Object Storage: {e}. Tentando GCS...")
            if 'temp_path' in locals() and os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except:
                    pass
    
    if storage_bucket is not None:
        try:
            fd, temp_path = tempfile.mkstemp(suffix=ext)
            os.close(fd)
            blob = storage_bucket.blob(storage_key)
            blob.download_to_filename(temp_path)
            logger.info(f"Arquivo '{storage_key}' baixado para temp via GCS: {temp_path}")
            return temp_path
        except Exception as e:
            logger.error(f"Erro ao baixar do GCS: {e}")
            if 'temp_path' in locals() and os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except:
                    pass
    
    return None


def is_file_local(storage_key: str) -> bool:
    """
    Verifica se o arquivo existe localmente (para usar FileResponse direto).
    
    Args:
        storage_key: Chave do arquivo no storage
    
    Returns:
        bool: True se existe localmente
    """
    return get_local_file_path(storage_key) is not None


def _file_exists_local(storage_key: str) -> bool:
    """Verifica se arquivo existe localmente"""
    local_path = os.path.join("storage/media", storage_key)
    if os.path.exists(local_path):
        return True
    
    filename = os.path.basename(storage_key)
    possible_paths = [
        os.path.join("storage/media/documents", filename),
        os.path.join("storage/media/photos", filename),
        os.path.join("storage/media/videos", filename),
        os.path.join("storage/media/thumbnails", filename),
    ]
    
    return any(os.path.exists(p) for p in possible_paths)


def get_storage_status() -> dict:
    """Retorna o status do serviço de storage com diagnóstico detalhado"""
    import os
    
    bucket_from_env = os.environ.get("REPLIT_OBJECT_STORAGE_BUCKET", "")
    bucket_from_file = get_bucket_id_from_replit_file()
    active_bucket = bucket_from_env or bucket_from_file
    
    replit_env_vars = {
        "REPLIT_DB_URL": bool(os.environ.get("REPLIT_DB_URL")),
        "REPLIT_DEPLOYMENT": bool(os.environ.get("REPLIT_DEPLOYMENT")),
        "REPLIT_DEV_DOMAIN": bool(os.environ.get("REPLIT_DEV_DOMAIN")),
        "REPL_ID": bool(os.environ.get("REPL_ID")),
        "REPL_SLUG": bool(os.environ.get("REPL_SLUG")),
        "REPLIT_OBJECT_STORAGE_BUCKET": bool(bucket_from_env),
        "BUCKET_FROM_FILE": bool(bucket_from_file),
    }
    
    replit_client_works = False
    replit_upload_test_error = None
    try:
        from replit.object_storage import Client
        test_client = Client()
        replit_client_works = True
        try:
            test_client.upload_from_bytes("_test_ping", b"test")
            test_client.delete("_test_ping")
        except Exception as e:
            replit_upload_test_error = str(e)
    except Exception as e:
        replit_upload_test_error = str(e)
    
    gcs_works = storage_bucket is not None
    gcs_upload_test_error = None
    if gcs_works:
        try:
            blob = storage_bucket.blob("_test_ping")
            blob.upload_from_string(b"test")
            blob.delete()
        except Exception as e:
            gcs_upload_test_error = str(e)
    
    return {
        "object_storage_available": is_storage_available(),
        "fallback_mode": not is_storage_available(),
        "storage_type": "replit_object_storage" if storage_client else ("gcs" if storage_bucket else "local_filesystem"),
        "replit_client_initialized": storage_client is not None,
        "replit_client_works": replit_client_works,
        "replit_upload_test_error": replit_upload_test_error,
        "gcs_bucket_initialized": storage_bucket is not None,
        "gcs_upload_test_error": gcs_upload_test_error,
        "initialization_error": storage_init_error,
        "last_upload_error": last_upload_error,
        "replit_env_vars": replit_env_vars,
        "is_deployment": bool(os.environ.get("REPLIT_DEPLOYMENT"))
    }
