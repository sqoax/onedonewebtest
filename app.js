const CF_BASE = "https://golf-pickem-weekly.hiattgafnea0.workers.dev";
const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQs22oFFItCqxK4oSjw68DRmVXovuv6PgKm7koaGsjj1eLoDWPoYMGIRB7CdV7P3z6Na9Tdara8D-SD/pub?output=csv";
const GOLFERS_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vR6oHRo1CCY8mpPFEVnqI2YGnwOb65q7SqIC8iUi-tQ4FKhxVSuuSmCa91T-_NJOXDze0JOeoLyuG9f/pub?output=csv";
const OWGR_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTW8TIE2alSe2KXgwFhiD3QQhtsl_VjkYrDy_WCltTbjUeSIuXR7MnStelVv6LTnPn2-gWvqQ9kyIbM/pub?gid=699985235&single=true&output=csv";
const MEMBERS = ["Hiatt", "Caden", "Bennett", "Ryan", "William", "Ian", "Mason", "Tim", "Drew", "Ben"];

const state = {
  sheetData: { tournaments: [], standings: { totals: {}, avgs: {} }, winner: { name: "", by: "" } },
  cfStatus: {},
  cfWeeks: [],
  currentWeekData: null,
  currentViewWeek: null,
  historyView: "tournaments",
  lastFetchTime: null,
  adminKey: localStorage.getItem("golf_admin_key") || "",
  golfers: [],
  owgrRanks: {},
  tournamentPurses: []
};

const $ = (id) => document.getElementById(id);
const qs = (selector, root = document) => root.querySelector(selector);
const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[ch]));
}

function parseCSV(text) {
  const rows = [];
  let current = "";
  let inQuotes = false;
  let row = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === "\"" && text[i + 1] === "\"") {
        current += "\"";
        i++;
      } else if (ch === "\"") {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else if (ch === "\"") {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(current.trim());
      current = "";
    } else if (ch === "\n" || (ch === "\r" && text[i + 1] === "\n")) {
      row.push(current.trim());
      current = "";
      if (ch === "\r") i++;
      rows.push(row);
      row = [];
    } else {
      current += ch;
    }
  }

  if (current || row.length) {
    row.push(current.trim());
    rows.push(row);
  }
  return rows;
}

function parseDollar(value) {
  if (!value) return 0;
  return parseFloat(String(value).replace(/[$,]/g, "")) || 0;
}

function fmtDollar(value) {
  return "$" + Math.round(value || 0).toLocaleString("en-US");
}

function fmtCompactDollar(value) {
  const n = Math.round(value || 0);
  if (Math.abs(n) >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (Math.abs(n) >= 1000) return `$${Math.round(n / 1000)}K`;
  return fmtDollar(n);
}

function formatTime(iso) {
  if (!iso) return "Not submitted";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function weekStatusClass(data = {}) {
  if (data.revealed) return "revealed";
  if (data.locked) return "locked";
  return "open";
}

function weekStatusLabel(data = {}) {
  if (data.revealed) return "Revealed";
  if (data.locked) return "Locked";
  return "Open";
}

function showToast(message, type = "info") {
  const region = $("toastRegion");
  if (!region) return;
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  region.replaceChildren(toast);
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.remove(), 2800);
}

async function apiJSON(path, options = {}) {
  const response = await fetch(CF_BASE + path, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || data.message || "Request failed");
  }
  return data;
}

async function fetchSheetData() {
  const response = await fetch(SHEET_URL);
  const text = await response.text();
  const rows = parseCSV(text);
  if (rows.length < 2) return;

  const tournaments = [];
  const meta = { winner: "", by: "", totals: {}, avgs: {} };
  let section = null;

  rows.slice(1).forEach((row) => {
    const colA = (row[0] || "").trim();
    const colX = (row[23] || "").trim();
    const colY = (row[24] || "").trim();

    if (colX.startsWith("Winning")) {
      meta.winner = colY;
      section = null;
    } else if (colX.startsWith("By")) {
      meta.by = colY;
      section = null;
    } else if (colX.startsWith("Total")) {
      section = "totals";
    } else if (colX.startsWith("AVG Week")) {
      section = "avgs";
    } else if (section === "totals" && colX) {
      meta.totals[colX.replace(":", "").trim()] = parseDollar(colY);
    } else if (section === "avgs" && colX) {
      meta.avgs[colX.replace(":", "").trim()] = parseDollar(colY);
    }

    if (!colA) return;
    const skipLabels = ["winning:", "by:", "total:", "avg week $", "avg week"];
    if (skipLabels.some((label) => colA.toLowerCase().startsWith(label))) return;

    const picks = [];
    let hasPicks = false;
    for (let i = 0; i < 10; i++) {
      const pick = (row[2 + i] || "").trim();
      const earnings = parseDollar(row[12 + i]);
      if (pick) hasPicks = true;
      picks.push({ member: MEMBERS[i], pick, earnings });
    }

    if (hasPicks) {
      tournaments.push({
        name: colA,
        date: (row[1] || "").trim(),
        picks
      });
    }
  });

  state.sheetData = {
    tournaments,
    winner: { name: meta.winner, by: meta.by },
    standings: { totals: meta.totals, avgs: meta.avgs }
  };
  state.lastFetchTime = Date.now();
}

async function fetchGolfers() {
  try {
    const response = await fetch(GOLFERS_URL);
    const text = await response.text();
    const rows = parseCSV(text);
    state.golfers = rows
      .map((row) => (row[0] || "").trim())
      .filter((name) => name.length > 0);
  } catch (error) {
    state.golfers = [];
  }
}

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchOWGR() {
  try {
    const response = await fetch(OWGR_URL);
    const text = await response.text();
    const rows = parseCSV(text);
    const ranks = {};
    const purses = [];
    rows.forEach((row) => {
      const name = (row[0] || "").trim();
      const rank = parseInt((row[1] || "").trim(), 10);
      if (name && Number.isFinite(rank)) {
        ranks[normalizeName(name)] = rank;
      }
      const tournament = (row[3] || "").trim();
      const purse = parseDollar(row[4]);
      if (tournament && purse > 0) {
        purses.push({ tournament, purse });
      }
    });
    state.owgrRanks = ranks;
    state.tournamentPurses = purses;
  } catch (error) {
    state.owgrRanks = {};
    state.tournamentPurses = [];
  }
}

