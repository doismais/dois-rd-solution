# Dois Mais RD Solution — Memória do Projeto

## Estrutura
- Monorepo em `/Users/nettomello/neomello/projects/clientes/dois_mais/dois_mais_rd_solution`
- `apps/dashboard` — Fastify (TypeScript) + React (Vite) client
- `apps/dashboard/landing` — Landing page estática (HTML/CSS/JS)
- O Fastify serve os dois: landing em `/`, React em `/dashboard`

## Stack
- **Servidor:** Fastify 4, TypeScript, Node
- **DB:** Turso (LibSQL/SQLite remoto) via `@libsql/client`
- **KV/Redis:** Upstash Redis REST API
- **Client:** React 18, Vite, Recharts, Framer Motion
- **Deploy:** Railway (nixpacks), `railway.toml` em `apps/dashboard/`

## Railway — Configuração
- **Root Directory no Railway:** `apps/dashboard`
- **buildCommand:** `npm run build && npm run client:build`
- **startCommand:** `npm run start` → `node dist/index.js`
- **healthcheckPath:** `/health`
- `client:build` inclui `npm install` no subdiretório (corrigido)

## Env Vars Necessárias (Railway)
Ver `.env.example` em `apps/dashboard/`.
- `PORT`, `DASHBOARD_SECRET`
- `RD_CLIENT_ID`, `RD_CLIENT_SECRET`, `RD_REDIRECT_URI` (URL de prod do Railway)
- `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`

## Schema Turso (criado no initSchema do Scheduler)
- `rd_tokens` — tokens OAuth RD Station (criado no RDClient.saveTokens)
- `rd_cache` — cache de campanhas RD (criado no initSchema)
- `rd_events` — eventos webhook RD (criado no initSchema)
- `leads` — leads capturados (criado no initSchema — corrigido fev/2026)

## Fixes Aplicados (fev/2026)
1. `scheduler.ts` — adicionado `CREATE TABLE IF NOT EXISTS leads` no `initSchema()`
2. `package.json` — `client:build` agora inclui `npm install` antes do build
3. `.env.example` — `RD_REDIRECT_URI` atualizado para placeholder da URL Railway

## Webhook RD - Status atual
- Em 26 de fevereiro de 2026, `POST /api/rd/webhook` foi testado em produção
- URL: `https://dois-rd-solution-production.up.railway.app/api/rd/webhook`
- Payload de teste: evento `conversion` com `lead.email` e `campaign`
- Resposta observada: `{"ok":true}`
- Endpoint ajustado para aceitar webhook de `Conversão` e `Oportunidade` (array ou objeto único)
- Fallback de tipo de evento: `event_type`, `eventType` ou `type`
- Uso futuro: ampliar parsing e normalização de eventos para cobertura completa dos gatilhos do RD

## Arquivos Chave
- `apps/dashboard/src/index.ts` — servidor principal, todas as rotas
- `apps/dashboard/src/scheduler.ts` — initSchema + cron sync RD Station
- `apps/dashboard/src/rd-client.ts` — OAuth e API RD Station
- `apps/dashboard/src/storage/adapters/turso.ts` — persistência leads
- `apps/dashboard/src/storage/adapters/upstash.ts` — page views (Redis)
- `apps/dashboard/railway.toml` — config deploy Railway
