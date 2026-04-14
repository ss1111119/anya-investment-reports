"use strict";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let currentSymbol = "2330";
let priceChartInstance = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function apiFetch(url, opts = {}) {
  const res = await fetch(url, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || res.statusText);
  }
  return res.json();
}

function el(id) { return document.getElementById(id); }

function freshnessLabel(f) {
  return { live: "即時", delayed: "盤後/近期", stale: "資料偏舊", unavailable: "無資料" }[f] || f;
}

function showError(containerId, msg) {
  const c = el(containerId);
  if (!c) return;
  c.innerHTML = `<div class="section-error">${msg}</div>`;
}

function fmtNet(v) {
  if (v == null) return "N/A";
  const abs = Math.abs(v);
  const str = abs >= 10000 ? (abs / 10000).toFixed(1) + "億" : abs.toLocaleString() + "張";
  return (v >= 0 ? "+" : "-") + str;
}

// ---------------------------------------------------------------------------
// Quote + Interpretation
// ---------------------------------------------------------------------------
async function loadQuote(symbol) {
  const card = el("quote-body");
  card.innerHTML = '<div class="skeleton" style="width:120px;height:40px"></div><div class="skeleton" style="width:80px"></div>';

  try {
    const data = await apiFetch(`/api/workbench/quote/${encodeURIComponent(symbol)}`);
    renderQuote(data);
  } catch (e) {
    card.innerHTML = `<div class="unavailable-state">無法取得 ${symbol} 行情。</div>`;
  }
}

function renderQuote(q) {
  const card = el("quote-body");
  if (q.freshness === "unavailable" || q.last_price == null) {
    card.innerHTML = `
      <div class="unavailable-state">
        <strong>${q.symbol}</strong> 目前無法取得行情資料。<br>
        <span style="font-size:12px">來源狀態：${q.source}</span>
      </div>`;
    return;
  }

  const pct = q.change_percent ?? 0;
  const cls = pct > 0 ? "up" : pct < 0 ? "dn" : "flat";
  const sign = pct > 0 ? "+" : "";
  const freshLabel = freshnessLabel(q.freshness);

  card.innerHTML = `
    <div class="quote-card">
      <div style="font-size:13px;color:var(--muted)">${q.name}（${q.symbol}）</div>
      <div class="quote-price">${q.last_price.toLocaleString()}</div>
      <div class="quote-change ${cls}">
        ${sign}${(q.change ?? 0).toFixed(2)} &nbsp; ${sign}${pct.toFixed(2)}%
      </div>
      <div class="quote-meta">
        <span class="meta-chip ${q.freshness}">${freshLabel}</span>
        <span class="meta-chip">來源: ${q.source}</span>
        ${q.data_date ? `<span class="meta-chip">${q.data_date}</span>` : ""}
      </div>
    </div>`;
}

async function loadInterpretation(symbol) {
  const body = el("interp-body");
  body.innerHTML = '<div class="skeleton" style="width:90%"></div><div class="skeleton" style="width:70%"></div>';

  try {
    const data = await apiFetch(`/api/workbench/interpretation/${encodeURIComponent(symbol)}`);
    const i = data.interpretation;
    body.innerHTML = `
      <div class="interpretation-text">${i.summary}</div>
      <div class="interp-meta">
        信心度：<span class="badge-conf ${i.confidence}">${i.confidence}</span>
        &nbsp;•&nbsp; 依據：${i.based_on.join("、") || "—"}
      </div>`;
  } catch (e) {
    body.innerHTML = '<div class="unavailable-state">目前無法取得市場解讀。</div>';
  }
}

// ---------------------------------------------------------------------------
// Research panel — orchestrator (Task 4.1)
// ---------------------------------------------------------------------------
function loadResearchPanel(symbol) {
  // Fire all four in parallel; each renders independently
  renderPriceChartLoading();
  renderFundamentalsLoading();
  renderInstitutionalLoading();
  renderAiSummaryLoading();

  apiFetch(`/api/workbench/research/${encodeURIComponent(symbol)}/price-history`)
    .then(renderPriceChart)
    .catch(e => renderPriceChart({ error: "fetch_failed", detail: e.message }));

  apiFetch(`/api/workbench/research/${encodeURIComponent(symbol)}/fundamentals`)
    .then(renderFundamentals)
    .catch(e => renderFundamentals({ error: "fetch_failed", detail: e.message }));

  apiFetch(`/api/workbench/research/${encodeURIComponent(symbol)}/institutional`)
    .then(renderInstitutional)
    .catch(e => renderInstitutional({ error: "fetch_failed", detail: e.message }));

  apiFetch(`/api/workbench/research/${encodeURIComponent(symbol)}/ai-summary`)
    .then(renderAiSummary)
    .catch(e => renderAiSummary({ error: "fetch_failed", detail: e.message }));
}

