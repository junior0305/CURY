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

## Limitações deste MVP (honesto)
- **Detecção do número:** pega automático quando o contato **não está salvo** (o
  WhatsApp mostra o número no topo). Se estiver salvo (aparece o nome), digite/cole
  o número no campo e clique **Buscar**.
- Se o número não bate com nenhum lead seu, mostra "nenhum lead" (pesque/cadastre no painel).
- É um MVP: sem Jarvis e sem "Fecha a Conta" ainda (próximos passos).

## Config
API e chave anon ficam em `background.js` (`CFG`). A chave anon é pública (a
segurança é a RLS + seu login). Aponta pro self-hosted: `https://comandra.com.br/supabase`.