async function fetchCFStatus() {
  state.cfStatus = await apiJSON("/status");
}

async function fetchCFWeeks() {
  const data = await apiJSON("/weeks");
  state.cfWeeks = data.weeks || [];
}

async function fetchWeekPicks(week = state.cfStatus.currentWeek) {
  const data = await apiJSON(`/picks?week=${encodeURIComponent(week)}`);
  state.currentWeekData = data;
  state.currentViewWeek = data.week;
  return data;
}

async function loadLeagueData(options = {}) {
  await Promise.all([fetchSheetData(), fetchCFStatus(), fetchCFWeeks(), fetchGolfers(), fetchOWGR()]);
  await fetchWeekPicks(options.week || state.cfStatus.currentWeek);
}

function getRankings() {
  const totals = state.sheetData.standings.totals || {};
  const avgs = state.sheetData.standings.avgs || {};
  return MEMBERS.map((name) => ({
    name,
    total: totals[name] || 0,
    avg: avgs[name] || 0
  })).sort((a, b) => b.total - a.total);
}

function submittedNames(data = state.currentWeekData) {
  if (!data) return [];
  if (Array.isArray(data.submitted)) return data.submitted;
  if (data.picks && typeof data.picks === "object") return Object.keys(data.picks);
  return [];
}

function setTopContext() {
  const context = $("topContext");
  if (!context) return;
  const week = state.cfStatus.currentWeek || state.currentWeekData?.week || "-";
  const tournament = state.cfStatus.tournament || state.currentWeekData?.tournament || "Current week";
  context.textContent = `Week ${week} · ${tournament}`;
}

function renderMain() {
  $("loadingState")?.classList.add("hidden");
  setTopContext();
  renderWeekSelector();
  renderHome();
  renderPick();
  renderBoard();
  renderHistory();
  renderStats();
}

function renderHome() {
  const container = $("homeContent");
  if (!container) return;
  const week = state.currentWeekData || {};
  const rankings = getRankings();
  const leader = rankings[0];
  const submitted = submittedNames(week);
  const statusClass = weekStatusClass(week);
  const progress = Math.round((submitted.length / MEMBERS.length) * 100);
  const lastUpdated = state.lastFetchTime ? "Updated just now" : "Waiting for data";

  container.innerHTML = `
    <div class="hero-card card">
      <div class="status-row">
        <span class="status-pill ${statusClass}">${weekStatusLabel(week)}</span>
        <span class="help-text">Week ${escapeHTML(week.week || state.cfStatus.currentWeek || "-")}</span>
      </div>
      <h2>${escapeHTML(week.tournament || state.cfStatus.tournament || "Tournament TBD")}</h2>
      <p class="subline">${submitted.length} of ${MEMBERS.length} members submitted · ${lastUpdated}</p>
      <div class="metric-grid">
        <div class="metric-tile">
          <span class="metric-label">Submitted</span>
          <strong>${submitted.length}/${MEMBERS.length}</strong>
        </div>
        <div class="metric-tile">
          <span class="metric-label">Leader</span>
          <strong>${escapeHTML(leader?.name || "-")}</strong>
        </div>
        <div class="metric-tile">
          <span class="metric-label">Total</span>
          <strong>${fmtCompactDollar(leader?.total || 0)}</strong>
        </div>
      </div>
      <div class="progress-track" aria-label="Submission progress">
        <span class="progress-fill" style="width:${progress}%"></span>
      </div>
      <div class="btn-row">
        <button class="btn btn-primary" type="button" data-go-screen="pick">Make Pick</button>
        <button class="btn btn-secondary" type="button" id="homeRefreshBtn">Refresh</button>
      </div>
    </div>

    <div class="card leaderboard-preview">
      <div class="card-header">
        <div>
          <p class="eyebrow">Leaderboard</p>
          <h2>Top 3</h2>
        </div>
        <button class="status-pill neutral" type="button" data-go-screen="board">View Board</button>
      </div>
      <div class="mini-list">
        ${rankings.slice(0, 3).map((person, index) => rankRow(person, index, rankings[0]?.total || 1)).join("")}
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <div>
          <p class="eyebrow">Current Entries</p>
          <h2>Submitted Members</h2>
        </div>
        <span class="status-pill neutral">${submitted.length}/${MEMBERS.length}</span>
      </div>
      <div class="pills" style="margin-top:14px;">
        ${MEMBERS.map((member) => `<span class="pill ${submitted.includes(member) ? "submitted" : ""}">${escapeHTML(member)}</span>`).join("")}
      </div>
    </div>
  `;

  $("homeRefreshBtn")?.addEventListener("click", refreshData);
  qsa("[data-go-screen]", container).forEach((button) => {
    button.addEventListener("click", () => switchScreen(button.dataset.goScreen));
  });
}

function renderWeekSelector() {
  const block = $("weekSelectorBlock");
  const selector = $("weekSelector");
  if (!block || !selector) return;
  if (state.cfWeeks.length <= 1) {
    block.classList.add("hidden");
    return;
  }
  block.classList.remove("hidden");
  selector.innerHTML = [...state.cfWeeks].reverse().map((week) => `
    <option value="${week.week}" ${week.week === state.currentViewWeek ? "selected" : ""}>
      Week ${week.week} · ${escapeHTML(week.tournament || "TBD")} · ${escapeHTML(week.status || "")}
    </option>
  `).join("");
}

