// Chat UI controller: wires message feed, input submit, and shortcuts.
import { S } from "../state.js";
import { on } from "../bus.js";
import { $ } from "../utils.js";
import { sendChat } from "../systems/chat.js";
import { colorFromString, esc } from "../utils.js";

let bound = false;

export function initChatUI() {
  const form = $("#chat-form");
  const input = $("#chat-input");
  const list = $("#chat-messages");
  const btnChat = $("#btn-chat");

  if (!form || !input || !list) return;
  if (!bound) {
    bound = true;

    form.onsubmit = async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      input.value = "";
      await sendChat(text);
      renderMessages();
      input.blur();
    };

    if (btnChat) {
      btnChat.onclick = () => {
        input.focus();
      };
    }

    // Enter to focus chat if not already typing
    window.addEventListener("keydown", (e) => {
      const activeTag = document.activeElement?.tagName || "";
      const isInput = activeTag === "INPUT" || activeTag === "TEXTAREA" || activeTag === "SELECT";
      const hasModal = !!document.querySelector(".modal-backdrop");

      if (e.key === "Enter" && !isInput && !hasModal) {
        e.preventDefault();
        input.focus();
      } else if (e.key === "Escape" && document.activeElement === input) {
        input.blur();
      }
    });

    on("chat", () => {
      renderMessages();
    });
  }

  function renderMessages() {
    const msgs = (S.chat?.messages || []).slice(-25);
    list.innerHTML = msgs
      .map((m) => {
        const col = m.uid === S.uid ? "var(--gold)" : colorFromString(m.uid);
        return `<div class="chat-line"><b style="color: ${col};">${esc(m.name)}:</b><span>${esc(m.text)}</span></div>`;
      })
      .join("");
    list.scrollTop = list.scrollHeight;
  }

  renderMessages();
}
