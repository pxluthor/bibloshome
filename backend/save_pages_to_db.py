#!/usr/bin/env python3
"""
Script para salvar o número total de páginas de cada livro no banco de dados.
Este script varre todos os livros, abre os PDFs, conta as páginas e atualiza o campo 'paginas' no MySQL.
"""

import sys
import os

# Adiciona o diretório atual ao path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlmodel import Session, select
from database import engine, get_session
from models import Livro
from services import get_pdf_service

def save_pages_to_database():
    """Salva o número de páginas de todos os livros no banco de dados"""
    print("=== Salvando páginas dos livros no banco de dados ===\n")
    
    with Session(engine) as session:
        pdf_service = get_pdf_service()
        livros = session.exec(select(Livro)).all()
        
        if not livros:
            print("Nenhum livro encontrado no banco de dados.")
            return
        
        print(f"Total de livros encontrados: {len(livros)}\n")
        
        updated_count = 0
        skipped_count = 0
        errors = []
        
        for livro in livros:
            try:
                if not livro.caminho:
                    print(f"⚠ Livro {livro.id}: sem caminho - ignorado")
                    skipped_count += 1
                    continue
                
                # Obtém o caminho do arquivo
                file_path = pdf_service.get_file_path(livro.caminho)
                
                # Conta as páginas
                page_count = pdf_service.count_pages(file_path)
                
                # Atualiza o banco
                livro.paginas = page_count
                session.add(livro)
                
                print(f"✓ Livro {livro.id}: '{livro.titulo}' - {page_count} páginas")
                updated_count += 1
                    
            except Exception as e:
                error_msg = f"Livro {livro.id} ({livro.titulo}): {str(e)}"
                errors.append(error_msg)
                print(f"✗ {error_msg}")
        
        # Commit das alterações
        session.commit()
        
        # Resumo
        print(f"\n{'='*50}")
        print(f"Resumo:")
        print(f"  • Total de livros: {len(livros)}")
        print(f"  • Atualizados com sucesso: {updated_count}")
        print(f"  • Ignorados (sem caminho): {skipped_count}")
        print(f"  • Erros: {len(errors)}")
        
        if errors:
            print(f"\nErros encontrados:")
            for error in errors:
                print(f"  • {error}")
        
        print(f"\n✓ Processo concluído!")
        print(f"✓ Os dados foram salvos no banco de dados MySQL.")

if __name__ == "__main__":
    save_pages_to_database()