function renderPick() {
  const container = $("pickContent");
  if (!container) return;
  const data = state.currentWeekData || {};
  const submitted = submittedNames(data);
  const statusClass = weekStatusClass(data);
  const isCurrentWeek = data.week === state.cfStatus.currentWeek;

  let body = `
    <div class="card">
      <div class="card-header">
        <div>
          <p class="eyebrow">Week ${escapeHTML(data.week || "-")}</p>
          <h2>${escapeHTML(data.tournament || "Tournament TBD")}</h2>
        </div>
        <span class="status-pill ${statusClass}">${weekStatusLabel(data)}</span>
      </div>
      <p class="help-text" style="margin-top:12px;">${pickStateMessage(data, isCurrentWeek)}</p>
    </div>
  `;

  if (isCurrentWeek && !data.locked && !data.revealed) {
    body += `
      <form class="card stack-lg" id="pickForm">
        <div class="field-block">
          <label for="pickName">Your name</label>
          <select id="pickName" required>
            <option value="">Select member</option>
            ${MEMBERS.map((member) => `<option value="${escapeHTML(member)}">${escapeHTML(member)}</option>`).join("")}
          </select>
        </div>
        <div class="field-block">
          <label for="pickGolfer">Golfer pick</label>
          <div class="golfer-search">
            <input id="pickGolfer" type="text" autocomplete="off" autocapitalize="words" placeholder="Search golfer name" aria-controls="pickGolferDropdown" aria-expanded="false" required>
            <div class="golfer-dropdown hidden" id="pickGolferDropdown" role="listbox"></div>
          </div>
          <button class="text-action hidden" type="button" id="pickAnotherGolferBtn">Pick another golfer</button>
        </div>
        <div class="review-card hidden" id="pickReview">
          <h3>Review pick</h3>
          <p id="pickReviewText"></p>
        </div>
        <button class="btn btn-primary" type="submit" id="submitPickBtn">Submit Pick</button>
      </form>
    `;
  }

  if (data.revealed) {
    body += `
      <div class="card stack-lg">
        <div class="card-header">
          <div>
            <p class="eyebrow">Revealed</p>
            <h2>This Week's Picks</h2>
          </div>
        </div>
        <div class="mini-list">
          ${revealedPickRows(data)}
        </div>
      </div>
    `;
  } else {
    body += `
      <div class="card stack-lg">
        <div class="card-header">
          <div>
            <p class="eyebrow">Entries</p>
            <h2>Submitted Members</h2>
          </div>
          <span class="status-pill neutral">${submitted.length}/${MEMBERS.length}</span>
        </div>
        <div class="pills" style="margin-top:14px;">
          ${MEMBERS.map((member) => `<span class="pill ${submitted.includes(member) ? "submitted" : ""}">${escapeHTML(member)}</span>`).join("")}
        </div>
      </div>
    `;
  }

  container.innerHTML = body;
  bindPickForm();
}

function pickStateMessage(data, isCurrentWeek) {
  if (!isCurrentWeek) return "You are viewing a previous week. Picks can only be submitted for the active week.";
  if (data.revealed) return "Picks have been revealed for this week.";
  if (data.locked) return "This week is locked. No more picks can be submitted.";
  return "Picks are open. Choose your name, review your golfer, then lock it in.";
}

function bindPickForm() {
  const form = $("pickForm");
  if (!form) return;
  const nameInput = $("pickName");
  const golferInput = $("pickGolfer");
  const dropdown = $("pickGolferDropdown");
  const resetButton = $("pickAnotherGolferBtn");
  const review = $("pickReview");
  const reviewText = $("pickReviewText");
  const submitButton = $("submitPickBtn");

  form.dataset.selectedGolfer = "";
  submitButton.disabled = true;

  const hideDropdown = () => {
    dropdown.classList.add("hidden");
    dropdown.innerHTML = "";
    golferInput.setAttribute("aria-expanded", "false");
  };

  const updateReview = () => {
    const name = nameInput.value;
    const golfer = form.dataset.selectedGolfer || "";
    submitButton.disabled = !(name && golfer);
    if (!golfer) {
      review.classList.add("hidden");
      return;
    }
    review.classList.remove("hidden");
    reviewText.textContent = name && golfer
      ? `${name} is submitting ${golfer}.`
      : "Choose your name before submitting.";
  };

  const renderDropdown = (matches) => {
    const query = golferInput.value.trim();
    if (!query) {
      hideDropdown();
      return;
    }
    if (!matches.length) {
      dropdown.innerHTML = `
        <button type="button" class="golfer-option golfer-option-muted" role="option" data-custom-golfer="${escapeHTML(query)}">
          <span>Pick another golfer</span>
          <strong>${escapeHTML(query)}</strong>
        </button>
      `;
      dropdown.classList.remove("hidden");
      golferInput.setAttribute("aria-expanded", "true");
      return;
    }
    dropdown.innerHTML = matches.map((name) => `
      <button type="button" class="golfer-option" role="option" data-golfer="${escapeHTML(name)}">${escapeHTML(name)}</button>
    `).join("");
    dropdown.classList.remove("hidden");
    golferInput.setAttribute("aria-expanded", "true");
  };

  const filterGolfers = (query) => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const list = state.golfers || [];
    const starts = [];
    const contains = [];
    for (const name of list) {
      const lower = name.toLowerCase();
      if (lower.startsWith(q)) starts.push(name);
      else if (lower.includes(q)) contains.push(name);
      if (starts.length + contains.length >= 50) break;
    }
    return [...starts, ...contains].slice(0, 8);
  };

  const clearSelectedGolfer = () => {
    form.dataset.selectedGolfer = "";
    form.dataset.customGolfer = "";
    golferInput.readOnly = false;
    golferInput.value = "";
    resetButton.classList.add("hidden");
    hideDropdown();
    updateReview();
    golferInput.focus();
  };

  const selectGolfer = (golfer, isCustom = false) => {
    form.dataset.selectedGolfer = golfer;
    form.dataset.customGolfer = isCustom ? "true" : "";
    golferInput.value = golfer;
    golferInput.readOnly = true;
    resetButton.classList.remove("hidden");
    hideDropdown();
    updateReview();
  };

  golferInput.addEventListener("input", () => {
    form.dataset.selectedGolfer = "";
    form.dataset.customGolfer = "";
    resetButton.classList.add("hidden");
    renderDropdown(filterGolfers(golferInput.value));
    updateReview();
  });

  golferInput.addEventListener("focus", () => {
    if (!golferInput.readOnly && golferInput.value.trim()) {
      renderDropdown(filterGolfers(golferInput.value));
    }
  });

  dropdown.addEventListener("mousedown", (event) => {
    const button = event.target.closest(".golfer-option");
    if (!button) return;
    event.preventDefault();
    if (button.dataset.customGolfer) {
      selectGolfer(button.dataset.customGolfer, true);
      return;
    }
    selectGolfer(button.dataset.golfer);
  });

  resetButton.addEventListener("click", clearSelectedGolfer);

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".golfer-search")) {
      hideDropdown();
    }
  });

  nameInput.addEventListener("change", updateReview);
  form.addEventListener("submit", submitPick);
}

