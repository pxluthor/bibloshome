# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**BiblosHome** is a digital library web application with PDF reading capabilities, annotations, and book management. It consists of a React frontend and FastAPI backend.

- **Frontend**: React 18 + Vite + Tailwind CSS (`/frontend`)
- **Backend**: FastAPI + SQLModel + MySQL (`/backend`)

---

## ⚠️ REGRA CRÍTICA — Backup antes de qualquer docker compose up

**SEMPRE** rodar o backup antes de qualquer operação docker que possa recriar containers:

```powershell
# Fazer backup (salva em backups/ com timestamp)
.\backup-db.ps1

# Restaurar se algo der errado
.\restore-db.ps1 backups\bibloshome_YYYY-MM-DD_HH-mm.sql.zip
```

**Nunca rodar `docker compose up` sem antes confirmar:**
1. O container `bibloshome-db` já está rodando (`docker ps | grep bibloshome-db`)
2. O banco tem dados (`docker exec bibloshome-db bash -c "mysql -u bibloshome -pbibloshome bibloshome -e 'SELECT COUNT(*) FROM usuario;' 2>/dev/null"`)
3. Backup feito com `.\backup-db.ps1`

> Lição aprendida (31/05/2026): `docker compose up -d backend frontend` recriou o container do DB
> silenciosamente porque o container anterior não estava associado ao compose file atual,
> resultando em perda de dados (lista de leitura, coleções, progresso). Dados de arquivos
> em E:\BIBLIOTECA são sempre preservados; apenas metadados do banco são perdidos.

### Ajuste de desempenho do MySQL (25/10/2026)

`innodb_buffer_pool_size` foi elevado de 128 MB para **512 MB** com `SET PERSIST` (gravado em
`mysqld-auto.cnf`, dentro do volume `mysql_data`). Com 128 MB o banco inteiro (~123 MB, quase tudo
capas em MEDIUMBLOB) não cabia no cache e a listagem do acervo tinha picos de 1–2,4 s. Se o volume
for recriado, reaplicar:

```bash
docker exec bibloshome-db mysql -uroot -proot -e "SET PERSIST innodb_buffer_pool_size = 536870912;"
```

### Entrar com MyGroups (OIDC) — 25/10/2026

- Provedor: `https://mygroups.pxluthor.com.br/oidc` (Authorization Code + PKCE S256, `client_secret_basic`, RS256).
- Cliente `bibloshome`; callback cadastrado **exato**: `https://library.pxluthor.com.br/api/auth/mygroups/callback`.
- Caminho: o nginx do frontend faz proxy de `/api/auth/mygroups/*` para `backend:8001/auth/mygroups/*`
  (mesma origem do app). Código em `backend/mygroups_oidc.py`.
- Segredo: só `MYGROUPS_CLIENT_SECRET` no `.env` da raiz (origem: `D:\mygroups\apps\identity\.secrets\bibloshome.json`).
  Nunca em `VITE_*`, frontend, log ou commit. Trocou no MyGroups → atualizar o `.env` e recriar o backend.
- Contas vinculadas só por `(issuer, sub)` na tabela `usuario_identidades`; o e-mail do MyGroups é ignorado.
  Conta criada por esse login recebe e-mail interno `<sub>@mygroups.invalid` e não tem login por senha.
- State/nonce/verifier e o cookie de entrega da sessão ficam **em memória** (1 processo uvicorn).
  Se o backend passar a usar `--workers`, mover para tabela no banco.
- Erros voltam para `/login?mygroups_erro=cancelado|recusado|state_invalido|expirado|invalido|indisponivel|bloqueado`.

---

## Common Commands

### Development

```bash
# Start backend (port 8001)
cd backend && uvicorn main:app --reload --port 8001

# Start frontend (port 5171)
cd frontend && npm run dev

# Or use Makefile to start both
make dev
```

### Build & Production

```bash
# Build frontend
cd frontend && npm run build

# Start backend in production
cd backend && uvicorn main:app --host 0.0.0.0 --port 8001 --workers 4

# Preview production build
cd frontend && npm run preview
```

### Setup

