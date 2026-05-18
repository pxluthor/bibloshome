# 🌳 Árvore de Domínios - Frontend

> **Projeto:** BiblosHome
> **Tecnologia:** React 18 + Vite + Tailwind CSS
> **Local:** `D:\workstation\bibloshome\frontend`

---

## 📋 Visão Geral da Arquitetura

A aplicação frontend é organizada em **5 domínios principais**, cada um responsável por uma área de funcionalidade específica do sistema.

```
┌─────────────────────────────────────────────────────────────┐
│                      🎯 DOMAINS                             │
├─────────────┬─────────────┬─────────────┬─────────┬─────────┤
│   🔐 Auth   │   📚 Lib    │   📖 Reader │  🛒 Ped │  ⚙️ Admin│
└─────────────┴─────────────┴─────────────┴─────────┴─────────┘
```

---

## 🗂️ Estrutura de Domínios

### 🔐 Domain: Autenticação

**Responsabilidade:** Gerenciamento de sessão, login, registro e controle de acesso.

```
frontend/src/
├── Domain: Auth/
│   ├── 📄 Pages/
│   │   ├── Login.jsx           → /login
│   │   └── Register.jsx        → /register
│   │
│   ├── 🧩 Components/
│   │   └── UserMenu.jsx        → Menu dropdown do usuário logado
│   │
│   ├── 🛡️ Guards/
│   │   ├── PrivateRoute.jsx    → Protege rotas autenticadas
│   │   └── AdminRoute.jsx      → Protege rotas administrativas
│   │
│   └── 🔧 Service/
│       └── api.js              → Axios + interceptores JWT
│           └── localStorage (token)
```

**Integrações Backend:**

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/auth/register` | POST | Registro de novo usuário |
| `/auth/login` | POST | Login (retorna JWT) |
| `/auth/verify` | GET | Verificar token válido |

**Arquivos:**
- `components/Login.jsx`
- `components/Register.jsx`
- `components/UserMenu.jsx`
- `services/api.js`

---

### 📚 Domain: Biblioteca/Documentos

**Responsabilidade:** Catálogo de livros, busca, filtros e listagem.

```
frontend/src/
├── Domain: Library/
│   ├── 📄 Pages/
│   │   └── DocumentList.jsx    → / (home protegida)
│   │
│   ├── 🧩 Components/
│   │   └── BookCardSkeleton.jsx→ Loading state dos cards
│   │
│   └── ✨ Features/
│       ├── 🔍 Search           → Busca textual por título/autor
│       ├── 🏷️ Filter            → Filtros por gênero/metadata
│       └── 📑 Pagination        → Paginação de resultados
```

**Integrações Backend:**

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/documents` | GET | Listar todos os livros |
| `/documents/{doc_id}/cover` | GET | Obter capa do livro |

**Arquivos:**
- `components/DocumentList.jsx`
- `components/BookCardSkeleton.jsx`

---

### 📖 Domain: Leitor de PDF

**Responsabilidade:** Visualização e interação com documentos PDF.

```
frontend/src/
├── Domain: Reader/
│   ├── 📄 Pages/
│   │   └── PDFReader.jsx       → /document/:id
│   │
│   ├── 🧩 Components/
│   │   └── Reader/
│   │       └── SidebarTabs.jsx → Abas de tradução e notas
│   │
│   ├── 🪝 Hooks/
│   │   ├── usePDFAnnotations.js  → Gerenciamento de anotações
│   │   └── useSidebarResizer.js  → Redimensionamento da sidebar
│   │
│   └── ✨ Features/
│       ├── 👁️ Visualização PDF  → Renderização do documento
│       ├── ✏️ Anotações         → Comentários no documento
│       ├── 🌐 Tradução          → Tradução de páginas
│       ├── 🔖 Bookmarks         → Marcadores de página
│       ├── 🖍️ Highlights        → Destaque de texto
│       ├── 🔍 Zoom              → Zoom in/out
│       └── 👁️ Dual Page         → Visualização dupla página
```