async function submitPick(event) {
  event.preventDefault();
  const form = $("pickForm");
  const name = $("pickName").value;
  const golferPick = form?.dataset.selectedGolfer || "";
  const isCustomGolfer = form?.dataset.customGolfer === "true";

  if (!name) return showToast("Select your name.", "error");
  if (!golferPick) return showToast("Choose a golfer from the list.", "error");

  if (isCustomGolfer) showCustomGolferConfirm(name, golferPick);
  else showPickConfirm(name, golferPick);
}

function closePickConfirm() {
  $("pickConfirmModal")?.remove();
  $("customGolferConfirmModal")?.remove();
}

function showCustomGolferConfirm(name, golferPick) {
  closePickConfirm();
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.id = "customGolferConfirmModal";
  modal.innerHTML = `
    <div class="card pick-confirm-card" role="dialog" aria-modal="true" aria-labelledby="customGolferConfirmTitle">
      <div>
        <p class="eyebrow">Custom Golfer</p>
        <h2 id="customGolferConfirmTitle">This golfer is not in the saved list.</h2>
      </div>
      <div class="warning-box">
        <p>Only continue if the spelling below is exactly how you want the pick submitted.</p>
        <strong>${escapeHTML(golferPick)}</strong>
      </div>
      <div class="btn-row">
        <button class="btn btn-secondary" type="button" id="editCustomGolferBtn">Edit</button>
        <button class="btn btn-primary" type="button" id="continueCustomGolferBtn">Continue</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  $("editCustomGolferBtn")?.addEventListener("click", closePickConfirm);
  $("continueCustomGolferBtn")?.addEventListener("click", () => showPickConfirm(name, golferPick, true));
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closePickConfirm();
  });
  $("continueCustomGolferBtn")?.focus();
}

function showPickConfirm(name, golferPick, isCustomGolfer = false) {
  closePickConfirm();
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.id = "pickConfirmModal";
  modal.innerHTML = `
    <div class="card pick-confirm-card" role="dialog" aria-modal="true" aria-labelledby="pickConfirmTitle">
      <div>
        <p class="eyebrow">Confirm Pick</p>
        <h2 id="pickConfirmTitle">Submit this pick?</h2>
      </div>
      ${isCustomGolfer ? `
        <div class="warning-box compact">
          <p>This golfer is not in the saved list.</p>
        </div>
      ` : ""}
      <div class="confirm-summary">
        <div>
          <span class="metric-label">Name</span>
          <strong>${escapeHTML(name)}</strong>
        </div>
        <div>
          <span class="metric-label">Golfer</span>
          <strong>${escapeHTML(golferPick)}</strong>
        </div>
      </div>
      <div class="btn-row">
        <button class="btn btn-secondary" type="button" id="cancelPickConfirmBtn">Edit</button>
        <button class="btn btn-primary" type="button" id="confirmPickSubmitBtn">Confirm</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  $("cancelPickConfirmBtn")?.addEventListener("click", closePickConfirm);
  $("confirmPickSubmitBtn")?.addEventListener("click", () => performPickSubmission(name, golferPick));
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closePickConfirm();
  });
  $("confirmPickSubmitBtn")?.focus();
}

function closeSubmissionReceipt() {
  $("submissionReceiptModal")?.remove();
}

function showSubmissionReceipt(name, golferPick, submittedAt = new Date()) {
  closeSubmissionReceipt();
  const time = submittedAt.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit"
  });
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.id = "submissionReceiptModal";
  modal.innerHTML = `
    <div class="card pick-confirm-card receipt-card" role="dialog" aria-modal="true" aria-labelledby="submissionReceiptTitle">
      <div>
        <p class="eyebrow">Submitted</p>
        <h2 id="submissionReceiptTitle">Pick submitted successfully.</h2>
      </div>
      <p class="receipt-line">${escapeHTML(name)} submitted ${escapeHTML(golferPick)} at ${escapeHTML(time)}.</p>
      <button class="btn btn-primary" type="button" id="closeSubmissionReceiptBtn">Done</button>
    </div>
  `;
  document.body.appendChild(modal);

  $("closeSubmissionReceiptBtn")?.addEventListener("click", closeSubmissionReceipt);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeSubmissionReceipt();
  });
  $("closeSubmissionReceiptBtn")?.focus();
}

async function performPickSubmission(name, golferPick) {
  const button = $("confirmPickSubmitBtn");
  const cancelButton = $("cancelPickConfirmBtn");
  button.disabled = true;
  if (cancelButton) cancelButton.disabled = true;
  button.textContent = "Submitting...";
  try {
    await apiJSON("/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, golferPick })
    });
    const submittedAt = new Date();
    showToast("Pick submitted.", "success");
    if (typeof confetti === "function") {
      confetti({ particleCount: 70, spread: 58, origin: { y: 0.78 }, colors: ["#168A4A", "#B68A2C", "#FFFFFF"] });
    }
    await fetchWeekPicks(state.cfStatus.currentWeek);
    closePickConfirm();
    renderMain();
    switchScreen("pick");
    showSubmissionReceipt(name, golferPick, submittedAt);
  } catch (error) {
    showToast(error.message || "Submission failed.", "error");
  } finally {
    if (document.body.contains(button)) {
      button.disabled = false;
      if (cancelButton) cancelButton.disabled = false;
      button.textContent = "Confirm";
    }
  }
}

