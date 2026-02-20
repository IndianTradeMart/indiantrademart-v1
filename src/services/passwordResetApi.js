// ❌ Frontend me supabase use NAHI karna
// ✅ Sirf Netlify Functions call karni hai

// Helper to decide whether we're on localhost dev or Netlify
const isLocal = typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

const API_BASE = isLocal ? '/api' : '/.netlify/functions';

export const passwordResetApi = {
  // ===============================
  // STEP 1: Check email by role
  // ===============================
  checkEmailByRole: async (email, role) => {
    try {
      if (!email || !role) {
        throw new Error('Email and role are required');
      }

      // Local: Express route -> /api/password-reset/verify-email
      // Netlify: Function      -> /.netlify/functions/password-reset
      const url = isLocal
        ? `${API_BASE}/password-reset/verify-email`
        : `${API_BASE}/password-reset`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: email.toLowerCase().trim(),
          role
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Email not registered');
      }

      return data;
    } catch (error) {
      console.error('Error checking email by role:', error);
      throw error;
    }
  },

  // ===============================
  // STEP 2: Request OTP
  // ===============================
  requestOTP: async (email) => {
    try {
      if (!email) {
        throw new Error('Email is required');
      }

      const url = `${API_BASE}/otp/request`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: email.toLowerCase().trim()
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send OTP');
      }

      return data;
    } catch (error) {
      console.error('Error requesting OTP:', error);
      throw error;
    }
  },

  // ===============================
  // STEP 3: Verify OTP
  // ===============================
  verifyOTP: async (email, otpCode) => {
    try {
      if (!email || !otpCode) {
        throw new Error('Email and OTP are required');
      }

      const url = `${API_BASE}/otp/verify`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: email.toLowerCase().trim(),
          otp_code: otpCode
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Invalid or expired OTP');
      }

      return data;
    } catch (error) {
      console.error('Error verifying OTP:', error);
      throw error;
    }
  },

  // ===============================
  // STEP 4: RESET PASSWORD
  // ===============================
  resetPassword: async (email, newPassword) => {
    try {
      if (!email || !newPassword) {
        throw new Error('Email and new password are required');
      }

      if (newPassword.length < 6) {
        throw new Error('Password must be at least 6 characters long');
      }

      // Both local and Netlify use the same endpoint
      // Local: Express -> /api/password-reset
      // Netlify: Function -> /.netlify/functions/password-reset
      const url = `${API_BASE}/password-reset`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: email.toLowerCase().trim(),
          new_password: newPassword
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to reset password');
      }

      return data;
    } catch (error) {
      console.error('Error resetting password:', error);
      throw error;
    }
  }
};
