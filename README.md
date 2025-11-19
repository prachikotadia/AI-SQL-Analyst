# AI SQL Analyst

> Production-grade natural language to SQL query engine with intelligent chart visualization, fuzzy matching, and chat-based file management.

[![Next.js](https://img.shields.io/badge/Next.js-15-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-blue)](https://react.dev/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

A full-stack web application that converts natural language queries into SQL, executes them on uploaded CSV/Excel files, and automatically generates visualizations. Built with Next.js, TypeScript, and OpenRouter API.

---

## 🎯 Features

### Core Functionality
- **Natural Language to SQL**: Convert plain English queries to optimized SQL using GPT-4o-mini
- **File Upload & Parsing**: Support for CSV and Excel files with automatic schema inference
- **In-Memory Query Engine**: Fast SQL execution on uploaded data without database setup
- **Automatic Chart Generation**: Smart visualization based on result structure (bar, line, pie, table)
- **Chat-Based Sessions**: Persistent file attachments per chat with query history

### Advanced Features
- **Fuzzy Matching**: Intelligent typo correction for table/column names
- **Schema Validation**: Multi-layer SQL validation preventing hallucinations and errors
- **Retry Logic**: Automatic SQL correction on validation failures
- **Case-Insensitive Matching**: Robust column name resolution
- **Real-Time Results**: Instant query execution with loading states

### User Experience
- **Modern UI**: Neumorphic design with light/dark mode support
- **Responsive Design**: Works seamlessly on desktop and mobile
- **Query History**: Per-chat message history with full result restoration
- **File Management**: Drag-and-drop file uploads with visual feedback

---

## 🏗️ Architecture

### Tech Stack

**Frontend**
- Next.js 15 (App Router) - React framework with SSR and API routes
- React 18 - UI library with hooks and server components
- TypeScript 5.3 - Type-safe development
- Tailwind CSS 3.3 - Utility-first styling
- ShadCN UI - Accessible component library
- Recharts 2.10 - Data visualization

**Backend**
- Node.js 18+ - JavaScript runtime
- Next.js API Routes - Serverless backend endpoints
- OpenRouter API - LLM service (GPT-4o-mini)
- PostgreSQL 14+ (optional) - Database for persistent storage
- Prisma 5.7 - Type-safe ORM

**Data Processing**
- XLSX 0.18 - Excel file parsing
- csv-parse 6.1 - CSV file parsing
- UUID 13.0 - Unique identifier generation

### System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │ QueryInput   │  │ ResultsPanel │  │ HistorySidebar│  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘   │
└─────────┼──────────────────┼──────────────────┼──────────┘
          │                  │                  │
          ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────────┐
│                  API Routes (Next.js)                   │
│  /api/query  │  /api/attachments  │  /api/chats         │
└──────────────┼──────────────────────┼───────────────────┘
               │                      │
               ▼                      ▼
┌──────────────────────────┐  ┌──────────────────────────┐
│   Business Logic Layer   │  │    Data Storage Layer    │
│  • NL→SQL (LLM)          │  │  • File Registry         │
│  • SQL Validation        │  │  • Chat Store            │
│  • Query Execution       │  │  • In-Memory Data        │
│  • Chart Generation      │  │                          │
└──────────────────────────┘  └──────────────────────────┘
```

---

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL 14+ (optional, for persistent storage)
- OpenRouter API key ([Get one here](https://openrouter.ai/))

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd ai-sql-analyst
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env`:
   ```env
   # OpenRouter API Configuration
   OPENAI_API_KEY=sk-or-v1-your-key-here
   OPENAI_BASE_URL=https://openrouter.ai/api/v1
   OPENAI_MODEL=openai/gpt-4o-mini
   
   # Database (optional)
   DATABASE_URL="postgresql://user:password@localhost:5432/ai_sql_analyst"
   ```

4. **Set up database (optional)**
   ```bash
   npm run prisma:generate
   npm run prisma:migrate
   ```

5. **Start development server**
   ```bash
   npm run dev
   ```

6. **Open in browser**
   ```
   http://localhost:3000
   ```

---

## 📖 Usage

### Basic Workflow

1. **Upload a File**
   - Click "Attach CSV/Excel" or drag and drop a file
   - Supported formats: `.csv`, `.xlsx`, `.xls`
   - File is parsed and schema is automatically detected

2. **Ask a Question**
   - Type your question in natural language
   - Examples:
     - "Show me all products with price over 100"
     - "Count how many cities are in each state"
     - "What's the average stock level by category?"

3. **View Results**
   - **Reasoning**: Explanation of how the query was interpreted
   - **SQL**: Generated SQL query (with copy button)
   - **Data**: Table view of results
   - **Chart**: Automatic visualization

4. **Manage Chats**
   - Create new chats for different datasets
   - View query history per chat
   - Files persist across queries in the same chat

### Example Queries

```
"List all cities in Texas"
"Show products with stock less than 50"
"Count how many items are in each category"
"What's the total revenue by month?"
"Find the top 10 products by price"
```

---

## 🧩 Project Structure

```
ai-sql-analyst/
├── app/                      # Next.js App Router
│   ├── api/                  # API routes
│   │   ├── query/            # Query processing endpoint
│   │   ├── attachments/      # File upload endpoint
│   │   ├── chats/            # Chat management endpoints
│   │   └── ...
│   ├── page.tsx              # Main application page
│   └── globals.css           # Global styles
├── components/                # React components
│   ├── QueryInput.tsx        # Query input with file upload
│   ├── ResultsPanel.tsx      # Results display (tabs)
│   ├── HistorySidebar.tsx    # Chat history sidebar
│   └── ui/                   # ShadCN UI components
├── lib/                      # Business logic
│   ├── llm/                  # LLM integration
│   │   ├── promptFromFiles.ts # Prompt construction
│   │   └── client.ts         # OpenRouter client
│   ├── sql/                  # SQL processing
│   │   ├── validator.ts      # SQL validation
│   │   ├── schemaValidator.ts # Schema validation
│   │   └── sanitizer.ts      # SQL sanitization
│   ├── data/                 # Data management
│   │   ├── queryEngine.ts    # In-memory SQL engine
│   │   ├── fileRegistry.ts   # File storage
│   │   └── chatStore.ts     # Chat management
│   └── chart/                # Chart generation
│       └── resultBasedChart.ts # Chart from results
├── types/                     # TypeScript types
├── prisma/                    # Database schema (optional)
└── public/                    # Static assets
```

---

## 🔧 Key Components

### Query Processing Pipeline

1. **File Upload** → Parse CSV/Excel → Extract schema → Store in registry
2. **User Query** → Build prompt with schema → Call LLM API
3. **SQL Generation** → Validate against schema → Retry if invalid
4. **Execution** → Run SQL on in-memory data → Return results
5. **Chart Generation** → Analyze result structure → Generate visualization
6. **Response** → Return reasoning, SQL, data, and chart

### SQL Validation

Three-tier validation system:
- **Tier 1**: Structure validation (syntax, dangerous keywords)
- **Tier 2**: Schema validation (table/column existence)
- **Tier 3**: Execution safety (read-only queries)

### Chart Generation

Automatic chart type detection:
- **Bar Chart**: Category + numeric values
- **Line Chart**: Date/time + numeric values
- **Pie Chart**: Single value or subset vs rest comparison
- **Table**: Default fallback for complex data

---

## 🛡️ Security & Safety

### SQL Injection Prevention
- Users cannot write SQL directly (only natural language)
- SQL is generated by LLM, not concatenated from user input
- Schema validation ensures only valid tables/columns are used
- In-memory execution doesn't connect to external databases

### File Upload Safety
- File type validation (CSV/Excel only)
- File size limits (configurable)
- Schema validation before processing
- No code execution from uploaded files

### Data Privacy
- Files stored in-memory (not persisted to disk)
- Data cleared on server restart
- No external data transmission beyond LLM API

---

## 🧪 Development

### Available Scripts

```bash
# Development
npm run dev              # Start development server
npm run build            # Build for production
npm run start            # Start production server

# Code Quality
npm run lint             # Run ESLint
npm run format           # Format code with Prettier
npm run format:check     # Check code formatting

# Database (optional)
npm run prisma:generate  # Generate Prisma Client
npm run prisma:migrate   # Run database migrations
npm run prisma:studio    # Open Prisma Studio
```

### Environment Variables

| Variable         | Description                              | Required |
|------------------|------------------------------------------|----------|
| `OPENAI_API_KEY` | OpenRouter API key                       | Yes      |
| `OPENAI_BASE_URL`| OpenRouter API base URL                  | Yes      |
| `OPENAI_MODEL`   | Model to use (e.g., `openai/gpt-4o-mini`)| Yes      |
| `DATABASE_URL`   | PostgreSQL connection string             | No       |

---

## 📊 Performance Considerations

### Current Limitations
- In-memory storage limits dataset size
- Single-file queries (no JOINs across files)
- No query result caching
- LLM API latency affects response time

### Optimization Strategies
- Implement result caching for repeated queries
- Add file size limits and streaming for large files
- Use faster LLM models for simple queries
- Implement pagination for large result sets

---

## 🚧 Known Limitations

1. **Data Persistence**: Files and chats are lost on server restart
2. **File Size**: Large files (>100MB) may cause memory issues
3. **SQL Features**: Limited to SELECT queries (no JOINs, CTEs, subqueries)
4. **Multi-File**: No JOINs across multiple uploaded files
5. **Language**: Optimized for English queries (though LLM supports multiple languages)

---

## 🔮 Future Enhancements

- [ ] Database persistence for chats and files
- [ ] Multi-file JOIN support
- [ ] Advanced SQL features (CTEs, window functions)
- [ ] Query result caching with Redis
- [ ] User authentication and authorization
- [ ] Export results to CSV/Excel
- [ ] Query templates and saved queries
- [ ] Real-time collaboration
- [ ] API rate limiting and quotas
- [ ] Advanced chart types (scatter, heatmap)

---

## 🙏 Acknowledgments

- [Next.js](https://nextjs.org/) - React framework
- [OpenRouter](https://openrouter.ai/) - LLM API service
- [ShadCN UI](https://ui.shadcn.com/) - UI components
- [Recharts](https://recharts.org/) - Charting library

---

## 📧 Contact

For questions, issues, or contributions, please open an issue on GitHub.

---

