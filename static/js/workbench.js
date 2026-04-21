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
  // unit: 千元；1億 = 100,000 千元
  const str = abs >= 100000
    ? (abs / 100000).toFixed(1) + "億"
    : (abs / 1000).toFixed(1) + "千萬";
  return (v >= 0 ? "+" : "-") + str;
}

// ---------------------------------------------------------------------------
// Market status helpers
// ---------------------------------------------------------------------------
function isTaiwanMarketOpen() {
  const now = new Date();
  // Convert to Taiwan time (UTC+8)
  const tw = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
  const day  = tw.getDay(); // 0=Sun, 6=Sat
  const hour = tw.getHours();
  const min  = tw.getMinutes();
  const mins = hour * 60 + min;
  if (day === 0 || day === 6) return false;
  return mins >= 9 * 60 && mins < 13 * 60 + 30;
}

function updateMarketBadge() {
  const badge = el("market-status-badge");
  if (!badge) return;
  if (isTaiwanMarketOpen()) {
    badge.style.display = "";
    badge.className = "meta-chip live";
    badge.textContent = "開盤中";
  } else {
    badge.style.display = "none";
  }
}

let _quoteRefreshTimer = null;

function startQuoteAutoRefresh() {
  if (_quoteRefreshTimer) return;
  _quoteRefreshTimer = setInterval(() => {
    if (isTaiwanMarketOpen() && currentSymbol) {
      loadQuote(currentSymbol);
    }
  }, 60000); // every 60s
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
// Research Tab System
// ---------------------------------------------------------------------------
let _tabCache = {};     // key: `${symbol}__${tabName}`
let _klineChart = null; // ECharts instance for K-line

function _tabCacheKey(symbol, tabName) {
  return `${symbol}__${tabName}`;
}

function _showPanel(tabName) {
  document.querySelectorAll(".wb-panel").forEach(p => p.style.display = "none");
  const panel = el(`wb-panel-${tabName}`);
  if (panel) panel.style.display = "";
}

function _setActiveTab(tabName) {
  document.querySelectorAll(".wb-tab-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.tab === tabName);
  });
}

async function loadResearchTab(symbol, tabName) {
  _setActiveTab(tabName);
  _showPanel(tabName);

  const key = _tabCacheKey(symbol, tabName);

  // ── Existing 4 panels (load directly, no API route needed for render) ──
  if (tabName === "kline") {
    if (_tabCache[key]) {
      renderKlineChart(_tabCache[key]);
    } else {
      el("wb-kline-container").innerHTML = '<div class="wb-loading">K 線載入中…</div>';
      try {
        const data = await apiFetch(`/api/workbench/taiex-chart?symbol=${encodeURIComponent(symbol)}&days=120`);
        _tabCache[key] = data;
        renderKlineChart(data);
      } catch (e) {
        el("wb-kline-container").innerHTML = `<div class="wb-error">K 線資料無法取得：${e.message}</div>`;
      }
    }
    return;
  }

  if (tabName === "fundamentals") {
    if (!_tabCache[key]) {
      renderFundamentalsLoading();
      try {
        const data = await apiFetch(`/api/workbench/research/${encodeURIComponent(symbol)}/fundamentals`);
        _tabCache[key] = data;
        renderFundamentals(data);
      } catch (e) { renderFundamentals({ error: e.message }); }
    } else {
      renderFundamentals(_tabCache[key]);
    }
    return;
  }

  if (tabName === "institutional") {
    if (!_tabCache[key]) {
      renderInstitutionalLoading();
      try {
        const data = await apiFetch(`/api/workbench/research/${encodeURIComponent(symbol)}/institutional`);
        _tabCache[key] = data;
        renderInstitutional(data);
      } catch (e) { renderInstitutional({ error: e.message }); }
    } else {
      renderInstitutional(_tabCache[key]);
    }
    return;
  }

  if (tabName === "ai-summary") {
    if (!_tabCache[key]) {
      renderAiSummaryLoading();
      try {
        const data = await apiFetch(`/api/workbench/research/${encodeURIComponent(symbol)}/ai-summary`);
        _tabCache[key] = data;
        renderAiSummary(data);
      } catch (e) { renderAiSummary({ error: e.message }); }
    } else {
      renderAiSummary(_tabCache[key]);
    }
    return;
  }

  // ── Extended panels (text/image from new endpoints) ──
  const bodyEl = el(`wb-body-${tabName}`);
  if (!bodyEl) return;

  if (_tabCache[key] !== undefined) {
    renderExtendedTab(tabName, bodyEl, _tabCache[key]);
    return;
  }

  bodyEl.innerHTML = '<div class="wb-loading">分析中，請稍候…</div>';

  try {
    const data = await apiFetch(`/api/workbench/research/${encodeURIComponent(symbol)}/${tabName}`);
    _tabCache[key] = data;
    renderExtendedTab(tabName, bodyEl, data);
  } catch (e) {
    bodyEl.innerHTML = `<div class="wb-error">無法取得資料：${e.message}</div>`;
  }
}

