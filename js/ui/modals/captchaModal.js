// AdsLab Anti-Bot Captcha Modal & Verification flow
import { S } from "../../state.js";
import { toast } from "../toast.js";

export function requestCaptchaVerification() {
  return new Promise(async (resolve) => {
    const uid = S.uid || "guest";
    const subId = `user_${uid}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    let solveUrl = "";
    let captchaToken = subId;

    try {
      const res = await fetch("/api/captcha/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sub_id: subId,
          return_url: "https://kwanza-live.vercel.app/faucet"
        })
      });
      const data = await res.json();
      if (data.success && (data.solve_url || data.token)) {
        solveUrl = data.solve_url || `https://adslab.me/captcha?token=${data.token}`;
        captchaToken = data.token || subId;
      } else {
        toast("Erro ao iniciar Captcha AdsLab", "bad");
        resolve(null);
        return;
      }
    } catch (err) {
      toast("Falha na rede ao conectar com AdsLab", "bad");
      resolve(null);
      return;
    }

    // Modal overlay matching the game's modal system
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.style.zIndex = "100";

    backdrop.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" style="width: min(480px, 95vw); border-top-color: #f5c518;">
        <header>
          <h2>🛡️ AdsLab Captcha</h2>
          <button class="x" id="captcha-close-btn" type="button">✕</button>
        </header>
        <div class="modal-body" style="display: flex; flex-direction: column; gap: 14px;">
          <p style="font-size: 13px; color: var(--mut); line-height: 1.4;">
            Para validar transações, compras e trocas no jogo, complete a verificação anti-bot oficial do AdsLab.
          </p>

          <div style="background: var(--panel-2); border: 1px solid var(--line); border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 10px;">
            <div style="font-size: 12px; font-weight: 700; color: var(--gold); display: flex; align-items: center; justify-content: space-between;">
              <span>Passo 1: Resolver Desafio</span>
              <span id="captcha-status-badge" style="font-size: 11px; padding: 2px 6px; border-radius: 6px; background: rgba(245, 197, 24, 0.2); color: var(--gold);">Pendente</span>
            </div>
            <a href="${solveUrl}" target="_blank" id="captcha-solve-link" class="btn gold big" style="text-decoration: none; font-weight: 700; font-size: 14px; padding: 11px; border-radius: 10px; text-align: center;">
              🔗 Abrir Captcha no AdsLab
            </a>
          </div>

          <div style="background: var(--panel-2); border: 1px solid var(--line); border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 8px;">
            <label style="font-size: 12px; font-weight: 700; color: var(--txt); margin: 0;">
              Passo 2: Confirmar Token (?captcha_sub_id)
            </label>
            <input type="text" id="captcha-token-input" value="${captchaToken}" style="width: 100%; font-size: 12px; padding: 8px 10px; background: #0c1510; border: 1px solid var(--line); border-radius: 8px; color: var(--txt);" />
            <p style="font-size: 11px; color: var(--mut); margin: 0;">
              O sistema verifica a resolução do AdsLab automaticamente. Caso tenha resolvido na aba aberta, clique abaixo.
            </p>
          </div>

          <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 4px;">
            <button id="captcha-cancel-btn" class="btn alt" type="button" style="flex: 1; padding: 10px;">
              Cancelar
            </button>
            <button id="captcha-confirm-btn" class="btn gold" type="button" style="flex: 1; padding: 10px;">
              ✓ Verificar e Confirmar
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);

    let checkInterval = null;
    let closed = false;

    const cleanup = (result) => {
      if (closed) return;
      closed = true;
      if (checkInterval) {
        clearInterval(checkInterval);
        checkInterval = null;
      }
      if (backdrop.parentNode) {
        backdrop.parentNode.removeChild(backdrop);
      }
      resolve(result);
    };

    backdrop.querySelector("#captcha-close-btn").onclick = () => cleanup(null);
    backdrop.querySelector("#captcha-cancel-btn").onclick = () => cleanup(null);

    const checkVerification = async (silent = false) => {
      const token = backdrop.querySelector("#captcha-token-input")?.value?.trim() || captchaToken;
      if (!token) {
        if (!silent) toast("Insira o token do AdsLab", "bad");
        return false;
      }
      try {
        const res = await fetch("/api/captcha/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ captchaToken: token })
        });
        const data = await res.json();
        if (data.success) {
          const badge = backdrop.querySelector("#captcha-status-badge");
          if (badge) {
            badge.textContent = "Resolvido!";
            badge.style.background = "rgba(89, 209, 122, 0.2)";
            badge.style.color = "var(--ok)";
          }
          toast("Captcha verificado com sucesso!", "good");
          cleanup(token);
          return true;
        } else if (!silent) {
          toast(data.error || "Captcha ainda não resolvido no AdsLab.", "bad");
        }
      } catch (_) {
        if (!silent) toast("Erro de conexão com o AdsLab", "bad");
      }
      return false;
    };

    backdrop.querySelector("#captcha-confirm-btn").onclick = () => checkVerification(false);

    backdrop.querySelector("#captcha-solve-link").onclick = () => {
      toast("Resolva o captcha na nova aba. A verificação detectará automaticamente!", "good", 5000);
      if (!checkInterval) {
        checkInterval = setInterval(() => {
          checkVerification(true);
        }, 3000);
      }
    };
  });
}