// ---------------------------------------------------------------------------
// Price chart (Task 4.2)
// ---------------------------------------------------------------------------
function renderPriceChartLoading() {
  el("chart-body").style.display = "";
  el("chart-body").innerHTML = '<div class="skeleton" style="height:200px"></div>';
  el("price-chart").style.display = "none";
  el("chart-meta").style.display = "none";
}

function renderPriceChart(data) {
  const body = el("chart-body");
  const canvas = el("price-chart");
  const meta = el("chart-meta");

  if (data.error || !data.dates || !data.closes || data.dates.length === 0) {
    body.style.display = "";
    body.innerHTML = '<div class="unavailable-state">走勢圖資料目前無法取得。</div>';
    canvas.style.display = "none";
    meta.style.display = "none";
    return;
  }

  body.style.display = "none";
  canvas.style.display = "block";

  // Destroy previous chart instance to avoid memory leak
  if (priceChartInstance) {
    priceChartInstance.destroy();
    priceChartInstance = null;
  }

  // Thin out labels: show ~8 evenly spaced dates
  const n = data.dates.length;
  const step = Math.max(1, Math.floor(n / 8));
  const labels = data.dates.map((d, i) => (i % step === 0 ? d.slice(0, 7) : ""));

  priceChartInstance = new Chart(canvas, {
    type: "line",
    data: {
      labels: data.dates,
      datasets: [{
        data: data.closes,
        borderColor: "#76a9ff",
        backgroundColor: "rgba(118,169,255,0.08)",
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.2,
        fill: true,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 3.5,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: ctx => ctx[0].label,
            label: ctx => ` ${ctx.parsed.y.toLocaleString()}`,
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: "#8da1bf",
            font: { size: 10 },
            callback: (_, i) => labels[i] || null,
            maxRotation: 0,
          },
          grid: { color: "rgba(148,163,184,0.08)" },
        },
        y: {
          ticks: { color: "#8da1bf", font: { size: 10 } },
          grid: { color: "rgba(148,163,184,0.08)" },
        },
      },
    },
  });

  meta.style.display = "";
  meta.textContent = `${data.date_range || ""} · 來源: ${data.source} · ${freshnessLabel(data.freshness)}`;
  meta.className = `meta-chip ${data.freshness}`;
}

// ---------------------------------------------------------------------------
// Fundamentals (Task 4.3)
// ---------------------------------------------------------------------------
function renderFundamentalsLoading() {
  el("fundamentals-body").innerHTML =
    '<div class="skeleton" style="width:80%"></div>' +
    '<div class="skeleton" style="width:60%"></div>' +
    '<div class="skeleton" style="width:70%"></div>';
}

function renderFundamentals(data) {
  const body = el("fundamentals-body");
  if (data.error) {
    body.innerHTML = `<div class="section-error">基本面資料暫時無法取得。</div>`;
    return;
  }

  const fmt = v => (v == null || v === "N/A") ? "N/A" : v;

  let revenueHtml = "";
  if (data.revenue_months && data.revenue_months.length > 0) {
    const vals = data.revenue_months.map(r => parseFloat(r.revenue) || 0);
    const max = Math.max(...vals) || 1;
    revenueHtml = `
      <div style="margin-top:10px">
        <div style="font-size:11px;color:var(--muted);margin-bottom:4px">月營收趨勢（近${vals.length}月）</div>
        <div class="revenue-bar-row">
          ${vals.map(v => `<div class="revenue-bar" style="height:${Math.max(4, Math.round((v/max)*44))}px" title="${v.toLocaleString()}"></div>`).join("")}
        </div>
        <div style="font-size:10px;color:var(--muted);display:flex;justify-content:space-between;margin-top:2px">
          <span>${data.revenue_months[data.revenue_months.length - 1]?.year_month || ""}</span>
          <span>${data.revenue_months[0]?.year_month || ""}</span>
        </div>
      </div>`;
  }

  body.innerHTML = `
    <table class="fund-table">
      <tr><td>EPS（近四季）</td><td>${fmt(data.eps_trailing)}</td></tr>
      <tr><td>殖利率</td><td>${data.dividend_yield != null ? (parseFloat(data.dividend_yield) * 100).toFixed(2) + "%" : "N/A"}</td></tr>
      <tr><td>本益比（PE）</td><td>${fmt(data.pe_trailing)}</td></tr>
    </table>
    ${revenueHtml}`;
}

