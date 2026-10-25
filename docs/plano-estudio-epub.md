# Plano — Estúdio para livros EPUB

_25/10/2026 · status: proposta, nada implementado_

## Diagnóstico

| Camada | Situação hoje |
|---|---|
| Backend (`ai_estudio_routes.py`) | **Já lê EPUB.** PyMuPDF (`fitz`) abre `.epub`: sumário (`get_toc`) e texto por página funcionam. Testado com 3 dos 209 EPUBs do acervo: 30, 23 e 22 capítulos detectados. |
| Entrada no Estúdio | Só pelo botão da aba IA do **leitor de PDF** (`Reader/AITab.jsx`). O `EpubReader` não tem esse botão. |
| Paginação | **Diverge.** O PyMuPDF "pagina" o EPUB com um layout próprio (ex.: 449 páginas; 413 com layout fixo), enquanto o leitor (`epub.js`) usa localizações CFI. A "p. 120" citada pelo Estúdio não corresponde à "p. 120" do leitor. |
| Rótulos | A barra lateral, o chat e os artefatos falam em "páginas" e "leitura direta do PDF". |

## Decisões

1. **Unidade de navegação do EPUB = capítulo, não página.** Num EPUB a página não é estável (depende de fonte e tela). O Estúdio passa a citar `(cap. "Título", trecho N)` em EPUB e mantém `(p. N)` em PDF.
2. **Paginação estável no backend:** sempre abrir EPUB com `doc.layout(width=500, height=700, fontsize=11)` num helper único (`open_document()`), para que `escopo`, chapters, cache de resumo e artefatos salvos usem a mesma numeração entre chamadas e versões do PyMuPDF.
3. **Escopo continua sendo intervalo de "páginas internas"**, usado só como chave; nunca é mostrado ao usuário em EPUB.

## Etapas

| # | Etapa | Onde | Esforço |
|---|---|---|---|
| 1 | Helper `open_document(path)` que aplica layout fixo a EPUB; usar em `_extract_pages_text`, `_read_pages`, `get_chapters` | `ai_estudio_routes.py` | baixo |
| 2 | `get_chapters` devolve `kind: "epub" \| "pdf"` | backend | baixo |
| 3 | Botão **Estúdio** no `EpubReader` (cabeçalho) e no menu do cartão do livro | `EpubReader.jsx`, `BookCard`/`BookListRow` | baixo |
| 4 | Estúdio adapta rótulos quando `kind === "epub"`: "capítulos" no lugar de "p. 18–25", "leitura direta do livro" | `Estudio.jsx` | baixo |
| 5 | Citações por capítulo em EPUB: marcadores `[Capítulo: título]` no contexto e prompt pedindo `(cap. título)` | `ai_estudio_routes.py` (contexto e prompts) | médio |
| 6 | Link da citação abre o leitor no capítulo: `EpubReader` aceita `?cap=<href do sumário>` e chama `rendition.display(href)` | `EpubReader.jsx` | médio |
| 7 | EPUB sem sumário: fallback de "capítulos" pelos itens do spine (`ebooklib`, já instalado) | backend | médio |
| 8 | Testes: 10 EPUBs reais (com/sem sumário, só imagem, DRM) — chapters, chat, 1 artefato de cada tipo, MP3/MP4 | — | baixo |

Sugestão de entrega: **etapas 1–4 primeiro** (o Estúdio já fica utilizável em EPUB, citando por capítulo implícito), depois 5–7.

## Riscos

- **EPUB com DRM ou só imagens** (quadrinhos, escaneados): PyMuPDF não extrai texto → mostrar aviso claro como no PDF escaneado.
- **Mudança de layout invalida chaves salvas:** se as dimensões do `open_document` mudarem no futuro, os `escopo` antigos deixam de bater. Fixar as constantes e anotar aqui.
- **Sumário muito granular** (centenas de itens de nível 3): manter o filtro `level <= 2` já usado.
