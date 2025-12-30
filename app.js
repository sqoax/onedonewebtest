const API_BASE = "https://api.oneanddone.cloud";

function $(id) { return document.getElementById(id); }

function showToast(message, type = "ok") {
  const toast = $("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.hidden = false;
  toast.classList.remove("ok", "warn");
  toast.classList.add(type);
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { toast.hidden = true; }, 2500);
}

// --- Confetti System ---
const Confetti = {
  ctx: null,
  canvas: null,
  particles: [],
  running: false,

  init() {
    this.canvas = $("confettiCanvas");
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext("2d");
    this.resize();
    window.addEventListener("resize", () => this.resize());
  },

  resize() {
    if (this.canvas) {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
    }
  },

  fire() {
    if (!this.canvas) this.init();
    if (!this.canvas) return;
    
    // Reset/Add particles
    const count = 150;
    const colors = ["#c5a059", "#ffffff", "#8a6e36", "#e0f2e9", "#2d5a3f"];
    
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
        vx: (Math.random() - 0.5) * 25,
        vy: (Math.random() - 1) * 20 - 5,
        size: Math.random() * 8 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        drag: 0.95,
        grav: 0.25,
        rot: Math.random() * 360,
        drot: (Math.random() - 0.5) * 10,
        life: 1.0
      });
    }

    if (!this.running) {
      this.running = true;
      this.loop();
    }
  },

  loop() {
    if (!this.ctx || !this.running) return;
    
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Update and draw
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.grav;
      p.vx *= p.drag;
      p.vy *= p.drag;
      p.rot += p.drot;
      p.life -= 0.008;

      if (p.life > 0) {
        this.ctx.save();
        this.ctx.translate(p.x, p.y);
        this.ctx.rotate((p.rot * Math.PI) / 180);
        this.ctx.globalAlpha = p.life;
        this.ctx.fillStyle = p.color;
        this.ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        this.ctx.restore();
      }
    }

    // Cleanup dead particles
    this.particles = this.particles.filter(p => p.life > 0);

    if (this.particles.length > 0) {
      requestAnimationFrame(() => this.loop());
    } else {
      this.running = false;
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }
};

// --- API Functions ---

async function apiGetSettings() {
  const r = await fetch(`${API_BASE}/settings`);
  return await r.json();
}

