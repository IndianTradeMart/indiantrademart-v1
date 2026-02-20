import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.0.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Generate 6-digit OTP
function generateOtp(): string {
  let otp = ''
  for (let i = 0; i < 6; i++) {
    otp += Math.floor(Math.random() * 10)
  }
  return otp
}

// Send email via SMTP (using a simple approach with fetch to a mail service)
async function sendEmailViaSMTP(email: string, otp: string, fromEmail: string, fromName: string): Promise<boolean> {
  // Option 1: Using SendGrid API (simplest)
  const sendgridApiKey = Deno.env.get('SENDGRID_API_KEY')
  if (sendgridApiKey) {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sendgridApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [
          {
            to: [{ email }],
            subject: `Your OTP Code: ${otp}`,
          },
        ],
        from: {
          email: fromEmail,
          name: fromName,
        },
        content: [
          {
            type: 'text/html',
            value: `
              <html>
                <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <h2 style="color: #003D82;">Email Verification</h2>
                  <p>Your OTP verification code is:</p>
                  <h1 style="color: #003D82; letter-spacing: 10px; font-size: 32px;">${otp}</h1>
                  <p style="color: #666;">This code will expire in 2 minutes.</p>
                  <p style="color: #999; font-size: 12px;">If you didn't request this, please ignore this email.</p>
                </body>
              </html>
            `,
          },
        ],
      }),
    })
    
    return response.ok
  }

  throw new Error('Email service not configured')
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { email } = await req.json()

    if (!email) {
      return new Response(
        JSON.stringify({ error: 'Email is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: 'Invalid email format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Generate OTP
    const otp = generateOtp()
    const expiresAt = new Date(Date.now() + 2 * 60 * 1000) // 2 minutes from now

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase credentials not configured')
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Store OTP in database
    const { error: dbError } = await supabase
      .from('auth_otps')
      .insert({
        email,
        otp_code: otp,
        expires_at: expiresAt.toISOString(),
        used: false,
      })

    if (dbError) {
      throw new Error(`Failed to store OTP: ${dbError.message}`)
    }

    // Send email
    const fromEmail = Deno.env.get('SENDGRID_FROM_EMAIL') || 'noreply@indiantrademart.com'
    const fromName = Deno.env.get('SENDGRID_FROM_NAME') || 'IndianTradeMart'

    await sendEmailViaSMTP(email, otp, fromEmail, fromName)

    return new Response(
      JSON.stringify({
        success: true,
        message: 'OTP sent successfully',
        expiresIn: 120, // 2 minutes in seconds
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
