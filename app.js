// 1) PUT YOUR WORKER URL HERE
const API_BASE = "https://twilight-tree-42ce.hiattgafnea0.workers.dev";

// 2) EVENT LIST, edit anytime
// id must be stable, it becomes eventId in your Worker storage
const EVENTS = [
  { id: "test-week", name: "Test Week" },

  // Add your real season events here
  // { id: "sentry", name: "The Sentry" },
  // { id: "sony-open", name: "Sony Open in Hawaii" },
  // { id: "farmers", name: "Farmers Insurance Open" },
  // ...
];

const el = (id) => document.getElementById(id);

const eventSelect = el("eventSelect");
const nameInput = el("nameInput");
const pickInput = el("pickInput");
const submitBtn = el("submitBtn");
const statusLine = el("statusLine");
const picksBlock = el("picksBlock");
const picksRows = el("picksRows");

function fmtET(iso) {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return "";
  }
}

function setStatus(html) {
  statusLine.innerHTML = html;
}

function getSelectedEventId() {
  return eventSelect.value || "";
}

async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`, { method: "GET" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);
  return data;
}

async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);
  return data;
}

async function refreshState() {
  const eventId = getSelectedEventId();
  if (!eventId) return;

  // Save choice locally
  localStorage.setItem("od_eventId", eventId);

  // Load settings
  let settings;
  try {
    settings = await apiGet(`/settings?eventId=${encodeURIComponent(eventId)}`);
  } catch (e) {
    setStatus(`<span class="warn">Could not load settings,</span> ${e.message}`);
    submitBtn.disabled = true;
    picksBlock.classList.add("hidden");
    return;
  }

  const locked = !!settings.locked;
  const revealed = !!settings.revealed;

  // Status line + form state
  if (locked && !revealed) {
    setStatus(`<span class="warn">Picks are locked right now.</span> Reveals Wednesday 9:00 PM ET.`);
    submitBtn.disabled = true;
  } else if (locked && revealed) {
    setStatus(`<span class="ok">Picks are revealed.</span> Submissions are closed for this event.`);
    submitBtn.disabled = true;
  } else {
    setStatus(`<span class="ok">Picks are open.</span> They lock and reveal Wednesday 9:00 PM ET.`);
    submitBtn.disabled = false;
  }

  // Picks table
  if (revealed) {
    try {
      const data = await apiGet(`/picks?eventId=${encodeURIComponent(eventId)}`);
      const picks = data.picks || [];
      picksRows.innerHTML = picks
        .map(
          (p) => `
          <tr>
            <td>${escapeHtml(p.name || "")}</td>
            <td>${escapeHtml(p.pick || "")}</td>
            <td>${escapeHtml(fmtET(p.ts || ""))}</td>
          </tr>
        `
        )
        .join("");
      picksBlock.classList.remove("hidden");
    } catch (e) {
      setStatus(`<span class="warn">Revealed, but could not load picks,</span> ${e.message}`);
      picksBlock.classList.add("hidden");
    }
  } else {
    picksBlock.classList.add("hidden");
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

async function submitPick() {
  const eventId = getSelectedEventId();
  const name = (nameInput.value || "").trim();
  const pick = (pickInput.value || "").trim();

  if (!eventId) return setStatus(`<span class="warn">Pick an event first.</span>`);
  if (!name || !pick) return setStatus(`<span class="warn">Name and pick are required.</span>`);

  // Save name locally for convenience
  localStorage.setItem("od_name", name);

  submitBtn.disabled = true;
  setStatus(`Submitting...`);

  try {
    await apiPost("/submit", { eventId, name, pick });
    setStatus(`<span class="ok">Pick submitted.</span>`);
  } catch (e) {
    setStatus(`<span class="warn">${escapeHtml(e.message)}</span>`);
  } finally {
    await refreshState();
  }
}

// Init
(function init() {
  // Fill dropdown
  eventSelect.innerHTML = EVENTS.map(
    (e) => `<option value="${e.id}">${e.name}</option>`
  ).join("");

  // Restore saved values
  const savedEventId = localStorage.getItem("od_eventId");
  const savedName = localStorage.getItem("od_name");
  if (savedName) nameInput.value = savedName;

  if (savedEventId && EVENTS.some((e) => e.id === savedEventId)) {
    eventSelect.value = savedEventId;
  } else {
    eventSelect.value = EVENTS[0]?.id || "";
  }

  // Listeners
  eventSelect.addEventListener("change", refreshState);
  submitBtn.addEventListener("click", submitPick);

  // First load
  refreshState();

  // Optional auto-refresh every 30s so it flips to revealed without a manual reload
  setInterval(refreshState, 30000);
})();
