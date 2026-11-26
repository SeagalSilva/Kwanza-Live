// Restaurante da Cidade:
// - Reposição do sistema: 10 pães por jogador para comprar e restaurar +25 de Energia.
// - Abastecimento por outros jogadores: jogadores vendem colheitas/alimentos que outros compram para +35 de Energia.
// - Requer validação do Captcha AdsLab para compras, trocas e transações.

import { S, energy, bal, inv } from "../../state.js";
import { t, fmtNum } from "../../i18n.js";
import { esc } from "../../utils.js";
import { toast } from "../toast.js";
import { openModal } from "../modal.js";
import { playEnterBuilding, playDungeonHeal } from "../../systems/audio.js";
import { requestCaptchaVerification } from "./captchaModal.js";
import { commit, savePath } from "../../systems/db.js";
import { CROPS, CROP_IDS } from "../../data/crops.js";
import { cropItemId, itemName, itemIcon } from "../../data/items.js";

export function openRestaurantModal() {
  playEnterBuilding();

  let activeTab = "eat"; // "eat" | "supply"
  let restaurantData = {
    systemBreadRemaining: 10,
    systemBreadCost: 15,
    systemBreadEnergy: 25,
    playerStock: {}
  };
  let loading = true;

  const fetchState = async (repaintFn) => {
    try {
      const uid = S.uid || "guest";
      const res = await fetch(`/api/restaurant/state/${encodeURIComponent(uid)}`);
      const data = await res.json();
      if (data && data.success) {
        restaurantData = data;
      }
    } catch (_) {}
    loading = false;
    if (repaintFn) repaintFn();
  };

  openModal({
    title: () => "🍳 " + (t("place.restaurant") || "Restaurante"),
    events: ["save", "lang"],
    render(body, api) {
      if (loading) {
        fetchState(() => api.repaint());
      }

      const en = energy();
      const bronzeBal = bal("bronze");
      const systemLeft = restaurantData.systemBreadRemaining ?? 10;
      const breadCost = restaurantData.systemBreadCost || 15;
      const breadEnergy = restaurantData.systemBreadEnergy || 25;
      const stock = restaurantData.playerStock || {};

      // Energy bar & balance header
      const energyPct = Math.min(100, Math.round((en.current / en.max) * 100));

      let contentHtml = `
        <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 12px;">
          <div style="background: var(--panel-2); border: 1px solid var(--line); border-radius: 12px; padding: 10px 14px; display: flex; justify-content: space-between; align-items: center;">
            <div style="font-size: 13px;">
              <span style="color: var(--mut);">Energia atual:</span>
              <strong style="color: var(--gold); margin-left: 4px;">⚡ ${en.current} / ${en.max}</strong>
            </div>
            <div style="font-size: 13px;">
              <span style="color: var(--mut);">Saldo:</span>
              <strong style="color: #f0b78a; margin-left: 4px;">🥉 ${fmtNum(bronzeBal)}</strong>
            </div>
          </div>

          <div style="height: 6px; background: rgba(255,255,255,0.08); border-radius: 99px; overflow: hidden;">
            <div style="width: ${energyPct}%; height: 100%; background: var(--ok); transition: width 0.3s;"></div>
          </div>

          <div class="tabs" style="margin: 4px 0 0;">
            <button class="${activeTab === "eat" ? "on" : ""}" id="tab-eat-btn" type="button">
              🍲 Comer & Recuperar Energia
            </button>
            <button class="${activeTab === "supply" ? "on" : ""}" id="tab-supply-btn" type="button">
              📦 Abastecer Restaurante
            </button>
          </div>
        </div>
      `;

      if (activeTab === "eat") {
        // 1. System Bread Quota Box
        contentHtml += `
          <div style="background: var(--panel-2); border: 1px solid var(--line); border-radius: 12px; padding: 12px; margin-bottom: 12px; display: flex; flex-direction: column; gap: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 24px;">🥖</span>
                <div>
                  <strong style="font-size: 14px; color: var(--gold);">Pão do Sistema (Apoio)</strong>
                  <div style="font-size: 11px; color: var(--mut);">Reposição automática do jogo (+${breadEnergy} ⚡ Energia)</div>
                </div>
              </div>
              <span style="font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 99px; background: ${systemLeft > 0 ? "rgba(89, 209, 122, 0.2)" : "rgba(255, 107, 107, 0.2)"}; color: ${systemLeft > 0 ? "var(--ok)" : "var(--bad)"};">
                ${systemLeft} / 10 disponíveis
              </span>
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
              <span style="font-size: 13px; font-weight: 700; color: #f0b78a;">Preço: ${breadCost} 🥉</span>
              <button id="buy-system-bread-btn" class="btn gold small" type="button" ${systemLeft <= 0 || bronzeBal < breadCost ? "disabled" : ""}>
                ${systemLeft <= 0 ? "Limite de 10 esgotado" : "🥖 Comprar & Comer (+25 ⚡)"}
              </button>
            </div>
          </div>
        `;

        // 2. Player-Supplied Food List
        contentHtml += `
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <h3 style="font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: var(--mut); margin: 4px 0 6px;">
              🍲 Alimentos Fornecidos por Outros Jogadores (+35 ⚡)
            </h3>
        `;

        const stockEntries = Object.entries(stock);
        let hasPlayerItems = false;

        for (const [foodId, listArr] of stockEntries) {
          if (!Array.isArray(listArr) || listArr.length === 0) continue;
          for (const item of listArr) {
            hasPlayerItems = true;
            const cInfo = CROPS[foodId];
            const icon = cInfo?.emoji || itemIcon(foodId) || "🍲";
            const name = cInfo?.namePt || itemName(foodId) || foodId;

            contentHtml += `
              <div class="row" style="background: var(--panel-2); border: 1px solid var(--line); border-radius: 10px; padding: 10px; margin-bottom: 6px;">
                <span class="ico-lg">${icon}</span>
                <div class="grow">
                  <strong style="font-size: 13px;">${esc(name)}</strong>
                  <small style="color: var(--mut);">Vendedor: <b>${esc(item.sellerName || "Fazendeiro")}</b> · Stock: <b>${item.qty}</b></small>
                </div>
                <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
                  <span style="font-size: 12px; font-weight: 700; color: #f0b78a;">${item.price} 🥉</span>
                  <button class="btn gold small" data-buy-listing="${item.id}" data-food="${foodId}" type="button" ${bronzeBal < item.price ? "disabled" : ""}>
                    Comer (+35 ⚡)
                  </button>
                </div>
              </div>
            `;
          }
        }

        if (!hasPlayerItems) {
          contentHtml += `
            <div style="background: rgba(255,255,255,0.03); border: 1px dashed var(--line); border-radius: 12px; padding: 24px 16px; text-align: center; color: var(--mut); font-size: 13px;">
              Nenhum jogador abasteceu o restaurante com refeições ainda.<br>
              <span style="color: var(--gold); font-size: 12px; margin-top: 4px; display: inline-block;">
                Abasteça o restaurante na aba acima para vender alimentos!
              </span>
            </div>
          `;
        }

        contentHtml += `</div>`;
      } else {
        // Tab: Supply Restaurant (Deposit food/crops)
        contentHtml += `
          <div style="background: var(--panel-2); border: 1px solid var(--line); border-radius: 12px; padding: 14px; display: flex; flex-direction: column; gap: 12px;">
            <p style="font-size: 12px; color: var(--mut); margin: 0; line-height: 1.4;">
              Deposite colheitas do seu inventário no restaurante para alimentar a comunidade e lucrar moedas de bronze a cada compra!
            </p>

            <div>
              <label style="font-size: 12px; margin: 0 0 4px; color: var(--mut);">Escolha a Colheita / Alimento do seu Inventário:</label>
              <select id="supply-crop-select" style="width: 100%; padding: 10px; border-radius: 8px; background: #0c1510; border: 1px solid var(--line); color: var(--txt); font-size: 14px;">
        `;

        let cropsFound = 0;
        for (const cropId of CROP_IDS) {
          const itemId = cropItemId(cropId);
          const count = inv(itemId);
          if (count > 0) {
            cropsFound++;
            const c = CROPS[cropId];
            contentHtml += `<option value="${cropId}">${c.emoji} ${c.namePt || cropId} (Tens: ${count})</option>`;
          }
        }

        if (cropsFound === 0) {
          contentHtml += `<option value="" disabled selected>Nenhuma colheita no inventário (colha na quinta pública)</option>`;
        }

        contentHtml += `
              </select>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
              <div>
                <label style="font-size: 12px; margin: 0 0 4px; color: var(--mut);">Quantidade a vender:</label>
                <input type="number" id="supply-qty-input" min="1" max="100" value="5" style="width: 100%; padding: 8px 10px; border-radius: 8px; background: #0c1510; border: 1px solid var(--line); color: var(--txt);" />
              </div>
              <div>
                <label style="font-size: 12px; margin: 0 0 4px; color: var(--mut);">Preço por unidade (🥉):</label>
                <input type="number" id="supply-price-input" min="1" max="1000" value="15" style="width: 100%; padding: 8px 10px; border-radius: 8px; background: #0c1510; border: 1px solid var(--line); color: var(--txt);" />
              </div>
            </div>

            <button id="submit-supply-btn" class="btn gold big" type="button" style="margin-top: 6px;" ${cropsFound === 0 ? "disabled" : ""}>
              📦 Depositar e Abastecer Restaurante
            </button>
          </div>
        `;
      }

      body.innerHTML = contentHtml;

      // Event Listeners
      const tabEatBtn = body.querySelector("#tab-eat-btn");
      if (tabEatBtn) {
        tabEatBtn.onclick = () => {
          activeTab = "eat";
          api.repaint();
        };
      }
      const tabSupplyBtn = body.querySelector("#tab-supply-btn");
      if (tabSupplyBtn) {
        tabSupplyBtn.onclick = () => {
          activeTab = "supply";
          api.repaint();
        };
      }

      // Buy System Bread
      const buyBreadBtn = body.querySelector("#buy-system-bread-btn");
      if (buyBreadBtn) {
        buyBreadBtn.onclick = async () => {
          if (!S.uid) {
            toast("Inicie sessão para comprar", "bad");
            return;
          }
          if (bal("bronze") < breadCost) {
            toast("Moedas de bronze insuficientes", "bad");
            return;
          }

          // AdsLab Captcha verification
          const captchaToken = await requestCaptchaVerification();
          if (!captchaToken) return;

          try {
            const res = await fetch("/api/restaurant/buy", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                uid: S.uid,
                name: S.profile?.username || "Jogador",
                type: "system_bread",
                captchaToken
              })
            });
            const data = await res.json();
            if (data && data.success) {
              playDungeonHeal();
              // Update balance and energy in state and Firebase
              const newBronze = Math.max(0, bal("bronze") - (data.cost || breadCost));
              const curEnergy = energy().current;
              const newEnergy = Math.min(energy().max, curEnergy + (data.energyGain || breadEnergy));
              S.save.wallet.bronze = newBronze;
              S.save.energy.current = newEnergy;
              await commit({
                [savePath(S.uid, "wallet/bronze")]: newBronze,
                [savePath(S.uid, "energy/current")]: newEnergy
              });
              toast(`Pão consumido! +${data.energyGain} Energia ⚡`, "good");
              fetchState(() => api.repaint());
            } else {
              toast(data.error || "Erro ao comprar pão", "bad");
            }
          } catch (_) {
            toast("Erro de conexão com o restaurante", "bad");
          }
        };
      }

      // Buy Player Food
      body.querySelectorAll("[data-buy-listing]").forEach((btn) => {
        btn.onclick = async () => {
          if (!S.uid) {
            toast("Inicie sessão para comprar", "bad");
            return;
          }
          const listingId = btn.getAttribute("data-buy-listing");
          const foodId = btn.getAttribute("data-food");

          // AdsLab Captcha verification
          const captchaToken = await requestCaptchaVerification();
          if (!captchaToken) return;

          try {
            const res = await fetch("/api/restaurant/buy", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                uid: S.uid,
                name: S.profile?.username || "Jogador",
                type: "player_food",
                listingId,
                foodId,
                captchaToken
              })
            });
            const data = await res.json();
            if (data && data.success) {
              playDungeonHeal();
              const cost = Number(data.cost) || 15;
              const newBronze = Math.max(0, bal("bronze") - cost);
              const curEnergy = energy().current;
              const newEnergy = Math.min(energy().max, curEnergy + (data.energyGain || 35));
              S.save.wallet.bronze = newBronze;
              S.save.energy.current = newEnergy;
              await commit({
                [savePath(S.uid, "wallet/bronze")]: newBronze,
                [savePath(S.uid, "energy/current")]: newEnergy
              });
              toast(`Alimento delicioso! +${data.energyGain || 35} Energia ⚡`, "good");
              fetchState(() => api.repaint());
            } else {
              toast(data.error || "Erro na compra", "bad");
            }
          } catch (_) {
            toast("Erro de conexão", "bad");
          }
        };
      });

      // Submit Supply (Deposit Food)
      const supplyBtn = body.querySelector("#submit-supply-btn");
      if (supplyBtn) {
        supplyBtn.onclick = async () => {
          if (!S.uid) {
            toast("Inicie sessão para abastecer", "bad");
            return;
          }
          const cropId = body.querySelector("#supply-crop-select")?.value;
          const qty = Math.floor(Number(body.querySelector("#supply-qty-input")?.value));
          const price = Math.floor(Number(body.querySelector("#supply-price-input")?.value));

          if (!cropId) {
            toast("Escolha uma colheita", "bad");
            return;
          }
          const itemId = cropItemId(cropId);
          const currentOwned = inv(itemId);
          if (isNaN(qty) || qty < 1 || currentOwned < qty) {
            toast("Quantidade inválida ou insuficiente no inventário", "bad");
            return;
          }
          if (isNaN(price) || price < 1) {
            toast("Preço inválido", "bad");
            return;
          }

          // AdsLab Captcha verification
          const captchaToken = await requestCaptchaVerification();
          if (!captchaToken) return;

          try {
            const res = await fetch("/api/restaurant/deposit", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                uid: S.uid,
                name: S.profile?.username || "Jogador",
                foodId: cropId,
                qty,
                price,
                captchaToken
              })
            });
            const data = await res.json();
            if (data && data.success) {
              // Deduct deposited crops from player's inventory
              const nextInv = Math.max(0, currentOwned - qty);
              S.save.inv[itemId] = nextInv;
              await commit({
                [savePath(S.uid, `inv/${itemId}`)]: nextInv
              });
              toast(`Restaurante abastecido com ${qty}x ${CROPS[cropId]?.namePt || cropId}!`, "good");
              activeTab = "eat";
              fetchState(() => api.repaint());
            } else {
              toast(data.error || "Erro ao abastecer restaurante", "bad");
            }
          } catch (_) {
            toast("Erro de conexão", "bad");
          }
        };
      }
    }
  });
}
