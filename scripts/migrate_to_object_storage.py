#!/usr/bin/env python3
"""
Script de migração para enviar arquivos locais para o Replit Object Storage.
Executa apenas uma vez para migrar arquivos existentes.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services import storage_service

MEDIA_DIRS = {
    "documents": "document",
    "photos": "photo", 
    "videos": "video",
    "thumbnails": "thumbnail"
}

def migrate_files():
    """Migra todos os arquivos locais para o Object Storage"""
    
    if not storage_service.is_storage_available():
        print("❌ Object Storage não está disponível. Execute este script em produção.")
        return False
    
    print("✅ Object Storage disponível")
    print("-" * 50)
    
    base_path = "storage/media"
    total_files = 0
    migrated_files = 0
    failed_files = []
    
    for dir_name, media_type in MEDIA_DIRS.items():
        dir_path = os.path.join(base_path, dir_name)
        
        if not os.path.exists(dir_path):
            print(f"📁 Diretório {dir_path} não existe, pulando...")
            continue
        
        files = [f for f in os.listdir(dir_path) if os.path.isfile(os.path.join(dir_path, f))]
        
        if not files:
            print(f"📁 Diretório {dir_path} está vazio, pulando...")
            continue
        
        print(f"\n📂 Migrando {len(files)} arquivos de {dir_path}...")
        
        for filename in files:
            file_path = os.path.join(dir_path, filename)
            total_files += 1
            
            try:
                storage_key = storage_service.get_storage_key(filename, media_type)
                
                if storage_service.file_exists(storage_key):
                    print(f"  ⏭️  {filename} já existe no Object Storage")
                    migrated_files += 1
                    continue
                
                with open(file_path, "rb") as f:
                    file_content = f.read()
                
                success, result = storage_service.upload_file(file_content, filename, media_type)
                
                if success:
                    print(f"  ✅ {filename} migrado com sucesso")
                    migrated_files += 1
                else:
                    print(f"  ❌ {filename} falhou: {result}")
                    failed_files.append(filename)
                    
            except Exception as e:
                print(f"  ❌ {filename} erro: {e}")
                failed_files.append(filename)
    
    print("\n" + "=" * 50)
    print(f"📊 RESUMO DA MIGRAÇÃO")
    print(f"   Total de arquivos: {total_files}")
    print(f"   Migrados com sucesso: {migrated_files}")
    print(f"   Falhas: {len(failed_files)}")
    
    if failed_files:
        print(f"\n❌ Arquivos que falharam:")
        for f in failed_files:
            print(f"   - {f}")
        return False
    
    print("\n✅ Migração concluída com sucesso!")
    return True


if __name__ == "__main__":
    success = migrate_files()
    sys.exit(0 if success else 1)
