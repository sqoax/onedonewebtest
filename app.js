const API_BASE = "https://twilight-tree-42ce.hiattgafnea0.workers.dev";
const $ = (id) => document.getElementById(id);

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
      } else {
        $("statusLine").textContent = "Picks are open, reveal Wed at 9:00 PM ET.";
        $("statusLine").className = "status-pill warn";
        $("pickForm").classList.remove("hidden");
        $("picksBlock").classList.add("hidden");
      }
    };

    $("resetBtn").onclick = async () => {
      const k = localStorage.getItem("one_done_admin_key");
      if (!k || !confirm("Reset everything for next week?")) return;
      
      const res = await (await fetch(`${API_BASE}/admin`, { 
        method: "POST", 
        headers: { "Content-Type": "application/json", "X-Admin-Key": k }, 
        body: JSON.stringify({ action: "reset" }) 
      })).json();

      if (res.ok) {
        // FORCE UI RESET IMMEDIATELY
        $("picksBlock").classList.add("hidden");
        $("pickForm").classList.remove("hidden");
        $("statusLine").textContent = "Picks are open, reveal Wed at 9:00 PM ET.";
        $("statusLine").className = "status-pill warn";
        await refreshUI(); 
      }
    };

    await refreshUI();
  }
};
document.addEventListener("DOMContentLoaded", () => App.init());