**Integrações Backend:**

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/documents/{doc_id}/file` | GET | Download do arquivo PDF |
| `/documents/{doc_id}/annotations` | GET/POST | Anotações do usuário |
| `/documents/{doc_id}/page/{page_number}/translate` | POST | Tradução de página |

**Arquivos:**
- `components/PDFReader.jsx`
- `components/Reader/SidebarTabs.jsx`
- `hooks/usePDFAnnotations.js`
- `hooks/useSidebarResizer.js`

---

### 🛒 Domain: Sistema de Pedidos

**Responsabilidade:** Fluxo de solicitação e acompanhamento de pedidos de livros.

```
frontend/src/
├── Domain: Orders/
│   ├── 📄 Pages/
│   │   ├── CriarPedido.jsx     → /criar-pedido
│   │   ├── MeusPedidos.jsx     → /meus-pedidos
│   │   └── AdminPedidos.jsx    → /admin/pedidos
│   │
│   └── ✨ Features/
│       ├── ➕ Create Order      → Novo pedido
│       ├── 📋 My Orders         → Listagem pessoal
│       └── 🔧 Order Management  → Administração (admin)
```

**Integrações Backend:**

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/pedidos` | POST | Criar pedido |
| `/pedidos/meus` | GET | Meus pedidos |
| `/pedidos` | GET | Todos pedidos (admin) |
| `/pedidos/{pedido_id}/status` | PUT | Atualizar status (admin) |
| `/pedidos/{pedido_id}` | DELETE | Cancelar pedido |

**Status de Pedidos:**
- `pendente` → Aguardando análise
- `em_analise` → Em avaliação
- `aprovado` → Pedido aceito
- `recusado` → Pedido negado

**Arquivos:**
- `components/CriarPedido.jsx`
- `components/MeusPedidos.jsx`
- `components/AdminPedidos.jsx`

---

### ⚙️ Domain: Administração

**Responsabilidade:** Funcionalidades exclusivas de administradores.

```
frontend/src/
├── Domain: Admin/
│   ├── 📄 Pages/
│   │   ├── EditBook.jsx        → /edit-book/:id
│   │   └── AdminPedidos.jsx    → /admin/pedidos (compartilhado)
│   │
│   ├── 🛡️ Guards/
│   │   └── AdminRoute.jsx      ← Proteção de acesso admin
│   │
│   └── ✨ Features/
│       ├── 📝 Edit Metadata    → Editar metadados de livros
│       └── 📊 Order Admin      → Gerenciar pedidos
```

**Integrações Backend:**

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/documents/{doc_id}/details` | GET | Detalhes completos (admin) |
| `/documents/{doc_id}/update` | PUT | Atualizar livro (admin) |
| `/pedidos` | GET | Listar todos pedidos (admin) |
| `/pedidos/{pedido_id}/status` | PUT | Atualizar status (admin) |

**Arquivos:**
- `components/EditBook.jsx`
- `components/AdminPedidos.jsx` (compartilhado com Orders)

---

## 🔗 Mapa de Dependências Entre Domínios

```
┌─────────────────────────────────────────────────────────────┐
│                     🔐 Auth (Core)                          │
│              (JWT Token + localStorage)                     │
└─────────────┬─────────────┬─────────────┬───────────────────┘
              │             │             │
              ▼             ▼             ▼
        ┌─────────┐   ┌─────────┐   ┌─────────┐
        │📚 Library│   │📖 Reader│   │🛒 Orders│
        └─────────┘   └─────────┘   └────┬────┘
                                         │
                                         ▼
                                    ┌─────────┐
                                    │⚙️ Admin │◄── Requer AdminRoute
                                    └─────────┘
