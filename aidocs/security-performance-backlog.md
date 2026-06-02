---
# Backlog de Segurança e Performance — BibliosHome

> Auditoria realizada em 31/05/2026. Itens críticos/altos/médios imediatos já foram corrigidos no commit 4252ee3.
> Este documento registra os itens que exigem maior esforço e ficaram para um próximo ciclo.

---

## A2 — Rate Limiting em Login e Registro

**Severidade:** Alta  
**Arquivos:** `backend/main.py`, `backend/routes.py`

**Problema:** `POST /auth/login` e `POST /auth/register` não têm limitação de taxa. Brute force de senha e criação massiva de contas são possíveis sem restrição.

**Implementação sugerida:**
1. Adicionar dependência `slowapi` ao `backend/requirements.txt`
2. Configurar limiter em `main.py`:
```python
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
```
3. Decorar os endpoints:
```python
@router.post("/auth/login")
@limiter.limit("10/minute")
def login(request: Request, ...):

@router.post("/auth/register")
@limiter.limit("5/minute")
def register(request: Request, ...):
```

**Esforço estimado:** ~1h

---

## P1 — BLOB de Capa Carregado em Toda Query de Listagem

**Severidade:** Performance alta (impacto direto em memória e I/O)  
**Arquivos:** `backend/models.py`, `backend/routes.py` (linhas 80, 104, 330, 390, 829)

**Problema:** `select(Livro)` carrega a coluna `capa` (bytes JPEG, ~30KB médio) em RAM mesmo quando `LivroRead` não a retorna. Em 24 livros por página = ~720KB de dados descartados por request. Piora com busca por texto que varre toda a tabela.

**Opção A — Projeção explícita (médio prazo):**
Usar `select(Livro.id, Livro.titulo, Livro.autor, ...)` sem `Livro.capa` nas listagens, e buscar a capa apenas no endpoint `/cover`.

**Opção B — Migrar capas para disco (longo prazo, recomendada):**
- Salvar capas como arquivos em `/data/biblioteca/.capas/{id}.jpg`
- Remover a coluna `capa bytes` do banco
- Nginx serve os arquivos estáticos diretamente (sem passar pelo Python)
- Ganho: elimina BLOB do MySQL, reduz tamanho do banco, capas servidas com cache HTTP nativo

**Esforço estimado:** Opção A ~2h | Opção B ~1 dia (inclui migração de dados)

---

## C4 — `caminho` Exposto no DTO Público `LivroRead`

**Severidade:** Média (mitigada: `/documents` agora exige auth desde commit 4252ee3)  
**Arquivos:** `backend/models.py`, `backend/routes.py`, `frontend/src/components/DocumentList.jsx`

**Problema residual:** Usuários autenticados ainda veem `caminho` (ex: `E:\BIBLIOTECA\Ciencias\livro.pdf`) nas respostas da API. Expõe estrutura interna de diretórios, letras de drive Windows e nomes de arquivos para todos os usuários (não só admin).

**Implementação sugerida:**
1. Adicionar campo `file_type: Optional[str] = None` ao `LivroRead`
2. Calcular `file_type` no endpoint `list_documents` a partir da extensão do caminho:
```python
def _get_file_type(caminho: Optional[str]) -> str:
    if not caminho:
        return 'pdf'
    ext = caminho.lower().rsplit('.', 1)[-1] if '.' in caminho else ''
    return ext if ext in ('pdf', 'epub') else 'pdf'
```
3. Remover `caminho` de `LivroRead`; criar `LivroAdmin(LivroRead):` com `caminho` para os endpoints admin (`/details`, `/update`)
4. Atualizar `DocumentList.jsx` para usar `doc.file_type === 'epub'` em vez de `doc.caminho?.endsWith('.epub')`

**Esforço estimado:** ~3h (backend + frontend + testes)

---

## Q5 — Guards de Autenticação Duplicados no Frontend

**Severidade:** Qualidade de código (sem risco de segurança)  
**Arquivo:** `frontend/src/App.jsx` (linhas 21-112)

**Problema:** `PrivateRoute` e `AdminRoute` são 90% código duplicado — mesma lógica de verificação de token, mesmo spinner de loading, mesmo redirect para login.

**Implementação sugerida:**
```jsx
function useAuthGuard(requireAdmin = false) {
    const [state, setState] = useState({ status: 'loading', isAdmin: false });
    const token = localStorage.getItem('token');

    useEffect(() => {
        if (!token) { setState({ status: 'unauthenticated', isAdmin: false }); return; }
        api.get('/auth/verify')
            .then(res => setState({ status: 'ok', isAdmin: res.data.user.is_admin }))
            .catch(() => { localStorage.clear(); setState({ status: 'unauthenticated', isAdmin: false }); });
    }, [token]);

    return state;
}

const PrivateRoute = ({ children }) => {
    const { status } = useAuthGuard();
    if (status === 'loading') return <Spinner />;
    if (status === 'unauthenticated') return <Navigate to="/login" replace />;
    return children;
};

const AdminRoute = ({ children }) => {
    const { status, isAdmin } = useAuthGuard(true);
    if (status === 'loading') return <Spinner />;
    if (status === 'unauthenticated') return <Navigate to="/login" replace />;
    if (!isAdmin) return <Navigate to="/" replace />;
    return children;
};
```

**Esforço estimado:** ~30min

---

## Notas Gerais

### JWT em localStorage (info — sem plano de mudança imediata)
O token JWT é armazenado em `localStorage` (`api.js:11`). O comentário no código diz "Cookies HttpOnly" mas a implementação usa localStorage. Para um sistema pessoal/doméstico atrás de ZeroTrust o risco é baixo, mas a inconsistência deve ser reconhecida. Migrar para cookie HttpOnly requer mudanças no backend (set-cookie no login) e remoção do interceptor de request no frontend.

### MySQL na porta 3307 do host
`docker-compose.yml:14-15` publica a porta. Útil para acesso via DBeaver/ferramentas locais. Em produção, remover `ports: - "3307:3306"` do compose e acessar o banco apenas via rede Docker interna.

### Índices de banco de dados ausentes
Queries de busca por título/autor usam `ILIKE %termo%` (full scan). Para biblioteca grande, adicionar:
```sql
ALTER TABLE livros ADD FULLTEXT INDEX ft_titulo_autor (titulo, autor);
ALTER TABLE livros ADD INDEX idx_area (area(100));
ALTER TABLE livros ADD INDEX idx_genero (genero);
```
---
