# RD API + Webhook Playbook (Dois Mais)

Atualizado em: 26 de fevereiro de 2026

## Objetivo

Evitar retrabalho em OAuth e Webhooks do RD Station, padronizando:

- autenticação OAuth2 correta
- configuração de webhooks (`Conversão` e `Oportunidade`)
- testes mínimos de funcionamento
- diagnóstico rápido de falhas

## Arquitetura ativa

- API base em produção: `https://dois-rd-solution-production.up.railway.app`
- Endpoint webhook: `POST /api/rd/webhook`
- Callback OAuth: `GET /api/rd/callback`
- Início OAuth: `GET /api/rd/auth`
- Persistência:
  - `rd_tokens` (OAuth)
  - `rd_events` (eventos webhook)
  - `rd_cache` (catálogo + performance de e-mail)
  - `leads` (interações)

## Ingestão de e-mails RD (fonte de verdade)

Para refletir o que aparece na tela de Email do RD Station, o sync usa duas leituras:

1. `GET /platform/emails`
   - catálogo de campanhas de e-mail
   - nome, status, tipo, data de envio, leads selecionados
2. `GET /platform/analytics/emails?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD`
   - desempenho de envio (enviados, abertos, clicados, taxas, bounces)

Regra de consolidação:

- merge por `campaign_id` (com fallback determinístico por nome)
- persistência unificada em `rd_cache`
- o dashboard lê `rd_cache` para renderizar tabela e KPIs

## Decisão de superfícies (mantida)

- `GET /` é a superfície de narrativa e captura (landing)
- `GET /dashboard` é a superfície operacional (visão e decisão)
- ambos no mesmo backend para reduzir latência e reduzir pontos de falha

## Forense da confusão Railway x Vercel

Fato técnico:

- a raiz do Railway (`/`) entrega a landing da Troia por design
- por isso visualmente parece o mesmo site que já existia no Vercel
- não é redirecionamento para Vercel

Causas do ruído:

1. histórico com app legado duplicado (`apps/troia`) e migração para `apps/dashboard/landing`
2. links antigos para `troiaproducoes2026.vercel.app` em templates de e-mail e guia
3. callback OAuth com variável errada em produção no início da operação

Estado atual:

- legado `apps/troia` removido
- webhook robustecido e testado
- token flow com refresh e retry em `401` publicado

## Decisão sobre legado de links

Decisão atual:

- não executar limpeza de links legados agora
- manter coexistência intencional quando isso acelerar operação comercial
- revisar apenas se a coexistência começar a degradar leitura de dados ou conversão

## Plano de rastreabilidade de fluxos (cliente)

Objetivo: capturar rastros de quem passou por links, jornada e desfecho.

1. Padrão único de links:
   - `src`, `medium`, `campaign`, `event`, `asset`, `offer`, `audience`, `variant`, `rd_step`, `trace_id`
2. Endpoint de redirecionamento:
   - criar `/r/:token` para registrar clique e redirecionar com contexto preservado
3. Eventos de jornada na landing:
   - `page_view`, `scroll_25_50_75_100`, `cta_whatsapp_click`, `exit_intent`, `time_on_page`, `return_visit`
4. Modelo canônico de eventos:
   - tabela `journey_events` com `event_name`, `occurred_at`, `session_id`, `trace_id`, `source`, `campaign_id`, `lead_email`, `lead_phone`, `payload_json`
5. Costura de identidade:
   - prioridade `email` > `phone` > `rd_contact_id` > `session_id`
6. Regras de atribuição:
   - `first_touch`, `last_touch`, `assisted_touch`, `time_decay`
7. Painéis de decisão:
   - fluxo por campanha
   - mapa de abandono
   - clique para oportunidade
   - tempo até conversão
   - canal com maior LTV

## Metas de qualidade de dados

1. cobertura de rastreio maior que 95 por cento dos cliques
2. reconciliação clique para oportunidade maior que 80 por cento
3. diagnóstico de campanha em menos de 10 minutos

## Upgrade do dashboard (produto)

Problema:

- UI atual cumpre função, mas não traduz maturidade analítica

Direção de melhoria:

1. visão executiva com blocos de impacto no topo (não só cards de contagem)
2. timeline de eventos e oportunidades por campanha
3. destaque de gargalo por etapa do funil
4. filtros globais por período, evento, origem e campanha
5. tabela operacional com ordenação, busca e exportação
6. alertas visuais para quedas abruptas de conversão

## OAuth2 do RD Station (sem erro de parâmetro)

URL correta de autorização:

```text
https://api.rd.services/auth/dialog?client_id=<CLIENT_ID>&redirect_uri=<REDIRECT_URI_ENCODED>&state=<STATE_UNICO>
```

Exemplo válido:

