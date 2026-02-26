# Guia de Disparo — Troia Produções × RD Station

## Links por Evento

| Evento | URL da Landing |
|--------|----------------|
| Hospitalar | `https://troiaproducoes2026.vercel.app?src=rd&event=hospitalar` |
| Show Safra | `https://troiaproducoes2026.vercel.app?src=rd&event=showsafra` |
| AutoCom | `https://troiaproducoes2026.vercel.app?src=rd&event=autocom` |
| Expo Óptica | `https://troiaproducoes2026.vercel.app?src=rd&event=expo-otica` |

## Strings do eventMap

```
hospitalar  →  "Hospitalar 2026"
showsafra   →  "Show Safra 2026"
autocom     →  "AutoCom 2026"
expo-otica  →  "Expo Óptica 2026"
```

Fallback (evento inválido ou ausente): **"Eventos 2026"**

## Passo a Passo — Novo Disparo

1. Abrir o editor de e-mail no RD Station
2. Clicar em **IMPORTAR HTML**
3. Colar o HTML do template de e-mail (`email-template.html` ou da conversa)
4. **Buscar e substituir** `event=hospitalar` pelo evento da campanha
5. Revisar preview mobile e desktop
6. Salvar e avançar

## Trocar Evento no HTML (Ctrl+H)

| Campanha | Buscar | Substituir por |
|----------|--------|----------------|
| Hospitalar | _(já é o padrão)_ | — |
| Show Safra | `event=hospitalar` | `event=showsafra` |
| AutoCom | `event=hospitalar` | `event=autocom` |
| Expo Óptica | `event=hospitalar` | `event=expo-otica` |

## Fluxo do Clique

```
E-mail → Clique no CTA/imagem
  → Abre landing com ?src=rd&event=EVENTO
    → JS monta mensagem dinâmica para o evento
      → CTA WhatsApp abre com mensagem personalizada
```

## Tracking (Console)

- `page_view_EVENTO` — dispara ao abrir a landing
- `cta_click_EVENTO` — dispara ao clicar no botão WhatsApp

## Link de Unsubscribe

O template usa `*|UNSUB|*`. Se o RD Station usar outra tag, substituir por:
- `{{links.unsubscribe}}` ou equivalente da plataforma

## Contato WhatsApp

Número: **+55 62 99986-4191**
Formato wa.me: `https://wa.me/5562999864191`