// ---------------------------------------------------------------------------
// Institutional (Task 4.4)
// ---------------------------------------------------------------------------
function renderInstitutionalLoading() {
  el("institutional-body").innerHTML =
    '<div class="skeleton" style="width:80%"></div>' +
    '<div class="skeleton" style="width:60%"></div>';
}

function renderInstitutional(data) {
  const body = el("institutional-body");
  if (data.error) {
    body.innerHTML = `<div class="section-error">法人資料暫時無法取得。</div>`;
    return;
  }

  const cls = v => v > 0 ? "pos" : v < 0 ? "neg" : "zero";

  body.innerHTML = `
    <div class="inst-row">
      <span class="inst-label">外資</span>
      <span class="inst-val ${cls(data.foreign_net)}">${fmtNet(data.foreign_net)}</span>
    </div>
    <div class="inst-row">
      <span class="inst-label">投信</span>
      <span class="inst-val ${cls(data.trust_net)}">${fmtNet(data.trust_net)}</span>
    </div>
    <div class="inst-row">
      <span class="inst-label">自營商</span>
      <span class="inst-val ${cls(data.dealer_net)}">${fmtNet(data.dealer_net)}</span>
    </div>
    <div style="margin-top:8px;font-size:11px;color:var(--muted)">
      統計 ${data.days_covered || 0} 個交易日 ·
      <span class="meta-chip ${data.freshness}" style="padding:2px 7px">${freshnessLabel(data.freshness)}</span>
      ${data.latest_date ? "· 最新: " + data.latest_date : ""}
    </div>`;
}

// ---------------------------------------------------------------------------
// AI summary (Task 4.5)
// ---------------------------------------------------------------------------
function renderAiSummaryLoading() {
  el("ai-summary-body").innerHTML =
    '<div class="skeleton" style="width:95%"></div>' +
    '<div class="skeleton" style="width:85%"></div>' +
    '<div class="skeleton" style="width:75%"></div>';
  const badge = el("ai-conf-badge");
  badge.style.display = "none";
}

function renderAiSummary(data) {
  const body = el("ai-summary-body");
  const badge = el("ai-conf-badge");

  if (data.error && data.confidence !== "low") {
    body.innerHTML = `<div class="section-error">AI 分析暫時無法使用。</div>`;
    badge.style.display = "none";
    return;
  }

  const isLow = data.confidence === "low";
  body.innerHTML = isLow
    ? `<div class="ai-fallback">${data.summary || "AI 分析暫時無法使用。"}</div>`
    : `<div class="ai-text">${data.summary}</div>`;

  badge.style.display = "";
  badge.className = `badge-conf ${data.confidence}`;
  badge.textContent = data.confidence;
}

// ---------------------------------------------------------------------------
// loadSymbol — wire up research panel (Task 4.6)
// ---------------------------------------------------------------------------
function loadSymbol(symbol) {
  currentSymbol = symbol.toUpperCase();
  el("symbol-display").textContent = currentSymbol;
  loadQuote(currentSymbol);
  loadInterpretation(currentSymbol);
  loadResearchPanel(currentSymbol);
}

// ---------------------------------------------------------------------------
// Watchlist
// ---------------------------------------------------------------------------
async function loadWatchlist() {
  const list = el("watchlist-list");
  list.innerHTML = '<div class="skeleton" style="width:60%"></div>';

  try {
    const data = await apiFetch("/api/workbench/watchlist");
    if (data.error) {
      list.innerHTML = `<div class="section-error">Watchlist 暫時無法使用：${data.error}</div>`;
      return;
    }
    renderWatchlist(data.watchlist || []);
  } catch (e) {
    list.innerHTML = `<div class="section-error">Watchlist 載入失敗：${e.message}</div>`;
  }
}