```

**Dependências:**
- Todos os domínios dependem de **Auth** (token JWT em `localStorage`)
- **Admin** depende de **Orders** (compartilha componente `AdminPedidos.jsx`)
- **Reader** e **Library** são independentes entre si
- **PrivateRoute** protege rotas de Library, Reader, Orders
- **AdminRoute** protege rotas de Admin

---

## 🔌 Integrações com Backend - Resumo

| Domínio | Base Path | Auth Required | Role |
|---------|-----------|---------------|------|
| Auth | `/auth/*` | ❌ | - |
| Library | `/documents/*` | ✅ | USER/ADMIN |
| Reader | `/documents/{doc_id}/*` | ✅ | USER/ADMIN |
| Orders | `/pedidos/*` | ✅ | USER/ADMIN |
| Admin | `/admin/*` | ✅ | ADMIN only |

---

## 📁 Mapeamento Completo de Arquivos

| Arquivo | Domínio | Tipo | Rota |
|---------|---------|------|------|
| `components/Login.jsx` | Auth | Page | /login |
| `components/Register.jsx` | Auth | Page | /register |
| `components/UserMenu.jsx` | Auth | Component | - |
| `services/api.js` | Auth | Service | - |
| `components/DocumentList.jsx` | Library | Page | / |
| `components/BookCardSkeleton.jsx` | Library | Component | - |
| `components/PDFReader.jsx` | Reader | Page | /document/:id |
| `components/Reader/SidebarTabs.jsx` | Reader | Component | - |
| `hooks/usePDFAnnotations.js` | Reader | Hook | - |
| `hooks/useSidebarResizer.js` | Reader | Hook | - |
| `components/CriarPedido.jsx` | Orders | Page | /criar-pedido |
| `components/MeusPedidos.jsx` | Orders | Page | /meus-pedidos |
| `components/AdminPedidos.jsx` | Orders/Admin | Page | /admin/pedidos |
| `components/EditBook.jsx` | Admin | Page | /edit-book/:id |

---

## 🛡️ Sistema de Guards

### PrivateRoute
- Protege rotas que requerem autenticação
- Verifica token JWT no localStorage
- Redireciona para `/login` se não autenticado

### AdminRoute
- Estende PrivateRoute
- Verifica `is_admin` no token JWT
- Redireciona para `/` se não for admin

**Fluxo de Proteção:**
```
Rota → PrivateRoute? → AdminRoute? → Componente
        (JWT valid?)    (is_admin?)
```

---

## 🎨 Stack de Estilização

| Ferramenta | Uso |
|------------|-----|
| Tailwind CSS | Estilização utilitária |
| Lucide React | Ícones |
| React-PDF | Renderização de PDF |
| DOMPurify | Sanitização de HTML |

**Configuração:**
- `tailwind.config.js` - Configuração com animações customizadas (shimmer, fade-in-up)
- `postcss.config.js` - Integração Tailwind + autoprefixer
- `vite.config.js` - Build tool com host configurado

---

## 📊 Estadísticas do Frontend

| Aspecto | Valor |
|---------|-------|
| **Framework** | React 18.2.0 |
| **Build Tool** | Vite 4.4.5 |
| **Router** | React Router DOM 6.18.0 |
| **HTTP Client** | Axios 1.6.0 |
| **PDF Viewer** | react-pdf 9.0.0 |
| **Icons** | lucide-react 0.561.0 |
| **Components** | 13 |
| **Hooks** | 2 |
| **Pages** | 8 |

---

## 🚀 Quick Reference

```bash
# Instalar dependências
cd frontend && npm install

# Rodar em desenvolvimento
npm run dev

# Build de produção
npm run build

# Preview da build
npm run preview
```

---

## 🔄 Fluxo de Dados

```
┌──────────┐    HTTP     ┌──────────┐    SQL     ┌──────────┐
│ Frontend │ ───────────▶│  Backend │ ───────────▶│   MySQL  │
│ (React)  │◀────────────│ (FastAPI)│◀────────────│ (DB)     │
└──────────┘   JSON      └──────────┘           └──────────┘
      │
      ▼
┌──────────┐
│localStorage│
│ (token)  │
└──────────┘
```

---

*Documentação gerada em: 2026-02-18*
*Stack: React + Vite + Tailwind CSS*
