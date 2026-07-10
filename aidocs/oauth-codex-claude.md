# OAuth Codex Pro + Claude — Integração no BibliosHome

**Implementado em:** 2026-07-09  
**Baseado em:** sistema equivalente do projeto `local-ai-assistant` (TypeScript/Node.js), portado para Python/FastAPI/MySQL.

---

## O que foi implementado

Sistema de autenticação OAuth PKCE para dois provedores de IA premium: **Codex Pro** (OpenAI/ChatGPT) e **Claude** (Anthropic). Permite que o usuário conecte suas contas via OAuth e use os modelos na plataforma, sem precisar inserir chaves de API manualmente.

---

## Arquivos criados

### `backend/oauth/`

| Arquivo | Responsabilidade |
|---------|-----------------|
| `__init__.py` | Marca o pacote Python |
| `models.py` | SQLModel: `UserOAuthCodex` e `UserOAuthClaude` — tabelas MySQL criadas automaticamente via `create_all()` no startup |
| `codex_credentials.py` | CRUD de credenciais Codex: `get_codex_credentials`, `set_codex_credentials`, `clear_codex_credentials`, `get_codex_bearer_token` |
| `claude_credentials.py` | CRUD de credenciais Claude: `get_claude_credentials`, `set_claude_credentials`, `clear_claude_credentials` |
| `codex_service.py` | Fluxo PKCE completo para Codex: gera URL de autorização, inicia servidor HTTP local na porta 1455, troca `code` → `access_token` + `id_token` → API key OpenAI |
| `claude_service.py` | Fluxo PKCE completo para Claude: gera URL de autorização, inicia servidor HTTP local na porta 1456, troca código por tokens, refresh automático quando token expira |
| `codex_routes.py` | FastAPI router: `/api/codex-oauth/{status,start,logout,usage,probe}` |
| `claude_routes.py` | FastAPI router: `/api/claude-oauth/{status,start,logout,usage}` |

---

## Arquivos modificados

### `backend/main.py`
- Adicionado import de `codex_oauth_router` e `claude_oauth_router`
- Adicionado `import oauth.models` (garante que as tabelas entram no `SQLModel.metadata` antes do `create_all()`)
- Registrados os dois routers no app

### `backend/ai_routes.py`
- `GET /ai/providers` agora inclui `codex` e `claude` na resposta, com:
  - `authenticated: bool`
  - `hasApiKey: bool` (Codex)
  - `accountId: str | null` (Codex)
  - `subscriptionType: str | null` (Claude: max/pro/enterprise/team)
  - `accountEmail: str | null` (Claude)
  - `hasInferenceScope: bool` (Claude)
  - `models: list[str]` — lista fixa de modelos disponíveis

### `frontend/src/components/SettingsPage.jsx`
- Nova seção **"Provedores Premium"** adicionada abaixo do card de IA existente
- **Card Codex Pro**: badge connected/disconnected, botão Conectar/Desconectar, seletor de modelo, botão "Ver consumo"
- **Card Claude**: idem, com exibição de subscription type e aviso quando falta o escopo `user:inference`
- Polling a cada 2s após abertura de popup OAuth para detectar quando o login for concluído

---

## Fluxo de autenticação

```
[Frontend] Clique em "Conectar"
  → POST /api/codex-oauth/start
      → backend gera state + code_verifier (PKCE S256)
      → inicia HTTPServer em thread daemon (porta 1455 Codex / 1456 Claude)
      → retorna { auth_url: "https://auth.openai.com/oauth/authorize?..." }

[Frontend] window.open(auth_url, popup)
  → usuário autoriza no provider

[Provider] redireciona para http://localhost:1455/auth/callback?code=...&state=...
  → HTTPServer local captura o request
  → dispara thread: complete_codex_flow(code, state, session)
      → POST form-urlencoded → CODEX_OAUTH_ISSUER/oauth/token (troca code por tokens)
      → POST form-urlencoded → token-exchange (troca id_token por API key OpenAI)
      → salva credenciais em user_oauth_codex (MySQL)
  → responde HTML com auto-close após 1.8s

[Frontend] polling GET /api/codex-oauth/status a cada 2s
  → quando authenticated: true → fecha popup, exibe toast, recarrega providers
```

Para Claude o fluxo é equivalente mas:
- Callback na porta 1456
- Token endpoint recebe JSON (não form-urlencoded)
- Busca perfil em `https://api.anthropic.com/api/oauth/profile` após autenticar
- Refresh automático: quando `expiresAt - agora < 60s` e há `refreshToken`, faz refresh antes de retornar status

---

## Constantes e variáveis de ambiente

Podem ser sobrescritas via `.env`:

| Variável | Default | Descrição |
|----------|---------|-----------|
| `CODEX_OAUTH_CLIENT_ID` | `app_EMoamEEZ73f0CkXaXp7hrann` | Client ID registrado na OpenAI |
| `CODEX_OAUTH_CALLBACK_URL` | `http://localhost:1455/auth/callback` | URL de callback do Codex |
| `CLAUDE_OAUTH_CLIENT_ID` | `9d1c250a-e61b-44d9-88ed-5944d1962f5e` | Client ID registrado na Anthropic |
| `CLAUDE_OAUTH_CALLBACK_URL` | `http://localhost:1456/callback` | URL de callback do Claude |
| `CLAUDE_OAUTH_AUTHORIZE_URL` | `https://claude.com/cai/oauth/authorize` | Endpoint de autorização |
| `CLAUDE_OAUTH_TOKEN_URL` | `https://platform.claude.com/v1/oauth/token` | Endpoint de token |
| `CLAUDE_OAUTH_BASE_API_URL` | `https://api.anthropic.com` | Base API para profile e usage |

