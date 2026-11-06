// Plantões da equipe (06/11): onde o corretor pode fazer check-in. O gerente cadastra de pé no plantão
// ("Estou aqui agora" grava o ponto exato) ou acerta o pino de um que já existe; aprova ou recusa o plantão
// que um corretor digitou. Corretor nunca cria plantão sozinho. Econ veio do C2S e a planoego do site da Plano&Plano.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { pegarLocal, motivoTxt, erroTxt, distTxt } from "@/lib/plantao";
import PlantaoAgora from "./PlantaoAgora";

type Plantao = {
  id: string; nome: string; endereco: string | null; regiao: string | null; status: string; origem: string; aproximado: boolean;
  lat: number | null; lng: number | null; equipe: string | null; criado_por: string | null; hoje: number; pode_editar: boolean; created_at: string;
};
const CSS = `
.plc{display:grid;gap:18px}
.plc-caixa{border:1px solid rgba(127,140,160,.35);border-radius:14px;padding:16px;display:grid;gap:10px}
.plc-caixa h3{margin:0;font-size:16px}
.plc-m{font-size:13px;opacity:.8}
.plc-fila{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.plc-inp{font:inherit;font-size:14px;color:inherit;background:transparent;border:1px solid rgba(127,140,160,.45);border-radius:8px;padding:9px 10px;min-width:220px;flex:1}
.plc-btn{border:1px solid rgba(127,140,160,.45);background:transparent;color:inherit;border-radius:8px;padding:9px 12px;font-weight:700;font-size:13.5px;cursor:pointer;min-height:38px}
.plc-btn.pri{background:#0B7A6A;border-color:#0B7A6A;color:#fff}
.plc-btn:disabled{opacity:.5;cursor:default}
.plc-pend{border:1px solid #E8B65C;background:rgba(232,182,92,.12);border-radius:12px;padding:12px;display:grid;gap:8px}
.plc-lista{display:grid;gap:8px}
.plc-item{border:1px solid rgba(127,140,160,.25);border-radius:12px;padding:10px 12px;display:flex;gap:10px;justify-content:space-between;align-items:center;flex-wrap:wrap}
.plc-tag{font-size:12px;font-weight:700;border-radius:999px;padding:2px 8px;background:#FFF0D1;color:#7A4A00}
.plc-tag.ok{background:#DDF3EE;color:#075C50}
`;

