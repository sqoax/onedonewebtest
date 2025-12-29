const Store = {
  keys: {
    picks: "picker_picks_v1",
    settings: "picker_settings_v1",
  },

  getSettings() {
    const fallback = { locked: false, revealed: false };
    try {
      return { ...fallback, ...(JSON.parse(localStorage.getItem(this.keys.settings)) || {}) };
    } catch {
      return fallback;
    }
  },

  setSettings(next) {
    localStorage.setItem(this.keys.settings, JSON.stringify(next));
  },

  getPicks() {
    try {
      return JSON.parse(localStorage.getItem(this.keys.picks)) || [];
    } catch {
      return [];
    }
  },

  setPicks(picks) {
    localStorage.setItem(this.keys.picks, JSON.stringify(picks));
  },

  addPick({ name, pick }) {
    const settings = this.getSettings();
    if (settings.locked) return { ok: false, message: "Picks are locked." };

    const now = new Date();
    const picksList = this.getPicks();

    const normalizedName = name.trim();
    const existingIndex = picksList.findIndex(p => p.name.toLowerCase() === normalizedName.toLowerCase());

    const entry = {
      name: normalizedName,
      pick: pick.trim(),
      ts: now.toISOString(),
    };

    if (existingIndex >= 0) {
      picksList[existingIndex] = entry;
    } else {
      picksList.push(entry);
    }

    this.setPicks(picksList);
    return { ok: true, message: existingIndex >= 0 ? "Updated your pick." : "Pick submitted." };
  },

  resetAll() {
    localStorage.removeItem(this.keys.picks);
  }
};

const PickerPage = {
  init() {
    const form = document.getElementById("pickForm");
    const status = document.getElementById("status");

    const settings = Store.getSettings();
    if (settings.locked) {
      status.textContent = "Picks are locked right now.";
      status.classList.add("warn");
    }

    form.addEventListener("submit", (e) => {
      e.preventDefault();

      const name = document.getElementById("name").value;
      const pick = document.getElementById("pick").value;

      const result = Store.addPick({ name, pick });

      status.textContent = result.message;
      status.classList.toggle("ok", result.ok);
      status.classList.toggle("warn", !result.ok);

      if (result.ok) form.reset();
    });
  }
};

const RevealPage = {
  init() {
    const state = document.getElementById("revealState");
    const lockedBox = document.getElementById("lockedBox");
    const tableWrap = document.getElementById("tableWrap");
    const rows = document.getElementById("rows");

    const settings = Store.getSettings();
    state.textContent = `Locked: ${settings.locked ? "Yes" : "No"}, Revealed: ${settings.revealed ? "Yes" : "No"}`;

    if (!settings.revealed) {
      lockedBox.hidden = false;
      tableWrap.hidden = true;
      return;
    }

    lockedBox.hidden = true;
    tableWrap.hidden = false;

    const picks = Store.getPicks()
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));

    rows.innerHTML = picks.map(p => {
      const d = new Date(p.ts);
      const t = isNaN(d.getTime()) ? "" : d.toLocaleString();
      return `<tr><td>${escapeHtml(p.name)}</td><td>${escapeHtml(p.pick)}</td><td>${escapeHtml(t)}</td></tr>`;
    }).join("");
  }
};

const AdminPage = {
  init() {
    const status = document.getElementById("status");
    const toggleLock = document.getElementById("toggleLock");
    const toggleReveal = document.getElementById("toggleReveal");
    const reset = document.getElementById("reset");

    const refreshButtons = () => {
      const s = Store.getSettings();
      toggleLock.textContent = s.locked ? "Unlock picks" : "Lock picks";
      toggleReveal.textContent = s.revealed ? "Hide reveal" : "Reveal picks";
      status.textContent = `Locked: ${s.locked ? "Yes" : "No"}, Revealed: ${s.revealed ? "Yes" : "No"}`;
      status.className = "status";
    };

    toggleLock.addEventListener("click", () => {
      const s = Store.getSettings();
      Store.setSettings({ ...s, locked: !s.locked });
      refreshButtons();
    });

    toggleReveal.addEventListener("click", () => {
      const s = Store.getSettings();
      Store.setSettings({ ...s, revealed: !s.revealed });
      refreshButtons();
    });

    reset.addEventListener("click", () => {
      Store.resetAll();
      status.textContent = "Reset complete, picks cleared on this device.";
      status.classList.add("warn");
    });

    refreshButtons();
  }
};

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
