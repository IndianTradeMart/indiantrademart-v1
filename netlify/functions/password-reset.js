import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("[password-reset function] Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(
  SUPABASE_URL || "",
  SUPABASE_SERVICE_ROLE_KEY || ""
);

function isValidEmail(email) {
  return !!email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export const handler = async (event) => {
  try {
    // Only POST
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: "Method not allowed" })
      };
    }

    const body = JSON.parse(event.body || "{}");
    const { email, role, new_password } = body;

    // Validate email
    if (!email || !isValidEmail(email)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Valid email is required" })
      };
    }

    const emailLower = email.toLowerCase().trim();

    // ✅ CHECK EMAIL BY ROLE (BUYER / VENDOR)
    if (!new_password && role) {
      try {
        const normalizedRole = String(role).toUpperCase();

        if (normalizedRole !== "BUYER" && normalizedRole !== "VENDOR") {
          return {
            statusCode: 400,
            body: JSON.stringify({ error: "Invalid role" })
          };
        }

        const table = normalizedRole === "BUYER" ? "buyers" : "vendors";

        const { data, error } = await supabase
          .from(table)
          .select("id, email, user_id")
          .eq("email", emailLower)
          .maybeSingle();

        if (error && error.code !== "PGRST116") {
          console.error("[password-reset] Error checking", table, "for email", emailLower, error);
          return {
            statusCode: 500,
            body: JSON.stringify({ error: "Failed to verify email" })
          };
        }

        if (!data) {
          const notFoundMsg = normalizedRole === "BUYER"
            ? "This email is not registered as a buyer"
            : "This email is not registered as a vendor";

          return {
            statusCode: 404,
            body: JSON.stringify({ error: notFoundMsg })
          };
        }

        const successMsg = normalizedRole === "BUYER"
          ? "Buyer account found"
          : "Vendor account found";

        return {
          statusCode: 200,
          body: JSON.stringify({
            success: true,
            found: true,
            role: normalizedRole,
            email: emailLower,
            message: successMsg
          })
        };
      } catch (error) {
        console.error("[password-reset] Email verification error:", error);
        return {
          statusCode: 500,
          body: JSON.stringify({ error: error.message || "Check email failed" })
        };
      }
    }

    // ✅ RESET PASSWORD
    if (new_password) {
      if (new_password.length < 6) {
        return {
          statusCode: 400,
          body: JSON.stringify({
            error: "Password must be at least 6 characters long"
          })
        };
      }

      try {
        let userId = null;
        let userRole = null;

        // Step 1: Find user_id from buyers table
        const { data: buyer, error: buyerError } = await supabase
          .from("buyers")
          .select("user_id, email")
          .eq("email", emailLower)
          .maybeSingle();

        if (buyer && buyer.user_id) {
          userId = buyer.user_id;
          userRole = "BUYER";
        }

        // Step 2: If not found in buyers, check vendors table
        if (!userId) {
          const { data: vendor, error: vendorError } = await supabase
            .from("vendors")
            .select("user_id, email")
            .eq("email", emailLower)
            .maybeSingle();

          if (vendor && vendor.user_id) {
            userId = vendor.user_id;
            userRole = "VENDOR";
          }
        }

        if (!userId) {
          return {
            statusCode: 404,
            body: JSON.stringify({ error: "Email not found in our records" })
          };
        }

        // Step 3: Update password using Supabase Admin API
        const { data: updatedUser, error: updateError } = await supabase.auth.admin.updateUserById(
          userId,
          { password: new_password }
        );

        if (updateError) {
          console.error("[password-reset] Password update error:", updateError);
          return {
            statusCode: 500,
            body: JSON.stringify({
              error: "Failed to reset password: " + updateError.message
            })
          };
        }

        console.log(`[password-reset] Password reset successfully for ${userRole} user: ${emailLower}`);

        return {
          statusCode: 200,
          body: JSON.stringify({
            success: true,
            message: "Password has been reset successfully",
            email: emailLower,
            role: userRole
          })
        };
      } catch (error) {
        console.error("[password-reset] Password reset error:", error);
        return {
          statusCode: 500,
          body: JSON.stringify({
            error: error.message || "Password reset failed"
          })
        };
      }
    }

    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid request" })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || "Server error" })
    };
  }
};
