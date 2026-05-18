# Domain Tree - Backend

> Estrutura de domínios do backend FastAPI + SQLModel + MySQL

## Visão Geral da Arquitetura

```
backend/
├── Domain: Auth/Usuários 🔐
├── Domain: Livros (Acervo) 📚
├── Domain: Lista de Leitura 📖
├── Domain: Anotações ✏️
└── Domain: Pedidos de Livros 📝
```

---

## Domínios

### 🔐 Domain: Auth/Usuários

> Gerenciamento de autenticação e usuários do sistema.

```
backend/Auth/
├── Entity: Usuario
│   ├── id: int (PK)
│   ├── nome: str
│   ├── email: str (unique)
│   ├── senha_hash: str
│   ├── is_admin: bool
│   └── created_at: datetime
├── DTOs
│   ├── UsuarioCreate
│   └── UsuarioLogin
├── Service: AuthService
│   ├── bcrypt (hash de senhas)
│   └── JWT (geração/validação de tokens)
├── Repository: SQLModel
└── Routes: /auth/*
    ├── POST /auth/register
    ├── POST /auth/login
    └── GET  /auth/verify
```

**Local:** `backend/models.py`, `backend/auth.py`

---

### 📚 Domain: Livros (Acervo)

> Catálogo central de livros e documentos digitais.

```
backend/Livros/
├── Entity: Livro
│   ├── id: int (PK)
│   ├── titulo: str
│   ├── autor: str
│   ├── ano: int
│   ├── editora: str
│   ├── genero: str
│   ├── area: str
│   ├── idioma: str
│   ├── paginas: int
│   ├── sinopse: str
│   ├── caminho: str (PDF)
│   ├── capa: blob (imagem)
│   └── data_adicao: datetime
├── DTOs
│   ├── LivroRead
│   └── LivroUpdate
├── Services
│   ├── PDFService
│   │   ├── extrair_texto()
│   │   └── contar_paginas()
│   └── TranslationService
│       └── traduzir_pagina()
├── Repository: SQLModel
└── Routes: /documents/*
    ├── GET    /documents
    ├── GET    /documents/{doc_id}/file
    ├── GET    /documents/{doc_id}/cover
    ├── GET    /documents/{doc_id}/details      (admin)
    ├── PUT    /documents/{doc_id}/update       (admin)
    ├── POST   /documents/{doc_id}/page/{page_number}/translate
    ├── GET    /documents/{doc_id}/annotations
    └── POST   /documents/{doc_id}/annotations
```

**Local:** `backend/models.py`, `backend/services.py`

---

### 📖 Domain: Lista de Leitura

> Gerenciamento da lista pessoal de leitura de cada usuário.

```
backend/ListaLeitura/
├── Entity: ListaLeitura
│   ├── id: int (PK)
│   ├── usuario_id: int (FK → Usuario)
│   ├── livro_id: int (FK → Livro)
│   ├── status: Enum
│   │   ├── quero_ler
│   │   ├── lendo
│   │   └── concluido
│   └── data_adicao: datetime
├── DTOs
│   └── ListaLeituraUpdate
├── Repository: SQLModel
└── Routes: /my-list/*
    ├── GET    /my-list
    ├── POST   /my-list/add/{livro_id}
    ├── POST   /my-list/add2
    ├── PUT    /my-list/{livro_id}/status
    └── DELETE /my-list/remove/{livro_id}
```

**Local:** `backend/models.py`

**Dependências:**
- Usuario (FK: usuario_id)
- Livro (FK: livro_id)

---

### ✏️ Domain: Anotações

> Anotações, marcações e progresso de leitura por usuário e livro.

```
backend/Anotacoes/
├── Entity: Anotacao
│   ├── id: int (PK)
│   ├── usuario_id: int (FK → Usuario)
│   ├── livro_id: int (FK → Livro)
│   ├── dados_json: JSON
│   │   ├── bookmarks: array
│   │   ├── notes: array
│   │   ├── highlights: array
│   │   ├── lastPage: int
│   │   └── totalPages: int
│   └── updated_at: datetime
├── Repository: SQLModel
└── Routes: /documents/{doc_id}/annotations
    ├── GET  /documents/{doc_id}/annotations
    └── POST /documents/{doc_id}/annotations
```

**Local:** `backend/models.py`

**Dependências:**
- Usuario (FK: usuario_id)
- Livro (FK: livro_id)

---

### 📝 Domain: Pedidos de Livros

> Sistema de solicitação de novos livros pelos usuários.

