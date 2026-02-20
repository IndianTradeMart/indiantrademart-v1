import express from 'express';
import nodemailer from 'nodemailer';
import { supabase } from '../lib/supabaseClient.js';

const router = express.Router();

// Generate 6-digit OTP
function generateOtp() {
  let otp = '';
  for (let i = 0; i < 6; i++) {
    otp += Math.floor(Math.random() * 10);
  }
  return otp;
}

// Setup Gmail SMTP
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_EMAIL,
    pass: process.env.GMAIL_APP_PASSWORD
  }
});

// Send OTP Email
async function sendOtpEmail(email, otp) {
  try {
    const mailOptions = {
      from: `${process.env.OTP_FROM_NAME} <${process.env.GMAIL_EMAIL}>`,
      to: email,
      subject: `Your OTP Code: ${otp}`,
      html: `
        <html>
          <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center;">
              <h2 style="color: #003D82;">Email Verification</h2>
              <p style="font-size: 16px; color: #333;">Your OTP verification code is:</p>
              <div style="background-color: #f0f0f0; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h1 style="color: #003D82; letter-spacing: 8px; font-size: 36px; margin: 0;">${otp}</h1>
              </div>
              <p style="color: #666; font-size: 14px;">This code will expire in 2 minutes.</p>
              <p style="color: #999; font-size: 12px; margin-top: 20px;">If you didn't request this code, please ignore this email.</p>
            </div>
            <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
            <p style="text-align: center; color: #999; font-size: 11px;">
              © 2025 IndianTradeMart. All rights reserved.
            </p>
          </body>
        </html>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('Email sending failed:', error);
    throw new Error('Failed to send OTP email');
  }
}

// POST /api/otp/request - Request OTP
router.post('/request', async (req, res) => {
  try {
    const { email } = req.body;

    // Validate email
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Generate OTP
    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + 2 * 60 * 1000); // 2 minutes

    // Delete old unused OTPs for this email
    await supabase
      .from('auth_otps')
      .delete()
      .eq('email', email)
      .eq('used', false);

    // Store OTP in database
    const { error: dbError } = await supabase
      .from('auth_otps')
      .insert({
        email,
        otp_code: otp,
        expires_at: expiresAt.toISOString(),
        used: false
      });

    if (dbError) {
      console.error('Database error:', dbError);
      return res.status(500).json({ error: 'Failed to generate OTP' });
    }

    // Send OTP email
    await sendOtpEmail(email, otp);

    res.json({
      success: true,
      message: 'OTP sent successfully to your email',
      expiresIn: 120 // 2 minutes in seconds
    });
  } catch (error) {
    console.error('OTP request error:', error);
    res.status(500).json({ error: error.message || 'Failed to send OTP' });
  }
});

// POST /api/otp/verify - Verify OTP
router.post('/verify', async (req, res) => {
  try {
    const { email, otp_code } = req.body;

    if (!email || !otp_code) {
      return res.status(400).json({ error: 'Email and OTP code are required' });
    }

    // Check if OTP exists, matches, and hasn't expired
    const { data, error } = await supabase
      .from('auth_otps')
      .select('*')
      .eq('email', email)
      .eq('otp_code', otp_code)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Database error:', error);
      return res.status(500).json({ error: 'Verification failed' });
    }

    if (!data) {
      return res.status(401).json({ error: 'Invalid or expired OTP code' });
    }

    // Mark OTP as used
    await supabase
      .from('auth_otps')
      .update({ used: true })
      .eq('id', data.id);

    res.json({
      success: true,
      message: 'OTP verified successfully',
      email: email
    });
  } catch (error) {
    console.error('OTP verification error:', error);
    res.status(500).json({ error: error.message || 'Verification failed' });
  }
});

// POST /api/otp/resend - Resend OTP
router.post('/resend', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Delete old unused OTPs
    await supabase
      .from('auth_otps')
      .delete()
      .eq('email', email)
      .eq('used', false);

    // Generate new OTP
    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + 2 * 60 * 1000);

    // Store new OTP
    const { error: dbError } = await supabase
      .from('auth_otps')
      .insert({
        email,
        otp_code: otp,
        expires_at: expiresAt.toISOString(),
        used: false
      });

    if (dbError) {
      return res.status(500).json({ error: 'Failed to resend OTP' });
    }

    // Send OTP email
    await sendOtpEmail(email, otp);

    res.json({
      success: true,
      message: 'New OTP sent to your email',
      expiresIn: 120
    });
  } catch (error) {
    console.error('Resend OTP error:', error);
    res.status(500).json({ error: error.message || 'Failed to resend OTP' });
  }
});

export default router;
