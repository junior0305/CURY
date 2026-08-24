# Edge Functions — snapshot de produção

**A fonte da verdade é o Supabase, não este repositório.**

Estas funções rodam em produção e são deployadas direto pela CLI. Este diretório é um
**espelho** — serve como backup e histórico, não como origem do deploy.

## Ambiente espelhado

| Ambiente | Project ref | Espelhado aqui |
|---|---|---|
| **SP** (SAO_PAULO) | `vaghxnypfphhxiobnhpk` | ✅ sim |
| SJC (CRM_CURY) | `dcimeuefnhaiemrfiklj` | ❌ não |

SP e SJC **forkaram** — as funções dos dois ambientes divergem em vários pontos. O que está
aqui é o SP. Nunca deploye este diretório no SJC sem comparar antes.

## Antes de mexer em qualquer função

Sempre baixe o que está rodando. Editar o arquivo daqui e deployar pode ser **regressão** —
o repo pode estar atrasado em relação a produção.

```bash
# 1. baixa o que realmente roda
supabase functions download <slug> --project-ref vaghxnypfphhxiobnhpk

# 2. edita a fonte baixada

# 3. deploya de volta
supabase functions deploy <slug> --project-ref vaghxnypfphhxiobnhpk
```

### `--no-verify-jwt` é obrigatório em quem recebe webhook externo

`webhook_receiver` e `incoming-lead` são chamadas por Evolution / Make / Facebook, que não
mandam JWT. Sem a flag, o deploy passa a barrar tudo com **401 antes da função rodar** — sem
log, sem entrada em `webhook_logs`. Sintoma típico: "a IA parou de responder", "os leads do
Facebook sumiram".

```bash
supabase functions deploy webhook_receiver --project-ref <ref> --no-verify-jwt
```

Teste rápido depois de todo deploy dessas duas:

```bash
curl -sS -o /dev/null -w "%{http_code}\n" -X POST \
  "https://<ref>.supabase.co/functions/v1/webhook_receiver" \
  -H "Content-Type: application/json" -d '{}'
# 400 = ok (aceitou, payload vazio)   |   401 = BARRADO, redeploy com --no-verify-jwt
```

## Como regerar este espelho

```bash
supabase functions list --project-ref vaghxnypfphhxiobnhpk
supabase functions download <slug> --project-ref vaghxnypfphhxiobnhpk   # uma a uma
```

## Lacunas conhecidas deste snapshot

- **`agente-prospecção-ativa`** não está aqui. O slug tem acento e cedilha, e a API recusa o
  download (`function_slug: Invalid string: must match pattern /^[A-Za-z0-9_-]+$/`). A função
  está ACTIVE em produção (versão 6, 20/04/2026) e só pode ser lida pelo dashboard do Supabase.
- **`wa-inbox`** existe aqui mas **não** em produção — resquício, nunca foi deployada.