```
backend/PedidosLivros/
├── Entity: PedidoLivro
│   ├── id: int (PK)
│   ├── usuario_id: int (FK → Usuario)
│   ├── titulo: str
│   ├── autor: str
│   ├── editora: str
│   ├── status: Enum
│   │   ├── pendente
│   │   ├── em_analise
│   │   ├── aprovado
│   │   └── recusado
│   ├── data_criacao: datetime
│   ├── data_atualizacao: datetime
│   └── observacoes: str
├── DTOs
│   ├── PedidoLivroCreate
│   └── PedidoLivroUpdate
├── Repository: SQLModel
└── Routes: /pedidos/*
    ├── POST   /pedidos                    (user)
    ├── GET    /pedidos/meus               (user)
    ├── GET    /pedidos                    (admin)
    ├── PUT    /pedidos/{pedido_id}/status (admin)
    └── DELETE /pedidos/{pedido_id}        (admin)
```

**Local:** `backend/models.py`

**Dependências:**
- Usuario (FK: usuario_id)

---

## Mapa de Dependências

```
                    ┌─────────────┐
                    │   Auth/     │
                    │  Usuários   │
                    │   🔐        │
                    └──────┬──────┘
                           │
           ┌───────────────┼───────────────┐
           │               │               │
           ▼               ▼               ▼
    ┌────────────┐   ┌────────────┐   ┌────────────┐
    │   Lista    │   │ Anotações  │   │  Pedidos   │
    │  Leitura   │   │    ✏️      │   │   Livros   │
    │   📖       │   │            │   │   📝       │
    └─────┬──────┘   └─────┬──────┘   └────────────┘
          │                │
          └────────────────┘
                     │
                     ▼
              ┌────────────┐
              │   Livros   │
              │    📚      │
              │  (Acervo)  │
              └────────────┘
```

### Relacionamentos entre Domínios

| Domínio Fonte | Domínio Alvo | Tipo | Descrição |
|---------------|--------------|------|-----------|
| ListaLeitura | Usuario | N:1 | Cada entrada pertence a um usuário |
| ListaLeitura | Livro | N:1 | Cada entrada referencia um livro |
| Anotacoes | Usuario | N:1 | Anotações por usuário |
| Anotacoes | Livro | N:1 | Anotações por livro |
| PedidosLivros | Usuario | N:1 | Pedidos feitos por usuários |

---

## Estrutura de Arquivos

```
backend/
├── main.py                  # Entry point FastAPI
├── routes.py               # Rotas/endpoints (acessa todos os domínios)
├── models.py               # Entidades SQLModel (todos os domínios)
├── database.py             # Configuração MySQL
├── services.py             # PDFService, TranslationService
├── auth.py                 # JWT, bcrypt (Auth domain)
├── insert_livros.py        # Script importação (Livros)
├── sync_livros.py          # Sincronização (Livros)
├── capas.py                # Geração de capas (Livros)
├── admin_livros.py         # Interface Streamlit (Admin)
└── update_pages.py         # Atualização páginas (Livros)
```

---

## Convenções

### Nomenclatura

| Elemento | Convenção | Exemplo |
|----------|-----------|---------|
| Entidades | PascalCase | `Livro`, `Usuario` |
| Tabelas | snake_case, plural | `livros`, `usuarios` |
| DTOs | Sufixo + Acao | `LivroRead`, `UsuarioCreate` |
| Services | Sufixo Service | `PDFService`, `AuthService` |
| Rotas | kebab-case, plural | `/my-list`, `/documents` |

### Status Enums

```python
# ListaLeitura
class StatusLeitura(str, Enum):
    QUERO_LER = "quero_ler"
    LENDO = "lendo"
    CONCLUIDO = "concluido"

# PedidoLivro
class StatusPedido(str, Enum):
    PENDENTE = "pendente"
    EM_ANALISE = "em_analise"
    APROVADO = "aprovado"
    RECUSADO = "recusado"
```

---

## Resumo da Arquitetura

| Aspecto | Implementação |
|---------|---------------|
| **Framework** | FastAPI |
| **ORM** | SQLModel |
| **Banco** | MySQL |
| **Auth** | JWT + bcrypt |
| **Padrão** | Domain-Driven Design (leve) |
| **DTOs** | SQLModel schemas |
| **Serviços** | Classes utilitárias |

---

## Pontos de Extensão

Para adicionar novos domínios:

1. Criar entidade em `models.py`
2. Definir DTOs (se necessário)
3. Adicionar rotas em `routes.py`
4. Criar services em `services.py` (se necessário)
5. Atualizar este documento

---

*Documentação gerada em: 2026-02-18*
*Stack: FastAPI + SQLModel + MySQL*
