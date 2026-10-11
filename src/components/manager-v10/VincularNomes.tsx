// "Confirme quem é quem" — o gerente liga cada nome do C2S/Junix ao corretor dele.
//
// O conector (/root/econ/metricas.py) casa sozinho pelo 1º nome, e isso erra em
// homônimo e apelido ("GALILEIA BN", "FARTOT" x "Fartote", o gerente batendo ponto
// no próprio nome). Aqui o gerente confirma uma vez, nome por nome; o conector passa
// a obedecer o que ele confirmou (econ_vinculos) antes de adivinhar.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Sec } from "@/components/manager-v10/ui";
import CadastrarCorretor from "@/components/manager-v10/CadastrarCorretor";

type Nome = { nome_chave: string; exibicao: string; fontes: string; profile_auto: string | null;
  ultimo_dia: string | null; dias_60: number };
type Vinculo = { nome_chave: string; acao: "corretor" | "sem_login" | "nao_e_da_equipe"; profile_id: string | null };

const SEM_LOGIN = "__sem_login", NAO = "__nao";

export default function VincularNomes({ managerId, gerenteFixo }: {
  managerId: string | undefined;
  /** super/diretor cadastrando pelo gerente: o create-user só aceita o gerente vindo de cima */
  gerenteFixo?: { id: string; nome: string };
}) {
  const [cadastrando, setCadastrando] = useState<Nome | null>(null);
  const qc = useQueryClient();
  const [escolha, setEscolha] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState<string | null>(null);
  const [verConfirmados, setVerConfirmados] = useState(false);

  const { data } = useQuery({
    queryKey: ["vincular-nomes", managerId],
    enabled: !!managerId,
    staleTime: 60_000,
    queryFn: async () => {
      const [nRes, vRes, tRes] = await Promise.all([
        supabase.from("econ_nomes" as any).select("nome_chave,exibicao,fontes,profile_auto,ultimo_dia,dias_60")
          .eq("gerente_id", managerId!).order("exibicao"),
        supabase.from("econ_vinculos" as any).select("nome_chave,acao,profile_id").eq("gerente_id", managerId!),
        supabase.from("profiles").select("id,first_name,last_name").eq("manager_id", managerId!)
          .eq("is_active", true).order("first_name"),
      ]);
      return { nomes: (nRes.data ?? []) as Nome[], vinculos: new Map(((vRes.data ?? []) as Vinculo[]).map((v) => [v.nome_chave, v])),
        time: ((tRes.data ?? []) as any[]).map((p) => ({ id: p.id as string, nome: [p.first_name, p.last_name].filter(Boolean).join(" ") || "—" })) };
    },
  });
  if (!data || !data.nomes.length) return null;

  const nomeDe = (id: string | null) => data.time.find((t) => t.id === id)?.nome ?? null;
  const pendentes = data.nomes.filter((n) => !data.vinculos.has(n.nome_chave));
  const confirmados = data.nomes.filter((n) => data.vinculos.has(n.nome_chave));
  // sem palpite primeiro (são os que mais distorcem o número), depois os palpites a conferir
  pendentes.sort((a, b) => Number(!!a.profile_auto) - Number(!!b.profile_auto) || b.dias_60 - a.dias_60);

  async function confirmar(n: Nome, valor: string) {
    const acao = valor === SEM_LOGIN ? "sem_login" : valor === NAO ? "nao_e_da_equipe" : "corretor";
    setSalvando(n.nome_chave);
    try {
      const { error } = await supabase.rpc("confirmar_vinculo" as any, {
        p_nome: n.nome_chave, p_acao: acao, p_profile: acao === "corretor" ? valor : null });
      if (error) throw error;
      toast.success(acao === "corretor" ? `${n.exibicao} = ${nomeDe(valor)}` : `${n.exibicao}: ${acao === "sem_login" ? "sem login ainda" : "não conta"}`);
      qc.invalidateQueries({ queryKey: ["vincular-nomes", managerId] });
    } catch (e: any) { toast.error(e?.message ?? "Não consegui salvar."); }
    finally { setSalvando(null); }
  }
  async function desfazer(n: Nome) {
    const { error } = await supabase.rpc("confirmar_vinculo" as any, { p_nome: n.nome_chave, p_acao: "desfazer", p_profile: null });
    if (error) toast.error(error.message); else qc.invalidateQueries({ queryKey: ["vincular-nomes", managerId] });
  }

  const detalhe = (n: Nome) => [n.fontes, n.dias_60 ? `${n.dias_60} dia${n.dias_60 > 1 ? "s" : ""} de plantão` : null,
    n.ultimo_dia ? `último ${n.ultimo_dia.slice(8, 10)}/${n.ultimo_dia.slice(5, 7)}` : null].filter(Boolean).join(" · ");

  return (
    <Sec title="Confirme quem é quem"
      tag={<span className="dim">{pendentes.length ? `${pendentes.length} para confirmar` : "tudo confirmado ✓"}</span>}
      sub="Nomes como aparecem no C2S e no Junix. Diga quem é cada um na sua equipe — é uma vez só, e os números do painel passam a usar a sua resposta.">
      <div className="panel">
        {pendentes.map((n) => {
          const valor = escolha[n.nome_chave] ?? n.profile_auto ?? "";
          return (
            <div key={n.nome_chave} className="item" style={{ flexWrap: "wrap" }}>
              <span className={`pip${n.profile_auto ? "" : " hot"}`} />
              <div className="item-b">
                <b>{n.exibicao}</b>
                <span>{n.profile_auto ? <>parece ser <em>{nomeDe(n.profile_auto) ?? "alguém de outra equipe"}</em> · </> : <em>sem cadastro achado · </em>}{detalhe(n)}</span>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                <select value={valor} onChange={(e) => setEscolha((s) => ({ ...s, [n.nome_chave]: e.target.value }))}
                  style={{ border: "1px solid var(--line)", background: "var(--sunk)", borderRadius: 8, padding: "7px 9px", font: "500 13px Archivo,sans-serif", color: "var(--ink)", maxWidth: 190 }}>
                  <option value="" disabled>quem é?</option>
                  {data.time.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
                  <option value={SEM_LOGIN}>Ainda não tem login</option>
                  <option value={NAO}>Não contar (gerente / outra equipe)</option>
                </select>
                <button className="mini solid" disabled={!valor || salvando === n.nome_chave} onClick={() => confirmar(n, valor)}>
                  {salvando === n.nome_chave ? "…" : "Confirmar"}</button>
                {!n.profile_auto || valor === SEM_LOGIN ? (
                  <button className="mini key" onClick={() => setCadastrando(n)}>Cadastrar</button>) : null}
              </div>
            </div>
          );
        })}
        {confirmados.length ? (
          <div className="item" style={{ cursor: "pointer" }} onClick={() => setVerConfirmados((v) => !v)}>
            <span className="pip ok" />
            <div className="item-b"><b>{confirmados.length} já confirmado{confirmados.length > 1 ? "s" : ""}</b>
              <span>{verConfirmados ? "toque para esconder" : "toque para ver ou corrigir"}</span></div>
          </div>
        ) : null}
        {verConfirmados && confirmados.map((n) => {
          const v = data.vinculos.get(n.nome_chave)!;
          return (
            <div key={n.nome_chave} className="item">
              <span className="pip ok" />
              <div className="item-b"><b>{n.exibicao}</b>
                <span>= <em>{v.acao === "corretor" ? nomeDe(v.profile_id) ?? "—" : v.acao === "sem_login" ? "ainda sem login" : "não conta"}</em> · {detalhe(n)}</span></div>
              <button className="mini" onClick={() => desfazer(n)}>Corrigir</button>
            </div>
          );
        })}
      </div>
      {cadastrando && managerId ? (
        <CadastrarCorretor managerId={managerId} nomeInicial={cadastrando.exibicao.replace(/\s+Bn$/i, "")}
          gerentes={gerenteFixo ? [gerenteFixo] : undefined}
          onFechar={() => setCadastrando(null)}
          onPronto={async (novoId) => {
            const n = cadastrando; setCadastrando(null);
            // cadastrou a partir do nome do C2S/Junix: já fica associado, sem passo extra
            if (novoId) await supabase.rpc("confirmar_vinculo" as any, { p_nome: n.nome_chave, p_acao: "corretor", p_profile: novoId });
            qc.invalidateQueries({ queryKey: ["vincular-nomes", managerId] });
          }} />
      ) : null}
    </Sec>
  );
}