function renderWatchlist(items) {
  const list = el("watchlist-list");
  if (!items.length) {
    list.innerHTML = '<div class="watchlist-empty">尚無追蹤標的。</div>';
    return;
  }
  list.innerHTML = items.map(item => `
    <div class="watchlist-item" data-symbol="${item.symbol}">
      <div>
        <span class="watchlist-item-sym">${item.symbol}</span>
        ${item.display_name ? `<span class="watchlist-item-name"> &nbsp;${item.display_name}</span>` : ""}
      </div>
      <div style="display:flex;gap:6px;align-items:center">
        <button class="btn btn-ghost btn-sm" onclick="loadSymbol('${item.symbol}')">查看</button>
        <button class="btn btn-danger btn-sm" onclick="removeFromWatchlist('${item.symbol}')">移除</button>
      </div>
    </div>`).join("");
}

async function addToWatchlist() {
  const inp = el("watchlist-input");
  const sym = (inp.value || "").trim().toUpperCase();
  if (!sym) return;

  try {
    await apiFetch("/api/workbench/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol: sym }),
    });
    inp.value = "";
    loadWatchlist();
  } catch (e) {
    showError("watchlist-list", `新增失敗：${e.message}`);
  }
}

async function removeFromWatchlist(symbol) {
  try {
    await apiFetch(`/api/workbench/watchlist/${encodeURIComponent(symbol)}`, { method: "DELETE" });
    loadWatchlist();
  } catch (e) {
    showError("watchlist-list", `移除失敗：${e.message}`);
  }
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------
async function loadAlerts() {
  const list = el("alert-list");
  list.innerHTML = '<div class="skeleton" style="width:60%"></div>';

  try {
    const data = await apiFetch("/api/workbench/alerts");
    if (data.error) {
      list.innerHTML = `<div class="section-error">Alerts 暫時無法使用：${data.error}</div>`;
      return;
    }
    renderAlerts(data.alerts || []);
  } catch (e) {
    list.innerHTML = `<div class="section-error">Alerts 載入失敗：${e.message}</div>`;
  }
}

function renderAlerts(items) {
  const list = el("alert-list");
  if (!items.length) {
    list.innerHTML = '<div class="alert-empty">尚無價格警報。</div>';
    return;
  }
  const dirLabel = { above: "突破", below: "跌破" };
  list.innerHTML = items.map(a => `
    <div class="alert-item">
      <div>
        <span class="alert-sym">${a.symbol}</span>
        <span class="alert-cond"> ${dirLabel[a.direction] || a.direction} ${a.threshold}</span>
      </div>
      <div style="display:flex;gap:6px;align-items:center">
        <span class="alert-status ${a.status}">${a.status}</span>
        <button class="btn btn-danger btn-sm" onclick="deleteAlert(${a.id})">刪除</button>
      </div>
    </div>`).join("");
}

async function createAlert() {
  const sym = (el("alert-symbol").value || "").trim().toUpperCase();
  const threshold = parseFloat(el("alert-threshold").value);
  const direction = el("alert-direction").value;

  if (!sym || isNaN(threshold)) {
    showError("alert-list", "請填寫標的與目標價格。");
    return;
  }

  try {
    await apiFetch("/api/workbench/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol: sym, threshold, direction }),
    });
    el("alert-symbol").value = "";
    el("alert-threshold").value = "";
    loadAlerts();
  } catch (e) {
    showError("alert-list", `建立失敗：${e.message}`);
  }
}

async function deleteAlert(id) {
  try {
    await apiFetch(`/api/workbench/alerts/${id}`, { method: "DELETE" });
    loadAlerts();
  } catch (e) {
    showError("alert-list", `刪除失敗：${e.message}`);
  }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  const inp = el("symbol-input");
  el("lookup-btn").addEventListener("click", () => {
    const sym = (inp.value || "").trim();
    if (sym) loadSymbol(sym);
  });
  inp.addEventListener("keydown", e => { if (e.key === "Enter") el("lookup-btn").click(); });

  el("watchlist-add-btn").addEventListener("click", addToWatchlist);
  el("watchlist-input").addEventListener("keydown", e => { if (e.key === "Enter") addToWatchlist(); });

  el("alert-create-btn").addEventListener("click", createAlert);

  loadSymbol(currentSymbol);
  loadWatchlist();
  loadAlerts();
});
