## Atlas Migration Agent (MCP + LLM)

This isolated package adds an AI migration agent that talks to two MCP servers:

- `postgres-mcp-server`: exposes Postgres tools (read-only and SQL execution)
- `mongo-data-mcp-server`: exposes MongoDB data tools (insert, index)
- `agent`: a natural-language agent that routes tool calls between them to help migrate data from Postgres to MongoDB

No existing project files were modified.

### Prerequisites for migration (checklist)

- Access and permissions
  - Postgres: network access; user has USAGE on schema and SELECT on tables; for CDC, `wal_level=logical` and a replication slot
  - MongoDB: Atlas cluster reachable; user with `readWrite` on target database/collections
- Connectivity and security
  - Open inbound rules from the machine running the agent to Postgres and Atlas
  - SSL/TLS enforced as required; IP allowlists configured in Atlas
  - Credentials stored in environment variables or secret manager
- Data model assessment
  - Identify tables, PK/FKs, many-to-many bridges, sequences/identities
  - Map data types (UUID, numeric/decimal precision, dates/timestamps/timezones, enums, arrays/JSON, bytea/BLOB)
  - Decide embedding vs referencing in MongoDB; define target collection names and indexes
  - Define id mapping strategy (reuse PK, map to `_id`, compound keys)
- Migration strategy
  - One-shot snapshot vs snapshot + change capture (CDC) for minimal downtime
  - Ordering: parent tables first, then dependents; batching strategy and size
  - Error handling, retry and idempotency plan
  - Rollback plan and backups (pg_dump, Atlas snapshot)
- Validation and performance
  - Row counts per table, checksum/hash sampling, business invariants
  - Index plan in MongoDB; performance targets and load testing
  - Post-migration monitoring/alerts (Atlas metrics, query profiler)

### Setup

1) Install dependencies
```bash
cd agent
pnpm i || npm i || yarn
```

2) Configure environment
Create `agent/.env` with:
```
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4o-mini
POSTGRES_URL=postgres://user:password@host:5432/db
MONGODB_URI=mongodb+srv://user:password@cluster/db?retryWrites=true&w=majority
```

3) Build (or use dev)
```bash
npm run build
```

### Run

Run MCP servers (separate terminals or background):
```bash
npm run start:pg-mcp
npm run start:mongo-mcp
```

Run the agent (CLI):
```bash
npm run start -- "Migrate table public.users to MongoDB db app, collection users"
```

Or dev mode:
```bash
npm run dev:pg-mcp
npm run dev:mongo-mcp
npm run dev:agent -- "Migrate table public.users to MongoDB db app, collection users"
```

### Notes

- All data operations occur via MCP servers; the agent never connects to databases directly.
- To integrate with your UI, create an API endpoint that forwards a natural-language prompt to `askMigrationAgent()` from `src/index.ts`.


