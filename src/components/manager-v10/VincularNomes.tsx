// "Confirme quem é quem" — Vínculo C2S/Junix ao Corretor Comandra
//
// O conector (/root/econ/metricas.py) casa pelo 1º nome. Quando há homônimo ou apelido,
// o gerente confirma uma vez e o sistema grava em econ_vinculos.
//
// Versão Compacta: Fica invisível se tudo estiver confirmado, ou exibe uma faixa
// discreta de alerta que abre em modal sob demanda, sem roubar espaço da tela.

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import CadastrarCorretor from "@/components/manager-v10/CadastrarCorretor";
import { AlertTriangle, CheckCircle2, UserCheck, X } from "lucide-react";

type Nome = {
  nome_chave: string;
  exibicao: string;
  fontes: string;
  profile_auto: string | null;
  ultimo_dia: string | null;
  dias_60: number;
};

type Vinculo = {
  nome_chave: string;
  acao: "corretor" | "sem_login" | "nao_e_da_equipe";
  profile_id: string | null;
};

const SEM_LOGIN = "__sem_login", NAO = "__nao";

export default function VincularNomes({
  managerId,
  gerenteFixo,
}: {
  managerId: string | undefined;
  gerenteFixo?: { id: string; nome: string };
}) {
  const [modalAberto, setModalAberto] = useState(false);
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
        supabase
          .from("econ_nomes" as any)
          .select("nome_chave,exibicao,fontes,profile_auto,ultimo_dia,dias_60")
          .eq("gerente_id", managerId!)
          .order("exibicao"),
        supabase.from("econ_vinculos" as any).select("nome_chave,acao,profile_id").eq("gerente_id", managerId!),
        supabase
          .from("profiles")
          .select("id,first_name,last_name")
          .eq("manager_id", managerId!)
          .eq("is_active", true)
          .order("first_name"),
      ]);
      return {
        nomes: (nRes.data ?? []) as Nome[],
        vinculos: new Map(((vRes.data ?? []) as Vinculo[]).map((v) => [v.nome_chave, v])),
        time: ((tRes.data ?? []) as any[]).map((p) => ({
          id: p.id as string,
          nome: [p.first_name, p.last_name].filter(Boolean).join(" ") || "—",
        })),
      };
    },
  });

  if (!data || !data.nomes.length) return null;

  const nomeDe = (id: string | null) => data.time.find((t) => t.id === id)?.nome ?? null;
  const pendentes = data.nomes.filter((n) => !data.vinculos.has(n.nome_chave));
  const confirmados = data.nomes.filter((n) => data.vinculos.has(n.nome_chave));
  pendentes.sort((a, b) => Number(!!a.profile_auto) - Number(!!b.profile_auto) || b.dias_60 - a.dias_60);

  // Se tudo confirmado, não ocupa espaço nenhum
  if (pendentes.length === 0) return null;

  async function confirmar(n: Nome, valor: string) {
    const acao = valor === SEM_LOGIN ? "sem_login" : valor === NAO ? "nao_e_da_equipe" : "corretor";
    setSalvando(n.nome_chave);
    try {
      const { error } = await supabase.rpc("confirmar_vinculo" as any, {
        p_nome: n.nome_chave,
        p_acao: acao,
        p_profile: acao === "corretor" ? valor : null,
      });
      if (error) throw error;
      toast.success(
        acao === "corretor"
          ? `${n.exibicao} = ${nomeDe(valor)}`
          : `${n.exibicao}: ${acao === "sem_login" ? "sem login ainda" : "não conta"}`
      );
      qc.invalidateQueries({ queryKey: ["vincular-nomes", managerId] });
    } catch (e: any) {
      toast.error(e?.message ?? "Não consegui salvar o vínculo.");
    } finally {
      setSalvando(null);
    }
  }

  async function desfazer(n: Nome) {
    const { error } = await supabase.rpc("confirmar_vinculo" as any, {
      p_nome: n.nome_chave,
      p_acao: "desfazer",
      p_profile: null,
    });
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["vincular-nomes", managerId] });
  }

  const detalhe = (n: Nome) =>
    [
      n.fontes,
      n.dias_60 ? `${n.dias_60} dia${n.dias_60 > 1 ? "s" : ""} de plantão` : null,
      n.ultimo_dia ? `último ${n.ultimo_dia.slice(8, 10)}/${n.ultimo_dia.slice(5, 7)}` : null,
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <>
      {/* ── FAIXA DE ALERTA COMPACTA (OCUPA QUASE NADA DE ESPAÇO) ── */}
      <div className="alerta-vinculo-compacto">
        <div className="alerta-vinculo-texto">
          <div className="alerta-vinculo-badge">
            <AlertTriangle size={13} />
            <span>{pendentes.length} pendente{pendentes.length > 1 ? "s" : ""}</span>
          </div>
          <p style={{ margin: 0, fontSize: "13px", color: "var(--cv-text-main)" }}>
            <b>Vínculo C2S / Junix:</b> Há {pendentes.length} nome(s) fazendo check-in no plantão sem correspondência confirmada no Comandra.
          </p>
        </div>

        <button
          type="button"
          className="time-btn-action"
          style={{
            fontSize: "12.5px",
            padding: "6px 14px",
            borderColor: "var(--cv-amber-border)",
            background: "var(--cv-surface)",
            color: "var(--cv-amber)",
            fontWeight: 700,
          }}
          onClick={() => setModalAberto(true)}
        >
          <UserCheck size={14} />
          Confirmar Quem é Quem ({pendentes.length})
        </button>
      </div>

      {/* ── MODAL SOB DEMANDA ── */}
      {modalAberto && (
        <div className="modal-backdrop-v3" onClick={() => setModalAberto(false)}>
          <div className="modal-content-v3" style={{ maxWidth: "680px" }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-v3">
              <div>
                <h3 style={{ margin: 0, fontSize: "17px", fontWeight: "800", color: "var(--cv-text-main)" }}>
                  Confirme quem é quem (C2S / Junix)
                </h3>
                <p style={{ margin: "2px 0 0", fontSize: "12.5px", color: "var(--cv-text-muted)" }}>
                  Diga quem é cada corretor para os números de check-in e vendas baterem certo no painel.
                </p>
              </div>
              <button type="button" className="modal-close-btn-v3" onClick={() => setModalAberto(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body-v3">
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "380px", overflowY: "auto" }}>
                {pendentes.map((n) => {
                  const valor = escolha[n.nome_chave] ?? n.profile_auto ?? "";
                  return (
                    <div
                      key={n.nome_chave}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px 12px",
                        border: "1px solid var(--cv-border)",
                        borderRadius: "8px",
                        background: "var(--cv-surface)",
                        flexWrap: "wrap",
                        gap: "10px",
                      }}
                    >
                      <div>
                        <b style={{ fontSize: "13.5px", color: "var(--cv-text-main)" }}>{n.exibicao}</b>
                        <div style={{ fontSize: "11.5px", color: "var(--cv-text-muted)" }}>
                          {n.profile_auto ? (
                            <>parece ser <em>{nomeDe(n.profile_auto) ?? "de outra equipe"}</em> · </>
                          ) : (
                            <em>sem cadastro achado · </em>
                          )}
                          {detalhe(n)}
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                        <select
                          value={valor}
                          onChange={(e) => setEscolha((s) => ({ ...s, [n.nome_chave]: e.target.value }))}
                          style={{
                            border: "1px solid var(--cv-border)",
                            background: "var(--cv-surface)",
                            borderRadius: "6px",
                            padding: "6px 8px",
                            fontSize: "12.5px",
                            maxWidth: "180px",
                          }}
                        >
                          <option value="" disabled>Quem é?</option>
                          {data.time.map((t) => (
                            <option key={t.id} value={t.id}>{t.nome}</option>
                          ))}
                          <option value={SEM_LOGIN}>Ainda não tem login</option>
                          <option value={NAO}>Não contar (gerente / outra equipe)</option>
                        </select>

                        <button
                          type="button"
                          className="time-btn-primary"
                          style={{ padding: "6px 10px", fontSize: "12px" }}
                          disabled={!valor || salvando === n.nome_chave}
                          onClick={() => confirmar(n, valor)}
                        >
                          {salvando === n.nome_chave ? "…" : "Confirmar"}
                        </button>

                        {(!n.profile_auto || valor === SEM_LOGIN) && (
                          <button
                            type="button"
                            className="time-btn-action"
                            style={{ padding: "6px 10px", fontSize: "12px" }}
                            onClick={() => setCadastrando(n)}
                          >
                            Cadastrar
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {confirmados.length > 0 && (
                  <div
                    style={{
                      padding: "8px 12px",
                      background: "var(--cv-surface-subtle)",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontSize: "12.5px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                    onClick={() => setVerConfirmados((v) => !v)}
                  >
                    <span>
                      <b>{confirmados.length} já confirmado{confirmados.length > 1 ? "s" : ""}</b>
                    </span>
                    <span style={{ color: "var(--cv-text-muted)" }}>
                      {verConfirmados ? "esconder" : "ver ou corrigir"}
                    </span>
                  </div>
                )}

                {verConfirmados &&
                  confirmados.map((n) => {
                    const v = data.vinculos.get(n.nome_chave)!;
                    return (
                      <div
                        key={n.nome_chave}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "8px 12px",
                          fontSize: "12px",
                          borderBottom: "1px solid var(--cv-border-subtle)",
                        }}
                      >
                        <div>
                          <b>{n.exibicao}</b> ={" "}
                          <span>
                            {v.acao === "corretor"
                              ? nomeDe(v.profile_id) ?? "—"
                              : v.acao === "sem_login"
                              ? "ainda sem login"
                              : "não conta"}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="time-btn-action"
                          style={{ padding: "4px 8px", fontSize: "11px" }}
                          onClick={() => desfazer(n)}
                        >
                          Corrigir
                        </button>
                      </div>
                    );
                  })}
              </div>
            </div>

            <div className="modal-footer-v3">
              <button type="button" className="time-btn-action" onClick={() => setModalAberto(false)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {cadastrando && managerId && (
        <CadastrarCorretor
          managerId={managerId}
          nomeInicial={cadastrando.exibicao.replace(/\s+Bn$/i, "")}
          gerentes={gerenteFixo ? [gerenteFixo] : undefined}
          onFechar={() => setCadastrando(null)}
          onPronto={async (novoId) => {
            const n = cadastrando;
            setCadastrando(null);
            if (novoId) {
              await supabase.rpc("confirmar_vinculo" as any, {
                p_nome: n.nome_chave,
                p_acao: "corretor",
                p_profile: novoId,
              });
            }
            qc.invalidateQueries({ queryKey: ["vincular-nomes", managerId] });
          }}
        />
      )}
    </>
  );
}
