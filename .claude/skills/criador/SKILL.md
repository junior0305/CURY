---
name: criador
description: Porta de entrada de design e UI do CRM Comandra. Roteia para a skill certa (criar, animar, auditar, prototipar, escolher biblioteca) e carrega as regras deste repositório que as skills genéricas não conhecem. Use quando o pedido for sobre interface, visual, animação, movimento, layout ou "deixar bonito" — ou quando não estiver claro qual skill de design usar.
metadata:
  argument-hint: "[criar|animar|auditar|prototipar|biblioteca|nomear] <alvo opcional>"
---

# Criador — direção de design do CRM Comandra

Você é o ponto de entrada de tudo que é design/UI neste repositório. Faz duas coisas:

1. **Impõe as regras deste projeto** (abaixo). Elas valem sempre, inclusive quando outra
   skill de design estiver dirigindo o trabalho.
2. **Roteia** para a skill especialista certa, em vez de tentar fazer o trabalho dela.

Se o pedido for claro, roteie e siga. Se for ambíguo, faça **uma** pergunta e siga.

---

## Regras deste repositório — não negociáveis

**Stack.** React 18 + TypeScript + Vite + Tailwind + shadcn/ui + **Framer Motion 12.38**.
Nada de GSAP, react-spring ou SwiftUI. Vocabulário de spring do Framer Motion é
`stiffness` / `damping` / `mass` — `tension` e `friction` são de OUTRA biblioteca e são
ignorados silenciosamente se usados aqui.

**Nunca editar `src/components/ui/`.** É shadcn. Consequência prática: `Button` mora lá,
então movimento em botão se faz **por fora** —

```tsx
<motion.div whileTap={{ scale: 0.98 }}>
  <Button …/>
</motion.div>
```

— ou criando um wrapper próprio em `src/components/`. Nunca abrindo `ui/button.tsx`.

**Dois contextos, exigências opostas.** Antes de qualquer decisão visual, identifique em qual
você está:

| | Ferramenta operacional | Vitrine |
|---|---|---|
| **Onde** | `DashboardFoco.tsx`, `ManagerDashboard.tsx`, `src/pages/admin/*`, `src/components/broker/*` | landing, `public/comandra-demo.html`, artifacts, material de venda |
| **Quem usa** | corretor no celular, em stand de vendas, com pressa | cliente, prospect, gestor avaliando o produto |
| **O que importa** | densidade de informação, resposta imediata, zero distração | narrativa, percepção de qualidade, ritmo |
| **Movimento** | discreto e rápido — feedback, não espetáculo | pode ser cinematográfico, coreografado |
| **Espaço** | denso é **feature**, não defeito | respiro editorial é bem-vindo |

Espaço em branco generoso e ritmo cinematográfico **pioram** o painel do corretor. Se a skill
especialista sugerir isso dentro do contexto operacional, corrija-a.

**Acessibilidade.** `motion-safe:` do Tailwind **não** controla animação de Framer Motion —
só transição CSS. Use o hook: `import { useReducedMotion } from "framer-motion"`. Hoje
**nenhum** dos ~36 arquivos que usam Framer Motion respeita isso. Toda animação nova deve
respeitar, e é oportunidade legítima de correção quando você já estiver no arquivo.

**Performance.** Animar só `transform` (scale/translate/rotate) e `opacity`. Nunca `width`,
`height`, `top`, `margin` direto — se precisar de layout, use a prop `layout` do Framer Motion.

**Toasts** são `sonner` (já em uso, ex.: o "DESFAZER" do stepper no `DashboardFoco`).

---

## Roteamento

Chame a skill pelo nome. Não refaça o trabalho dela.

| O pedido é… | Skill |
|---|---|
| construir uma animação nova, "dar vida", fazer uma transição | `animate` |
| criticar movimento que já existe (um arquivo, um diff) | `review-animations` |
| varrer o codebase e ter um plano priorizado de motion | `improve-animations` |
| "o que aqui poderia ser animado?" | `find-animation-opportunities` |
| gesto, sheet, drag/swipe, momentum, profundidade, material | `apple-design` |
| polimento fino, detalhe invisível, decisão de componente | `emil-design-eng` |
| "como chama aquele efeito de…" | `animation-vocabulary` |
| ver várias versões de uma UI antes de decidir | `prototype` |
| escolher biblioteca (gráfico, OTP, command menu, virtualização, drag) | `pick-ui-library` |
| problema com toast — não aparece, duplica, perde estilo, some atrás do modal | `ask-sonner` |
| auditar acessibilidade / conformidade com boas práticas web | `web-design-guidelines` |
| criar tela/componente do zero, direção estética | `frontend-design` |
| requisito ainda vago, antes de codar | `brainstorming` |

**Se veio argumento:** `criar`→`frontend-design` · `animar`→`animate` ·
`auditar`→`review-animations` (arquivo/diff) ou `improve-animations` (codebase inteiro) ·
`prototipar`→`prototype` · `biblioteca`→`pick-ui-library` · `nomear`→`animation-vocabulary`.

**Se não veio nada:** diga em uma linha o que você faz e ofereça as 4 rotas mais comuns —
criar, animar, auditar, prototipar. Não despeje a tabela inteira.

---

## Como agir

- Roteie para **uma** skill. Encadear duas é exceção, não padrão.
- Antes de aplicar qualquer sugestão, confirme que ela respeita as regras acima. As skills
  especialistas são genéricas — não conhecem `ui/` do shadcn, nem que o corretor usa isso no
  celular com pressa.
- Sugestão que exija tocar em `src/components/ui/` → proponha o wrapper, não a edição.
- Mudança de frontend só chega no ar com `pnpm build` + commit do `dist/` + push + restart do
  agente-app no Portainer. Não prometa "está no ar" antes disso.
