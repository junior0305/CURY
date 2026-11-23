// Admin do Discador (SÓ ADMIN) — dentro de Configurar.
// Cadastra ramais comprados (ramal + senha SIP + Bina), aloca cada um pra um dono em
// qualquer nível (diretor/super/gerente/corretor), e define a licença (canais + minutos).
// Backend: RPCs disc_admin_painel / disc_admin_salvar_linha / disc_admin_apagar_linha /
// disc_admin_salvar_licenca / disc_admin_buscar_donos (todas exigem role ADMIN).
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const sb = supabase as any;
const NIVEL: Record<string, string> = { DIRECTOR: "diretor", SUPERINTENDENT: "super", MANAGER: "gerente", BROKER: "corretor" };

type Linha = { id: string; ramal: string; bina: string | null; sip_server: string; sip_domain: string; tem_senha: boolean; ativo: boolean; dono_id: string; dono_nome: string; dono_nivel: string; pool: number; em_uso: boolean; em_uso_nome: string | null };
type Lic = { dono_id: string; dono_nome: string; dono_nivel: string; posicoes: number; minutos: number | null; minutos_usados: number };

export default function DiscadorAdmin() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["disc-admin"],
    queryFn: async () => {
      const { data, error } = await sb.rpc("disc_admin_painel");
      if (error) throw error;
      return data as { linhas: Linha[]; licencas: Lic[] };
    },
  });
  const [form, setForm] = useState<Partial<Linha> & { senha?: string } | null>(null);
  const [licForm, setLicForm] = useState<{ dono_id?: string; dono_nome?: string; posicoes?: number; minutos?: number } | null>(null);
  const recarrega = () => qc.invalidateQueries({ queryKey: ["disc-admin"] });

  if (error) return <div className="dadm"><style>{CSS}</style><p className="dadm-err">Esta tela é só do admin. ({(error as any)?.message})</p></div>;

  return (
    <div className="dadm"><style>{CSS}</style>
      <div className="dadm-h"><b>📞 Discador — ramais e licenças</b><span>Você compra na Nvoip e aloca aqui. Só o admin vê isto.</span></div>

      {/* LICENÇAS */}
      <div className="dadm-card">
        <div className="dadm-ch">Licenças (canais simultâneos + minutos)
          <button className="dadm-add" onClick={() => setLicForm({ posicoes: 1 })}>+ Definir licença</button>
        </div>
        {licForm && <LicencaForm lic={licForm} setLic={setLicForm} onPronto={() => { setLicForm(null); recarrega(); }} />}
        {isLoading ? <p className="dadm-m">Carregando…</p> : !data?.licencas.length ? <p className="dadm-m">Nenhuma licença definida ainda.</p> : (
          <div className="dadm-lics">
            {data.licencas.map((l) => (
              <div className="dadm-lic" key={l.dono_id} onClick={() => setLicForm({ dono_id: l.dono_id, dono_nome: l.dono_nome, posicoes: l.posicoes, minutos: l.minutos ?? undefined })}>
                <b>{l.dono_nome}</b><span className="lv">{NIVEL[l.dono_nivel] ?? l.dono_nivel}</span>
                <div className="dadm-licn"><b>{l.posicoes}</b> canais {l.minutos != null && <>· <b>{l.minutos_usados}</b>/{l.minutos} min</>}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* RAMAIS */}
      <div className="dadm-card">
        <div className="dadm-ch">Ramais (chips)
          <button className="dadm-add" onClick={() => setForm({ sip_server: "wss://app.nvoip.com.br:7443", sip_domain: "app.nvoip.com.br", ativo: true })}>+ Cadastrar ramal</button>
        </div>
        {form && <LinhaForm form={form} setForm={setForm} onPronto={() => { setForm(null); recarrega(); }} />}
        {isLoading ? <p className="dadm-m">Carregando…</p> : !data?.linhas.length ? <p className="dadm-m">Nenhum ramal cadastrado. Cadastre o que você comprou na Nvoip.</p> : (
          <table className="dadm-tab">
            <thead><tr><th>Ramal</th><th>Dono</th><th>Pool</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {data.linhas.map((l) => (
                <tr key={l.id}>
                  <td><b className="mono">{l.ramal}</b>{l.bina ? <small> · Bina {l.bina}</small> : null}{!l.tem_senha ? <small className="warn"> · sem senha SIP</small> : null}</td>
                  <td>{l.dono_nome} <span className="lv">{NIVEL[l.dono_nivel] ?? l.dono_nivel}</span></td>
                  <td>{l.pool}</td>
                  <td>{!l.ativo ? <span className="tg off">inativo</span> : l.em_uso ? <span className="tg uso">em uso · {l.em_uso_nome}</span> : <span className="tg ok">livre</span>}</td>
                  <td><button className="dadm-mini" onClick={() => setForm({ ...l, senha: "" })}>editar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function DonoPicker({ valor, onPick }: { valor?: { id?: string; nome?: string }; onPick: (id: string, nome: string) => void }) {
  const [q, setQ] = useState("");
  const { data } = useQuery({
    queryKey: ["disc-donos", q],
    enabled: q.length >= 2,
    queryFn: async () => { const { data } = await sb.rpc("disc_admin_buscar_donos", { p_q: q }); return (data ?? []) as { id: string; nome: string; nivel: string }[]; },
  });
  return (
    <div className="dadm-dono">
      <input placeholder={valor?.nome ? `Dono: ${valor.nome}` : "Buscar dono (diretor/super/gerente/corretor)…"} value={q} onChange={(e) => setQ(e.target.value)} />
      {q.length >= 2 && (data ?? []).length > 0 && (
        <div className="dadm-res">
          {(data ?? []).map((d) => (
            <button key={d.id} onClick={() => { onPick(d.id, d.nome); setQ(""); }}>{d.nome} <span className="lv">{NIVEL[d.nivel] ?? d.nivel}</span></button>
          ))}
        </div>
      )}
    </div>
  );
}

function LinhaForm({ form, setForm, onPronto }: { form: any; setForm: (f: any) => void; onPronto: () => void }) {
  const [salvando, setSalvando] = useState(false);
  const editando = !!form.id;
  async function salvar() {
    if (!form.ramal) { toast.error("Informe o número do ramal."); return; }
    if (!form.dono_id) { toast.error("Escolha o dono do ramal."); return; }
    if (!editando && !form.senha) { toast.error("Informe a senha SIP (do painel Nvoip)."); return; }
    setSalvando(true);
    const { error } = await sb.rpc("disc_admin_salvar_linha", {
      p_id: form.id ?? null, p_ramal: form.ramal, p_server: form.sip_server, p_domain: form.sip_domain,
      p_senha: form.senha ?? "", p_bina: form.bina ?? null, p_dono: form.dono_id, p_ativo: form.ativo ?? true,
    });
    setSalvando(false);
    if (error) { toast.error("Não salvou: " + error.message); return; }
    toast.success("Ramal salvo."); onPronto();
  }
  async function apagar() {
    if (!confirm("Apagar este ramal? Quem usa ele deixa de ligar.")) return;
    const { error } = await sb.rpc("disc_admin_apagar_linha", { p_id: form.id });
    if (error) { toast.error(error.message); return; }
    toast.success("Ramal apagado."); onPronto();
  }
  return (
    <div className="dadm-form">
      <div className="dadm-grid">
        <label>Ramal<input value={form.ramal ?? ""} onChange={(e) => setForm({ ...form, ramal: e.target.value })} placeholder="ex. 144933003" /></label>
        <label>Senha SIP{editando && <small> (em branco = mantém)</small>}<input type="password" value={form.senha ?? ""} onChange={(e) => setForm({ ...form, senha: e.target.value })} placeholder={editando ? "••••••" : "do painel Nvoip"} /></label>
        <label>Bina (opcional)<input value={form.bina ?? ""} onChange={(e) => setForm({ ...form, bina: e.target.value })} placeholder="nº que aparece pro cliente" /></label>
      </div>
      <label className="dadm-wide">Dono do ramal<DonoPicker valor={{ id: form.dono_id, nome: form.dono_nome }} onPick={(id, nome) => setForm({ ...form, dono_id: id, dono_nome: nome })} /></label>
      {form.dono_nome && <p className="dadm-m">Alocado para: <b>{form.dono_nome}</b></p>}
      <label className="dadm-ck"><input type="checkbox" checked={form.ativo ?? true} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} /> Ativo</label>
      <div className="dadm-fbtn">
        <button className="dadm-salvar" disabled={salvando} onClick={salvar}>{salvando ? "Salvando…" : "Salvar ramal"}</button>
        {editando && <button className="dadm-apagar" onClick={apagar}>Apagar</button>}
        <button className="dadm-cancel" onClick={() => setForm(null)}>Cancelar</button>
      </div>
    </div>
  );
}

function LicencaForm({ lic, setLic, onPronto }: { lic: any; setLic: (l: any) => void; onPronto: () => void }) {
  const [salvando, setSalvando] = useState(false);
  async function salvar() {
    if (!lic.dono_id) { toast.error("Escolha o dono."); return; }
    setSalvando(true);
    const { error } = await sb.rpc("disc_admin_salvar_licenca", { p_dono: lic.dono_id, p_posicoes: lic.posicoes ?? 1, p_minutos: lic.minutos ?? null });
    setSalvando(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Licença salva."); onPronto();
  }
  return (
    <div className="dadm-form">
      <label className="dadm-wide">Dono<DonoPicker valor={{ id: lic.dono_id, nome: lic.dono_nome }} onPick={(id, nome) => setLic({ ...lic, dono_id: id, dono_nome: nome })} /></label>
      {lic.dono_nome && <p className="dadm-m">Licença de: <b>{lic.dono_nome}</b></p>}
      <div className="dadm-grid">
        <label>Canais simultâneos<input type="number" min={1} value={lic.posicoes ?? 1} onChange={(e) => setLic({ ...lic, posicoes: +e.target.value })} /></label>
        <label>Minutos do pacote<input type="number" min={0} value={lic.minutos ?? ""} onChange={(e) => setLic({ ...lic, minutos: e.target.value === "" ? null : +e.target.value })} placeholder="ex. 300" /></label>
      </div>
      <div className="dadm-fbtn">
        <button className="dadm-salvar" disabled={salvando} onClick={salvar}>{salvando ? "Salvando…" : "Salvar licença"}</button>
        <button className="dadm-cancel" onClick={() => setLic(null)}>Cancelar</button>
      </div>
    </div>
  );
}

const CSS = `
.dadm{--sf:#fff;--sf2:#f6f8fb;--ln:#dce3ec;--ln2:#e8edf3;--ink:#0d1f3c;--ink2:#3a4a63;--ink3:#7c8aa0;--ac:#1766d6;--ac-s:#e4efff;--good:#0f9d6b;--warn:#c77a0a;--warn-s:#fdf0db;--red:#d1443a;font-family:inherit;color:var(--ink)}
html[data-theme="dark"] .dadm{--sf:#111d33;--sf2:#0e1a2e;--ln:#23344f;--ln2:#1c2c45;--ink:#eaf0fa;--ink2:#aab8cf;--ink3:#6f8099;--ac:#4d93f0;--ac-s:#16294a;--good:#2bc389;--warn:#e0a53f;--warn-s:#3a2d12;--red:#ef6d63}
.dadm *{box-sizing:border-box}
.dadm-h{display:flex;flex-direction:column;gap:2px;margin-bottom:14px}
.dadm-h b{font-size:17px;font-weight:800} .dadm-h span{font-size:12.5px;color:var(--ink2)}
.dadm-err{color:var(--warn);background:var(--warn-s);border-radius:10px;padding:12px 14px}
.dadm-card{background:var(--sf);border:1px solid var(--ln);border-radius:14px;padding:14px 16px;margin-bottom:14px}
.dadm-ch{display:flex;align-items:center;gap:10px;font-size:13px;font-weight:800;margin-bottom:10px;flex-wrap:wrap}
.dadm-add{margin-left:auto;border:1px solid var(--ac);background:var(--ac-s);color:var(--ac);font:inherit;font-weight:700;font-size:12.5px;padding:7px 12px;border-radius:9px;cursor:pointer}
.dadm-m{font-size:12.5px;color:var(--ink2);margin:4px 0}
.dadm-lics{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px}
.dadm-lic{border:1px solid var(--ln);border-radius:11px;padding:11px 12px;cursor:pointer;background:var(--sf2)}
.dadm-lic b{font-size:13.5px} .dadm-licn{font-size:12.5px;color:var(--ink2);margin-top:6px}
.lv{font-size:10.5px;font-weight:800;border-radius:6px;padding:1px 7px;background:var(--ac-s);color:var(--ac);margin-left:6px;text-transform:uppercase;letter-spacing:.03em}
.dadm-tab{width:100%;border-collapse:collapse;font-size:13px}
.dadm-tab th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--ink3);font-weight:800;padding:6px 8px;border-bottom:1px solid var(--ln)}
.dadm-tab td{padding:9px 8px;border-bottom:1px solid var(--ln2)}
.mono{font-variant-numeric:tabular-nums} .dadm-tab small{color:var(--ink2);font-size:11.5px} .dadm-tab small.warn{color:var(--warn)}
.tg{font-size:11px;font-weight:800;border-radius:7px;padding:2px 8px} .tg.ok{background:var(--ac-s);color:var(--ac)} .tg.uso{background:var(--warn-s);color:var(--warn)} .tg.off{background:var(--ln2);color:var(--ink3)}
.dadm-mini{border:1px solid var(--ln);background:var(--sf);color:var(--ink2);font:inherit;font-weight:700;font-size:12px;padding:6px 11px;border-radius:8px;cursor:pointer}
.dadm-form{border:1px dashed var(--ac);border-radius:12px;padding:13px;margin-bottom:12px;background:var(--sf2)}
.dadm-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.dadm-form label{display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:700;color:var(--ink2)}
.dadm-form label small{font-weight:600;color:var(--ink3)}
.dadm-form input{border:1px solid var(--ln);border-radius:9px;background:var(--sf);color:var(--ink);font:inherit;font-size:13.5px;padding:9px 11px}
.dadm-wide{margin-top:10px}
.dadm-ck{flex-direction:row!important;align-items:center;gap:7px;margin-top:10px}
.dadm-ck input{width:auto}
.dadm-dono{position:relative}
.dadm-res{position:absolute;z-index:5;top:100%;left:0;right:0;background:var(--sf);border:1px solid var(--ln);border-radius:10px;margin-top:4px;box-shadow:0 10px 30px -12px rgba(0,0,0,.4);max-height:220px;overflow:auto}
.dadm-res button{display:block;width:100%;text-align:left;border:0;background:none;color:var(--ink);font:inherit;font-size:13px;padding:9px 11px;cursor:pointer;border-bottom:1px solid var(--ln2)}
.dadm-res button:hover{background:var(--ac-s)}
.dadm-fbtn{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.dadm-salvar{border:0;background:var(--ac);color:#fff;font:inherit;font-weight:800;font-size:13px;padding:9px 16px;border-radius:9px;cursor:pointer}
.dadm-salvar:disabled{opacity:.5}
.dadm-apagar{border:1px solid var(--red);background:none;color:var(--red);font:inherit;font-weight:700;font-size:13px;padding:9px 14px;border-radius:9px;cursor:pointer}
.dadm-cancel{border:1px solid var(--ln);background:var(--sf);color:var(--ink2);font:inherit;font-weight:700;font-size:13px;padding:9px 14px;border-radius:9px;cursor:pointer}
`;
