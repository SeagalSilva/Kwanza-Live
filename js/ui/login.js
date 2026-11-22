import { loginWithGoogle } from "../systems/auth.js";
import { t } from "../i18n.js";
import { $ } from "../utils.js";

export function initLogin() {
  const btn = $("#btn-google");
  const msg = $("#login-msg");
  btn.onclick = async () => {
    msg.textContent = "";
    btn.disabled = true;
    try {
      await loginWithGoogle();
    } catch (e) {
      const code = e.code || "";
      if (code === "auth/unauthorized-domain") msg.textContent = t("login.err.domain", { host: location.hostname });
      else if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") msg.textContent = "";
      else msg.textContent = t("login.err.generic", { msg: e.message || code });
    } finally {
      btn.disabled = false;
    }
  };
}
