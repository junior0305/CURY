import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const WEBHOOK_URL = "https://auto.ape77.com.br/webhook/mensagens"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { phone, message } = await req.json()

    if (!phone || !message) {
      throw new Error('Phone and message are required')
    }

    // Clean phone number (keep only digits)
    const cleanPhone = phone.replace(/\D/g, '')

    // Prepare form data for application/x-www-form-urlencoded
    const formData = new URLSearchParams()
    formData.append('Contato', cleanPhone)
    formData.append('Mensagem', message)

    console.log(`[WhatsApp] Sending to ${cleanPhone}: ${message}`)

    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Webhook error: ${response.status} ${text}`)
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error('[WhatsApp] Error:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