```bash
# Install all dependencies
make setup

# Or manually:
# Backend
cd backend && python -m venv venv && pip install -r requirements.txt

# Frontend
cd frontend && npm install
```

### Lint

```bash
cd frontend && npm run lint
```

---

## Architecture

### Backend Structure (`/backend`)

| File | Purpose |
|------|---------|
| `main.py` | FastAPI entry point, CORS config |
| `routes.py` | All API endpoints |
| `models.py` | SQLModel entities (Usuario, Livro, ListaLeitura, Anotacao, PedidoLivro) |
| `database.py` | MySQL connection config |
| `auth.py` | JWT authentication (bcrypt + PyJWT) |
| `services.py` | PDFService, TranslationService |

**Key Entities:**
- `Usuario` - Users with JWT auth
- `Livro` - Books with PDF path and cover blob
- `ListaLeitura` - User's reading list (status: quero_ler, lendo, concluido)
- `Anotacao` - Annotations stored as JSON (bookmarks, notes, highlights, lastPage)
- `PedidoLivro` - Book requests (status: pendente, em_analise, aprovado, recusado)

### Frontend Structure (`/frontend/src`)

| Path | Purpose |
|------|---------|
| `App.jsx` | Route definitions with PrivateRoute/AdminRoute guards |
| `services/api.js` | Axios instance with JWT interceptor |
| `components/` | React components |
| `hooks/` | Custom hooks (usePDFAnnotations, useSidebarResizer) |

**Key Components:**
- `DocumentList.jsx` - Book catalog with search/filter
- `PDFReader.jsx` - PDF viewer with annotations
- `Login.jsx` / `Register.jsx` - Authentication
- `CriarPedido.jsx` / `MeusPedidos.jsx` / `AdminPedidos.jsx` - Book requests
- `EditBook.jsx` - Admin book editing

**Route Guards:**
- `PrivateRoute` - Requires authentication
- `AdminRoute` - Requires `is_admin` in JWT token

---

## API Integration

**Base URLs:**
- Development: `http://localhost:8001`
- Production: `https://api-library.pxluthor.com.br`

**Authentication:**
- JWT token stored in `localStorage`
- Axios interceptor adds `Authorization: Bearer {token}` header
- 401 responses trigger logout

**Key Endpoints:**
```
POST   /auth/register
POST   /auth/login
GET    /documents
GET    /documents/{id}/file
GET    /documents/{id}/annotations
POST   /documents/{id}/annotations
GET    /my-list
POST   /my-list/add/{id}
POST   /pedidos
GET    /pedidos/meus
```

---

## Environment Variables

### Backend `.env`
```
DATABASE_URL=mysql+mysqlconnector://user:pass@localhost:3306/biblioteca
SECRET_KEY=your_secret_key
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440
PDF_SOURCE_DIR=E:\BIBLIOTECA
```

### Frontend `.env.local`
```
VITE_API_URL=https://api-library.pxluthor.com.br
```

---

## Project Conventions

### Backend
- **Entities**: PascalCase (`Livro`, `Usuario`)
- **Tables**: snake_case plural (`livros`, `usuarios`)
- **DTOs**: Suffix + Action (`LivroRead`, `UsuarioCreate`)

### Frontend
- **Components**: PascalCase (`DocumentList`, `PDFReader`)
- **Hooks**: camelCase with `use` prefix (`usePDFAnnotations`)
- **Routes**: kebab-case (`/criar-pedido`, `/meus-pedidos`)

---

## Important Files

- `docs/domain-tree-backend.md` - Backend domain documentation
- `docs/domain-tree-frontend.md` - Frontend domain documentation
- `Melhorias/roadmap-melhorias.md` - Feature roadmap
- `Makefile` - Common commands automation

---

## Stack Details

**Frontend:**
- React 18.2.0, React Router DOM 6.18.0, React-PDF 9.0.0
- Vite 4.4.5, Tailwind CSS 3.3.5, Lucide React
- Axios 1.6.0, DOMPurify 3.3.1

**Backend:**
- FastAPI 0.104.1, SQLModel, Uvicorn
- MySQL with mysql-connector-python
- PyJWT, Passlib (bcrypt), PDFPlumber, deep-translator