export default function PlantoesCadastro({ como }: { como?: string | null }) {
  const qc = useQueryClient();
  const [nome, setNome] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const [tirar, setTirar] = useState<string | null>(null);
  const { data: plantoes = [] } = useQuery<Plantao[]>({
    queryKey: ["plantoesGerenciar", como || "eu"],
    queryFn: async () => { const { data, error } = await (supabase as any).rpc("plantoes_gerenciar", { p_como: como || null }); if (error) throw error; return data || []; },
  });
  const atualizar = () => qc.invalidateQueries({ queryKey: ["plantoesGerenciar"] });
  const rodar = async (chave: string, f: () => Promise<void>) => {
    if (ocupado) return; setOcupado(chave);
    try { await f(); } catch (e) { toast.error(erroTxt(e)); } finally { setOcupado(null); }
  };

  const cadastrarAqui = () => rodar("novo", async () => {
    if (!nome.trim()) { toast.error("Escreva o nome do plantão."); return; }
    const l = await pegarLocal();
    const { data, error } = await (supabase as any).rpc("plantao_cadastrar", { p_nome: nome.trim(), p_endereco: null, p_lat: l.lat, p_lng: l.lng, p_prec: l.prec });
    if (error) throw error;
    if (!data?.ok) { toast.error(motivoTxt(data)); return; }
    toast.success(`${nome.trim()} cadastrado neste ponto`); setNome(""); atualizar();
  });
  const marcarAqui = (p: Plantao) => rodar(p.id, async () => {
    const l = await pegarLocal();
    const { data, error } = await (supabase as any).rpc("plantao_marcar_aqui", { p_plantao: p.id, p_lat: l.lat, p_lng: l.lng, p_prec: l.prec });
    if (error) throw error;
    if (!data?.ok) { toast.error(motivoTxt(data)); return; }
    toast.success(`Pino do ${p.nome} acertado${data.movido_m ? ` (mudou ${distTxt(data.movido_m)})` : ""}`); atualizar();
  });
  const decidir = (p: Plantao, aprovar: boolean) => rodar(p.id, async () => {
    const { error } = await (supabase as any).rpc("plantao_decidir", { p_plantao: p.id, p_aprovar: aprovar, p_nome: nomes[p.id] || null });
    if (error) throw error;
    toast.success(aprovar ? "Plantão aprovado · entra na lista dos corretores" : "Plantão recusado · quem fez check-in nele saiu da roleta"); atualizar();
    qc.invalidateQueries({ queryKey: ["plantaoAgora"] });
  });
  const desativar = (p: Plantao) => rodar(p.id, async () => {
    const { error } = await (supabase as any).rpc("plantao_desativar", { p_plantao: p.id }); if (error) throw error;
    toast.success(`${p.nome} saiu da lista`); atualizar();
  });

  const pendentes = plantoes.filter((p) => p.status === "pendente");
  const ativos = plantoes.filter((p) => p.status === "ativo" && (!busca || `${p.nome} ${p.endereco || ""} ${p.regiao || ""}`.toLowerCase().includes(busca.toLowerCase())));
  const mapa = (p: Plantao) => p.lat != null ? `https://www.google.com/maps?q=${p.lat},${p.lng}` : null;

  return (
    <div className="plc">
      <style>{CSS}</style>
      <section className="plc-caixa" aria-label="Quem está no plantão agora">
        <h3>Quem está no plantão agora</h3>
        <PlantaoAgora como={como} />
      </section>

      <section className="plc-caixa" aria-label="Cadastrar plantão">
        <h3>Está no plantão agora? Cadastre de pé, aqui dentro</h3>
        <span className="plc-m">O Comandra grava o ponto exato de onde você está. Para um plantão que já está na lista, use "Estou aqui" nele (acerta o pino).</span>
        <div className="plc-fila">
          <input className="plc-inp" placeholder="Nome do plantão (ex.: Plantão Lapa)" value={nome} onChange={(e) => setNome(e.target.value)} aria-label="Nome do plantão" />
          <button type="button" className="plc-btn pri" onClick={cadastrarAqui} disabled={!!ocupado}>{ocupado === "novo" ? "Pegando a localização…" : "Estou aqui agora · cadastrar"}</button>
        </div>
      </section>

      {pendentes.length > 0 && (
        <section className="plc-caixa" aria-label="Plantões pedidos por corretores">
          <h3>Pedidos de corretor · {pendentes.length}</h3>
          {pendentes.map((p) => (
            <div key={p.id} className="plc-pend">
              <span><b>{p.criado_por || "Corretor"}</b> fez check-in num plantão novo: <b>{p.nome}</b> · {new Date(p.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}
                {mapa(p) ? <> · <a href={mapa(p)!} target="_blank" rel="noreferrer">ver no mapa</a></> : null}</span>
              <div className="plc-fila">
                <input className="plc-inp" placeholder="Nome final (opcional)" value={nomes[p.id] ?? ""} onChange={(e) => setNomes((m) => ({ ...m, [p.id]: e.target.value }))} aria-label={`Nome final para ${p.nome}`} />
                <button type="button" className="plc-btn pri" disabled={!!ocupado} onClick={() => decidir(p, true)}>Aprovar</button>
                <button type="button" className="plc-btn" disabled={!!ocupado} onClick={() => decidir(p, false)}>Recusar</button>
              </div>
            </div>))}
        </section>
      )}

      <section className="plc-caixa" aria-label="Plantões cadastrados">
        <div className="plc-fila" style={{ justifyContent: "space-between" }}>
          <h3>Plantões cadastrados · {plantoes.filter((p) => p.status === "ativo").length}</h3>
          <input className="plc-inp" style={{ maxWidth: 280 }} type="search" placeholder="Buscar plantão…" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar plantão" />
        </div>
        <span className="plc-m">"Pino aproximado" = localizado pelo endereço, ainda não conferido no local: o check-in aceita até 3 km e o pino se acerta sozinho com os check-ins dos corretores. Para deixar exato, toque em "Estou aqui" quando estiver lá.</span>
        <div className="plc-lista">
          {ativos.map((p) => (
            <div key={p.id} className="plc-item">
              <span style={{ display: "grid", gap: 2 }}>
                <b>{p.nome} <span className={`plc-tag${p.aproximado ? "" : " ok"}`}>{p.aproximado ? "pino aproximado" : "pino conferido"}</span></b>
                <span className="plc-m">{[p.endereco, p.regiao, p.equipe ? `equipe ${p.equipe}` : "empresa toda"].filter(Boolean).join(" · ")}{p.hoje ? ` · ${p.hoje} com check-in hoje` : ""}</span>
              </span>
              <span className="plc-fila">
                {mapa(p) && <a className="plc-btn" href={mapa(p)!} target="_blank" rel="noreferrer">Mapa</a>}
                <button type="button" className="plc-btn" disabled={!!ocupado} onClick={() => marcarAqui(p)}>{ocupado === p.id ? "Pegando…" : "Estou aqui"}</button>
                {p.pode_editar && (tirar === p.id
                  ? <><button type="button" className="plc-btn" disabled={!!ocupado} onClick={() => { setTirar(null); desativar(p); }}>Tirar da lista</button>
                      <button type="button" className="plc-btn" onClick={() => setTirar(null)}>Cancelar</button></>
                  : <button type="button" className="plc-btn" disabled={!!ocupado} onClick={() => setTirar(p.id)}>Tirar</button>)}
              </span>
            </div>))}
          {!ativos.length && <span className="plc-m">Nenhum plantão {busca ? "com esse nome" : "cadastrado"}.</span>}
        </div>
      </section>
    </div>
  );
}