> **Importante:** os client IDs acima são os mesmos usados pelo `local-ai-assistant`. As URLs de callback são `localhost` — o fluxo OAuth funciona apenas quando o usuário acessa o app a partir da mesma máquina onde o backend roda (cenário local/self-hosted esperado para o BibliosHome).

---

## Estrutura das credenciais armazenadas

### Codex (`user_oauth_codex.credentials` — JSON)
```json
{
  "apiKey": "sk-...",
  "accessToken": "eyJ...",
  "refreshToken": "...",
  "idToken": "eyJ...",
  "accountId": "chatgpt-account-uuid",
  "obtainedAt": 1720526400000
}
```
O campo `apiKey` (obtido via token-exchange do `id_token`) é preferido como bearer. Se não houver, usa `accessToken`.

### Claude (`user_oauth_claude.credentials` — JSON)
```json
{
  "accessToken": "sk-ant-oat01-...",
  "refreshToken": "...",
  "scopes": ["user:inference", "user:profile", "..."],
  "expiresAt": 1720530000000,
  "obtainedAt": 1720526400000,
  "subscriptionType": "pro",
  "rateLimitTier": "standard",
  "accountEmail": "usuario@example.com",
  "accountUuid": "...",
  "organizationUuid": "..."
}
```

---

## Endpoints disponíveis

### Codex
| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/codex-oauth/status` | Status de autenticação do usuário atual |
| `POST` | `/api/codex-oauth/start` | Inicia o fluxo OAuth, retorna `auth_url` |
| `POST` | `/api/codex-oauth/logout` | Remove credenciais do banco |
| `GET` | `/api/codex-oauth/usage` | Consulta `chatgpt.com/backend-api/wham/usage` |
| `POST` | `/api/codex-oauth/probe` | Testa conectividade (body: `{ model: "gpt-5.5" }`) |

### Claude
| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/claude-oauth/status` | Status (faz refresh automático se necessário) |
| `POST` | `/api/claude-oauth/start` | Inicia o fluxo OAuth, retorna `auth_url` |
| `POST` | `/api/claude-oauth/logout` | Remove credenciais do banco |
| `GET` | `/api/claude-oauth/usage` | Consulta `api.anthropic.com/api/oauth/usage` |

Todos os endpoints requerem autenticação JWT (`Authorization: Bearer <token>`).

---

## Dependências usadas

- `httpx` — HTTP sync (já estava no `requirements.txt`)
- `http.server.HTTPServer` + `threading` — servidor callback local (stdlib Python)
- `sqlmodel` / `sqlalchemy.text` — acesso ao MySQL
- Sem novas dependências adicionadas ao `requirements.txt`

---

## Inferência com credenciais OAuth — CONCLUÍDO (2026-07-10)

As credenciais OAuth agora são usadas de fato nas chamadas de IA.

### Backend

- **`ai/providers.py`**: adicionados `CodexOAuthProvider` e `ClaudeOAuthProvider` (ambos sem acesso a DB — recebem token concreto no construtor).
  - **Codex**: chama `POST https://chatgpt.com/backend-api/codex/responses` (Responses API), com header `chatgpt-account-id`. Streaming lê eventos SSE `response.output_text.delta`. Contrato copiado do endpoint `/probe` já existente.
  - **Claude**: chama `POST https://api.anthropic.com/v1/messages` com `Authorization: Bearer <accessToken>` + `anthropic-beta: oauth-2025-04-20`. O **primeiro bloco de `system` é obrigatoriamente a identidade do Claude Code** (`"You are Claude Code, Anthropic's official CLI for Claude."`); o system real da app entra como segundo bloco. Streaming lê eventos `content_block_delta`.
  - `embed()` desses providers levanta `NotImplementedError` — embeddings/RAG continuam sempre no Ollama.
- **`ai_routes.py`**: novo helper público `build_provider(settings, user_id, session)` centraliza a construção dos 4 providers (ollama/openai/codex/claude). Busca credenciais e, no caso do Claude, faz `refresh_claude_if_needed` antes de usar o token. Chamado nos 3 sites de inferência (`extract-metadata`, `summarize`, `chat`).
- **`auto_metadata_routes.py`** e **`ai_estudio_routes.py`**: passaram a usar `build_provider` em vez de `get_provider`, então Codex/Claude funcionam também no preenchimento automático e no Estúdio.

### Persistência do modelo

- Reutiliza a coluna `chat_model` de `UsuarioAISettings` (sem nova coluna — evita mudança de schema, dado o histórico de perda de dados). Quando `provider = "codex" | "claude"`, `chat_model` guarda o modelo escolhido.

### Frontend (`SettingsPage.jsx`)

- Cada card premium (Codex/Claude) ganhou botão **"Usar para IA"** que faz `PUT /ai/settings` com `provider` + `chat_model` e ativa aquele provedor. Quando ativo, o botão vira **"Ativo para IA"** (verde, desabilitado).
- O card do Claude só habilita o botão se `hasInferenceScope` for verdadeiro.
- Ao carregar, `codexModel`/`claudeModel` são inicializados a partir de `chat_model` quando o provider ativo é codex/claude.

> **Nota de verificação:** o plumbing segue o contrato do `/probe` (Codex) e o contrato documentado do Claude Code OAuth. Os nomes de eventos SSE e o formato de resposta só podem ser confirmados em runtime com uma conta conectada — teste conectando a conta e usando "Usar para IA".
