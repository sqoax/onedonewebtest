// ====== CONFIG ======
const API_BASE = "https://twilight-tree-42ce.hiattgafnea0.workers.dev";

// ====== API STORE ======
const Store = {
  async getSettings() {
    try {
      const r = await fetch(`${API_BASE}/settings`, { method: "GET" });
      if (!r.ok) return { locked: false, revealed: false };
      return await r.json();
    } catch {
      return { locked: false, revealed: false };
    }
  },

  async addPick({ name, pick }) {
    try {
      const r = await fetch(`${API_BASE}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, pick }),
      });

      const data = await safeJson(r);
      if (!r.ok) return { ok: false, message: data?.message || "Submit failed." };
      return data;
    } catch {
      return { ok: false, message: "Network error submitting pick." };
    }
  },

  async getPicks() {
    try {
      const r = await fetch(`${API_BASE}/picks`, { method: "GET" });
      const data = await safeJson(r);
      if (!r.ok) return { ok: false, message: data?.message || "Not available." };
      return data; // { ok: true, picks: [...] }
    } catch {
      return { ok: false, message: "Network error loading picks." };
    }
  },

  async admin(action, adminKey) {
    try {
      const r = await fetch(`${API_BASE}/admin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Key": adminKey || "",
        },
        body: JSON.stringify({ action }),
      });

      const data = await safeJson(r);
      if (!r.ok) return { ok: false, message: data?.message || "Admin request failed." };
      return data; // { ok: true, settings: {...} }
    } catch {
      return { ok: false, message: "Network error calling admin." };
    }
  },
};

// ====== PAGES ======
const PickerPage = {
  init() {
    const form = document.getElementById("pickForm");
    const status = document.getElementById("status");

    const refreshLockNotice = async () => {
      const settings = await Store.getSettings();
      if (settings.locked) {
        status.textContent = "Picks are locked right now.";
        status.classList.add("warn");
        status.classList.remove("ok");
      } else {
        status.textContent = "";
        status.classList.remove("warn");
        status.classList.remove("ok");
      }
    };

    refreshLockNotice();

    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const name = document.getElementById("name").value;
      const pick = document.getElementById("pick").value;

      const result = await Store.addPick({ name, pick });

      status.textContent = result.message || (result.ok ? "Pick submitted." : "Something went wrong.");
      status.classList.toggle("ok", !!result.ok);
      status.classList.toggle("warn", !result.ok);

      if (result.ok) form.reset();

      await refreshLockNotice();
    });
  },
};

const RevealPage = {
  init() {
    const state = document.getElementById("revealState");
    const lockedBox = document.getElementById("lockedBox");
    const tableWrap = document.getElementById("tableWrap");
    const rows = document.getElementById("rows");

    const render = async () => {
      const settings = await Store.getSettings();
      state.textContent = `Locked: ${settings.locked ? "Yes" : "No"}, Revealed: ${settings.revealed ? "Yes" : "No"}`;

      if (!settings.revealed) {
        lockedBox.hidden = false;
        tableWrap.hidden = true;
        rows.innerHTML = "";
        return;
      }

      const res = await Store.getPicks();
      if (!res.ok) {
        lockedBox.hidden = false;
        tableWrap.hidden = true;
        rows.innerHTML = "";
        return;
      }

      lockedBox.hidden = true;
      tableWrap.hidden = false;

      const picks = (res.picks || [])
        .slice()
        .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

      rows.innerHTML = picks
        .map((p) => {
          const d = new Date(p.ts);
          const t = isNaN(d.getTime()) ? "" : d.toLocaleString();
          return `<tr><td>${escapeHtml(p.name)}</td><td>${escapeHtml(p.pick)}</td><td>${escapeHtml(t)}</td></tr>`;
        })
        .join("");
    };

    render();
  },
};

const AdminPage = {
  init() {
    const status = document.getElementById("status");
    const toggleLock = document.getElementById("toggleLock");
    const toggleReveal = document.getElementById("toggleReveal");
    const reset = document.getElementById("reset");

    const getAdminKey = () => {
      return sessionStorage.getItem("picker_admin_key") || "";
    };

    const ensureAdminKey = () => {
      let key = getAdminKey();
      if (key) return key;

      key = prompt("Enter admin key");
      if (!key) return "";
      sessionStorage.setItem("picker_admin_key", key);
      return key;
    };

    const refreshButtons = async () => {
      const s = await Store.getSettings();
      toggleLock.textContent = s.locked ? "Unlock picks" : "Lock picks";
      toggleReveal.textContent = s.revealed ? "Hide reveal" : "Reveal picks";
      status.textContent = `Locked: ${s.locked ? "Yes" : "No"}, Revealed: ${s.revealed ? "Yes" : "No"}`;
      status.className = "status";
    };

    toggleLock.addEventListener("click", async () => {
      const key = ensureAdminKey();
      if (!key) return;

      const s = await Store.getSettings();
      const action = s.locked ? "unlock" : "lock";
      const res = await Store.admin(action, key);

      if (!res.ok) {
        status.textContent = res.message || "Admin action failed.";
        status.className = "status warn";
        return;
      }

      await refreshButtons();
    });

    toggleReveal.addEventListener("click", async () => {
      const key = ensureAdminKey();
      if (!key) return;

      const s = await Store.getSettings();
      const action = s.revealed ? "hide" : "reveal";
      const res = await Store.admin(action, key);

      if (!res.ok) {
        status.textContent = res.message || "Admin action failed.";
        status.className = "status warn";
        return;
      }

      await refreshButtons();
    });

    reset.addEventListener("click", async () => {
      const key = ensureAdminKey();
      if (!key) return;

      const res = await Store.admin("reset", key);
      if (!res.ok) {
        status.textContent = res.message || "Reset failed.";
        status.className = "status warn";
        return;
      }

      status.textContent = "Reset complete, picks cleared for everyone.";
      status.className = "status warn";
      await refreshButtons();
    });

    refreshButtons();
  },
};

// ====== HELPERS ======
async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
