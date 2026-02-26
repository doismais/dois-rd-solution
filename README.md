# dois_mais_rd_solution

Ecossistema de funil digital para a agência **Dois Mais** — conecta RD Station, landing pages de eventos e WhatsApp em um dashboard unificado. Arquitetura modular: um serviço por cliente, replicável.

**Arquiteto:** NΞØ MELLØ
**Primeiro cliente:** Troia Produções

---

## O problema que isso resolve

A Dois Mais gerencia campanhas de email marketing para eventos (feiras, exposições, shows). Antes, os dados viviam em silos: RD Station mostrava taxa de abertura, mas não havia como cruzar isso com quem acessou a landing page, por qual campanha, nem quem clicou no WhatsApp. Esse projeto fecha esse gap.

---

## Arquitetura

```
RD Station           Landing Page           WhatsApp Click
(email campaigns)    (static HTML/CSS/JS)   (trackAndRedirect)
      |                     |                      |
      | OAuth + cron        | POST /api/track       | POST /api/leads
      |                     |                      |
      +---------------------+----------------------+
                            |
                    Railway Service (Fastify)
                    apps/dashboard/
                            |
               +------------+------------+
               |                         |
          Turso (libSQL)          Upstash Redis
          leads, rd_cache         page view counters
          rd_tokens, rd_events    (pv:{event}:{src})
               |
          Dashboard UI (React/Vite)
          /dashboard — funil completo
```

**Regra de ouro:** um único serviço Railway por cliente. A landing é servida como estático pelo mesmo Fastify — não existe serviço separado para o HTML.

---

## Stack

| Camada | Tecnologia | Motivo |
|---|---|---|
| Servidor | Fastify (Node.js/TypeScript) | leve, rápido, Railway-friendly |
| Landing | HTML/CSS/JS estático | projeto já existia assim |
| Dashboard UI | React + Vite + Recharts | SPA servida pelo mesmo processo |
| Leads + RD cache | Turso (libSQL) | SQLite serverless, 1 DB por cliente |
| Page views | Upstash Redis (REST) | free tier, HTTP puro, sem SDK |
| Email CRM | RD Station API | OAuth2 + cron 1h + Webhook |
| Deploy | Railway | always-on, sem cold start |

---

## Estrutura do monorepo

```
dois_mais_rd_solution/
├── apps/
│   └── dashboard/                ← serviço Railway (único deploy)
│       ├── src/
│       │   ├── index.ts          ← Fastify bootstrap
│       │   ├── rd-client.ts      ← OAuth2 + fetchEmailAnalytics
│       │   ├── scheduler.ts      ← node-cron: sync RD 1x/hora
│       │   ├── storage/
│       │   │   ├── types.ts      ← StorageAdapter interface
│       │   │   ├── index.ts      ← factory: new TursoAdapter()
│       │   │   └── adapters/
│       │   │       ├── turso.ts  ← leads + rd_cache + composição
│       │   │       └── upstash.ts← page views via Redis REST
│       │   └── routes/
│       │       ├── health.ts     ← GET /health
│       │       ├── track.ts      ← POST /api/track
│       │       ├── leads.ts      ← POST /api/leads, GET /api/leads
│       │       ├── auth.ts       ← GET /api/rd/auth + /callback
│       │       ├── metrics.ts    ← GET /api/metrics
│       │       └── webhook.ts    ← POST /api/rd/webhook (fase 5+)
│       ├── client/               ← React SPA (Vite)
│       ├── .env                  ← local (não commitar)
│       ├── .env.example          ← template de vars
│       └── railway.toml          ← config de deploy
```

---

## Banco de dados (Turso)

```sql
-- 1 DB por cliente: troia-producoes
CREATE TABLE leads (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  event     TEXT NOT NULL,   -- "hospitalar", "autocom", etc.
  src       TEXT,            -- "rd", "instagram", "direto"
  name      TEXT,
  email     TEXT,
  company   TEXT,
  phone     TEXT,
  message   TEXT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE rd_cache (
  campaign_id   INTEGER PRIMARY KEY,
  campaign_name TEXT,
  sent_at       TEXT,
  sent          INTEGER, delivered INTEGER,
  opened        INTEGER, clicked   INTEGER, bounced INTEGER,
  open_rate     REAL,    click_rate REAL,
  cached_at     TEXT NOT NULL
);

CREATE TABLE rd_tokens (
  id            INTEGER PRIMARY KEY DEFAULT 1,
  access_token  TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE rd_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type    TEXT NOT NULL,  -- "email.opened" | "email.clicked"
  lead_email    TEXT,
  campaign_id   INTEGER,
  campaign_name TEXT,
  occurred_at   TEXT NOT NULL,
  raw_payload   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

## Variáveis de ambiente

```env
PORT=3000
DASHBOARD_SECRET=          # string aleatória para proteger /api/metrics

# RD Station App (criar em rdstation.com/app-store)
RD_CLIENT_ID=
RD_CLIENT_SECRET=
RD_REDIRECT_URI=https://[railway-url]/api/rd/callback

# Turso — 1 DB por cliente
TURSO_DATABASE_URL=libsql://[db-name]-[org].turso.io
TURSO_AUTH_TOKEN=

