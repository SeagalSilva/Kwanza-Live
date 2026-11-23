// Chat UI controller: wires message feed, input submit, and shortcuts.
import { S } from "../state.js";
import { on } from "../bus.js";
import { $, colorFromString, esc } from "../utils.js";
import { sendChat } from "../systems/chat.js";

let bound = false;

function setChatOpen(open) {
  const widget = $("#chat-widget");
  const hud = $(".hud");
  if (widget) widget.classList.toggle("active", open);
  if (hud) hud.classList.toggle("chat-open", open);
}

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
      setChatOpen(false);
    };

    if (btnChat) {
      btnChat.onpointerdown = (e) => {
        // Prevent input blur from firing before click toggles chat cleanly
        e.preventDefault();
      };
      btnChat.onclick = () => {
        const widget = $("#chat-widget");
        const nextOpen = !(widget && widget.classList.contains("active"));
        setChatOpen(nextOpen);
        if (nextOpen) {
          input.focus();
          list.scrollTop = list.scrollHeight;
        } else {
          input.blur();
        }
      };
    }

    input.onfocus = () => {
      setChatOpen(true);
    };

    input.onblur = (e) => {
      if (e.relatedTarget && form.contains(e.relatedTarget)) return;
      setTimeout(() => {
        if (document.activeElement !== input && !form.contains(document.activeElement)) {
          setChatOpen(false);
        }
      }, 120);
    };

    // Enter to focus chat if not already typing
    window.addEventListener("keydown", (e) => {
      const activeTag = document.activeElement?.tagName || "";
      const isInput = activeTag === "INPUT" || activeTag === "TEXTAREA" || activeTag === "SELECT";
      const hasModal = !!document.querySelector(".modal-backdrop");

      if (e.key === "Enter" && !isInput && !hasModal) {
        e.preventDefault();
        setChatOpen(true);
        input.focus();
      } else if (e.key === "Escape" && document.activeElement === input) {
        input.blur();
        setChatOpen(false);
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