function revealedPickRows(data) {
  const picks = data.picks || {};
  const rows = MEMBERS.map((member) => {
    const pick = picks[member];
    if (!pick) return "";
    return `
      <div class="pick-row">
        <div class="row-main">
          <span class="row-title">${escapeHTML(member)}</span>
          <span class="row-subtitle">${escapeHTML(pick.pick || "-")}</span>
        </div>
        <span class="row-subtitle">${escapeHTML(formatTime(pick.ts))}</span>
      </div>
    `;
  }).join("");
  return rows || `<div class="empty-state">No picks available yet.</div>`;
}

function renderBoard() {
  const container = $("boardContent");
  if (!container) return;
  const rankings = getRankings();
  const maxTotal = rankings[0]?.total || 1;
  container.innerHTML = `
    <div class="top-three">
      ${rankings.slice(0, 3).map((person, index) => leaderCard(person, index)).join("")}
    </div>
    <div class="card">
      <div class="card-header">
        <div>
          <p class="eyebrow">Full Ranking</p>
          <h2>Season Board</h2>
        </div>
      </div>
      <div class="mini-list">
        ${rankings.map((person, index) => rankRow(person, index, maxTotal)).join("")}
      </div>
    </div>
  `;
}

function leaderCard(person, index) {
  const label = ["Leader", "Second", "Third"][index] || `#${index + 1}`;
  return `
    <div class="leader-card ${index === 0 ? "primary" : ""}">
      <span class="place">${label}</span>
      <h3>${escapeHTML(person.name)}</h3>
      <div class="status-row">
        <span class="money ${index === 0 ? "gold" : ""}">${fmtDollar(person.total)}</span>
        <span class="row-subtitle">Avg ${fmtDollar(person.avg)}</span>
      </div>
    </div>
  `;
}

function rankRow(person, index, maxTotal) {
  const width = maxTotal > 0 ? Math.round((person.total / maxTotal) * 100) : 0;
  return `
    <div class="rank-row">
      <span class="rank-num ${index === 0 ? "gold" : ""}">${index + 1}</span>
      <div class="row-main">
        <span class="row-title">${escapeHTML(person.name)}</span>
        <span class="row-subtitle">Avg ${fmtDollar(person.avg)} / wk</span>
        <span class="progress-track"><span class="progress-fill ${index === 0 ? "gold" : ""}" style="width:${width}%"></span></span>
      </div>
      <span class="money">${fmtDollar(person.total)}</span>
    </div>
  `;
}

function renderHistory() {
  const container = $("historyContent");
  if (!container) return;
  container.innerHTML = state.historyView === "players" ? renderPlayersHTML() : renderTournamentHistoryHTML();
  bindAccordions(container);
}

function renderTournamentHistoryHTML() {
  const tournaments = [...state.sheetData.tournaments].reverse();
  if (!tournaments.length) return `<div class="empty-state">No tournament history loaded yet.</div>`;

  return tournaments.map((tournament, index) => {
    const sorted = [...tournament.picks].sort((a, b) => b.earnings - a.earnings);
    const top = sorted[0] || {};
    return `
      <article class="accordion-card ${index === 0 ? "open" : ""}">
        <button class="accordion-trigger" type="button" aria-expanded="${index === 0 ? "true" : "false"}">
          <span class="row-main">
            <strong>${escapeHTML(tournament.name)}</strong>
            <span>${escapeHTML(tournament.date || "Date TBD")} · Top: ${escapeHTML(top.member || "-")} ${fmtDollar(top.earnings || 0)}</span>
          </span>
          <span class="chevron">⌄</span>
        </button>
        <div class="accordion-body">
          ${sorted.map((pick, pickIndex) => historyPickRow(pick, pickIndex)).join("")}
        </div>
      </article>
    `;
  }).join("");
}

function historyPickRow(pick, index) {
  const noPick = !pick.pick || pick.pick.toUpperCase() === "NO PICK";
  return `
    <div class="history-row">
      <span class="rank-num ${index === 0 && pick.earnings > 0 ? "gold" : ""}">${index + 1}</span>
      <div class="row-main">
        <span class="row-title">${escapeHTML(pick.member)}</span>
        <span class="row-subtitle">${noPick ? "No pick" : escapeHTML(pick.pick)}</span>
      </div>
      <span class="money ${pick.earnings > 0 ? "positive" : ""}">${fmtDollar(pick.earnings)}</span>
    </div>
  `;
}

function renderPlayersHTML() {
  const golferMap = {};
  state.sheetData.tournaments.forEach((tournament) => {
    tournament.picks.forEach((pick) => {
      if (!pick.pick || pick.pick.toUpperCase() === "NO PICK") return;
      const name = pick.pick.trim();
      if (!golferMap[name]) golferMap[name] = { count: 0, earnings: 0 };
      golferMap[name].count++;
      golferMap[name].earnings += pick.earnings;
    });
  });

  const golferList = Object.entries(golferMap)
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.count - a.count || b.earnings - a.earnings)
    .slice(0, 15);

  return `
    <div class="card">
      <div class="card-header">
        <div>
          <p class="eyebrow">Most Picked</p>
          <h2>Golfers</h2>
        </div>
      </div>
      <div class="mini-list">
        ${golferList.map((golfer, index) => `
          <div class="player-row">
            <span class="rank-num">${index + 1}</span>
            <div class="row-main">
              <span class="row-title">${escapeHTML(golfer.name)}</span>
              <span class="row-subtitle">${golfer.count} pick${golfer.count === 1 ? "" : "s"}</span>
            </div>
            <span class="money">${fmtDollar(golfer.earnings)}</span>
          </div>
        `).join("") || `<div class="empty-state">No used players loaded yet.</div>`}
      </div>
    </div>
    <div style="height:12px"></div>
    ${MEMBERS.map((member, index) => memberAccordion(member, index)).join("")}
  `;
}

