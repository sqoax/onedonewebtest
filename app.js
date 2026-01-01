const API_BASE = "https://twilight-tree-42ce.hiattgafnea0.workers.dev";
const $ = (id) => document.getElementById(id);

const triggerConfetti = () => {
  confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 }, colors: ['#c5a059', '#1e3a28', '#f2f2f2'], zIndex: 999 });
};

const showToast = (msg, type = "ok") => {
  const t = $("toast");
  if (!t) return;
  t.textContent = msg;
  t.hidden = false;
  t.classList.remove("ok", "warn", "hidden");
  t.classList.add(type);
  clearTimeout(window._toastT);
  window._toastT = setTimeout(() => { t.classList.add("hidden"); t.hidden = true; }, 2500);
};

const App = {
  async init() {
    const refreshUI = async () => {
      const s = await (await fetch(`${API_BASE}/settings`)).json();
      const namesRes = await (await fetch(`${API_BASE}/submitted`)).json();
      
      if (namesRes.ok) $("submittedList").innerHTML = namesRes.names.map(n => `<span class="member-pill">${n}</span>`).join("");

      if (s.revealed) {
        $("statusLine").textContent = "Picks are revealed.";
        $("statusLine").className = "status-pill ok";
        $("pickForm").classList.add("hidden");
        $("picksBlock").classList.remove("hidden");
        const res = await (await fetch(`${API_BASE}/picks`)).json();
        if (res.ok) $("picksRows").innerHTML = res.picks.map(p => `<tr><td>${p.name}</td><td>${p.pick}</td><td>${new Date(p.ts).toLocaleString()}</td></tr>`).join("");
      } else {
        $("statusLine").textContent = "Picks are open, reveal Wed at 9:00 PM ET.";
        $("statusLine").className = "status-pill warn";
        $("pickForm").classList.remove("hidden");
        $("picksBlock").classList.add("hidden");
        $("submitBtn").disabled = !!s.locked;
      }
    };

    $("pickForm").onsubmit = async (e) => {
      e.preventDefault();
      const name = $("name").value.trim();
      const pick = $("pick").value.trim();
      if (!name || !pick) return showToast("Enter name and pick.", "warn");
      $("submitBtn").disabled = true;
      const res = await (await fetch(`${API_BASE}/submit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, pick }) })).json();
      if (res.ok) { showToast("Pick submitted!", "ok"); triggerConfetti(); $("pick").value = ""; await refreshUI(); }
      else showToast(res.message, "warn");
      $("submitBtn").disabled = false;
    };

    $("adminKeyBtn").onclick = () => { const k = prompt("Enter admin key"); if (k) localStorage.setItem("one_done_key", k.trim()); };

    $("resetBtn").onclick = async () => {
      const k = localStorage.getItem("one_done_key");
      if (!k || !confirm("Reset everything for next week?")) return;
      const res = await (await fetch(`${API_BASE}/admin`, { method: "POST", headers: { "Content-Type": "application/json", "X-Admin-Key": k }, body: JSON.stringify({ action: "reset" }) })).json();
      if (res.ok) { 
        showToast("Reset complete!", "ok");
        // Force the screen to switch back immediately
        $("picksBlock").classList.add("hidden");
        $("pickForm").classList.remove("hidden");
        await refreshUI(); 
      } else showToast(res.message, "warn");
    };

    $("revealBtn").onclick = async () => {
      const k = localStorage.getItem("one_done_key");
      if (!k) return;
      await fetch(`${API_BASE}/admin`, { method: "POST", headers: { "Content-Type": "application/json", "X-Admin-Key": k }, body: JSON.stringify({ action: "reveal" }) });
      await refreshUI();
    };

    await refreshUI();
  }
};
document.addEventListener("DOMContentLoaded", () => App.init());