# Upstash Redis (substituiu Vercel KV)
UPSTASH_REDIS_REST_URL=https://[nome].upstash.io
UPSTASH_REDIS_REST_TOKEN=
```

---

## Endpoints

| Método | Rota | Descrição |
|---|---|---|
| GET | `/health` | status do serviço |
| GET | `/` | landing page (estático) |
| POST | `/api/track` | page view — body: `{ event, src }` |
| POST | `/api/leads` | WhatsApp click — body: `{ event, src }` |
| GET | `/api/leads` | lista leads (requer x-secret) |
| GET | `/api/rd/auth` | inicia OAuth RD Station |
| GET | `/api/rd/callback` | callback OAuth |
| GET | `/api/metrics` | funil completo (requer x-secret) |
| POST | `/api/rd/webhook` | eventos em tempo real do RD Station |

---

## Status do webhook RD (26 de fevereiro de 2026)

- Endpoint operacional em produção: `POST /api/rd/webhook`
- URL de integração para o RD Station: `https://dois-rd-solution-production.up.railway.app/api/rd/webhook`
- Teste manual executado em 26 de fevereiro de 2026 com payload de conversão
- Resposta recebida do serviço: `{"ok":true}`

Payload usado no teste:

```json
[
  {
    "event_type": "conversion",
    "lead": { "email": "teste@exemplo.com" },
    "campaign": { "id": "1", "name": "teste" }
  }
]
```

Próxima implementação sugerida:

- evoluir parser de eventos do webhook para mapear campos de conversão por tipo de evento e versionar schema de payload
- criar e manter dois webhooks no RD Station usando a mesma URL: um com gatilho `Conversão` e outro com gatilho `Oportunidade`

Configuração recomendada no RD Station para Oportunidade:

- `Nome`: `dois-mais-rd-webhook-oportunidade`
- `URL`: `https://dois-rd-solution-production.up.railway.app/api/rd/webhook`
- `Gatilho`: `Oportunidade`
- Endpoint preparado para receber payload em lista (`[]`) ou objeto único (`{}`) com fallback de `event_type` (`event_type`, `eventType` ou `type`)

---

## Como o tracking funciona

A landing não tem formulário — o CTA é WhatsApp. O tracking é feito via intercepção do clique:

```js
// index.html (apps/dashboard/landing/)
async function trackAndRedirect(waUrl) {
  await fetch(API_BASE_URL + '/api/leads', {
    method: 'POST',
    keepalive: true,  // garante envio mesmo com redirect
    body: JSON.stringify({ event, src })
  })
  window.open(waUrl)
}
```

Os parâmetros `?event=hospitalar&src=rd` vêm do link do email no RD Station — cada campanha tem seu UTM próprio.

---

## Deploy (Railway)

```bash
cd apps/dashboard

# 1. Configurar vars
railway variables set PORT=3000
railway variables set DASHBOARD_SECRET=[string aleatória]
railway variables set TURSO_DATABASE_URL=[do turso db show]
railway variables set TURSO_AUTH_TOKEN=[do turso tokens create]
railway variables set UPSTASH_REDIS_REST_URL=[do Upstash Dashboard]
railway variables set UPSTASH_REDIS_REST_TOKEN=[do Upstash Dashboard]
railway variables set RD_CLIENT_ID=[do App Store RD]
railway variables set RD_CLIENT_SECRET=[do App Store RD]
railway variables set RD_REDIRECT_URI=https://[railway-url]/api/rd/callback

# 2. Deploy
railway up

# 3. Fazer OAuth: acessar https://[railway-url]/api/rd/auth no browser
```

**Atenção:** o Railway deve ter apenas UM serviço — o `apps/dashboard/`. A landing (`apps/dashboard/landing/`) é servida como asset estático por dentro desse serviço via `@fastify/static`.

---

## Padrão Adapter (como trocar de provider)

O storage segue interface `StorageAdapter`. Para trocar o Redis por outro provider, só criar um novo adapter em `src/storage/adapters/` e atualizar `src/storage/index.ts`. O resto do código não muda.

```typescript
interface StorageAdapter {
  trackPageView(data: PageView): Promise<void>
  saveLead(data: Lead): Promise<void>
  getPageViewsByEvent(event: string): Promise<number>
  getAllMetrics(): Promise<CampaignMetrics[]>
}
```

---

## Novo cliente (como replicar)

1. Criar DB no Turso: `turso db create [cliente]-producoes`
2. Executar schema SQL acima no novo DB
3. Criar App no RD Station App Store do cliente
4. Criar novo projeto no Railway
5. Copiar `apps/dashboard/landing/` para uma nova landing de cliente e adaptar o HTML
6. Configurar vars do novo ambiente
7. `railway up` de dentro do novo serviço

---

## Documentação adicional

- `docs/RD_API_WEBHOOK_PLAYBOOK.md` — guia operacional completo de OAuth + Webhooks RD (Conversão e Oportunidade)
- `DEV_AGENT_PROMPT.md` — spec técnica completa por fase
- `CHANGE_BRIEF.md` — mudanças de arquitetura (tem precedência sobre o prompt)
- Notion: `⬡ ECOSYSTEM_ARCH` — visão do ecossistema Dois Mais

---

```
▓▓▓ NΞØ MELLØ · Core Architect
```
