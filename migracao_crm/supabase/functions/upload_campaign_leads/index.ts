import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function parseCSV(text: string): string[][] {
  const lines = text.split('\n');
  return lines.map(line => {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if ((char === ',' || char === ';') && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    return values;
  }).filter(row => row.some(cell => cell));
}

serve(async (req) => {
  console.log('🚀 Upload iniciado');
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('📋 Lendo formData...');
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const campaignId = formData.get('campaignId') as string;
    const columnMapping = JSON.parse(formData.get('columnMapping') as string || '{}');

    console.log('📄 Arquivo:', file?.name);
    console.log('🎯 Campanha ID:', campaignId);

    if (!file || !campaignId) {
      console.error('❌ Falta arquivo ou campaignId');
      return new Response(
        JSON.stringify({ error: 'File and campaignId required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('📝 Lendo conteúdo do arquivo...');
    const text = await file.text();
    console.log('📊 Tamanho do texto:', text.length, 'caracteres');
    
    const rows = parseCSV(text);
    console.log('📈 Total de linhas:', rows.length);

    if (rows.length === 0) {
      console.error('❌ Arquivo vazio');
      return new Response(
        JSON.stringify({ error: 'Empty file' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const headers = rows[0];
    console.log('🏷️ Cabeçalhos:', headers);
    
    const dataRows = rows.slice(1);
    console.log('📉 Linhas de dados:', dataRows.length);

    const nameCol = columnMapping.name !== undefined ? columnMapping.name : headers.findIndex(h => /nome|name/i.test(h));
    const phoneCol = columnMapping.phone !== undefined ? columnMapping.phone : headers.findIndex(h => /telefone|phone|celular|whatsapp/i.test(h));
    const emailCol = columnMapping.email !== undefined ? columnMapping.email : headers.findIndex(h => /email|e-mail/i.test(h));

    console.log('📍 Mapeamento - Nome:', nameCol, 'Telefone:', phoneCol, 'Email:', emailCol);

    if (phoneCol === -1) {
      console.error('❌ Coluna de telefone não encontrada');
      return new Response(
        JSON.stringify({ 
          error: 'Phone column not found',
          headers: headers,
          suggestion: 'Certifique-se de ter uma coluna chamada "telefone" ou "phone"'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const leads = dataRows
      .filter(row => row[phoneCol])
      .map(row => {
        const customFields: any = {};
        headers.forEach((header, idx) => {
          if (idx !== nameCol && idx !== phoneCol && idx !== emailCol && row[idx]) {
            customFields[header] = row[idx];
          }
        });

        return {
          campaign_id: campaignId,
          name: nameCol !== -1 && row[nameCol] ? String(row[nameCol]).trim() : null,
          phone: String(row[phoneCol]).replace(/\D/g, ''),
          email: emailCol !== -1 && row[emailCol] ? String(row[emailCol]).trim() : null,
          custom_fields: customFields,
          status: 'pending',
        };
      })
      .filter(lead => lead.phone && lead.phone.length >= 10);

    console.log('✅ Leads válidos:', leads.length);

    if (leads.length === 0) {
      console.error('❌ Nenhum lead válido encontrado');
      return new Response(
        JSON.stringify({ error: 'No valid leads found in file' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('📤 Inserindo', leads.length, 'leads no banco...');
    const { data: inserted, error } = await supabaseClient
      .from('campaign_leads')
      .insert(leads)
      .select();

    if (error) {
      console.error('❌ Erro ao inserir:', error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ Inseridos:', inserted?.length || 0);

    await supabaseClient
      .from('ia_campaigns')
      .update({ leads_targeted: (inserted?.length || 0) })
      .eq('id', campaignId);

    console.log('🎉 Upload concluído com sucesso!');

    return new Response(
      JSON.stringify({
        success: true,
        imported: inserted?.length || 0,
        headers: headers,
        preview: inserted?.slice(0, 5),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('❌ Erro geral:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});