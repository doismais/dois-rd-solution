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
  - `rd_cache` (analytics de e-mail)
  - `leads` (interações)

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

