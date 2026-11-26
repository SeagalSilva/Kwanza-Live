import { Router } from "express";
import { dbState, saveDb } from "../db.js";

const router = Router();
const ADSLAB_API_KEY = "s0wA9HcJqHQwvoMq5Ho4kKTm8ll7ceJLEm7eEWgx";

export async function verifyAdsLabToken(subId) {
  if (!subId) return { valid: false, error: "Missing captcha token" };

  if (!dbState.usedCaptchaTokens) dbState.usedCaptchaTokens = {};
  if (dbState.usedCaptchaTokens[subId]) {
    return { valid: false, error: "Token already used" };
  }

  try {
    const response = await fetch(`https://adslab.me/api/v1/captcha/session-info?token=${encodeURIComponent(subId)}`, {
      headers: {
        "x-api-key": ADSLAB_API_KEY
      }
    });
    const data = await response.json();

    if (data.success && (data.status === "solved" || data.status === "completed" || data.status === "verified")) {
      dbState.usedCaptchaTokens[subId] = Date.now();
      saveDb();
      return { valid: true };
    } else {
      return { valid: false, error: data.error || "Captcha not solved" };
    }
  } catch (err) {
    console.error("[AdsLab] Verification error:", err.message);
    return { valid: false, error: "Captcha verification service unreachable" };
  }
}

router.post("/init", async (req, res) => {
  const { sub_id, return_url } = req.body || {};
  if (!sub_id) return res.status(400).json({ success: false, error: "sub_id required" });

  try {
    const response = await fetch("https://adslab.me/api/v1/captcha/init", {
      method: "POST",
      headers: {
        "x-api-key": ADSLAB_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        sub_id,
        return_url: return_url || "https://kwanza-live.vercel.app/faucet"
      })
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error("[AdsLab] Init error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/verify", async (req, res) => {
  const { captchaToken } = req.body || {};
  const result = await verifyAdsLabToken(captchaToken);
  if (result.valid) {
    res.json({ success: true });
  } else {
    res.status(403).json({ success: false, error: result.error });
  }
});

export default router;
