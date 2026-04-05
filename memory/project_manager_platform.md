---
name: Manager Platform Vision
description: Visão completa da plataforma do gerente — funcionalidades, indicadores, AI Coach, metas, BI competitivo e accountability para superintendente
type: project
---

# Plataforma do Gerente — Visão Completa

**Por:** Decisão estratégica do produto, sessão de 05/04/2026

## Status atual
- War Room básico implementado (split layout, semáforo, ranking, presença, fila, KPIs)
- WhatsApp QR Banner integrado

## Funcionalidades aprovadas para implementar

### Prioridade Alta (já decididas)
1. **Redistribuição livre por status** — gerente redistribui qualquer lead independente do status
2. **Alerta manual para corretor** — notificação interna com mensagem customizada
3. **Metas visíveis** — barra de progresso da meta do mês gritando no topo, com status de ritmo
4. **Painel de descarte** — repositório para revisão, sem fluxo de aprovação (lead nunca é deletado, vai para rework)
5. **Monitor de conversas** — gerente vê mensagens trocadas de qualquer lead da equipe
6. **AI Coach na conversa** — análise automática de qualidade, tom, oportunidades perdidas, score 0-10 com sugestões específicas

### Prioridade Média
7. **Cockpit de indicadores por equipe:**
   - Funil real: Recebidos → Contactados → Responderam → Visita → Docs → Venda
   - Velocidade de primeiro contato (meta vs real, benchmark visível)
   - Automações que trabalharam: boas-vindas stats, follow-up resgatados, sentinela sessions, IA solo por corretor
   - Perdas e repositório com estimativa de valor perdido (custo financeiro das perdas)
8. **Inbox do gerente** — central de ações pendentes: leads sem corretor, conversas score baixo, corretores sem atividade, alertas do AI Coach
9. **Health Score da equipe** — número único 0-100: taxa contato (30%) + velocidade (25%) + conversão (25%) + automações (20%)

### Prioridade Menor
10. **Custo das perdas calculado** — estimativa de comissão perdida por leads abandonados
11. **Visão do superintendent** — health score de cada equipe, meta vs realizado, alertas de quem está abaixo da curva

## BI Competitivo (nova ideia, aprovada)

### Conceito
Usar a tag do lead (origem/região) para análise cruzada entre equipes. O gerente vê:
- De onde vieram os leads convertidos (por tag/região/canal)
- O que as equipes concorrentes estão investindo (inferido pelos volumes de leads por tag)
- Melhores práticas: quais tags têm maior taxa de conversão em outras equipes
- Ranking geral da superintendência (todas as equipes, não só a própria)

### Funcionalidades do BI Competitivo
- **Ranking geral** — gerente vê posição da sua equipe vs todas as outras
- **Análise por origem/tag** — quais canais (Facebook, Google, indicação, região X) convertem mais, por equipe
- **Análise cruzada** — "A equipe da Liliane converte 3x mais leads do Facebook — eles respondem em média 12min, sua equipe em 2h14min"
- **Melhores práticas automáticas** — AI sugere ações baseadas no que funciona nas equipes de maior conversão
- **Mapa de investimento** — volume de leads por tag/campanha/região mostra onde cada equipe está investindo marketing

### AI Sugestora para o Gerente
A IA analisa os dados do gerente e entrega sugestões proativas:
- "Sua equipe recebe 40% dos leads do Facebook mas converte apenas 3%. A equipe do Rio converte 9% do mesmo canal — a diferença é o tempo de resposta (8min vs 2h). Sugiro definir um prazo interno de 15min para leads Facebook."
- "Nos últimos 30 dias, leads com tag 'Amsterdã_Jaguaré' converteram 12% com a equipe SP. Considere aumentar investimento nessa campanha."
- "O corretor Fluvy não usou a IA nenhuma vez este mês. Corretores que usam a IA têm 23% mais conversão. Considere treinar o Fluvy."

## Design System (manter consistente)
- Background: #080B14
- Cyan: #00D4FF, Purple: #7C3AED, Emerald: #10B981, Amber: #F59E0B, Red: #EF4444
- framer-motion para animações (não excessivas)
- Layout split sem scroll na área principal
- Metas em destaque visual com urgência quando abaixo da curva

## Princípios do produto para o gerente inexperiente
1. A ferramenta diz O QUE FAZER, não só mostra dados
2. Mostra custo financeiro da inação (comissão perdida)
3. Ensina através do AI Coach (gerente aprende ao ver os feedbacks)
4. Cria rotina: Inbox de manhã → resolve alertas → vê health score → ajusta quem está abaixo
5. Justifica decisões com dados concretos para cobrar corretores
6. Benchmark externo (outras equipes) como motivador e direcionador

## Accountability para o Superintendent
- Health Score de cada equipe em tempo real
- Meta vs realizado por gerente
- Alertas de equipes abaixo da curva
- Histórico de intervenções do gerente (o superintendent vê SE o gerente está gerenciando)
