# 🌳 Árvore de Domínios - BiblosHome

> Documentação completa da arquitetura de domínios da aplicação BiblosHome

---

## 📋 Índice

1. [Visão Geral](#visão-geral)
2. [Arquitetura Completa](#arquitetura-completa)
3. [Backend Domains](#backend-domains)
4. [Frontend Domains](#frontend-domains)
5. [Integração Backend-Frontend](#integração-backend-frontend)
6. [Mapa de Relacionamentos](#mapa-de-relacionamentos)

---

## Visão Geral

O **BiblosHome** é uma aplicação web de biblioteca digital com arquitetura **cliente-servidor separada**.

| Aspecto | Backend | Frontend |
|---------|---------|----------|
| **Tecnologia** | FastAPI (Python) | React (JavaScript) |
| **ORM/UI** | SQLModel | Tailwind CSS |
| **Banco** | MySQL | - |
| **Build** | Uvicorn | Vite |

---

## Arquitetura Completa

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           🌐 BIBLOSHOME                                      │
├─────────────────────────────────┬─────────────────────────────────────────────┤
│         🔧 BACKEND              │            🎨 FRONTEND                     │
│     D:\workstation\bibloshome\backend          D:\workstation\bibloshome\frontend    │
├─────────────────────────────────┼─────────────────────────────────────────────┤
│                                 │                                             │
│  ┌─────────────────────────┐    │    ┌─────────────────────────────────┐      │
│  │   🔐 Auth/Usuários      │◄───│───▶│   🔐 Auth                        │      │
│  │   - JWT + bcrypt        │    │    │   - Login, Register              │      │
│  │   - Usuario entity      │    │    │   - PrivateRoute, AdminRoute     │      │
│  └─────────────────────────┘    │    └─────────────────────────────────┘      │
│                                 │                                             │
│  ┌─────────────────────────┐    │    ┌─────────────────────────────────┐      │
│  │   📚 Livros (Acervo)    │◄───│───▶│   📚 Library                     │      │
│  │   - PDFService          │    │    │   - DocumentList                 │      │
│  │   - TranslationService  │    │    │   - Search, Filter               │      │
│  └─────────────────────────┘    │    └─────────────────────────────────┘      │
│           ▲                     │                   ▲                        │
│           │                     │                   │                        │
│  ┌────────┴────────────────┐    │    ┌──────────────┴──────────────────┐      │
│  │   📖 Lista de Leitura   │◄───│───▶│   📖 Reader (Leitor PDF)         │      │
│  │   ✏️ Anotações          │    │    │   - PDFReader                    │      │
│  │   📝 Pedidos de Livros  │◄───│───▶│   - Anotações, Tradução          │      │
│  └─────────────────────────┘    │    │   🛒 Sistema de Pedidos          │      │
│                                 │    │   ⚙️ Administração               │      │
│                                 │    └─────────────────────────────────┘      │
│                                 │                                             │
└─────────────────────────────────┴─────────────────────────────────────────────┘
                                    │
                                    ▼
                          ┌─────────────────┐
                          │    🗄️ MySQL     │
                          │   (Database)    │
                          └─────────────────┘
```

---

## Backend Domains

### 🔐 Domain: Auth/Usuários

```
backend/
├── Entity: Usuario
│   ├── id: int (PK)
│   ├── nome: str
│   ├── email: str (unique)
│   ├── senha_hash: str
│   ├── is_admin: bool
│   └── created_at: datetime
├── DTOs: UsuarioCreate, UsuarioLogin
├── Service: AuthService (bcrypt + JWT)
└── Routes: /auth/*
    ├── POST /auth/register
    ├── POST /auth/login
    └── GET  /auth/verify
```

### 📚 Domain: Livros (Acervo)

```
backend/
├── Entity: Livro
│   ├── id, titulo, autor, ano, editora
│   ├── genero, area, idioma, paginas
│   ├── sinopse, caminho (PDF), capa (blob)
│   └── data_adicao
├── DTOs: LivroRead, LivroUpdate
├── Services: PDFService, TranslationService
└── Routes: /documents/*
```

### 📖 Domain: Lista de Leitura

```
backend/
├── Entity: ListaLeitura
│   ├── id, usuario_id (FK), livro_id (FK)
│   ├── status: quero_ler | lendo | concluido
│   └── data_adicao
├── DTO: ListaLeituraUpdate
└── Routes: /my-list/*
```

### ✏️ Domain: Anotações

```
backend/
├── Entity: Anotacao
│   ├── id, usuario_id (FK), livro_id (FK)
│   ├── dados_json: { bookmarks, notes, highlights, lastPage }
│   └── updated_at
└── Routes: /documents/{id}/annotations
```

### 📝 Domain: Pedidos de Livros

```
backend/
├── Entity: PedidoLivro
│   ├── id, usuario_id (FK), titulo, autor, editora
│   ├── status: pendente | em_analise | aprovado | recusado
│   ├── data_criacao, data_atualizacao, observacoes
├── DTOs: PedidoLivroCreate, PedidoLivroUpdate
└── Routes: /pedidos/*
```

**Arquivos principais:**
- `backend/models.py` - Todas as entidades
- `backend/routes.py` - Todos os endpoints
- `backend/services.py` - PDFService, TranslationService
- `backend/auth.py` - Autenticação JWT

---

## Frontend Domains

### 🔐 Domain: Autenticação

```
frontend/src/
├── Pages: Login.jsx, Register.jsx
├── Components: UserMenu.jsx
├── Guards: PrivateRoute.jsx, AdminRoute.jsx
└── Service: api.js (Axios + JWT interceptor)

Rotas:
├── /login
├── /register
└── (proteção via token localStorage)
```

### 📚 Domain: Library

```
frontend/src/
├── Pages: DocumentList.jsx
├── Components: BookCardSkeleton.jsx
└── Features: Search, Filter, Pagination

Rotas:
└── / (home - protegida)
```

### 📖 Domain: Reader (Leitor PDF)

```
frontend/src/
├── Pages: PDFReader.jsx
├── Components: Reader/SidebarTabs.jsx
├── Hooks:
│   ├── usePDFAnnotations.js
│   └── useSidebarResizer.js
└── Features: PDF view, Annotations, Translation, Bookmarks, Highlights

Rotas:
└── /document/:id (protegida)
```

### 🛒 Domain: Orders

```
frontend/src/
├── Pages:
│   ├── CriarPedido.jsx
│   ├── MeusPedidos.jsx
│   └── AdminPedidos.jsx
└── Features: Create Order, My Orders, Order Management

Rotas:
├── /criar-pedido (protegida)
├── /meus-pedidos (protegida)
└── /admin/pedidos (admin)
```

### ⚙️ Domain: Admin

```
frontend/src/
├── Pages:
│   ├── EditBook.jsx
│   └── AdminPedidos.jsx (compartilhado)
└── Guard: AdminRoute.jsx

Rotas:
├── /edit-book/:id (admin)
└── /admin/pedidos (admin)
```

**Arquivos principais:**
- `frontend/src/App.jsx` - Roteamento principal
- `frontend/src/services/api.js` - HTTP client
- `frontend/src/components/` - Componentes React
- `frontend/src/hooks/` - Custom hooks

---

## Integração Backend-Frontend

### Fluxo de Dados

```
┌─────────────────────────────────────────────────────────────────┐
│  Componente React                                               │
│     │                                                           │
│     ▼                                                           │
│  Hook useEffect / Event Handler                                 │
│     │                                                           │
│     ▼                                                           │
│  services/api.js (Axios)                                        │
│     │  • Base URL: VITE_API_URL                                │
│     │  • Interceptor: Authorization: Bearer {token}              │
│     ▼                                                           │
│  HTTP Request ──────────────────────────────────────────────▶   │
│     │                                          │                │
│     │                                          ▼                │
│     │                                    FastAPI (Backend)      │
│     │                                          │                │
│     ◀─────────────────────────────────────────│                │
│  HTTP Response                                  │                │
│     │                                           │                │
│     ▼                                           │                │
│  Estado React ◄───────────────────────────────────│                │
│     │                                           │                │
│     ▼                                           │                │
│  Renderização UI                                │                │
└─────────────────────────────────────────────────────────────────┘
```

### Mapeamento Endpoints ↔ Components

| Endpoint | Método | Componente Frontend |
|----------|--------|---------------------|
| `/auth/login` | POST | Login.jsx |
| `/auth/register` | POST | Register.jsx |
| `/auth/verify` | GET | App.jsx (guard) |
| `/documents` | GET | DocumentList.jsx |
| `/documents/{id}/file` | GET | PDFReader.jsx |
| `/documents/{id}/annotations` | GET/POST | usePDFAnnotations.js |
| `/documents/{id}/page/{n}/translate` | POST | SidebarTabs.jsx |
| `/my-list` | GET | DocumentList.jsx |
| `/my-list/add/{id}` | POST | DocumentList.jsx |
| `/pedidos` | POST | CriarPedido.jsx |
| `/pedidos/meus` | GET | MeusPedidos.jsx |
| `/pedidos` | GET | AdminPedidos.jsx |
| `/pedidos/{id}/status` | PUT | AdminPedidos.jsx |
| `/documents/{id}/update` | PUT | EditBook.jsx |

---

## Mapa de Relacionamentos

### Entidades Backend

```
                    ┌─────────────┐
                    │   Usuario   │
                    │   🔐        │
                    └──────┬──────┘
                           │
           ┌───────────────┼───────────────┐
           │               │               │
           ▼               ▼               ▼
    ┌────────────┐   ┌────────────┐   ┌────────────┐
    │ Lista      │   │ Anotacao   │   │ Pedido     │
    │ Leitura    │   │     ✏️      │   │ Livro      │
    │   📖       │   │            │   │   📝       │
    └─────┬──────┘   └─────┬──────┘   └────────────┘
          │                │
          └────────────────┘
                     │
                     ▼
              ┌────────────┐
              │   Livro    │
              │    📚      │
              │  (Acervo)  │
              └────────────┘
```

### Componentes Frontend

```
                    ┌─────────────┐
                    │     Auth    │
                    │   🔐        │
                    └──────┬──────┘
                           │
           ┌───────────────┼───────────────┐
           │               │               │
           ▼               ▼               ▼
    ┌────────────┐   ┌────────────┐   ┌────────────┐
    │  Library   │   │   Reader   │   │   Orders   │
    │   📚       │   │    📖      │   │   🛒       │
    └────────────┘   └────────────┘   └─────┬──────┘
                                              │
                                              ▼
                                       ┌────────────┐
                                       │   Admin    │
                                       │    ⚙️      │
                                       └────────────┘
```

### Dependências Entre Domínios

| Domínio | Depende de | Tipo |
|---------|------------|------|
| ListaLeitura | Usuario, Livro | FK: usuario_id, livro_id |
| Anotacao | Usuario, Livro | FK: usuario_id, livro_id |
| PedidoLivro | Usuario | FK: usuario_id |
| Library | Auth | JWT Token |
| Reader | Auth | JWT Token |
| Orders | Auth | JWT Token |
| Admin | Auth, Orders | JWT + Admin role |

---

## Convenções de Código

### Backend

| Elemento | Convenção | Exemplo |
|----------|-----------|---------|
| Entidades | PascalCase | `Livro`, `Usuario` |
| Tabelas | snake_case, plural | `livros`, `usuarios` |
| DTOs | Sufixo + Ação | `LivroRead`, `UsuarioCreate` |
| Rotas | kebab-case, plural | `/my-list`, `/documents` |

### Frontend

| Elemento | Convenção | Exemplo |
|----------|-----------|---------|
| Componentes | PascalCase | `DocumentList`, `PDFReader` |
| Hooks | camelCase, prefix `use` | `usePDFAnnotations` |
| Serviços | camelCase | `api`, `authService` |
| Rotas | kebab-case | `/criar-pedido`, `/meus-pedidos` |

---

## Arquivos de Documentação

| Arquivo | Descrição |
|---------|-----------|
| `docs/domain-tree-backend.md` | Árvore completa do backend |
| `docs/domain-tree-frontend.md` | Árvore completa do frontend |
| `docs/domain-tree-unified.md` | Este arquivo - visão unificada |

---

*Documentação gerada em: 2026-02-18*
*Projeto: BiblosHome - Biblioteca Digital*