async function apiSubmitPick({ name, pick }) {
  const r = await fetch(`${API_BASE}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, pick }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, message: data?.message || `Error ${r.status}` };
  return data;
}

async function apiGetPicks() {
  const r = await fetch(`${API_BASE}/picks`);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, message: data?.message || `Error ${r.status}` };
  return data;
}

async function apiAdmin(action, adminKey) {
  const r = await fetch(`${API_BASE}/admin`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Key": adminKey || "",
    },
    body: JSON.stringify({ action }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, message: data?.message || `Error ${r.status}` };
  return data;
}

function fmtTime(iso) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso || "";
  }
}

// --- Trigger Stamp Animation ---
function triggerStamp() {
  const stamp = $("lockedInStamp");
  if (!stamp) return;
  
  stamp.classList.remove("hidden");
  // Force reflow
  void stamp.offsetWidth; 
  stamp.classList.add("visible");
  
  // Flash duration ~0.8s then fade out
  setTimeout(() => {
    stamp.classList.remove("visible");
    setTimeout(() => {
      stamp.classList.add("hidden");
    }, 300); // Wait for fade out transition
  }, 900);
}

// --- Main App ---

const App = {
  async init() {
    Confetti.init();
    
    const form = $("pickForm");
    const statusLine = $("statusLine");
    const submitBtn = $("submitBtn");

    const picksBlock = $("picksBlock");
    const picksRows = $("picksRows");

    const adminBlock = $("adminBlock");
    const adminKeyBtn = $("adminKeyBtn");
    const resetBtn = $("resetBtn");
    const revealBtn = $("revealBtn");
    const adminStatus = $("adminStatus");

    const setStatus = (msg, type = "warn") => {
      if (!statusLine) return;
      statusLine.textContent = msg;
      statusLine.classList.remove("ok", "warn");
      statusLine.classList.add(type);
    };

    const setAdminStatus = (msg, type = "warn") => {
      if (!adminStatus) return;
      adminStatus.textContent = msg;
      adminStatus.classList.remove("ok", "warn");
      adminStatus.classList.add(type);
    };

    const getSavedAdminKey = () => localStorage.getItem("one_done_admin_key") || "";
    const saveAdminKey = (k) => localStorage.setItem("one_done_admin_key", k);

    const refreshUI = async () => {
      const s = await apiGetSettings();

      // Reveal mode
      if (s.revealed) {
        setStatus("Picks are revealed.", "ok");
        if (form) form.classList.add("hidden");
        if (picksBlock) picksBlock.classList.remove("hidden");

        const res = await apiGetPicks();
        if (res.ok) {
          const picks = res.picks || [];
          if (picksRows) {
            picksRows.innerHTML = picks.map(p =>
              `<tr><td>${p.name || ""}</td><td>${p.pick || ""}</td><td>${fmtTime(p.ts)}</td></tr>`
            ).join("");
          }
        } else {
          showToast(res.message || "Could not load picks.", "warn");
        }
        return;
      }

      // Submit mode
      setStatus("Picks are open, picks reveal Wednesday at 9:00 PM ET.", "warn");
      if (form) form.classList.remove("hidden");
      if (picksBlock) picksBlock.classList.add("hidden");

      const locked = !!s.locked;
      if (submitBtn) submitBtn.disabled = locked;
      if (locked) showToast("Picks are locked right now.", "warn");
    };

    // Submit handler
    if (form) {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const name = ($("name")?.value || "").trim();
        const pick = ($("pick")?.value || "").trim();

        if (!name || !pick) {
          showToast("Enter your name and pick.", "warn");
          return;
        }

        if (submitBtn) submitBtn.disabled = true;
        const res = await apiSubmitPick({ name, pick });

        if (res.ok) {
          showToast(res.message || "Pick submitted.", "ok");
          if ($("pick")) $("pick").value = "";
          
          // SUCCESS VISUALS
          triggerStamp();
          Confetti.fire();
          
        } else {
          showToast(res.message || "Submit failed.", "warn");
        }

        if (submitBtn) submitBtn.disabled = false;
        await refreshUI();
      });
    }

    // Admin block, show it if a key exists
    if (adminBlock) adminBlock.classList.remove("hidden");

    if (adminKeyBtn) {
      adminKeyBtn.addEventListener("click", () => {
        const k = prompt("Enter admin key");
        if (k && k.trim()) {
          saveAdminKey(k.trim());
          setAdminStatus("Admin key saved on this device.", "ok");
        }
      });
    }

    if (revealBtn) {
      revealBtn.addEventListener("click", async () => {
        const k = getSavedAdminKey();
        if (!k) {
          setAdminStatus("No admin key set.", "warn");
          return;
        }

        if (!confirm("Force reveal now, lock submissions, and show picks?")) return;

        const res = await apiAdmin("reveal", k);
        if (res.ok) {
          showToast("Revealed.", "ok");
          setAdminStatus("Picks revealed.", "ok");
          await refreshUI();
        } else {
          showToast(res.message || "Reveal failed.", "warn");
          setAdminStatus(res.message || "Reveal failed.", "warn");
        }
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener("click", async () => {
        const k = getSavedAdminKey();
        if (!k) {
          setAdminStatus("No admin key set.", "warn");
          return;
        }
        if (!confirm("Reset picks, open submissions again?")) return;

        const res = await apiAdmin("reset", k);
        if (res.ok) {
          showToast("Reset complete.", "ok");
          setAdminStatus("Reset complete.", "ok");
          await refreshUI();
        } else {
          showToast(res.message || "Reset failed.", "warn");
          setAdminStatus(res.message || "Reset failed.", "warn");
        }
      });
    }

    await refreshUI();
  },
};

document.addEventListener("DOMContentLoaded", () => App.init());
