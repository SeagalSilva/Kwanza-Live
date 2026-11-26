import { t } from "../../../i18n.js";
import { esc } from "../../../utils.js";

export function formatMs(ms) {
  if (ms <= 0) return "00:00";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n) => (n < 10 ? "0" + n : String(n));
  return h > 0 ? `${h}h ${pad(m)}m ${pad(s)}s` : `${m}m ${pad(s)}s`;
}

export function rankBadge(rank) {
  if (rank === 1) return "🥇 #1";
  if (rank === 2) return "🥈 #2";
  if (rank === 3) return "🥉 #3";
  return `#${rank}`;
}

export function statusBadge(claimed, earned) {
  if (!earned || earned <= 0) return "";
  if (claimed) {
    return `<span class="ws-status-tag claimed">✅ ${esc(t("ws.statusClaimed"))}</span>`;
  }
  return `<span class="ws-status-tag ready">${esc(t("ws.statusReadyOnce"))}</span>`;
}