```text
https://api.rd.services/auth/dialog?client_id=00bf319fb3ad25a9e57eb8cab1e87407&redirect_uri=https%3A%2F%2Fdois-rd-solution-production.up.railway.app%2Fapi%2Frd%2Fcallback&state=oauth_20260226_01
```

Regras obrigatórias:

1. `redirect_uri` deve ser exatamente a callback cadastrada no app do RD.
2. `state` é token de segurança, não é a callback.
3. `code` de OAuth é de uso único.
4. `refresh_token` renova o `access_token` quando expira.

## Falhas reais observadas e causa raiz

### Falha 1: parâmetros invertidos no gerador

Sintoma:
- URL de auth com `redirect_uri=<hash>` e callback no `state`.

Causa:
- campo `Redirect Uri` preenchido com valor errado (aparência de `client_secret`).

Correção:
- `redirect_uri=https://dois-rd-solution-production.up.railway.app/api/rd/callback`
- `state=<valor aleatório>`

### Falha 2: `/api/rd/auth` redirecionando para localhost

Sintoma:

```text
location: ...&redirect_uri=http://localhost:3000/api/rd/callback
```

Causa:
- variável de produção `RD_REDIRECT_URI` incorreta no Railway.

Correção:

```bash
railway variables set RD_REDIRECT_URI=https://dois-rd-solution-production.up.railway.app/api/rd/callback
```

Validação:

```bash
curl -I https://dois-rd-solution-production.up.railway.app/api/rd/auth
```

`Location` deve apontar para callback de produção, não localhost.

## Webhooks RD Station

Configurar dois webhooks no RD, mesma URL de destino:

- URL: `https://dois-rd-solution-production.up.railway.app/api/rd/webhook`
- Webhook 1:
  - Nome: `dois-mais-rd-webhook`
  - Gatilho: `Conversão`
- Webhook 2:
  - Nome: `dois-mais-rd-webhook-oportunidade`
  - Gatilho: `Oportunidade`

## Testes de webhook

### Conversão (formato legado compatível)

```bash
curl -X POST https://dois-rd-solution-production.up.railway.app/api/rd/webhook \
  -H 'Content-Type: application/json' \
  -d '[{
    "event_type":"conversion",
    "lead":{"email":"teste@exemplo.com"},
    "campaign":{"id":1,"name":"Teste Conversao"}
  }]'
```

Resposta esperada hoje em produção:

```json
{"ok":true}
```

### Oportunidade (formato legado compatível)

```bash
curl -X POST https://dois-rd-solution-production.up.railway.app/api/rd/webhook \
  -H 'Content-Type: application/json' \
  -d '[{
    "event_type":"opportunity.created",
    "lead":{"email":"oportunidade@teste.com"},
    "campaign":{"id":1,"name":"Oportunidade Teste"}
  }]'
```

Resposta esperada hoje em produção:

```json
{"ok":true}
```

## Compatibilidade de payload (estado atual)

Em 26 de fevereiro de 2026:

- Produção aceita com segurança o formato legado:
  - `Array`
  - `event_type`
  - `lead.email`
- Payload com `type`/`contact` pode falhar sem parser robusto em produção.

Patch já versionado no commit `3f2a1c1` amplia ingestão para:

- array ou objeto único
- fallback de tipo: `event_type`, `eventType`, `type`
- fallback de contato: `lead.email` ou `contact.email`
- resposta com `received`

## Checklist de operação

Antes de qualquer ativação:

1. Confirmar variáveis no Railway:
   - `RD_CLIENT_ID`
   - `RD_CLIENT_SECRET`
   - `RD_REDIRECT_URI` (produção)
2. Validar `GET /api/rd/auth` com `curl -I`.
3. Criar os dois webhooks no RD (`Conversão` e `Oportunidade`).
4. Executar 1 teste de `curl` para cada gatilho.
5. Conferir ingestão no dashboard (`/api/rd/events` com `x-secret`).

## Resposta rápida de troubleshooting

- `WRONGPASS` no domínio Upstash:
  - falta `Authorization: Bearer <UPSTASH_REDIS_REST_TOKEN>`
  - endpoint Upstash não é site público
- `Missing code` em `/api/rd/callback`:
  - normal quando acessa callback sem fluxo OAuth
- `Unsupported type of value` no webhook:
  - payload não compatível com parser ativo em produção
  - usar formato legado ou publicar parser robusto

- Dashboard com `0` em Enviados/Abertos/Clicados enquanto RD mostra números:
  1. confirmar OAuth concluído em `/api/rd/auth` + `/api/rd/callback`
  2. executar sync manual em `POST /api/rd/sync` com header `x-secret`
  3. checar logs do scheduler para contagem:
     - `emails=<n>`
     - `analytics=<n>`
  4. validar se as campanhas existem em `rd_cache` com `campaign_name` e `sent`
