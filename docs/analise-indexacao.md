# Análise — indexação de livros (RAG)

_25/10/2026 · referência: `backend/ai/rag.py`, `_run_index` em `backend/ai_routes.py`_

## Estado atual (medido)

- **Nenhum livro indexado:** ChromaDB vazio, tabela `livros_ia_status` vazia.
- **Ollama inacessível** em `host.docker.internal:11434` (`EMBED_PROVIDER=ollama`, modelo `nomic-embed-text`): a indexação hoje falha logo no primeiro lote.
- **Quem depende do índice:** só o chat da aba IA do leitor de PDF. O chat do Estúdio não usa mais o índice (resumo salvo + busca por palavras em todas as páginas da seleção).

## Acervo (amostra de 60 PDFs)

| Métrica | Valor |
|---|---|
| PDFs | 2.303 (+209 EPUBs) |
| Páginas por livro | mediana 339 · média 749 · máx 12.754 |
| Texto por página (limite atual de 3.000 chars) | média 1.424 caracteres |
| Escaneados, sem texto (precisam OCR) | ~12% |
| **Estimativa do acervo inteiro** | ~1,5 mi páginas com texto · ~2,2 bi caracteres · **~550 mi tokens** |

## Custo de indexar tudo em lote

| Opção | Custo | Tempo / observação |
|---|---|---|
| Ollama local (`nomic-embed-text`, 768 dim) | **R$ 0** | Não medido (Ollama desligado). Ordem de grandeza: CPU ~10–30 págs/s → **14–42 h**; GPU bem mais rápido |
| OpenAI `text-embedding-3-small` (1536 dim) | **~US$ 11** (~US$ 5,50 pela Batch API) | Horas, limitado por rate limit |
| Gemini `gemini-embedding-001` | **~US$ 80** (tabela paga) | Camada gratuita existe, mas com limite diário baixo para este volume |
| **Armazenamento no ChromaDB** | ~8–10 GB (768 dim) · ~12 GB (1536 dim) | vetores + texto + índice HNSW |

_Preços de referência por 1 mi de tokens (OpenAI US$ 0,02; Gemini US$ 0,15) — confirmar na tabela do provedor antes de rodar._

## Problemas de robustez no código atual

| # | Problema | Efeito |
|---|---|---|
| 1 | Indexar um intervalo de capítulos **apaga o índice inteiro do livro** antes de inserir (`col.delete` de todos os ids) | indexar o cap. 5 perde os caps. 1–4 já indexados |
| 2 | Apaga tudo e só depois reindexa; erro no meio deixa o livro meio indexado | estado inconsistente após falha |
| 3 | Página cortada em 3.000 caracteres, sem divisão em trechos nem sobreposição | perde o fim de páginas densas |
| 4 | O modelo de embedding não é registrado por coleção | trocar `EMBED_PROVIDER`/modelo deixa vetores incompatíveis e buscas sem sentido, sem erro |
| 5 | Uma coleção por livro (até ~2.500 coleções) | sobrecarga de metadados no Chroma; o `livro_id` já está nos metadados e permitiria uma coleção única |
| 6 | Sem fila nem limite de concorrência (`BackgroundTasks` por requisição) | indexar vários livros ao mesmo tempo sobrecarrega o Ollama |
| 7 | Livro escaneado termina "indexado" com 0 páginas | usuário fica preso em "livro não indexado" sem explicação |
| 8 | Chamadas síncronas do Chroma dentro de rotas `async` | travam o servidor durante a indexação |
| 9 | Nenhuma nova tentativa quando o Ollama oscila | um erro transitório derruba a indexação inteira |

## Recomendação

1. **Não indexar o acervo em lote.** O ganho é só para o chat do leitor de PDF e o custo é de dezenas de horas ou ~10 GB.
2. **Levar o chat do leitor para o mesmo modelo do Estúdio** (resumo salvo do capítulo atual + busca por palavras nas páginas): custo zero, nenhuma dependência do Ollama, funciona para qualquer livro na hora.
3. **Se a busca semântica entre livros virar requisito**, corrigir os itens 1, 2, 4, 6 e 7 antes de indexar qualquer coisa, e indexar sob demanda (ao abrir o chat), com fila de 1–2 livros por vez.
