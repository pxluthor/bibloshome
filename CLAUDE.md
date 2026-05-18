# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**BiblosHome** is a digital library web application with PDF reading capabilities, annotations, and book management. It consists of a React frontend and FastAPI backend.

- **Frontend**: React 18 + Vite + Tailwind CSS (`/frontend`)
- **Backend**: FastAPI + SQLModel + MySQL (`/backend`)

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