function memberAccordion(member, index) {
  const used = [];
  state.sheetData.tournaments.forEach((tournament) => {
    const pick = tournament.picks.find((item) => item.member === member);
    if (pick && pick.pick && pick.pick.toUpperCase() !== "NO PICK") {
      used.push({ tournament: tournament.date || tournament.name, golfer: pick.pick, earnings: pick.earnings });
    }
  });

  return `
    <article class="accordion-card ${index === 0 ? "open" : ""}">
      <button class="accordion-trigger" type="button" aria-expanded="${index === 0 ? "true" : "false"}">
        <span class="row-main">
          <strong>${escapeHTML(member)}</strong>
          <span>${new Set(used.map((item) => item.golfer)).size} players used</span>
        </span>
        <span class="chevron">⌄</span>
      </button>
      <div class="accordion-body">
        ${used.map((item) => `
          <div class="player-row">
            <div class="row-main">
              <span class="row-title">${escapeHTML(item.golfer)}</span>
              <span class="row-subtitle">${escapeHTML(item.tournament)}</span>
            </div>
            <span class="money ${item.earnings > 0 ? "positive" : ""}">${fmtDollar(item.earnings)}</span>
          </div>
        `).join("") || `<div class="empty-state">No players used yet.</div>`}
      </div>
    </article>
  `;
}

function bindAccordions(root = document) {
  qsa(".accordion-trigger", root).forEach((button) => {
    button.addEventListener("click", () => {
      const card = button.closest(".accordion-card");
      const willOpen = !card.classList.contains("open");
      card.classList.toggle("open", willOpen);
      button.setAttribute("aria-expanded", String(willOpen));
    });
  });
}

function buildMemberStats() {
  const tournaments = state.sheetData.tournaments || [];
  const purses = state.tournamentPurses || [];
  const ranks = state.owgrRanks || {};

  const stats = {};
  MEMBERS.forEach((member) => {
    stats[member] = {
      ranksOfPicks: [],
      deepestCash: null,
      captureRates: [],
      bestCapture: null,
      pickOfWeekCount: 0,
      moneyLeftOnTable: 0,
      usedGolfers: new Set()
    };
  });

  tournaments.forEach((tournament, idx) => {
    const purse = purses[idx]?.purse || 0;
    let topEarnings = 0;
    tournament.picks.forEach((pick) => {
      if (pick.earnings > topEarnings) topEarnings = pick.earnings;
    });

    tournament.picks.forEach((pick) => {
      const member = pick.member;
      const bucket = stats[member];
      const golferName = (pick.pick || "").trim();
      const isPick = golferName && golferName.toUpperCase() !== "NO PICK";

      if (isPick) {
        bucket.usedGolfers.add(normalizeName(golferName));
        const rank = ranks[normalizeName(golferName)];
        if (Number.isFinite(rank)) {
          bucket.ranksOfPicks.push(rank);
          if (pick.earnings > 0 && (!bucket.deepestCash || rank > bucket.deepestCash.rank)) {
            bucket.deepestCash = { rank, name: golferName, earnings: pick.earnings, tournament: tournament.name };
          }
        }
      }

      if (purse > 0 && isPick) {
        const capturePct = (pick.earnings / purse) * 100;
        bucket.captureRates.push(capturePct);
        if (!bucket.bestCapture || capturePct > bucket.bestCapture.pct) {
          bucket.bestCapture = { pct: capturePct, tournament: tournament.name, golfer: golferName, earnings: pick.earnings };
        }
      }

      if (topEarnings > 0) {
        if (pick.earnings === topEarnings) bucket.pickOfWeekCount++;
        bucket.moneyLeftOnTable += (topEarnings - pick.earnings);
      }
    });
  });

  MEMBERS.forEach((member) => {
    const bucket = stats[member];
    bucket.avgRank = bucket.ranksOfPicks.length
      ? bucket.ranksOfPicks.reduce((sum, value) => sum + value, 0) / bucket.ranksOfPicks.length
      : null;
    bucket.avgCapture = bucket.captureRates.length
      ? bucket.captureRates.reduce((sum, value) => sum + value, 0) / bucket.captureRates.length
      : 0;
    bucket.totalEarnings = state.sheetData.standings.totals?.[member] || 0;
    bucket.valueRating = bucket.avgRank ? bucket.totalEarnings / bucket.avgRank : 0;
  });

  return stats;
}

