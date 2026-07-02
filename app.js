/* Water Tracker — offline daily water logging in mL.
 * Data lives in localStorage. State is keyed by local calendar day so the
 * count naturally resets each morning. Supports ?add=250 URL param so iOS
 * Shortcuts (incl. lock-screen shortcuts) can log water with one tap. */

(function () {
  "use strict";

  var STORE_KEY = "waterTracker.v1";
  var RING_CIRC = 2 * Math.PI * 96; // matches r=96 in the SVG

  // ---- Date helpers (local time) --------------------------------------
  function todayKey(d) {
    d = d || new Date();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }

  function dayKeyOffset(n) {
    // Key for the day that is n days before today (n>=0), in local time.
    var d = new Date();
    d.setHours(12, 0, 0, 0); // noon avoids DST edge cases when subtracting days
    d.setDate(d.getDate() - n);
    return { key: todayKey(d), date: d };
  }

  function prettyDate(key) {
    var parts = key.split("-");
    var d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
    return d.toLocaleDateString(undefined, {
      weekday: "long", month: "long", day: "numeric"
    });
  }

  function fmtTime(ts) {
    return new Date(ts).toLocaleTimeString(undefined, {
      hour: "numeric", minute: "2-digit"
    });
  }

  // ---- Persistence ----------------------------------------------------
  function load() {
    var raw;
    try { raw = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) { raw = null; }
    if (!raw || typeof raw !== "object") raw = {};
    if (typeof raw.goal !== "number" || raw.goal <= 0) raw.goal = 2000;
    if (!raw.days || typeof raw.days !== "object") raw.days = {};
    return raw;
  }

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  function todayEntries() {
    var k = todayKey();
    if (!state.days[k]) state.days[k] = [];
    return state.days[k];
  }

  function todayTotal() {
    return todayEntries().reduce(function (s, e) { return s + e.amount; }, 0);
  }

  var state = load();

  // Trim history to the last ~120 days so storage never grows unbounded.
  (function prune() {
    var keys = Object.keys(state.days).sort();
    while (keys.length > 120) { delete state.days[keys.shift()]; }
  })();

  // ---- DOM refs -------------------------------------------------------
  var el = {
    total: document.getElementById("total"),
    goalLabel: document.getElementById("goalLabel"),
    percent: document.getElementById("percent"),
    ringFill: document.getElementById("ringFill"),
    logList: document.getElementById("logList"),
    emptyLog: document.getElementById("emptyLog"),
    dateLabel: document.getElementById("dateLabel"),
    undoBtn: document.getElementById("undoBtn"),
    toast: document.getElementById("toast"),
    settingsSheet: document.getElementById("settingsSheet"),
    goalInput: document.getElementById("goalInput"),
    customInput: document.getElementById("customInput"),
    weekPlot: document.getElementById("weekPlot"),
    weekDays: document.getElementById("weekDays"),
    goalLine: document.getElementById("goalLine"),
    weekAvg: document.getElementById("weekAvg"),
    weekGoalDays: document.getElementById("weekGoalDays")
  };

  el.ringFill.style.strokeDasharray = RING_CIRC.toFixed(2);

  // ---- Rendering ------------------------------------------------------
  function render() {
    var total = todayTotal();
    var goal = state.goal;
    var pct = Math.min(100, Math.round((total / goal) * 100));

    el.total.textContent = total;
    el.goalLabel.textContent = goal;
    el.percent.textContent = pct + "%";
    el.ringFill.style.strokeDashoffset =
      (RING_CIRC * (1 - Math.min(1, total / goal))).toFixed(2);

    var entries = todayEntries();
    el.undoBtn.hidden = entries.length === 0;
    el.emptyLog.hidden = entries.length !== 0;

    el.logList.innerHTML = "";
    // Newest first.
    entries.slice().reverse().forEach(function (entry) {
      var li = document.createElement("li");

      var left = document.createElement("span");
      left.className = "amt";
      left.textContent = entry.amount + " mL";

      var right = document.createElement("span");
      right.className = "time";
      right.textContent = fmtTime(entry.ts);

      var del = document.createElement("button");
      del.className = "del";
      del.setAttribute("aria-label", "Delete entry");
      del.textContent = "×";
      del.addEventListener("click", function () { removeEntry(entry.ts); });

      var meta = document.createElement("div");
      meta.style.display = "flex";
      meta.style.alignItems = "center";
      meta.appendChild(right);
      meta.appendChild(del);

      li.appendChild(left);
      li.appendChild(meta);
      el.logList.appendChild(li);
    });

    el.dateLabel.textContent = prettyDate(todayKey());
    renderWeek();
  }

  function dayTotal(key) {
    var arr = state.days[key] || [];
    return arr.reduce(function (s, e) { return s + e.amount; }, 0);
  }

  function renderWeek() {
    var goal = state.goal;
    var todayK = todayKey();

    // Oldest -> newest across the last 7 days (index 0 = 6 days ago).
    var days = [];
    for (var n = 6; n >= 0; n--) days.push(dayKeyOffset(n));

    var totals = days.map(function (d) { return dayTotal(d.key); });
    var maxTotal = Math.max.apply(null, totals);
    // Headroom above the taller of goal / peak day so value labels never clip.
    var scaleMax = Math.max(goal, maxTotal) * 1.18 || 1;

    // Weekly stats.
    var sum = totals.reduce(function (a, b) { return a + b; }, 0);
    var hit = totals.filter(function (t) { return t >= goal; }).length;
    el.weekAvg.textContent = Math.round(sum / 7).toLocaleString();
    el.weekGoalDays.textContent = hit;

    // Goal reference line.
    el.goalLine.style.bottom = (Math.min(1, goal / scaleMax) * 100).toFixed(1) + "%";

    // Rebuild bars + day labels (keep the goal line node).
    Array.prototype.slice.call(el.weekPlot.querySelectorAll(".bar"))
      .forEach(function (b) { b.remove(); });
    el.weekDays.innerHTML = "";

    days.forEach(function (d, i) {
      var total = totals[i];
      var isToday = d.key === todayK;

      var bar = document.createElement("div");
      bar.className = "bar" +
        (total === 0 ? " empty" : "") +
        (total >= goal && total > 0 ? " met" : "") +
        (isToday ? " today" : "");
      var pct = total > 0 ? Math.max(3, (total / scaleMax) * 100) : 0;
      bar.style.height = total > 0 ? pct.toFixed(1) + "%" : "4px";

      if (total > 0) {
        var val = document.createElement("div");
        val.className = "bar-val";
        val.textContent = total >= 1000
          ? (total / 1000).toFixed(total % 1000 === 0 ? 0 : 1) + "L"
          : total;
        bar.appendChild(val);
      }

      var label = d.date.toLocaleDateString(undefined, { weekday: "short" });
      bar.setAttribute("role", "img");
      bar.setAttribute("aria-label", label + ": " + total + " mL");
      bar.addEventListener("click", function () {
        toast(label + ": " + total.toLocaleString() + " mL");
      });
      el.weekPlot.appendChild(bar);

      var dl = document.createElement("div");
      dl_set(dl, isToday, label);
      el.weekDays.appendChild(dl);
    });
  }

  function dl_set(node, isToday, label) {
    node.className = "day-label" + (isToday ? " today" : "");
    node.textContent = label;
  }

  // ---- Actions --------------------------------------------------------
  function addWater(amount, silent) {
    amount = Math.round(amount);
    if (!amount || amount < 1 || amount > 5000) return;
    todayEntries().push({ amount: amount, ts: Date.now() });
    save();
    render();
    if (!silent) {
      toast("+" + amount + " mL");
      if (navigator.vibrate) navigator.vibrate(15);
    }
  }

  function removeEntry(ts) {
    var arr = todayEntries();
    var i = arr.findIndex(function (e) { return e.ts === ts; });
    if (i >= 0) { arr.splice(i, 1); save(); render(); }
  }

  function undoLast() {
    var arr = todayEntries();
    if (arr.length) { arr.pop(); save(); render(); toast("Removed last"); }
  }

  function clearToday() {
    state.days[todayKey()] = [];
    save();
    render();
    toast("Cleared");
  }

  var toastTimer;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.hidden = true; }, 1400);
  }

  // ---- Event wiring ---------------------------------------------------
  document.querySelectorAll(".quick-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      addWater(parseInt(btn.dataset.amt, 10));
    });
  });

  document.getElementById("customAdd").addEventListener("click", function () {
    var v = parseInt(el.customInput.value, 10);
    if (v > 0) { addWater(v); el.customInput.value = ""; el.customInput.blur(); }
  });
  el.customInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") document.getElementById("customAdd").click();
  });

  el.undoBtn.addEventListener("click", undoLast);

  // Settings sheet
  document.getElementById("settingsBtn").addEventListener("click", function () {
    el.goalInput.value = state.goal;
    el.settingsSheet.hidden = false;
  });
  document.getElementById("closeSettings").addEventListener("click", function () {
    var g = parseInt(el.goalInput.value, 10);
    if (g >= 250 && g <= 10000) { state.goal = g; save(); render(); }
    el.settingsSheet.hidden = true;
  });
  document.getElementById("clearToday").addEventListener("click", clearToday);
  el.settingsSheet.addEventListener("click", function (e) {
    if (e.target === el.settingsSheet) el.settingsSheet.hidden = true;
  });

  // Re-render if the day rolled over while the app was open/backgrounded.
  var lastDay = todayKey();
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && todayKey() !== lastDay) { lastDay = todayKey(); render(); }
  });

  // ---- URL quick-add (for iOS Shortcuts / lock screen) ----------------
  // e.g. https://<you>.github.io/Waterapp/?add=250
  function handleUrlAdd() {
    var params = new URLSearchParams(location.search);
    var add = parseInt(params.get("add"), 10);
    if (add > 0) {
      addWater(add, true);
      toast("Logged " + add + " mL");
      // Strip the param so a refresh doesn't double-log.
      history.replaceState(null, "", location.pathname);
    }
  }

  handleUrlAdd();
  render();

  // ---- Service worker (offline) --------------------------------------
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    });
  }
})();
