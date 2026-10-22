/* Resgate de pastas para os lançamentos (22/10, ideia do Junior).
 * Quem já abriu pasta já quis comprar: muitos pararam por falta de unidade, preço ou aprovação.
 * Um lançamento novo na região deles é o motivo para voltar a chamar.
 *
 * Fonte: resgate_pastas (servidor /root/junix/resgate.py — toda proposta do Junix que não virou venda,
 * com região e motivo) e resgate_fones.py (celular da ficha do cliente, de madrugada).
 * Lançamentos e região de cada um: system_settings.resgate_lancamentos.
 * Escopo: o super vê as pastas das equipes dele (mesma regra de dono das pastas: donoJunix).
 * Passo 1 = só os números. Distribuir para a equipe vem depois.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { donoJunix, type SuperDiretoria } from "@/hooks/useDiretoria";

type Linha = { superintendente: string | null; gerente: string | null; regiao: string | null; motivo: string; recente: boolean; com_celular: boolean; buscado: boolean; n: number };
type Lancamento = { nome: string; regiao: string };

const MOTIVOS: { k: string; nome: string; dica: string }[] = [
  { k: "aprovada", nome: "Aprovada e não comprou", dica: "o mais quente: crédito aprovado" },
  { k: "unidade", nome: "Parou na unidade / simulação", dica: "faltou unidade ou preço" },
  { k: "documento", nome: "Parou nos documentos / análise", dica: "faltou empurrar" },
  { k: "reprovada", nome: "Reprovada", dica: "refazer a análise, unidade mais barata" },
  { k: "cancelada", nome: "Cancelada / distrato", dica: "já comprou uma vez" },
];
const fmt = (n: number) => n.toLocaleString("pt-BR");

export default function ResgateLancamentos({ supers }: { supers: SuperDiretoria[] }) {
  const { role } = useAuth();
  const [soRecentes, setSoRecentes] = useState(true);
  const diretoria = (role === "ADMIN" || role === "DIRECTOR") && supers.length > 1;

  const { data } = useQuery({
    queryKey: ["resgate-resumo"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [r, l] = await Promise.all([
        supabase.rpc("resgate_resumo" as any),
        supabase.from("system_settings").select("value").eq("key", "resgate_lancamentos").maybeSingle(),
      ]);
      return { linhas: ((r.data ?? []) as unknown) as Linha[], lancamentos: (((l.data as any)?.value ?? []) as Lancamento[]) };
    },
  });

  const ids = useMemo(() => new Set(supers.map((s) => s.id)), [supers]);
  const linhas = useMemo(() => (data?.linhas ?? []).filter((x) => {
    if (soRecentes && !x.recente) return false;
    const dono = donoJunix(supers, x.superintendente, x.gerente).superId;
    return ids.has(dono) || (diretoria && dono === "fora");
  }), [data?.linhas, supers, ids, diretoria, soRecentes]);

  const lancs = data?.lancamentos ?? [];
  const soma = (f: (x: Linha) => boolean) => linhas.filter(f).reduce((a, x) => a + Number(x.n), 0);
  const total = soma(() => true);
  const buscados = soma((x) => x.buscado);
  const comCel = soma((x) => x.com_celular);
  const regioesLanc = new Set(lancs.map((l) => l.regiao));
  const fora = soma((x) => !regioesLanc.has(x.regiao ?? ""));
  const semRegiao = soma((x) => !x.regiao);

  return (
    <section className="dir-card rsg">
      <style>{CSS}</style>
      <div className="rsg-top">
        <div>
          <span className="rsg-chip">♻️ Resgate de pastas</span>
          <h3>Pastas que não compraram × lançamentos do mês</h3>
          <p>Quem já abriu pasta já quis comprar. Um lançamento novo na região dele é o motivo para voltar a chamar.</p>
        </div>
        <label className="rsg-tg">
          <input type="checkbox" checked={soRecentes} onChange={(e) => setSoRecentes(e.target.checked)} />
          Só pastas dos últimos 2 anos
        </label>
      </div>

      {!data ? <div className="rsg-mut">Carregando as pastas do Junix…</div> : (
        <>
          <div className="rsg-grid">
            {lancs.map((l) => {
              const daRegiao = (x: Linha) => x.regiao === l.regiao;
              const n = soma(daRegiao);
              const cel = soma((x) => daRegiao(x) && x.com_celular);
              const busc = soma((x) => daRegiao(x) && x.buscado);
              return (
                <div key={l.nome} className="rsg-col">
                  <div className="rsg-lanc"><b>{l.nome}</b><small>{l.regiao.toLowerCase()}</small></div>
                  <div className="rsg-num">{fmt(n)}<small> pastas</small></div>
                  <ul className="rsg-mot">
                    {MOTIVOS.map((m) => {
                      const k = soma((x) => daRegiao(x) && x.motivo === m.k);
                      return k ? <li key={m.k} title={m.dica}><span>{m.nome}</span><b>{fmt(k)}</b></li> : null;
                    })}
                  </ul>
                  <div className="rsg-cel">
                    {busc ? <>📱 <b>{fmt(cel)}</b> com celular de {fmt(busc)} já buscados</> : "📱 celular ainda não buscado"}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="rsg-pe">
            <span><b>{fmt(total)}</b> pastas sem venda no total · <b>{fmt(fora)}</b> em outras regiões{semRegiao ? ` (${fmt(semRegiao)} de empreendimento sem região)` : ""}</span>
            <span>Celular: buscado em <b>{fmt(buscados)}</b> de {fmt(total)} ({fmt(comCel)} encontrados). O robô busca na ficha do Junix de madrugada, começando pelas regiões dos lançamentos.</span>
          </div>
        </>
      )}
    </section>
  );
}

const CSS = `
.rsg{padding:18px 20px;margin:0 0 16px;display:flex;flex-direction:column;gap:14px}
.rsg-top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}
.rsg-chip{display:inline-block;padding:3px 10px;border-radius:99px;background:rgba(14,124,123,.12);color:var(--teal,#0E7C7B);font-size:11.5px;font-weight:800}
.rsg h3{margin:6px 0 4px;font-size:18px;font-weight:800;color:var(--ink,#0F1B2D)}
.rsg p{margin:0;font-size:13px;color:var(--ink-3,#5B6B80)}
.rsg-tg{display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:var(--ink,#0F1B2D);min-height:40px;cursor:pointer}
.rsg-tg input{width:18px;height:18px}
.rsg-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
.rsg-col{border:1px solid var(--line,#E1E6EE);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:8px}
.rsg-lanc{display:flex;justify-content:space-between;align-items:baseline;gap:8px}
.rsg-lanc b{font-size:15.5px;color:var(--ink,#0F1B2D)}
.rsg-lanc small{font-size:12px;color:var(--ink-3,#5B6B80);text-transform:capitalize}
.rsg-num{font-size:30px;font-weight:800;color:var(--teal,#0E7C7B);line-height:1.1}
.rsg-num small{font-size:13px;font-weight:600;color:var(--ink-3,#5B6B80)}
.rsg-mot{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:5px}
.rsg-mot li{display:flex;justify-content:space-between;gap:8px;font-size:13px;color:var(--ink,#0F1B2D)}
.rsg-mot li b{font-variant-numeric:tabular-nums}
.rsg-cel{font-size:12.5px;color:var(--ink-3,#5B6B80);border-top:1px dashed var(--line,#E1E6EE);padding-top:8px}
.rsg-pe{display:flex;flex-direction:column;gap:4px;font-size:12.5px;color:var(--ink-3,#5B6B80)}
.rsg-mut{font-size:13px;color:var(--ink-3,#5B6B80)}
`;