function renderStats() {
  const container = $("statsContent");
  if (!container) return;

  const tournaments = state.sheetData.tournaments || [];
  if (!tournaments.length || !Object.keys(state.owgrRanks || {}).length) {
    container.innerHTML = `<div class="empty-state">Loading stats data...</div>`;
    return;
  }

  const stats = buildMemberStats();
  const ranks = state.owgrRanks || {};

  const pickQuality = MEMBERS
    .map((m) => ({ name: m, ...stats[m] }))
    .filter((m) => m.avgRank !== null)
    .sort((a, b) => a.avgRank - b.avgRank);

  const valueRating = MEMBERS
    .map((m) => ({ name: m, ...stats[m] }))
    .filter((m) => m.valueRating > 0)
    .sort((a, b) => b.valueRating - a.valueRating);

  const purseCapture = MEMBERS
    .map((m) => ({ name: m, ...stats[m] }))
    .filter((m) => m.captureRates.length)
    .sort((a, b) => b.avgCapture - a.avgCapture);
  const bestCaptureOverall = MEMBERS
    .map((m) => ({ name: m, ...stats[m].bestCapture, member: m }))
    .filter((entry) => entry.pct)
    .sort((a, b) => b.pct - a.pct)[0];

  const pickOfWeek = MEMBERS
    .map((m) => ({ name: m, ...stats[m] }))
    .sort((a, b) => b.pickOfWeekCount - a.pickOfWeekCount || a.moneyLeftOnTable - b.moneyLeftOnTable);

  const top50 = Object.entries(ranks)
    .filter(([, rank]) => rank <= 50)
    .map(([key]) => key);
  const remainingPool = MEMBERS.map((m) => {
    const used = stats[m].usedGolfers;
    const remainingTop50 = top50.filter((key) => !used.has(key));
    const allRemaining = Object.entries(ranks)
      .filter(([key, rank]) => !used.has(key) && rank <= 200)
      .sort((a, b) => a[1] - b[1])
      .slice(0, 10);
    const avgTop10 = allRemaining.length
      ? allRemaining.reduce((sum, [, rank]) => sum + rank, 0) / allRemaining.length
      : 0;
    return { name: m, top50Left: remainingTop50.length, avgTop10 };
  }).sort((a, b) => b.top50Left - a.top50Left || a.avgTop10 - b.avgTop10);

  container.innerHTML = `
    <div class="card stat-card">
      <div class="card-header">
        <div>
          <p class="eyebrow">Pick Quality</p>
          <h2>Avg OWGR of Picks</h2>
        </div>
        <span class="status-pill neutral">Lower = stars</span>
      </div>
      <p class="help-text" style="margin-top:6px;">Average world ranking of every golfer each member has picked.</p>
      <div class="mini-list" style="margin-top:14px;">
        ${pickQuality.map((m, i) => `
          <div class="stat-row">
            <span class="rank-num ${i === 0 ? "gold" : ""}">${i + 1}</span>
            <div class="row-main">
              <span class="row-title">${escapeHTML(m.name)}</span>
              <span class="row-subtitle">${m.deepestCash ? `Deepest cash: #${m.deepestCash.rank} ${escapeHTML(m.deepestCash.name)} · ${fmtDollar(m.deepestCash.earnings)}` : "No cashed picks yet"}</span>
            </div>
            <span class="stat-value">#${m.avgRank.toFixed(1)}</span>
          </div>
        `).join("")}
      </div>
    </div>

    <div class="card stat-card">
      <div class="card-header">
        <div>
          <p class="eyebrow">Value Rating</p>
          <h2>Earnings per OWGR Slot</h2>
        </div>
        <span class="status-pill neutral">Higher = savvy</span>
      </div>
      <p class="help-text" style="margin-top:6px;">Total earnings divided by avg pick rank. Rewards squeezing dollars out of lower-ranked golfers.</p>
      <div class="mini-list" style="margin-top:14px;">
        ${valueRating.map((m, i) => `
          <div class="stat-row">
            <span class="rank-num ${i === 0 ? "gold" : ""}">${i + 1}</span>
            <div class="row-main">
              <span class="row-title">${escapeHTML(m.name)}</span>
              <span class="row-subtitle">${fmtCompactDollar(m.totalEarnings)} total · avg pick #${m.avgRank.toFixed(1)}</span>
            </div>
            <span class="stat-value">${fmtCompactDollar(m.valueRating)}</span>
          </div>
        `).join("")}
      </div>
    </div>

    <div class="card stat-card">
      <div class="card-header">
        <div>
          <p class="eyebrow">Purse Capture</p>
          <h2>Avg % of Purse</h2>
        </div>
        <span class="status-pill neutral">Field-leveled</span>
      </div>
      <p class="help-text" style="margin-top:6px;">What share of each tournament's purse the member captured, averaged across the season.</p>
      ${bestCaptureOverall ? `
        <div class="callout-tile" style="margin-top:12px;">
          <span class="metric-label">Performance of the season</span>
          <strong>${escapeHTML(bestCaptureOverall.member)} · ${bestCaptureOverall.pct.toFixed(2)}%</strong>
          <span class="row-subtitle">${escapeHTML(bestCaptureOverall.golfer || "")} at ${escapeHTML(bestCaptureOverall.tournament || "")} · ${fmtDollar(bestCaptureOverall.earnings || 0)}</span>
        </div>` : ""}
      <div class="mini-list" style="margin-top:14px;">
        ${purseCapture.map((m, i) => `
          <div class="stat-row">
            <span class="rank-num ${i === 0 ? "gold" : ""}">${i + 1}</span>
            <div class="row-main">
              <span class="row-title">${escapeHTML(m.name)}</span>
              <span class="row-subtitle">${m.captureRates.length} weeks tracked</span>
            </div>
            <span class="stat-value">${m.avgCapture.toFixed(2)}%</span>
          </div>
        `).join("")}
      </div>
    </div>

    <div class="card stat-card">
      <div class="card-header">
        <div>
          <p class="eyebrow">Pick of the Week</p>
          <h2>Top Pick Among Members</h2>
        </div>
        <span class="status-pill neutral">Wins · gap</span>
      </div>
      <p class="help-text" style="margin-top:6px;">Weeks where the member had the highest-earning pick of the league. Gap = total dollars behind the weekly top pick.</p>
      <div class="mini-list" style="margin-top:14px;">
        ${pickOfWeek.map((m, i) => `
          <div class="stat-row">
            <span class="rank-num ${i === 0 ? "gold" : ""}">${i + 1}</span>
            <div class="row-main">
              <span class="row-title">${escapeHTML(m.name)}</span>
              <span class="row-subtitle">Gap behind top picks: ${fmtCompactDollar(m.moneyLeftOnTable)}</span>
            </div>
            <span class="stat-value">${m.pickOfWeekCount}</span>
          </div>
        `).join("")}
      </div>
    </div>

    <div class="card stat-card">
      <div class="card-header">
        <div>
          <p class="eyebrow">Remaining Pool Power</p>
          <h2>Stars Left in the Tank</h2>
        </div>
        <span class="status-pill neutral">Top 50</span>
      </div>
      <p class="help-text" style="margin-top:6px;">OWGR top-50 golfers each member can still pick (one-and-done removes used picks). Avg rank of their 10 best remaining options shown alongside.</p>
      <div class="mini-list" style="margin-top:14px;">
        ${remainingPool.map((m, i) => `
          <div class="stat-row">
            <span class="rank-num ${i === 0 ? "gold" : ""}">${i + 1}</span>
            <div class="row-main">
              <span class="row-title">${escapeHTML(m.name)}</span>
              <span class="row-subtitle">Avg rank of top-10 unused: #${m.avgTop10.toFixed(1)}</span>
            </div>
            <span class="stat-value">${m.top50Left}</span>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

async function refreshData() {
  showToast("Refreshing...");
  try {
    await loadLeagueData({ week: state.currentViewWeek });
    renderMain();
    showToast("League updated.", "success");
  } catch (error) {
    showToast(error.message || "Refresh failed.", "error");
  }
}

function switchScreen(screen) {
  qsa(".screen").forEach((panel) => panel.classList.toggle("active", panel.id === `screen-${screen}`));
  qsa(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.screen === screen));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function bindMainEvents() {
  qsa(".nav-item").forEach((button) => {
    button.addEventListener("click", () => switchScreen(button.dataset.screen));
  });

  $("weekSelector")?.addEventListener("change", async (event) => {
    try {
      await fetchWeekPicks(Number(event.target.value));
      renderHome();
      renderPick();
    } catch (error) {
      showToast(error.message || "Could not load week.", "error");
    }
  });

  qsa("[data-history-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.historyView = button.dataset.historyView;
      qsa("[data-history-view]").forEach((item) => item.classList.toggle("active", item === button));
      renderHistory();
    });
  });
}

