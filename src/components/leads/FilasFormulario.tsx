/* Filas por formulário (19/10) — aba Leads do gerente, do super e do diretor.
 *
 * O líder escolhe um formulário do Facebook e os corretores que recebem os leads dele.
 * Fila do formulário MANDA: os escolhidos recebem em rodízio mesmo fora do plantão
 * (distribution_queues.ignora_plantao). Formulário sem fila segue a roleta do plantão, como antes.
 *
 * De onde vêm os formulários: formularios_catalogo, montado de hora em hora no servidor
 * (/root/econ/formularios_catalogo.py) a partir dos anúncios das contas de cada líder e das
 * páginas compartilhadas com a ADMIN 01 — por isso aparecem antes do primeiro lead.
 * Salvar/tirar passa pelas RPCs salvar_fila_formulario / tirar_fila_formulario, que conferem
 * se os corretores são da árvore de quem salva.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";

type Form = { form_id: string; page_id: string | null; nome: string | null; nome_fonte: string | null; anuncios: string | null;
  owner_id: string | null; status: string | null; leads_7d: number };
type Pessoa = { id: string; first_name: string | null; last_name: string | null; role: string; manager_id: string | null; lead_assignment_enabled: boolean | null };
type Fila = { id: string; match_value: string; broker_ids: string[]; criado_por: string | null; last_assigned_index: number | null };

const nomeDe = (p?: Pessoa) => (p ? [p.first_name, p.last_name].filter(Boolean).join(" ") || "—" : "—");
const ERROS: Record<string, string> = {
  corretor_fora_da_sua_equipe: "Algum corretor escolhido não é da sua equipe.",
  fila_de_outro_lider: "Esta fila foi criada por outro líder. Peça para ele ou para quem está acima.",
  escolha_corretores: "Escolha pelo menos um corretor.",
  sem_permissao: "Você não tem permissão para criar filas.",
};

export default function FilasFormulario() {
  const { session, role } = useAuth();
  const eu = session?.user?.id;
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [marc, setMarc] = useState<Set<string>>(new Set());
  const [verPausados, setVerPausados] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const tudo = role === "ADMIN" || role === "DIRECTOR";

  const { data } = useQuery({
    queryKey: ["filas-formulario", eu, role],
    enabled: !!eu,
    staleTime: 60_000,
    queryFn: async () => {
      const arvore = tudo ? null : (((await supabase.rpc("ids_da_arvore" as any, { p: eu })).data ?? []) as any[]).map((r: any) => (typeof r === "string" ? r : r.ids_da_arvore));
      let qp = supabase.from("profiles").select("id,first_name,last_name,role,manager_id,lead_assignment_enabled").eq("is_active", true);
      if (arvore) qp = qp.in("id", arvore);
      let qf = supabase.from("formularios_catalogo" as any).select("form_id,page_id,nome,nome_fonte,anuncios,owner_id,status,leads_7d");
      if (arvore) qf = qf.in("owner_id", arvore);
      const [pRes, fRes, qRes] = await Promise.all([
        qp,
        qf.order("leads_7d", { ascending: false }),
        supabase.from("distribution_queues").select("id,match_value,broker_ids,criado_por,last_assigned_index").eq("match_field", "form_id").eq("is_active", true),
      ]);
      return { pessoas: (pRes.data ?? []) as Pessoa[], forms: ((fRes.data ?? []) as unknown) as Form[], filas: ((qRes.data ?? []) as unknown) as Fila[] };
    },
  });

  const pessoas = data?.pessoas ?? [];
  const porId = useMemo(() => new Map(pessoas.map((p) => [p.id, p])), [pessoas]);
  const filaDe = useMemo(() => new Map((data?.filas ?? []).map((f) => [f.match_value, f])), [data?.filas]);
  const ativos = (data?.forms ?? []).filter((f) => f.status === "ACTIVE" || f.leads_7d > 0 || filaDe.has(f.form_id));
  const pausados = (data?.forms ?? []).filter((f) => !ativos.includes(f));
  const lista = verPausados ? [...ativos, ...pausados] : ativos;
  const comFila = ativos.filter((f) => filaDe.has(f.form_id)).length;

  // corretores da árvore, por líder direto
  const grupos = useMemo(() => {
    const m = new Map<string, Pessoa[]>();
    for (const p of pessoas) if (p.role === "BROKER") {
      const k = p.manager_id ?? "—";
      m.set(k, [...(m.get(k) ?? []), p]);
    }
    return [...m.entries()].map(([lider, cs]) => ({ lider, nome: nomeDe(porId.get(lider)), cs: cs.sort((a, b) => nomeDe(a).localeCompare(nomeDe(b))) }))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [pessoas, porId]);

  const abrirForm = (f: Form) => {
    if (sel === f.form_id) { setSel(null); return; }
    setSel(f.form_id);
    setMarc(new Set(filaDe.get(f.form_id)?.broker_ids ?? []));
  };
  const toggle = (id: string) => setMarc((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  async function salvar(f: Form) {
    if (!marc.size) { toast.error(ERROS.escolha_corretores); return; }
    setSalvando(true);
    // a ordem do rodízio segue a ordem da lista na tela
    const ordem = grupos.flatMap((g) => g.cs.map((c) => c.id)).filter((id) => marc.has(id));
    const { error } = await supabase.rpc("salvar_fila_formulario" as any, { p_form_id: f.form_id, p_page_id: f.page_id, p_nome: f.nome, p_broker_ids: ordem });
    setSalvando(false);
    if (error) { toast.error(ERROS[(error.message || "").trim()] ?? `Não consegui salvar: ${error.message}`); return; }
    toast.success("Fila salva. O próximo lead deste formulário já vai só para os escolhidos.");
    setSel(null);
    qc.invalidateQueries({ queryKey: ["filas-formulario"] });
  }
  async function tirar(f: Form) {
    const { error } = await supabase.rpc("tirar_fila_formulario" as any, { p_form_id: f.form_id });
    if (error) { toast.error(ERROS[(error.message || "").trim()] ?? `Não consegui tirar: ${error.message}`); return; }
    toast.success("Fila tirada. Os leads deste formulário voltam a seguir o plantão.");
    setSel(null);
    qc.invalidateQueries({ queryKey: ["filas-formulario"] });
  }

  const proximo = (f: Fila) => {
    const ids = f.broker_ids ?? [];
    if (!ids.length) return "—";
    return nomeDe(porId.get(ids[(f.last_assigned_index ?? 0) % ids.length]));
  };

  return (
    <>
      <style>{CSS}</style>
      <section className="ff-card">
        <div className="ff-card-txt">
          <b>Fila de leads por formulário</b>
          <span>
            {ativos.length
              ? `${comFila} formulário${comFila === 1 ? "" : "s"} com fila · ${ativos.length - comFila} sem fila (seguem o plantão)`
              : "Nenhum formulário ativo nas suas contas de anúncio."}
          </span>
        </div>
        <button type="button" className="ff-btn" onClick={() => setAberto(true)}>Gerenciar filas</button>
      </section>

      {aberto && (
        <div className="ff-fundo" onClick={() => setAberto(false)}>
          <aside className="ff-gaveta" aria-label="Fila de leads por formulário" onClick={(e) => e.stopPropagation()}>
            <div className="ff-topo">
              <div>
                <h2>Fila de leads por formulário</h2>
                <p>Formulário com fila: o lead vai só para quem você escolher, mesmo fora do plantão. Sem fila: segue a roleta do plantão, como hoje.</p>
              </div>
              <button type="button" className="ff-x" aria-label="Fechar" onClick={() => setAberto(false)}>×</button>
            </div>

            {lista.map((f) => {
              const fila = filaDe.get(f.form_id);
              const on = sel === f.form_id;
              const meta = [f.status === "ACTIVE" ? "Ativo" : "Pausado", f.leads_7d ? `${f.leads_7d} leads em 7 dias` : "ainda sem lead no Comandra",
                f.nome_fonte === "anuncio" ? "nome pelo anúncio" : null].filter(Boolean).join(" · ");
              return (
                <div key={f.form_id} className={`ff-form${on ? " on" : ""}`}>
                  <button type="button" className="ff-linha" onClick={() => abrirForm(f)} aria-expanded={on}>
                    <span className="ff-nome">
                      <b>{f.nome || `Formulário ${f.form_id}`}</b>
                      <small>{meta}</small>
                    </span>
                    <span className={`ff-badge${fila ? " tem" : ""}`}>
                      {fila ? `Fila: ${fila.broker_ids.map((id) => nomeDe(porId.get(id)).split(" ")[0]).join(", ")}` : "Sem fila · segue o plantão"}
                    </span>
                  </button>
                  {on && (
                    <div className="ff-edit">
                      <span className="ff-lbl">Quem recebe os leads deste formulário</span>
                      {grupos.length === 0 && <span className="ff-mut">Nenhum corretor na sua equipe.</span>}
                      {grupos.map((g) => (
                        <div key={g.lider} className="ff-grupo">
                          <span className="ff-gnome">{g.nome}</span>
                          <div className="ff-pills">
                            {g.cs.map((c) => (
                              <button type="button" key={c.id} className={`ff-pill${marc.has(c.id) ? " on" : ""}`} aria-pressed={marc.has(c.id)} onClick={() => toggle(c.id)}>
                                {nomeDe(c)}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                      <span className="ff-mut">
                        {marc.size ? `${marc.size} escolhido${marc.size > 1 ? "s" : ""} · rodízio entre eles${fila ? ` · próximo: ${proximo(fila)}` : ""}` : "Ninguém marcado: o formulário segue o plantão."}
                      </span>
                      <div className="ff-acoes">
                        <button type="button" className="ff-btn" disabled={salvando} onClick={() => salvar(f)}>{fila ? "Salvar mudanças" : "Criar fila"}</button>
                        {fila && <button type="button" className="ff-btn ghost" onClick={() => tirar(f)}>Tirar a fila (volta para o plantão)</button>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {pausados.length > 0 && (
              <button type="button" className="ff-mais" onClick={() => setVerPausados((v) => !v)}>
                {verPausados ? "Esconder formulários pausados" : `Ver também ${pausados.length} formulário${pausados.length > 1 ? "s" : ""} de anúncios pausados`}
              </button>
            )}
            <p className="ff-mut">
              Os formulários vêm dos anúncios das suas contas e aparecem antes do primeiro lead. Para ver o nome exato de cada formulário
              e os que ainda não estão em anúncio, compartilhe a página com a ADMIN 01 (ID 505522686848507). A lista atualiza de hora em hora.
            </p>
          </aside>
        </div>
      )}
    </>
  );
}

const CSS = `
.ff-card{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:14px 16px;margin:0 0 14px;border-radius:12px;
  border:1px solid var(--cv-border,#E1E6EE);background:var(--cv-surface,#fff);color:var(--cv-text,#0F1B2D)}
.ff-card-txt{display:flex;flex-direction:column;gap:3px;min-width:0}
.ff-card-txt b{font-size:14.5px}
.ff-card-txt span{font-size:13px;color:var(--cv-text-muted,#5B6B80)}
.ff-btn{min-height:42px;padding:0 16px !important;border-radius:10px !important;border:0 !important;background:#0E7C7B !important;color:#fff !important;font-weight:700;font-size:13.5px;cursor:pointer}
.ff-btn:disabled{opacity:.6}
.ff-btn.ghost{background:transparent !important;border:1px solid var(--cv-border,#CFD7E3) !important;color:#A8322A !important}
.ff-fundo{position:fixed;inset:0;background:rgba(15,27,45,.35);z-index:60;display:flex;justify-content:flex-end}
.ff-gaveta{width:min(640px,100%);height:100%;overflow-y:auto;box-sizing:border-box;padding:20px 22px;display:flex;flex-direction:column;gap:10px;
  background:var(--cv-surface,#fff);color:var(--cv-text,#0F1B2D);box-shadow:-8px 0 30px rgba(0,0,0,.18)}
.ff-topo{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:4px}
.ff-topo h2{margin:0;font-size:19px;font-weight:800}
.ff-topo p{margin:4px 0 0;font-size:13px;color:var(--cv-text-muted,#3C4B5F)}
.ff-x{min-width:42px;min-height:42px;border-radius:10px !important;border:1px solid var(--cv-border,#CFD7E3) !important;background:transparent !important;color:inherit;font-size:18px;cursor:pointer}
.ff-form{border:1px solid var(--cv-border,#E1E6EE);border-radius:10px;overflow:hidden}
.ff-form.on{border:2px solid #0E7C7B}
.ff-linha{display:flex;justify-content:space-between;align-items:center;gap:12px;width:100%;min-height:56px;padding:10px 12px;background:transparent;border:0;color:inherit;cursor:pointer;text-align:left}
.ff-nome{display:flex;flex-direction:column;gap:3px;min-width:0}
.ff-nome b{font-size:13.5px;overflow:hidden;text-overflow:ellipsis}
.ff-nome small{font-size:12px;color:var(--cv-text-muted,#5B6B80)}
.ff-badge{padding:4px 10px;border-radius:99px;font-size:11.5px;font-weight:700;max-width:220px;text-align:right;background:rgba(91,107,128,.12);color:var(--cv-text-muted,#3C4B5F);flex-shrink:0}
.ff-badge.tem{background:rgba(14,124,123,.12);color:#0E7C7B}
.ff-edit{padding:12px 14px;display:flex;flex-direction:column;gap:10px;border-top:1px solid var(--cv-border,#E1E6EE)}
.ff-lbl{font-size:11.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--cv-text-muted,#5B6B80)}
.ff-grupo{display:flex;flex-direction:column;gap:5px}
.ff-gnome{font-size:12.5px;font-weight:700}
.ff-pills{display:flex;gap:7px;flex-wrap:wrap}
.ff-pill{min-height:38px;padding:0 13px !important;border-radius:99px !important;border:1px solid var(--cv-border,#CFD7E3) !important;background:transparent !important;color:inherit !important;font-size:13px;font-weight:600;cursor:pointer}
.ff-pill.on{background:#0E7C7B !important;border-color:#0E7C7B !important;color:#fff !important}
.ff-acoes{display:flex;gap:8px;flex-wrap:wrap}
.ff-mut{font-size:12.5px;color:var(--cv-text-muted,#5B6B80)}
.ff-mais{align-self:flex-start;background:none;border:0;color:#0E7C7B;font-weight:700;font-size:13px;cursor:pointer;padding:6px 0}
`;
