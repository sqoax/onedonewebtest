const API_BASE = "https://twilight-tree-42ce.hiattgafnea0.workers.dev";

// 1) Put your season events here
// eventId is what gets stored in KV, keep it simple, no spaces
const EVENTS = [
  { id: "test-week", label: "Test Week" },
  { id: "week-01", label: "Week 1" },
  { id: "week-02", label: "Week 2" },
  { id: "week-03", label: "Week 3" },
  // keep adding…
];

function $(id) {
  return document.getElementById(id);
}

function showToast(message, type = "ok") {
  const toast = $("toast");
  if (!toast) return;

  toast.textContent = message;
  toast.hidden = false;

  toast.classList.remove("ok", "warn");
  toast.classList.add(type);

  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => {
    toast.hidden = true;
  }, 2500);
}

async function apiGetSettings(eventId) {
  const r = await fetch(`${API_BASE}/settings?eventId=${encodeURIComponent(eventId)}`);
  return await r.json();
}

async function apiSubmitPick({ eventId, name, pick }) {
  const r = await fetch(`${API_BASE}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventId, name, pick }),
  });

  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    return { ok: false, message: data?.message || `Error ${r.status}` };
  }
  return data;
}

const PickerPage = {
  async init() {
    const form = $("pickForm");
    const status = $("status"); // optional, if you have it
    const eventSelect = $("eventId"); // you will add this dropdown to HTML
    const submitBtn = $("submitBtn"); // give your button id="submitBtn"

    // Build dropdown options
    if (eventSelect) {
      eventSelect.innerHTML = EVENTS.map(e => `<option value="${e.id}">${e.label}</option>`).join("");
    }

    const setStatus = (msg, type = "warn") => {
      if (!status) return;
      status.textContent = msg;
      status.classList.remove("ok", "warn");
      status.classList.add(type);
    };

    const refreshLockState = async () => {
      const eventId = eventSelect ? eventSelect.value : EVENTS[0].id;
      const s = await apiGetSettings(eventId);

      // Your Worker reveals and locks at Wed 9 PM ET, until then revealed is false
      if (s.revealed) {
        setStatus("Picks have been revealed for this event.", "ok");
      } else {
        setStatus("Picks are locked until Wednesday at 9:00 PM ET.", "warn");
      }

      // If locked is true, prevent submitting
      const locked = !!s.locked;
      if (submitBtn) submitBtn.disabled = locked;
      if (locked) showToast("Picks are locked right now.", "warn");
    };

    if (eventSelect) {
      eventSelect.addEventListener("change", refreshLockState);
    }

    await refreshLockState();

    if (!form) return;

    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const eventId = eventSelect ? eventSelect.value : EVENTS[0].id;
      const name = $("name").value.trim();
      const pick = $("pick").value.trim();

      if (!name || !pick) {
        showToast("Enter your name and pick.", "warn");
        return;
      }

      if (submitBtn) submitBtn.disabled = true;

      const res = await apiSubmitPick({ eventId, name, pick });

      if (res.ok) {
        showToast(res.message || "Pick submitted.", "ok");
        // optional, clear only the pick field, keep name
        $("pick").value = "";
      } else {
        showToast(res.message || "Submit failed.", "warn");
      }

      // Re-check lock state after submit
      await refreshLockState();
      if (submitBtn) submitBtn.disabled = false;
    });
  }
};

// Auto-run
document.addEventListener("DOMContentLoaded", () => {
  PickerPage.init();
});
