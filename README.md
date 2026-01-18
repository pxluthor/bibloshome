# 📚 BiblosHome

![BiblosHome](https://img.shields.io/badge/version-1.0.0-blue.svg)
![React](https://img.shields.io/badge/React-18.2.0-61DAFB.svg?logo=react)
![FastAPI](https://img.shields.io/badge/FastAPI-0.104.1-009688.svg?logo=fastapi)
![License](https://img.shields.io/badge/license-MIT-green.svg)

Uma aplicação web completa de biblioteca digital com sistema de leitura de PDFs, anotações e gerenciamento de livros.

## 🌟 Funcionalidades

### 📖 Leitura de PDFs
- Visualizador de PDFs interativo com zoom
- Navegação por página e modo página dupla
- Sistema de bookmarks (marcadores de página)
- Sistema de highlights (marcar texto com cores)
- Anotações por página
- Barra de ferramentas com atalhos de teclado
- Tela cheia
- Sidebar redimensionável (touch e mouse)

### 👤 Gerenciamento de Usuários
- Registro e autenticação de usuários
- Login com JWT (JSON Web Tokens)
- Lista pessoal de livros ("Meus Livros")
- Adicionar/remover livros da lista

### 📋 Catálogo de Livros
- Listagem de todos os livros disponíveis
- Busca por título e autor
- Filtros: "Acervo Completo" vs "Meus Livros"
- Paginação
- Exibição de capas com fallback visual
- Informações detalhadas (autor, ano, gênero)

### 🎨 Interface
- Design moderno e responsivo
- Dark theme no leitor de PDF
- Suporte a mobile, tablet e desktop
- Animações suaves
- Feedback visual em ações

## 🛠️ Stack Tecnológico

### Frontend
- **React 18.2.0** - Framework UI
- **Vite 4.4.5** - Build tool e dev server
- **React Router DOM 6.18.0** - Roteamento
- **React-PDF 9.0.0** - Renderização de PDFs
- **Tailwind CSS 3.3.5** - Estilização
- **Lucide React 0.561.0** - Ícones
- **Axios 1.6.0** - Cliente HTTP
- **DOMPurify 3.3.1** - Sanitização HTML

### Backend
- **FastAPI 0.104.1** - Framework web
- **Uvicorn** - Servidor ASGI
- **SQLModel** - ORM baseado em Pydantic
- **MySQL** - Banco de dados
- **PyJWT** - Autenticação JWT
- **Passlib** - Hash de senhas (bcrypt)
- **PDFPlumber** - Extração de texto de PDFs
- **Deep-Translator** - Tradução de textos

## 📋 Pré-requisitos

Antes de começar, certifique-se de ter instalado:

- **Node.js** 18+ e npm
- **Python** 3.10+
- **MySQL** 8.0+
- **Git**

## 🚀 Instalação

### 1. Clone o repositório

```bash
git clone https://github.com/pxluthor/bibloshome.git
cd bibloshome
```

### 2. Configuração do Backend

#### 2.1. Crie um ambiente virtual

```bash
cd backend
python -m venv venv
```

#### 2.2. Ative o ambiente virtual

**Windows:**
```bash
venv\Scripts\activate
```

**Linux/Mac:**
```bash
source venv/bin/activate
```

#### 2.3. Instale as dependências

```bash
pip install -r requirements.txt
```

#### 2.4. Configure as variáveis de ambiente

Crie um arquivo `.env` na pasta `backend` baseado no `.env.example`:

```env
# Database
DATABASE_URL=mysql+mysqlconnector://usuario:senha@localhost:3306/bibloshome

# JWT
SECRET_KEY=sua_chave_secreta_aqui_muito_segura
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440
```

#### 2.5. Crie o banco de dados

No MySQL:

```sql
CREATE DATABASE bibloshome CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

As tabelas serão criadas automaticamente ao iniciar o servidor.

### 3. Configuração do Frontend

#### 3.1. Instale as dependências

```bash
cd frontend
npm install
```

#### 3.2. Configure a API

Edite `frontend/src/services/api.js` se necessário para ajustar a URL da API.

## ▶️ Como Executar

### Modo Desenvolvimento

#### Inicie o Backend

Em um terminal (na pasta `backend`):

```bash
cd backend
uvicorn main:app --reload --port 8001
```

O backend estará disponível em `http://localhost:8001`

A documentação automática da API (Swagger) estará em `http://localhost:8001/docs`

#### Inicie o Frontend

Em outro terminal (na pasta `frontend`):

```bash
cd frontend
npm run dev
```

O frontend estará disponível em `http://localhost:5173`

### Modo Produção

#### Backend

```bash
cd backend
uvicorn main:app --host 0.0.0.0 --port 8001 --workers 4
```

#### Frontend

```bash
cd frontend
npm run build
npm run preview
```

Ou use um servidor de produção como Nginx ou Apache para servir os arquivos estáticos.

## 📁 Estrutura do Projeto

```
bibloshome/
├── backend/                 # Backend FastAPI
│   ├── main.py            # Aplicação principal
│   ├── models.py          # Modelos SQLModel
│   ├── routes.py          # Endpoints da API
│   ├── auth.py            # Autenticação JWT
│   ├── database.py        # Configuração do banco de dados
│   ├── services.py        # Serviços (PDF, tradução)
│   ├── requirements.txt   # Dependências Python
│   └── .env.example       # Exemplo de variáveis de ambiente
│
├── frontend/               # Frontend React
│   ├── src/
│   │   ├── App.jsx              # Componente principal e rotas
│   │   ├── main.jsx             # Entry point
│   │   ├── index.css            # Estilos globais
│   │   │
│   │   ├── components/          # Componentes React
│   │   │   ├── DocumentList.jsx # Lista de livros
│   │   │   ├── PDFReader.jsx    # Leitor de PDFs
│   │   │   ├── Login.jsx        # Formulário de login
│   │   │   ├── Register.jsx     # Formulário de registro
│   │   │   └── Reader/          # Componentes do leitor
│   │   │       └── SidebarTabs.jsx
│   │   │
│   │   ├── hooks/               # Hooks customizados
│   │   │   ├── usePDFAnnotations.js
│   │   │   └── useSidebarResizer.js
│   │   │
│   │   └── services/            # Serviços
│   │       └── api.js           # Configuração do Axios
│   │
│   ├── package.json        # Dependências Node.js
│   ├── vite.config.js      # Configuração do Vite
│   └── tailwind.config.js  # Configuração do Tailwind
│
├── Melhorias/              # Documentação de melhorias
│   └── roadmap-melhorias.md
│
├── .env.example            # Exemplo de variáveis de ambiente
├── .gitignore              # Arquivos ignorados pelo Git
└── README.md               # Este arquivo
```

## 🔧 Endpoints da API

### Autenticação
- `POST /auth/register` - Registrar novo usuário
- `POST /auth/login` - Fazer login
- `GET /auth/verify` - Verificar token

### Documentos
- `GET /documents` - Listar todos os documentos
- `GET /documents/{doc_id}/file` - Baixar arquivo PDF
- `GET /documents/{doc_id}/cover` - Obter capa do documento
- `GET /documents/{doc_id}/page/{page_number}/translate` - Traduzir página

### Lista de Leitura
- `GET /my-list` - Obter lista pessoal
- `POST /my-list/add/{livro_id}` - Adicionar livro à lista
- `DELETE /my-list/remove/{livro_id}` - Remover livro da lista

### Anotações
- `GET /documents/{doc_id}/annotations` - Obter anotações
- `POST /documents/{doc_id}/annotations` - Salvar anotações

Para ver a documentação completa e interativa da API, acesse `http://localhost:8001/docs`

## 🎯 Atalhos de Teclado

No leitor de PDF:
- `←` - Página anterior
- `→` - Próxima página

## 🔐 Segurança

- Senhas hashadas com bcrypt
- Autenticação via JWT
- CORS configurado
- Sanitização HTML com DOMPurify

## 📝 Roadmap

Veja o roadmap completo de melhorias planejadas em [Melhorias/roadmap-melhorias.md](Melhorias/roadmap-melhorias.md)

## 🤝 Contribuindo

Contribuições são bem-vindas! Por favor:

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/MinhaFeature`)
3. Commit suas mudanças (`git commit -m 'Adiciona MinhaFeature'`)
4. Push para a branch (`git push origin feature/MinhaFeature`)
5. Abra um Pull Request

## 📄 Licença

Este projeto está licenciado sob a Licença MIT - veja o arquivo LICENSE para detalhes.

## 👨‍💻 Autor

**Azevedo Cobretti**

- GitHub: [@pxluthor](https://github.com/pxluthor)
- Projeto: https://github.com/pxluthor/bibloshome

## 🙏 Agradecimentos

- FastAPI pela excelente documentação e facilidade de uso
- React pela comunidade ativa e ecossistema rico
- Tailwind CSS pela utilidade incrível no desenvolvimento
- react-pdf pela implementação robusta de leitura de PDFs

## 📞 Suporte

Se você encontrar algum problema ou tiver dúvidas:

1. Verifique a [documentação da API](http://localhost:8001/docs)
2. Consulte o [roadmap de melhorias](Melhorias/roadmap-melhorias.md)
3. Abra uma [issue no GitHub](https://github.com/pxluthor/bibloshome/issues)

---

**Desenvolvido com ❤️ usando React e FastAPI**
