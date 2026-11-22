// Entry point: wires authentication → profile (username + character) → game.
import { S, resetState } from "./state.js";
import { applyStatic, toggleLang, t } from "./i18n.js";
import { $ } from "./utils.js";
import { watchAuth, logout } from "./systems/auth.js";
import { loadProfile, ensureSave } from "./systems/profile.js";
import { startSync, stopSync } from "./systems/sync.js";
import { startChatSync, stopChatSync } from "./systems/chat.js";
import { showScreen } from "./ui/screens.js";
import { initLogin } from "./ui/login.js";
import { startOnboarding } from "./ui/onboarding.js";
import { initHud } from "./ui/hud.js";
import { toast } from "./ui/toast.js";
import { startGame, stopGame } from "./game.js";

let hudReady = false;

applyStatic();
$("#langBtn").onclick = toggleLang;
$("#logoutBtn").onclick = async () => { teardown(); await logout(); };
initLogin();

function teardown() {
  stopGame();
  stopSync();
  stopChatSync();
  resetState();
}

async function enterGame() {
  const hasSave = await startSync(S.uid);
  if (!hasSave) await ensureSave(S.uid);
  startChatSync();
  showScreen("game");
  if (!hudReady) { initHud(); hudReady = true; }
  startGame();
}

watchAuth(async (user) => {
  if (!user) { teardown(); showScreen("login"); return; }

  S.uid = user.uid;
  S.user = user;
  showScreen("loading");
  try {
    const profile = await loadProfile(user.uid);
    if (!profile) { startOnboarding(user, enterGame); return; }
    S.profile = profile;
    await enterGame();
  } catch (e) {
    console.error(e);
    toast(t("msg.loadError", { msg: e.message || e }), "bad", 6000);
    showScreen("login");
  }
});
