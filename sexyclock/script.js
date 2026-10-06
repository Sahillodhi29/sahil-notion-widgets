(() => {
  const $ = (id) => document.getElementById(id);
  const widget = $("widget");

  const DAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const DAYS_SHORT = ["S", "M", "T", "W", "T", "F", "S"];
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const pad = (n) => String(n).padStart(2, "0");

  /* ---------- Build static bits once ---------- */
  // week dots
  const week = $("week");
  DAYS_SHORT.forEach((d) => {
    const s = document.createElement("span");
    s.textContent = d;
    week.appendChild(s);
  });

  // dial ticks
  const ticks = $("ticks");
  const NS = "http://www.w3.org/2000/svg";
  for (let i = 0; i < 60; i++) {
    const big = i % 5 === 0;
    const len = big ? 8 : 4;
    const line = document.createElementNS(NS, "line");
    line.setAttribute("x1", 100);
    line.setAttribute("x2", 100);
    line.setAttribute("y1", 14);
    line.setAttribute("y2", 14 + len);
    line.setAttribute("class", "tick" + (big ? " big" : ""));
    line.setAttribute("transform", `rotate(${i * 6} 100 100)`);
    ticks.appendChild(line);
  }

  /* ---------- Greeting + palette by hour ---------- */
  function period(h) {
    if (h < 5)  return ["night",   "still up? 🌙"];
    if (h < 12) return ["morning", "good morning ☀️"];
    if (h < 17) return ["day",     "good afternoon 🍊"];
    if (h < 21) return ["evening", "good evening 🌇"];
    return ["night", "good night ✨"];
  }

  /* ---------- Tick ---------- */
  let lastPeriod = "";

  function tick() {
    const now = new Date();
    const h24 = now.getHours();
    const m = now.getMinutes();
    const s = now.getSeconds();
    const ms = now.getMilliseconds();

    // digital
    const h12 = h24 % 12 || 12;
    $("hh").textContent = pad(h12);
    $("mm").textContent = pad(m);
    $("ss").textContent = pad(s);
    $("ampm").textContent = h24 >= 12 ? "PM" : "AM";
    $("barFill").style.width = ((s + 1) / 60) * 100 + "%";

    // date
    const dateText = `${DAYS_LONG[now.getDay()]} · ${MONTHS[now.getMonth()]} ${now.getDate()}`;
    $("date").textContent = dateText;
    $("dateA").textContent = dateText;

    // week highlight
    [...week.children].forEach((el, i) => el.classList.toggle("today", i === now.getDay()));

    // analog (smooth)
    const sec = s + ms / 1000;
    const min = m + sec / 60;
    const hr = (h24 % 12) + min / 60;
    $("hand-s").style.transform = `rotate(${sec * 6}deg)`;
    $("hand-m").style.transform = `rotate(${min * 6}deg)`;
    $("hand-h").style.transform = `rotate(${hr * 30}deg)`;

    // greeting + sky palette
    const [p, text] = period(h24);
    if (p !== lastPeriod) {
      widget.dataset.period = p;
      document.body.dataset.period = p;
      $("greeting").textContent = text;
      lastPeriod = p;
    }

    requestAnimationFrame(tick);
  }

  /* ---------- Flip digital <-> analog ---------- */
  try {
    const saved = localStorage.getItem("sunny-clock-mode");
    if (saved === "analog" || saved === "digital") widget.dataset.mode = saved;
  } catch (_) {}

  widget.addEventListener("click", () => {
    const next = widget.dataset.mode === "digital" ? "analog" : "digital";
    widget.dataset.mode = next;
    try { localStorage.setItem("sunny-clock-mode", next); } catch (_) {}
  });

  requestAnimationFrame(tick);
})();