async function initMain() {
  bindMainEvents();
  try {
    await loadLeagueData();
    renderMain();
    setInterval(() => setTopContext(), 30000);
  } catch (error) {
    $("loadingState").innerHTML = `<p>${escapeHTML(error.message || "Unable to load league data.")}</p>`;
    showToast("Unable to load league data.", "error");
  }
}

async function initAdmin() {
  const input = $("adminKeyInput");
  if (input) input.value = state.adminKey;
  updateAdminAuthState();
  bindAdminEvents();
  await refreshAdminStatus();
}

function bindAdminEvents() {
  $("saveAdminKeyBtn")?.addEventListener("click", () => {
    state.adminKey = $("adminKeyInput").value.trim();
    if (state.adminKey) localStorage.setItem("golf_admin_key", state.adminKey);
    updateAdminAuthState();
    showToast("Admin key saved.", "success");
  });
  $("adminRefreshBtn")?.addEventListener("click", refreshAdminStatus);
  $("adminRevealBtn")?.addEventListener("click", () => adminAction("reveal"));
  $("adminAdvanceBtn")?.addEventListener("click", () => {
    if (confirm("Advance to the next week? This can reveal the current week.")) adminAction("advanceWeek");
  });
}

function updateAdminAuthState() {
  const el = $("adminAuthState");
  if (el) el.textContent = state.adminKey ? "Authenticated locally. Actions will use the saved key." : "Admin key is stored locally on this device.";
}

async function refreshAdminStatus() {
  try {
    await Promise.all([fetchCFStatus(), fetchCFWeeks()]);
    const data = await apiJSON(`/picks?week=${encodeURIComponent(state.cfStatus.currentWeek)}`);
    const submitted = submittedNames(data);
    $("adminContext").textContent = `Week ${state.cfStatus.currentWeek} · ${state.cfStatus.tournament || data.tournament || "Current"}`;
    $("adminWeekTitle").textContent = `Week ${state.cfStatus.currentWeek} · ${state.cfStatus.tournament || data.tournament || "Current"}`;
    const pill = $("adminStatusPill");
    pill.className = `status-pill ${weekStatusClass(data)}`;
    pill.textContent = weekStatusLabel(data);
    $("adminSubmittedCount").textContent = `${submitted.length}/${MEMBERS.length}`;
    $("adminRevealState").textContent = data.revealed ? "Revealed" : data.locked ? "Locked" : "Open";
    $("adminApiSnapshot").textContent = JSON.stringify({ status: state.cfStatus, week: data, weeks: state.cfWeeks }, null, 2);
  } catch (error) {
    showToast(error.message || "Admin refresh failed.", "error");
    $("adminApiSnapshot").textContent = error.message || "Admin refresh failed.";
  }
}

async function adminAction(action) {
  if (!state.adminKey) {
    showToast("Authenticate first.", "error");
    return;
  }
  try {
    await apiJSON("/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Admin-Key": state.adminKey },
      body: JSON.stringify({ action })
    });
    showToast(`${action} complete.`, "success");
    await refreshAdminStatus();
  } catch (error) {
    showToast(error.message || "Admin action failed.", "error");
  }
}

async function initReveal() {
  try {
    await fetchCFStatus();
    const data = await apiJSON(`/picks?week=${encodeURIComponent(state.cfStatus.currentWeek)}`);
    $("revealContext").textContent = `Week ${data.week} · ${data.tournament || "Current"}`;
    const submitted = submittedNames(data);
    $("revealContent").innerHTML = `
      <div class="card">
        <div class="card-header">
          <div>
            <p class="eyebrow">Week ${escapeHTML(data.week)}</p>
            <h2>${escapeHTML(data.tournament || "Tournament TBD")}</h2>
          </div>
          <span class="status-pill ${weekStatusClass(data)}">${weekStatusLabel(data)}</span>
        </div>
        <p class="help-text" style="margin-top:12px;">${data.revealed ? "Picks are visible." : "Picks are not revealed yet. Showing submitted members only."}</p>
      </div>
      <div class="card stack-lg">
        <div class="card-header">
          <div>
            <p class="eyebrow">${data.revealed ? "Picks" : "Entries"}</p>
            <h2>${data.revealed ? "Revealed Picks" : "Submitted Members"}</h2>
          </div>
          <span class="status-pill neutral">${submitted.length}/${MEMBERS.length}</span>
        </div>
        <div class="mini-list">
          ${data.revealed ? revealedPickRows(data) : submitted.map((name) => `
            <div class="pick-row">
              <div class="row-main">
                <span class="row-title">${escapeHTML(name)}</span>
                <span class="row-subtitle">Submitted</span>
              </div>
            </div>
          `).join("") || `<div class="empty-state">No picks submitted yet.</div>`}
        </div>
      </div>
    `;
  } catch (error) {
    $("revealContent").innerHTML = `<div class="empty-state">${escapeHTML(error.message || "Unable to load reveal.")}</div>`;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const page = document.body.dataset.page;
  if (page === "admin") initAdmin();
  else if (page === "reveal") initReveal();
  else initMain();
});