function renderExtendedTab(tabName, bodyEl, data) {
  if (data.error && !data.report && !data.image_url && !data.name) {
    bodyEl.innerHTML = `<div class="wb-error">資料暫時無法取得。</div>`;
    return;
  }

  if (tabName === "pe-river") {
    if (data.image_url) {
      bodyEl.innerHTML = `<img class="wb-pe-river-img" src="${data.image_url}" alt="PE River Chart">`;
    } else {
      bodyEl.innerHTML = `<div class="wb-error">本益比河流圖目前無法生成。</div>`;
    }
    return;
  }

  if (tabName === "company-info") {
    const rows = [
      ["公司名稱", data.name || ""],
      ["產業", data.industry || ""],
      ["主要產品", data.products || ""],
      ["員工人數", data.employees || ""],
      ["官網", data.website ? `<a href="${data.website}" target="_blank" rel="noopener">${data.website}</a>` : ""],
      ["簡介", data.description || ""],
    ].filter(r => r[1]).map(r =>
      `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`
    ).join("");
    bodyEl.innerHTML = `<table class="wb-company-table">${rows}</table>`;
    return;
  }

  // Default: text report
  const report = data.report || "";
  if (!report) {
    bodyEl.innerHTML = `<div class="wb-error">此分析目前無資料。</div>`;
    return;
  }
  bodyEl.innerHTML = `<div class="wb-report-body">${report.replace(/</g,"&lt;").replace(/>/g,"&gt;")}</div>`;
}

// ── K-line ECharts renderer (uses taiex-chart data) ──
function renderKlineChart(d) {
  if (!d || d.error || !d.dates) {
    el("wb-kline-container").innerHTML = '<div class="wb-error">K 線資料無法取得。</div>';
    return;
  }

  const sharpeBadge = el("wb-kline-sharpe");
  if (sharpeBadge && d.sharpe != null) {
    sharpeBadge.textContent = `Sharpe: ${d.sharpe}`;
  }

  const container = el("wb-kline-container");
  container.innerHTML = "";

  if (typeof echarts === "undefined") {
    container.innerHTML = '<div class="wb-error">ECharts 尚未載入。</div>';
    return;
  }
  if (_klineChart) { _klineChart.dispose(); _klineChart = null; }
  _klineChart = echarts.init(container, "dark");

  const up = "#34d399", dn = "#f87171";
  const itemColor = data => data[1] >= data[0] ? up : dn;

  const option = {
    backgroundColor: "transparent",
    animation: false,
    tooltip: { trigger: "axis", axisPointer: { type: "cross" }, backgroundColor: "#0e1627", borderColor: "rgba(148,163,184,0.2)", textStyle: { color: "#c8d8ec", fontSize: 12 } },
    legend: { data: ["K線", "MA5", "MA20", "BB上軌", "BB下軌"], top: 0, textStyle: { color: "#8da1bf", fontSize: 11 }, inactiveColor: "#3a4a60" },
    axisPointer: { link: [{ xAxisIndex: "all" }] },
    dataZoom: [
      { type: "inside", xAxisIndex: [0,1,2,3], start: 50, end: 100 },
      { type: "slider", xAxisIndex: [0,1,2,3], start: 50, end: 100, bottom: 2, height: 18, borderColor: "transparent", fillerColor: "rgba(118,169,255,0.12)", textStyle: { color: "#8da1bf", fontSize: 10 } },
    ],
    grid: [
      { left: 60, right: 16, top: 32, height: "38%" },
      { left: 60, right: 16, top: "46%", height: "10%" },
      { left: 60, right: 16, top: "60%", height: "12%" },
      { left: 60, right: 16, top: "76%", height: "10%" },
    ],
    xAxis: [0,1,2,3].map(i => ({ type: "category", data: d.dates, gridIndex: i, axisLabel: { show: i===3, color: "#8da1bf", fontSize: 10 }, axisLine: { lineStyle: { color: "#2a3a50" } } })),
    yAxis: [
      { scale: true, gridIndex: 0, splitLine: { lineStyle: { color: "rgba(148,163,184,0.08)" } }, axisLabel: { color: "#8da1bf", fontSize: 10 } },
      { scale: true, gridIndex: 1, splitNumber: 2, splitLine: { lineStyle: { color: "rgba(148,163,184,0.08)" } }, axisLabel: { color: "#8da1bf", fontSize: 10 } },
      { scale: true, gridIndex: 2, max: 100, min: 0, splitNumber: 3, splitLine: { lineStyle: { color: "rgba(148,163,184,0.08)" } }, axisLabel: { color: "#8da1bf", fontSize: 10 } },
      { scale: true, gridIndex: 3, splitNumber: 2, splitLine: { lineStyle: { color: "rgba(148,163,184,0.08)" } }, axisLabel: { color: "#8da1bf", fontSize: 10 } },
    ],
    series: [
      { name: "K線", type: "candlestick", xAxisIndex: 0, yAxisIndex: 0, data: d.ohlcv, itemStyle: { color: up, color0: dn, borderColor: up, borderColor0: dn } },
      { name: "MA5",  type: "line", xAxisIndex: 0, yAxisIndex: 0, data: d.ma5,  smooth: true, lineStyle: { width: 1, color: "#fbbf24" }, showSymbol: false },
      { name: "MA20", type: "line", xAxisIndex: 0, yAxisIndex: 0, data: d.ma20, smooth: true, lineStyle: { width: 1, color: "#38bdf8" }, showSymbol: false },
      ...(d.bband ? [
        { name: "BB上軌", type: "line", xAxisIndex: 0, yAxisIndex: 0, data: d.bband.upper, smooth: true, lineStyle: { width: 1, color: "#a78bfa", type: "dashed" }, showSymbol: false },
        { name: "BB下軌", type: "line", xAxisIndex: 0, yAxisIndex: 0, data: d.bband.lower, smooth: true, lineStyle: { width: 1, color: "#a78bfa", type: "dashed" }, showSymbol: false },
      ] : []),
      { name: "成交量", type: "bar", xAxisIndex: 1, yAxisIndex: 1, data: d.volumes.map((v,i) => ({ value: v, itemStyle: { color: itemColor(d.ohlcv[i]) } })) },
      ...(d.rsi ? [
        { name: "RSI14", type: "line", xAxisIndex: 2, yAxisIndex: 2, data: d.rsi, smooth: true, lineStyle: { width: 1.5, color: "#fb923c" }, showSymbol: false },
        { name: "RSI 70", type: "line", xAxisIndex: 2, yAxisIndex: 2, data: d.dates.map(() => 70), lineStyle: { width: 0.8, color: "#f87171", type: "dashed" }, showSymbol: false },
        { name: "RSI 30", type: "line", xAxisIndex: 2, yAxisIndex: 2, data: d.dates.map(() => 30), lineStyle: { width: 0.8, color: "#34d399", type: "dashed" }, showSymbol: false },
      ] : []),
      { name: "OSC", type: "bar", xAxisIndex: 3, yAxisIndex: 3, data: d.macd.histogram.map(v => ({ value: v, itemStyle: { color: v >= 0 ? up : dn } })) },
      { name: "DIF", type: "line", xAxisIndex: 3, yAxisIndex: 3, data: d.macd.dif, smooth: true, lineStyle: { width: 1, color: "#38bdf8" }, showSymbol: false },
      { name: "DEA", type: "line", xAxisIndex: 3, yAxisIndex: 3, data: d.macd.dea, smooth: true, lineStyle: { width: 1, color: "#fb923c" }, showSymbol: false },
    ],
  };

  _klineChart.setOption(option);
  window.addEventListener("resize", () => _klineChart && _klineChart.resize());
}

