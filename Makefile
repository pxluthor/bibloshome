VENV_DIR ?= .venv

ifeq ($(OS),Windows_NT)
SHELL := cmd.exe
.SHELLFLAGS := /c
PYTHON := python
CLEAN_BACKEND := if exist backend\$(VENV_DIR) rmdir /S /Q backend\$(VENV_DIR)
CLEAN_FRONTEND := if exist frontend\node_modules rmdir /S /Q frontend\node_modules
else
SHELL := /bin/bash
PYTHON := python3
CLEAN_BACKEND := rm -rf backend/$(VENV_DIR)
CLEAN_FRONTEND := rm -rf frontend/node_modules
endif

.PHONY: help setup backend frontend dev backend-prod frontend-prod clean stop

help:
	@echo "BiblosHome - comandos disponiveis:"
	@echo "  make setup          Instala dependencias do backend e frontend"
	@echo "  make backend        Inicia o backend em modo desenvolvimento"
	@echo "  make frontend       Inicia o frontend em modo desenvolvimento"
	@echo "  make dev            Inicia backend e frontend em paralelo"
	@echo "  make backend-prod   Inicia o backend em modo producao"
	@echo "  make frontend-prod  Builda e inicia o preview do frontend"
	@echo "  make clean          Remove ambientes/artefatos locais"
	@echo "  make stop           Para todos os processos backend e frontend"

setup:
	@echo "Instalando dependencias do backend..."
ifeq ($(OS),Windows_NT)
	cd backend && $(PYTHON) -m venv $(VENV_DIR) && $(VENV_DIR)\Scripts\python -m pip install -r requirements.txt
else
	cd backend && $(PYTHON) -m venv $(VENV_DIR) && $(VENV_DIR)/bin/python -m pip install -r requirements.txt
endif
	@echo "Instalando dependencias do frontend..."
	cd frontend && npm install

backend:
ifeq ($(OS),Windows_NT)
	cd backend && $(VENV_DIR)\Scripts\python -m uvicorn main:app --reload --port 8001
else
	cd backend && $(VENV_DIR)/bin/python -m uvicorn main:app --reload --port 8001
endif

frontend:
	cd frontend && npm run dev

dev:
	@echo "Iniciando backend e frontend..."
	$(MAKE) -j2 backend frontend

backend-prod:
ifeq ($(OS),Windows_NT)
	cd backend && $(VENV_DIR)\Scripts\python -m uvicorn main:app --host 0.0.0.0 --port 8001 --workers 4
else
	cd backend && $(VENV_DIR)/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8001 --workers 4
endif

frontend-prod:
	cd frontend && npm run build && npm run preview

clean:
	@echo "Removendo ambiente virtual e node_modules..."
	$(CLEAN_BACKEND)
	$(CLEAN_FRONTEND)

stop:
	@echo "Parando backend e frontend..."
ifeq ($(OS),Windows_NT)
	taskkill /F /IM python.exe 2>nul || echo "Nenhum processo python encontrado"
	taskkill /F /IM node.exe 2>nul || echo "Nenhum processo node encontrado"
else
	pkill -f "uvicorn" || echo "Nenhum processo uvicorn encontrado"
	pkill -f "vite" || echo "Nenhum processo vite encontrado"
endif
	@echo "Aplicacao parada com sucesso!"
