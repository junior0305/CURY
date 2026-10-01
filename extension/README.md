# Comandra no WhatsApp (extensão Chrome — MVP)

Traz o funil do Comandra **pra dentro do WhatsApp Web**: com uma conversa aberta,
um painel mostra a ficha do lead e deixa **avançar o status** e **registrar o
atendimento** — sem sair do WhatsApp.

## Como instalar (carregar sem publicar)
1. No Chrome, abra `chrome://extensions`.
2. Ligue o **Modo do desenvolvedor** (canto superior direito).
3. Clique em **Carregar sem compactação** e selecione esta pasta (`extension/`).
4. A extensão **"Comandra no WhatsApp"** aparece. (Fixe o ícone na barra, opcional.)

## Como usar
1. Clique no **ícone da extensão** → faça login com seu usuário do Comandra
   (ex: `seunome@comandra` + sua senha).
2. Abra o **WhatsApp Web** (`web.whatsapp.com`) e entre numa conversa.
3. Clique no botão verde **Comandra** (canto inferior direito).
4. O painel busca o lead pelo número do contato aberto e mostra:
   - **Ficha** (nome, região/tag, produto, renda, status atual).
   - **Avançar status** (Em atendimento, Visita agendada, Visita feita, Negociando, Documentos, Vendeu, Perdeu).
   - **Registrar atendimento** (vira uma nota no lead — e conta como "andar" no prazo dos 15 dias do pescar).

## O que ele respeita
- Usa **seu login** (RLS do Comandra): você só vê/edita **seus** leads.
- As chamadas à API saem pelo *background* da extensão (o CSP do WhatsApp bloqueia
  o content script de falar direto com a API).

## Detecção da conversa (automática)
Lê a **1ª linha do cabeçalho** do chat aberto:
- Contato **não salvo** (leads de disparo/pescar) → o WhatsApp mostra o **número** →
  o painel já traz o lead sozinho. **É o caso principal.**
- Contato **salvo** → o WhatsApp mostra só o **nome** (o número não existe no DOM) →
  o painel busca o lead **pelo nome**. Se não achar (nome divergente), aparece o campo
  pra digitar o número. O link **"não é esse?"** troca a qualquer momento.

> Nota técnica: o WhatsApp mudou o `data-id` das mensagens (virou só hex, sem `@c.us`)
> e tirou o número do `span[title]` — por isso a versão antiga caía no "digite o número".

## Limitações
- Contato salvo com nome diferente do cadastro → cai no campo manual.
- Sem "Fecha a Conta" ainda (próximo passo, ligado ao Junix).

## Config
API e chave anon ficam em `background.js` (`CFG`). A chave anon é pública (a
segurança é a RLS + seu login). Aponta pro self-hosted: `https://comandra.com.br/supabase`.