// Legacy loading functions (still used by some code paths)
function loadResearchPanel(symbol) {
  // Legacy: now delegates to tab system; load default (kline) tab
  loadResearchTab(symbol, "kline");
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
// loadSymbol — clear cache on new symbol, load active tab
// ---------------------------------------------------------------------------
function loadSymbol(symbol) {
  const prev = currentSymbol;
  currentSymbol = symbol.toUpperCase();
  el("symbol-display").textContent = currentSymbol;

  // Clear tab cache when symbol changes
  if (prev !== currentSymbol) {
    _tabCache = {};
    if (_klineChart) { _klineChart.dispose(); _klineChart = null; }
  }

  loadQuote(currentSymbol);
  loadInterpretation(currentSymbol);

  // Load whichever tab is currently active
  const activeBtn = document.querySelector(".wb-tab-btn.active");
  const activeTab = activeBtn ? activeBtn.dataset.tab : "kline";
  loadResearchTab(currentSymbol, activeTab);
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

  // Quote refresh button
  const refreshBtn = el("quote-refresh-btn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      if (currentSymbol) loadQuote(currentSymbol);
    });
  }

  // Market badge + auto-refresh
  updateMarketBadge();
  setInterval(updateMarketBadge, 60000);
  startQuoteAutoRefresh();

  el("watchlist-add-btn").addEventListener("click", addToWatchlist);
  el("watchlist-input").addEventListener("keydown", e => { if (e.key === "Enter") addToWatchlist(); });

  el("alert-create-btn").addEventListener("click", createAlert);

  // Tab bar event delegation
  const tabBar = document.querySelector(".wb-tab-bar");
  if (tabBar) {
    tabBar.addEventListener("click", e => {
      const btn = e.target.closest(".wb-tab-btn");
      if (btn && btn.dataset.tab) {
        loadResearchTab(currentSymbol, btn.dataset.tab);
      }
    });
  }

  loadSymbol(currentSymbol);
  loadWatchlist();
  loadAlerts();
});
