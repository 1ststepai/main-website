import {
  clearAdminCookie,
  createAdminCookie,
  createAdminSessionToken,
  isAdminAuthenticated,
  isAdminMfaRequired,
  isMobileAdminTotpLoginAllowed,
  isSameOriginRequest,
  verifyAdminPassword,
  verifyAdminTotp,
} from "../lib/admin/auth.js";
import { checkRateLimit, setRateLimitHeaders } from "../lib/http/rateLimit.js";
import { parseAdminJson, sendAdminJson } from "../lib/admin/adminRequest.js";

const MAX_BODY_BYTES = 2048;

export default async function handler(req, res) {
  if (req.method === "GET") {
    try {
      return sendAdminJson(res, 200, {
        ok: true,
        authenticated: isAdminAuthenticated(req),
        mfa_required: isAdminMfaRequired(),
        mobile_totp_login_allowed: isMobileAdminTotpLoginAllowed(req),
      });
    } catch (error) {
      return sendAdminJson(res, Number(error.statusCode) || 503, {
        ok: false,
        code: error.code || "admin_not_configured",
        message: "Admin access is not configured.",
      });
    }
  }

  if (!["POST", "DELETE"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST, DELETE");
    return sendAdminJson(res, 405, { ok: false, code: "method_not_allowed" });
  }
  if (!isSameOriginRequest(req)) {
    return sendAdminJson(res, 403, { ok: false, code: "origin_not_allowed" });
  }

  if (req.method === "DELETE") {
    res.setHeader("Set-Cookie", clearAdminCookie());
    return sendAdminJson(res, 200, { ok: true });
  }

  if (!String(req.headers["content-type"] || "").toLowerCase().includes("application/json")) {
    return sendAdminJson(res, 415, { ok: false, code: "json_required" });
  }
  const limit = checkRateLimit(req, "admin-login");
  setRateLimitHeaders(res, limit);
  if (!limit.allowed) return sendAdminJson(res, 429, { ok: false, code: "rate_limited" });

  try {
    const { password, otp, mobile_totp_login } = parseAdminJson(req, MAX_BODY_BYTES);
    const otpValid = verifyAdminTotp(String(otp || ""));
    const mobileTotpOnlyValid = mobile_totp_login === true
      && isMobileAdminTotpLoginAllowed(req)
      && otpValid;

    if (mobileTotpOnlyValid) {
      res.setHeader("Set-Cookie", createAdminCookie(createAdminSessionToken()));
      return sendAdminJson(res, 200, { ok: true, authenticated: true, auth_mode: "mobile_totp" });
    }

    const passwordValid = verifyAdminPassword(String(password || ""));
    if (!mobileTotpOnlyValid && (!passwordValid || !otpValid)) {
      return sendAdminJson(res, 401, { ok: false, code: "invalid_credentials" });
    }
    res.setHeader("Set-Cookie", createAdminCookie(createAdminSessionToken()));
    return sendAdminJson(res, 200, { ok: true, authenticated: true });
  } catch (error) {
    const statusCode = Number(error.statusCode) || 500;
    return sendAdminJson(res, statusCode, {
      ok: false,
      code: error.code || "internal_error",
      message: statusCode >= 500 ? "Admin access is not configured." : error.message,
    });
  }
}
