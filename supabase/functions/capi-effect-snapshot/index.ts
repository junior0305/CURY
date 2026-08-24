import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const GRAPH = "https://graph.facebook.com/v21.0"

serve(async (req) => {
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')||'', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'')
    const body = await req.json().catch(()=>({}))
    const days = Number(body?.days) || 7
    const preset = days <= 7 ? 'last_7d' : (days <= 14 ? 'last_14d' : 'last_28d')
    const snapDate = new Date().toISOString().split('T')[0]

    const { data: toks } = await supabase.from('fb_bm_tokens').select('account_id, label, token').eq('is_active', true)
    const { data: teamMap } = await supabase.from('fb_team_map').select('account_id, name').eq('is_active', true)
    const acc2team: Record<string,string> = {}
    for (const t of (teamMap||[])) acc2team[String(t.account_id)] = t.name
    const { data: eff } = await supabase.rpc('capi_effect', { p_days: days })
    const effByTeam: Record<string,any> = {}
    for (const e of (eff||[])) effByTeam[e.equipe] = e

    const rows: any[] = []
    for (const t of (toks||[])) {
      let gasto = null, leads_fb = null, cpl = null
      try {
        const u = `${GRAPH}/act_${t.account_id}/insights?fields=spend,actions&date_preset=${preset}&level=account&access_token=${t.token}`
        const j = await (await fetch(u)).json()
        if (!j.error) {
          const r = (j.data && j.data[0]) || {}
          const acts = r.actions || []
          const la = acts.find((a:any)=>['lead','onsite_conversion.lead_grouped','leadgen_grouped'].includes(a.action_type))
          leads_fb = la ? Number(la.value) : 0
          gasto = Number(r.spend || 0)
          cpl = leads_fb ? Math.round(gasto/leads_fb*100)/100 : null
        }
      } catch (_) {}
      const equipe = acc2team[String(t.account_id)] || null
      const q = equipe ? effByTeam[equipe] : null
      rows.push({
        snapshot_date: snapDate, account_id: t.account_id, label: t.label, equipe,
        gasto, leads_fb, cpl,
        leads_crm: q?.leads ?? null, pct_resposta: q?.pct_resposta ?? null, qualificados: q?.qualificados ?? null,
        capi_qualified: q?.capi_qualified ?? null, capi_visita: q?.capi_visita ?? null,
        capi_purchase: q?.capi_purchase ?? null, capi_value: q?.capi_value ?? null,
      })
    }
    if (rows.length) await supabase.from('capi_effect_snapshots').insert(rows)
    return new Response(JSON.stringify({ ok:true, snapshot_date: snapDate, rows: rows.length }), { headers:{'Content-Type':'application/json'} })
  } catch (e:any) { return new Response(JSON.stringify({ error: e?.message }), { status:500 }) }
})
