(function () {
  'use strict';

  const SUBTABS = ['flow', 'calendar', 'us-macro', 'tw-macro', 'macro', 'overview', 'scan', 'trend', 'thread'];
  let _activeSubtab = 'flow';
  let _flowType = 'listed';
  let _scanType = 'strong';
  let _loaded = {};

  function el(id) { return document.getElementById(id); }

  // ── Sub-tab switching ──────────────────────────────────────────────────────

  function activateSubtab(name) {
    if (!SUBTABS.includes(name)) name = 'flow';
    _activeSubtab = name;

    SUBTABS.forEach(function (t) {
      const btn = document.querySelector('.mkt-tab-btn[data-tab="' + t + '"]');
      const panel = el('mkt-panel-' + t);
      if (btn) btn.classList.toggle('active', t === name);
      if (panel) panel.style.display = t === name ? '' : 'none';
    });

    if (!_loaded[name]) loadSubtab(name);
  }

  function loadSubtab(name) {
    if (name === 'flow') loadFlow();
    else if (name === 'calendar') loadCalendar();
    else if (name === 'us-macro') loadMacroDataPanel('us-macro', '/api/market/us-macro');
    else if (name === 'tw-macro') loadMacroDataPanel('tw-macro', '/api/market/tw-macro');
    else if (name === 'overview') loadOverview();
    else if (name === 'macro') loadMacro();
    else if (name === 'scan') loadScan();
    else if (name === 'trend') loadTrend();
    else if (name === 'thread') { /* user-triggered, don't auto-load */ }
  }

  // ── Generic helpers ────────────────────────────────────────────────────────

  function setLoading(panelId, msg) {
    const panel = el(panelId);
    if (!panel) return;
    panel.innerHTML = '<div class="mkt-loading">' + (msg || '載入中…') + '</div>';
  }

  function setError(panelId, msg) {
    const panel = el(panelId);
    if (!panel) return;
    panel.innerHTML = '<div class="mkt-error">' + msg + '</div>';
  }

  function lockRefresh(btnId) {
    const btn = el(btnId);
    if (btn) btn.disabled = true;
  }

  function unlockRefresh(btnId) {
    const btn = el(btnId);
    if (btn) btn.disabled = false;
  }

  async function apiFetch(url) {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  // ── 資金流向 ───────────────────────────────────────────────────────────────

  async function loadFlow() {
    const contentId = 'mkt-flow-content';
    setLoading(contentId);
    lockRefresh('mkt-flow-refresh');
    _loaded['flow'] = false;
    try {
      const data = await apiFetch('/api/market/flow?type=' + _flowType);
      renderFlow(contentId, data);
      _loaded['flow'] = true;
    } catch (e) {
      setError(contentId, '資金流向載入失敗：' + e.message);
    } finally {
      unlockRefresh('mkt-flow-refresh');
    }
  }

  function renderFlow(containerId, data) {
    const panel = el(containerId);
    if (!panel) return;
    if (!data.rows || data.rows.length === 0) {
      panel.innerHTML = '<div class="mkt-empty">目前無資料（資金流向尚未更新）</div>';
      return;
    }

    const dateLabel = data.date ? '資料日期：' + data.date : '';
    const rows = data.rows;

    // Sort for top gainers / top losers / by value
    const byValue = [...rows].sort((a, b) => (b.total_value || 0) - (a.total_value || 0)).slice(0, 8);
    const gainers = [...rows].sort((a, b) => (b.avg_change_pct || 0) - (a.avg_change_pct || 0)).slice(0, 5);
    const losers = [...rows].sort((a, b) => (a.avg_change_pct || 0) - (b.avg_change_pct || 0)).slice(0, 5);

    function fmtVal(v) {
      if (!v && v !== 0) return '-';
      const n = Number(v);
      if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
      if (n >= 1e6) return (n / 1e6).toFixed(0) + 'M';
      return n.toFixed(0);
    }

    function fmtPct(v) {
      if (v === null || v === undefined) return '-';
      const n = Number(v);
      const sign = n >= 0 ? '+' : '';
      return sign + n.toFixed(2) + '%';
    }

    function pctClass(v) {
      if (v === null || v === undefined) return '';
      return Number(v) >= 0 ? 'mkt-up' : 'mkt-dn';
    }

    function sectorRows(arr) {
      return arr.map(function (r) {
        return '<tr><td>' + (r.sector || '-') + '</td>'
          + '<td class="' + pctClass(r.avg_change_pct) + '">' + fmtPct(r.avg_change_pct) + '</td>'
          + '<td>' + fmtVal(r.total_value) + '</td></tr>';
      }).join('');
    }

    panel.innerHTML =
      '<div class="mkt-date-label">' + dateLabel + '</div>'
      + '<div class="mkt-flow-grid">'
      + '<div class="mkt-flow-card"><div class="mkt-flow-card-title">💰 金流點名（成交量）</div>'
      + '<table class="mkt-table"><thead><tr><th>板塊</th><th>漲跌</th><th>成交</th></tr></thead>'
      + '<tbody>' + sectorRows(byValue) + '</tbody></table></div>'
      + '<div class="mkt-flow-card"><div class="mkt-flow-card-title">🚀 領漲排行</div>'
      + '<table class="mkt-table"><thead><tr><th>板塊</th><th>漲跌</th><th>成交</th></tr></thead>'
      + '<tbody>' + sectorRows(gainers) + '</tbody></table></div>'
      + '<div class="mkt-flow-card"><div class="mkt-flow-card-title">📉 領跌排行</div>'
      + '<table class="mkt-table"><thead><tr><th>板塊</th><th>漲跌</th><th>成交</th></tr></thead>'
      + '<tbody>' + sectorRows(losers) + '</tbody></table></div>'
      + '</div>';
  }

  // ── 財經日曆 ───────────────────────────────────────────────────────────────

  async function buildCalendarCache(contentId) {
    const panel = el(contentId);
    if (panel) panel.innerHTML = '<div class="mkt-loading">⏳ 正在抓取財經日曆資料，請稍候…</div>';
    lockRefresh('mkt-calendar-refresh');
    try {
      const res = await fetch('/api/market/calendar/refresh', { method: 'POST' });
      const result = await res.json();
      if (result.ok) {
        await loadCalendar();
      } else {
        if (panel) panel.innerHTML = '<div class="mkt-error">❌ 建立失敗：' + (result.error || '未知錯誤') + '</div>';
        unlockRefresh('mkt-calendar-refresh');
      }
    } catch (e) {
      if (panel) panel.innerHTML = '<div class="mkt-error">❌ 請求失敗：' + e.message + '</div>';
      unlockRefresh('mkt-calendar-refresh');
    }
  }

  async function loadCalendar() {
    const contentId = 'mkt-calendar-content';
    setLoading(contentId);
    lockRefresh('mkt-calendar-refresh');
    _loaded['calendar'] = false;
    try {
      const data = await apiFetch('/api/market/calendar');
      renderCalendar(contentId, data);
      _loaded['calendar'] = true;
    } catch (e) {
      setError(contentId, '財經日曆載入失敗：' + e.message);
    } finally {
      unlockRefresh('mkt-calendar-refresh');
    }
  }

  function renderCalendar(containerId, data) {
    const panel = el(containerId);
    if (!panel) return;

    // Handle both array (direct cache) and object with events key
    const events = Array.isArray(data) ? data
      : (data.events || data.upcoming || data.items || null);

    if (data && data.note === 'no_cache') {
      panel.innerHTML =
        '<div class="mkt-empty" style="display:flex;flex-direction:column;align-items:center;gap:0.75em">' +
          '<span>尚無快取，點下方按鈕立即建立。</span>' +
          '<button class="mkt-refresh-btn" id="mkt-calendar-build-btn">立即建立日曆快取</button>' +
        '</div>';
      const buildBtn = document.getElementById('mkt-calendar-build-btn');
      if (buildBtn) buildBtn.addEventListener('click', function () { buildCalendarCache(containerId); });
      return;
    }
    if (!Array.isArray(data) && data.error) {
      setError(containerId, '財經日曆錯誤：' + data.error);
      return;
    }

    if (Array.isArray(events) && events.length > 0) {
      // importance: "1"=高, "2"=中, "3"=低 (Cnyes convention)
      function impLabel(v) {
        return v === '1' ? '高' : v === '2' ? '中' : v === '3' ? '低' : (v || '-');
      }
      function impClass(v) {
        return v === '1' || v === 'HIGH' || v === '高' ? 'mkt-impact-high'
          : v === '2' || v === 'MEDIUM' || v === '中' ? 'mkt-impact-med'
          : 'mkt-impact-low';
      }
      const rows = events.map(function (ev) {
        const date = ev.date || ev.event_date || '';
        const time = ev.time || '';
        const country = ev.country || '';
        const title = ev.subject || ev.title || ev.name || ev.event || JSON.stringify(ev);
        const imp = String(ev.importance || ev.impact || '');
        return '<tr>'
          + '<td>' + date + (time ? '<br><span style="color:var(--muted);font-size:11px">' + time + '</span>' : '') + '</td>'
          + '<td>' + (country ? '<span style="color:var(--muted);font-size:11px">' + country + '　</span>' : '') + title + '</td>'
          + '<td><span class="mkt-impact-badge ' + impClass(imp) + '">' + impLabel(imp) + '</span></td>'
          + '</tr>';
      }).join('');
      panel.innerHTML = '<table class="mkt-table mkt-table-full">'
        + '<thead><tr><th>日期</th><th>事件</th><th>重要度</th></tr></thead>'
        + '<tbody>' + rows + '</tbody></table>';
    } else {
      panel.innerHTML = '<div class="mkt-empty">目前無日曆資料。</div>';
    }
  }

  // ── 市場總覽 ───────────────────────────────────────────────────────────────

  async function loadOverview() {
    const contentId = 'mkt-overview-content';
    setLoading(contentId, '分析市場數據中，約需 10-30 秒…');
    lockRefresh('mkt-overview-refresh');
    _loaded['overview'] = false;
    try {
      const data = await apiFetch('/api/market/overview');
      renderOverview(contentId, data);
      _loaded['overview'] = true;
    } catch (e) {
      setError(contentId, '市場總覽載入失敗：' + e.message);
    } finally {
      unlockRefresh('mkt-overview-refresh');
    }
  }

  function renderOverview(containerId, data) {
    const panel = el(containerId);
    if (!panel) return;
    if (data.error) {
      setError(containerId, '市場總覽：' + data.error);
      return;
    }

    function fmtPct(v, decimals) {
      if (v === null || v === undefined) return '-';
      const n = Number(v);
      const d = decimals !== undefined ? decimals : 2;
      return (n >= 0 ? '+' : '') + n.toFixed(d) + '%';
    }
    function pctCls(v) { return Number(v) >= 0 ? 'mkt-up' : 'mkt-dn'; }

    // ── 市場情緒 ──
    function renderSentiment(s) {
      if (!s) return '<div class="mkt-empty">無資料</div>';
      const regimeLabel = { Bullish: '多頭', Bearish: '空頭', Neutral: '中性' }[s.regime] || s.regime;
      const scoreColor = s.score >= 60 ? '#4ade80' : s.score <= 40 ? '#f87171' : '#facc15';
      return '<div class="mkt-sentiment-row">'
        + '<div class="mkt-score-circle" style="border-color:' + scoreColor + ';color:' + scoreColor + '">' + (s.score || '-') + '</div>'
        + '<div><div class="mkt-regime-label">' + regimeLabel + '</div>'
        + '<div style="font-size:12px;color:var(--muted);margin-top:4px">'
        + 'PCR ' + (s.metrics && s.metrics.pcr !== undefined ? Number(s.metrics.pcr).toFixed(2) : '-')
        + '　散戶比 ' + (s.metrics && s.metrics.retail_ratio !== undefined ? (Number(s.metrics.retail_ratio) * 100).toFixed(1) + '%' : '-')
        + '</div></div></div>'
        + (s.reasons && s.reasons.length ? '<ul class="mkt-reasons" style="margin-top:10px">' + s.reasons.map(function(r){ return '<li>' + r + '</li>'; }).join('') + '</ul>' : '');
    }

    // ── 板塊輪動 ──
    function renderSector(s) {
      if (!s) return '<div class="mkt-empty">無資料</div>';
      function sectorRow(item) {
        return '<tr><td>' + item.name + '</td>'
          + '<td class="' + pctCls(item.change_1d) + '">' + fmtPct(item.change_1d) + '</td>'
          + '<td class="' + pctCls(item.change_5d) + '">' + fmtPct(item.change_5d) + '</td>'
          + '<td class="' + pctCls(item.change_20d) + '">' + fmtPct(item.change_20d) + '</td>'
          + '</tr>';
      }
      const colHead = '<thead><tr><th>板塊</th><th>1日</th><th>5日</th><th>20日</th></tr></thead>';
      return '<div style="margin-bottom:10px;font-size:12px;color:var(--muted)">共 ' + (s.total_sectors || '-') + ' 個板塊</div>'
        + '<div style="margin-bottom:6px;font-size:12px;font-weight:600;color:#4ade80">🚀 領漲</div>'
        + '<table class="mkt-table">' + colHead + '<tbody>' + (s.leading || []).map(sectorRow).join('') + '</tbody></table>'
        + '<div style="margin:12px 0 6px;font-size:12px;font-weight:600;color:#f87171">📉 落後</div>'
        + '<table class="mkt-table">' + colHead + '<tbody>' + (s.lagging || []).map(sectorRow).join('') + '</tbody></table>';
    }

    // ── 主力資金 ──
    function renderSmartMoney(s) {
      if (!s) return '<div class="mkt-empty">無資料</div>';
      const signalColor = s.signal === 'Bullish' ? '#4ade80' : s.signal === 'Bearish' ? '#f87171' : '#facc15';
      const signalLabel = { Bullish: '多頭', Bearish: '空頭', Neutral: '中性' }[s.signal] || (s.signal || '-');
      return '<div class="mkt-smart-grid">'
        + '<div class="mkt-smart-item"><div class="mkt-smart-val" style="color:' + signalColor + '">' + signalLabel + '</div><div class="mkt-smart-key">信號</div></div>'
        + '<div class="mkt-smart-item"><div class="mkt-smart-val">' + (s.top10_net_oi !== undefined ? s.top10_net_oi : '-') + '</div><div class="mkt-smart-key">前10大淨OI</div></div>'
        + '<div class="mkt-smart-item"><div class="mkt-smart-val ' + pctCls(s.oi_change_1d) + '">' + (s.oi_change_1d !== undefined ? (s.oi_change_1d >= 0 ? '+' : '') + s.oi_change_1d : '-') + '</div><div class="mkt-smart-key">OI 日變化</div></div>'
        + '<div class="mkt-smart-item"><div class="mkt-smart-val">' + (s.long_ratio !== undefined ? (Number(s.long_ratio) * 100).toFixed(1) + '%' : '-') + '</div><div class="mkt-smart-key">多方比例</div></div>'
        + '</div>';
    }

    const date = (data.sentiment && data.sentiment.date) || data.date || '';
    panel.innerHTML =
      '<div class="mkt-date-label">' + date + '</div>'
      + '<div class="mkt-overview-grid">'
      + '<div class="mkt-overview-card"><div class="mkt-overview-card-title">市場情緒</div>' + renderSentiment(data.sentiment) + '</div>'
      + '<div class="mkt-overview-card"><div class="mkt-overview-card-title">板塊輪動</div>' + renderSector(data.sector) + '</div>'
      + '<div class="mkt-overview-card"><div class="mkt-overview-card-title">主力資金</div>' + renderSmartMoney(data.smart_money) + '</div>'
      + '</div>';
  }

  // ── 總經分析 ───────────────────────────────────────────────────────────────

  async function loadMacro() {
    const contentId = 'mkt-macro-content';
    setLoading(contentId, '載入總經數據…');
    lockRefresh('mkt-macro-refresh');
    _loaded['macro'] = false;
    try {
      const data = await apiFetch('/api/market/macro');
      renderMacro(contentId, data);
      _loaded['macro'] = true;
    } catch (e) {
      setError(contentId, '總經分析載入失敗：' + e.message);
    } finally {
      unlockRefresh('mkt-macro-refresh');
    }
  }

  function renderMacroDataPanel(containerId, data) {
    const panel = el(containerId);
    if (!panel) return;

    if (data && data.error) {
      setError(containerId, data.error);
      return;
    }

    const groups = Array.isArray(data.groups) ? data.groups : [];
    const updatedAt = data.updated_at || data.generated_at || '';
    const freshness = data.freshness || {};
    const freshnessBits = [];
    if (freshness.latest_date) freshnessBits.push('最新資料日：' + freshness.latest_date);
    if (freshness.source) freshnessBits.push('來源：' + freshness.source);
    if (freshness.note) freshnessBits.push(freshness.note);
    if (updatedAt) freshnessBits.push('更新：' + updatedAt.replace('T', ' ').slice(0, 19));

    if (!groups.length) {
      panel.innerHTML = '<div class="mkt-empty mkt-data-empty">' + escapeHtml(data.fallback_message || '目前沒有可顯示的資料。') + '</div>';
      return;
    }

    function renderMetricCard(item) {
      const value = item.value === null || item.value === undefined || item.value === '' ? '—' : item.value;
      const displayValue = item.display_value === null || item.display_value === undefined || item.display_value === ''
        ? null
        : item.display_value;
      const change = item.change_pct;
      const valueText = displayValue !== null
        ? escapeHtml(String(displayValue))
        : (typeof value === 'number' ? (Math.abs(value) >= 1000 ? value.toLocaleString('zh-TW', { maximumFractionDigits: 2 }) : value.toFixed(2)) : escapeHtml(String(value)));
      const changeText = change === null || change === undefined || change === '' ? '' : (Number(change) >= 0 ? '+' : '') + Number(change).toFixed(2) + '%';
      const changeCls = change === null || change === undefined || change === '' ? 'mkt-data-change-neutral' : (Number(change) >= 0 ? 'mkt-up' : 'mkt-dn');
      const metaBits = [];
      if (item.date) metaBits.push('資料日 ' + item.date);
      if (item.source) metaBits.push(item.source);
      return '<article class="mkt-data-item mkt-data-item-metric">'
        + '<div class="mkt-data-item-name">' + escapeHtml(item.name || item.symbol || '') + '</div>'
        + '<div class="mkt-data-item-value" title="' + escapeHtml(String(value)) + '">' + valueText + '</div>'
        + (changeText ? '<div class="mkt-data-item-change ' + changeCls + '">' + changeText + '</div>' : '')
        + (metaBits.length ? '<div class="mkt-data-item-meta">' + escapeHtml(metaBits.join(' · ')) + '</div>' : '')
        + '</article>';
    }

    function renderStatusCard(item) {
      const metaBits = [];
      if (item.date) metaBits.push('資料日 ' + item.date);
      if (item.note) metaBits.push(item.note);
      return '<article class="mkt-data-item mkt-data-item-status">'
        + '<div class="mkt-data-item-name">' + escapeHtml(item.name || item.symbol || '') + '</div>'
        + '<div class="mkt-data-status-pill">' + escapeHtml(item.value === null || item.value === undefined || item.value === '' ? '—' : item.value) + '</div>'
        + (metaBits.length ? '<div class="mkt-data-item-meta">' + escapeHtml(metaBits.join(' · ')) + '</div>' : '')
        + '</article>';
    }

    function renderItem(item) {
      if (!item) return '';
      if (item.kind === 'status') return renderStatusCard(item);
      return renderMetricCard(item);
    }

    const groupsHtml = groups.map(function (group) {
      const items = Array.isArray(group.items) ? group.items : [];
      const rendered = items.map(renderItem).filter(Boolean).join('');
      return '<section class="mkt-data-group">'
        + '<div class="mkt-data-group-head">'
        + '<div>'
        + '<div class="mkt-data-group-title">' + escapeHtml(group.label || group.key || '') + '</div>'
        + (group.subtitle ? '<div class="mkt-data-group-subtitle">' + escapeHtml(group.subtitle) + '</div>' : '')
        + '</div>'
        + '</div>'
        + (rendered ? '<div class="mkt-data-grid">' + rendered + '</div>' : '<div class="mkt-empty mkt-data-empty">目前沒有可顯示的項目。</div>')
        + '</section>';
    }).join('');

    panel.innerHTML =
      '<div class="mkt-data-layout">'
      + '<section class="mkt-data-hero">'
      + '<div class="mkt-data-hero-top">'
      + '<span class="mkt-data-panel-pill">' + escapeHtml(data.title || '') + '</span>'
      + (freshnessBits.length ? '<span class="mkt-data-freshness">' + escapeHtml(freshnessBits.join(' · ')) + '</span>' : '')
      + '</div>'
      + '<div class="mkt-data-hero-note">原始資料面板，保留來源日期與更新狀態，方便比對蒐集結果與摘要面板。</div>'
      + '</section>'
      + groupsHtml
      + '</div>';
  }

  async function loadMacroDataPanel(name, url) {
    const contentId = 'mkt-' + name + '-content';
    const refreshId = 'mkt-' + name + '-refresh';
    setLoading(contentId, '載入資料中…');
    lockRefresh(refreshId);
    _loaded[name] = false;
    try {
      const data = await apiFetch(url);
      renderMacroDataPanel(contentId, data);
      _loaded[name] = true;
    } catch (e) {
      setError(contentId, '資料載入失敗：' + e.message);
    } finally {
      unlockRefresh(refreshId);
    }
  }

  async function manualRefreshTwMacro() {
    const contentId = 'mkt-tw-macro-content';
    const refreshId = 'mkt-tw-macro-refresh';
    const updateId = 'mkt-tw-macro-update';
    setLoading(contentId, '手動更新台灣總經資料中，請稍候…');
    lockRefresh(refreshId);
    lockRefresh(updateId);
    _loaded['tw-macro'] = false;
    try {
      const res = await fetch('/api/market/tw-macro/refresh', { method: 'POST' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      renderMacroDataPanel(contentId, data);
      _loaded['tw-macro'] = true;
    } catch (e) {
      setError(contentId, '台灣總經手動更新失敗：' + e.message);
    } finally {
      unlockRefresh(refreshId);
      unlockRefresh(updateId);
    }
  }

  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function cleanReason(reason) {
    return String(reason || '').replace(/\s+/g, ' ').trim().replace(/[。．.]+$/, '');
  }

  function buildMacroSummary(levelLabel, reasons) {
    const cleaned = (reasons || []).map(cleanReason).filter(Boolean);
    if (cleaned.length === 0) {
      return '目前沒有足夠的異常訊號，總經風險維持在可觀察區間。';
    }
    const lead = cleaned.slice(0, 2).join('；');
    return levelLabel + '｜' + lead;
  }

  function hasMacroIndicators(indicators) {
    return indicators && Object.keys(indicators).some(function (k) {
      return indicators[k] && typeof indicators[k] === 'object';
    });
  }

  function renderMacroReasons(reasons) {
    const items = (reasons || []).map(function (reason) {
      const text = cleanReason(reason);
      if (!text) return '';
      return '<li class="mkt-macro-reason"><span class="mkt-macro-reason-dot"></span><span>' + escapeHtml(text) + '</span></li>';
    }).filter(Boolean).join('');

    if (!items) {
      return '<div class="mkt-empty mkt-macro-empty">目前沒有可列出的原因訊號。</div>';
    }

    return '<ul class="mkt-macro-reasons">' + items + '</ul>';
  }

  function renderMacroIndicators(indicators) {
    const indKeys = ['TSM', 'Nasdaq_Fut', 'SP500_Fut', 'USDTWD', 'N225'];
    const labels = {
      TSM: 'TSM ADR',
      Nasdaq_Fut: 'Nasdaq 期貨',
      SP500_Fut: 'S&P 500 期貨',
      USDTWD: '美元/台幣',
      N225: '日經 225',
    };

    const cards = indKeys.filter(function (key) {
      return indicators && indicators[key];
    }).map(function (key) {
      const item = indicators[key];
      const pct = item.pct_change !== undefined ? Number(item.pct_change) : null;
      const price = item.price !== undefined ? Number(item.price) : null;
      const pctText = pct === null || Number.isNaN(pct) ? '—' : (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%';
      const priceText = price === null || Number.isNaN(price) ? '—' : price.toFixed(2);
      const cls = pct === null || Number.isNaN(pct) ? 'mkt-macro-indicator-neutral' : (pct >= 0 ? 'mkt-up' : 'mkt-dn');
      return '<article class="mkt-macro-indicator-card">'
        + '<div class="mkt-macro-indicator-name">' + escapeHtml(labels[key] || key) + '</div>'
        + '<div class="mkt-macro-indicator-price">' + escapeHtml(priceText) + '</div>'
        + '<div class="mkt-macro-indicator-pct ' + cls + '">' + escapeHtml(pctText) + '</div>'
        + '</article>';
    }).join('');

    if (!cards) {
      return '<div class="mkt-empty mkt-macro-empty">目前沒有可顯示的核心指標。</div>';
    }

    return '<div class="mkt-macro-indicator-grid">' + cards + '</div>';
  }

  function renderMacro(containerId, data) {
    const panel = el(containerId);
    if (!panel) return;
    const levelMap = { GREEN: { label: '安全', cls: 'mkt-level-green' }, YELLOW: { label: '警戒', cls: 'mkt-level-yellow' }, RED: { label: '危險', cls: 'mkt-level-red' }, UNKNOWN: { label: '未知', cls: '' } };
    const lv = levelMap[data.level] || levelMap['UNKNOWN'];

    const reasons = Array.isArray(data.reasons) ? data.reasons : [];
    const indicators = data.indicators || {};
    const summary = buildMacroSummary(lv.label, reasons);
    const shouldFallback = data.level === 'UNKNOWN' && reasons.length === 0 && !hasMacroIndicators(indicators);

    panel.innerHTML =
      '<div class="mkt-macro-layout">'
      + '<section class="mkt-macro-hero ' + (lv.cls || 'mkt-level-unknown') + '">'
      + '<div class="mkt-macro-hero-top">'
      + '<span class="mkt-level-badge ' + lv.cls + '">' + lv.label + '</span>'
      + '</div>'
      + '<h3 class="mkt-macro-summary">' + escapeHtml(summary) + '</h3>'
      + '<p class="mkt-macro-context">摘要只根據現有的總經結果與原因訊號整理，不會額外推演新結論。</p>'
      + '</section>'
      + '<div class="mkt-macro-sections">'
      + '<section class="mkt-macro-section">'
      + '<div class="mkt-macro-section-head">'
      + '<span class="mkt-macro-section-title">判斷原因</span>'
      + '<span class="mkt-macro-section-note">Evidence</span>'
      + '</div>'
      + (shouldFallback ? '<div class="mkt-empty mkt-macro-empty">目前資料不足，暫時無法整理出可靠的總經摘要。</div>' : renderMacroReasons(reasons))
      + '</section>'
      + '<section class="mkt-macro-section">'
      + '<div class="mkt-macro-section-head">'
      + '<span class="mkt-macro-section-title">核心指標</span>'
      + '<span class="mkt-macro-section-note">Detail</span>'
      + '</div>'
      + renderMacroIndicators(indicators)
      + '</section>'
      + '</div>'
      + '</div>';
  }

  // ── 強勢掃描 ───────────────────────────────────────────────────────────────

  function renderScanText(text) {
    // Parse structured text: header + numbered stock entries
    // Format: "N. **name** (code)\n   emoji key: value\n..."
    var lines = text.split('\n');
    var title = '';
    var date = '';
    var stocks = [];
    var current = null;

    // Strip **bold** markers for display
    function stripBold(s) { return s.replace(/\*\*/g, ''); }
    // Strip leading emojis and whitespace from a string
    function stripEmoji(s) { return s.replace(/^[\s\u{1F000}-\u{1FFFF}\u{2600}-\u{27FF}\u{FE00}-\u{FEFF}💰📊📦💥📅🔸🔹⚠️❌✅🚀📈📉💡🐋🌊]+/gu, '').trim(); }

    lines.forEach(function (line) {
      var trimmed = line.trim();
      if (!trimmed) return;

      // Header: lines with ** that aren't stock entries
      var stockMatch = trimmed.match(/^(\d+)\.\s*\*\*(.+?)\*\*\s*[（(]([^)）]+)[)）]/);
      if (stockMatch) {
        current = { rank: parseInt(stockMatch[1]), name: stockMatch[2], code: stockMatch[3], details: [] };
        stocks.push(current);
        return;
      }

      // Detail line under a stock (indented or starts with emoji)
      if (current && (line.startsWith('   ') || line.startsWith('\t') || /^[\s]*[^\d]/.test(line))) {
        var detail = stripEmoji(trimmed);
        if (detail && !detail.startsWith('*') && detail.length > 1) {
          current.details.push(detail);
        }
        return;
      }

      // Title / date line
      if (!current) {
        var clean = stripBold(stripEmoji(trimmed));
        if (/^\d{4}-\d{2}-\d{2}/.test(clean)) {
          date = clean;
        } else if (clean) {
          title = title || clean;
        }
      }
    });

    // Fallback: no structured data found
    if (stocks.length === 0) {
      return '<pre class="mkt-pretext">' + text + '</pre>';
    }

    var header = '<div class="mkt-scan-header">'
      + '<span class="mkt-scan-title">' + (title || '掃描結果') + '</span>'
      + (date ? '<span class="mkt-scan-date">' + date + '</span>' : '')
      + '</div>';

    var cards = stocks.map(function (s) {
      var details = s.details.map(function (d) {
        var parts = d.split(':');
        if (parts.length >= 2) {
          var key = parts[0].trim();
          var val = parts.slice(1).join(':').trim();
          // Color change percentage values
          var valHtml = val;
          if (/[+-]?\d+\.?\d*%/.test(val)) {
            var numMatch = val.match(/([+-]?\d+\.?\d*)%/);
            if (numMatch) {
              var cls = parseFloat(numMatch[1]) >= 0 ? 'mkt-up' : 'mkt-dn';
              valHtml = val.replace(numMatch[0], '<span class="' + cls + '">' + numMatch[0] + '</span>');
            }
          }
          return '<div class="mkt-scan-detail"><span class="mkt-scan-key">' + key + '</span><span class="mkt-scan-val">' + valHtml + '</span></div>';
        }
        return '<div class="mkt-scan-detail mkt-scan-full">' + d + '</div>';
      }).join('');

      return '<div class="mkt-scan-card">'
        + '<div class="mkt-scan-card-head">'
        + '<span class="mkt-scan-rank">' + s.rank + '</span>'
        + '<span class="mkt-scan-name">' + s.name + '</span>'
        + '<span class="mkt-scan-code">' + s.code + '</span>'
        + '</div>'
        + (details ? '<div class="mkt-scan-card-body">' + details + '</div>' : '')
        + '</div>';
    }).join('');

    return header + '<div class="mkt-scan-grid">' + cards + '</div>';
  }

  async function loadScan() {
    const contentId = 'mkt-scan-content';
    setLoading(contentId, '掃描中，請稍候（約 10-30 秒）…');
    lockRefresh('mkt-scan-refresh');
    _loaded['scan'] = false;
    try {
      const data = await apiFetch('/api/market/scan?type=' + _scanType);
      const panel = el(contentId);
      if (panel) {
        var text = (data.text || '（無資料）');
        // Strip LINE bot usage instructions
        var cutIdx = text.search(/💡\s*\*?\*?使用方式/);
        if (cutIdx !== -1) text = text.slice(0, cutIdx).trimEnd();
        panel.innerHTML = renderScanText(text);
      }
      _loaded['scan'] = true;
    } catch (e) {
      setError(contentId, '掃描失敗：' + e.message);
    } finally {
      unlockRefresh('mkt-scan-refresh');
    }
  }

  // ── 市場趨勢 ───────────────────────────────────────────────────────────────

  async function loadTrend() {
    const contentId = 'mkt-trend-content';
    setLoading(contentId, '分析市場趨勢中，約需 15-30 秒…');
    lockRefresh('mkt-trend-refresh');
    _loaded['trend'] = false;
    try {
      const data = await apiFetch('/api/market/trend');
      renderTrend(contentId, data);
      _loaded['trend'] = true;
    } catch (e) {
      setError(contentId, '趨勢分析失敗：' + e.message);
    } finally {
      unlockRefresh('mkt-trend-refresh');
    }
  }

  function renderTrend(containerId, data) {
    const panel = el(containerId);
    if (!panel) return;
    if (!data.themes || data.themes.length === 0) {
      panel.innerHTML = '<div class="mkt-empty">' + (data.summary || '暫無資料') + '</div>';
      return;
    }

    const signalColor = { '強勢共振': '#4ade80', '背離': '#f87171', '轉強中': '#facc15' };

    const cards = data.themes.map(function (t) {
      const score = Number(t.score || 0);
      const scoreColor = score >= 70 ? '#4ade80' : score >= 40 ? '#facc15' : '#f87171';
      const sigColor = signalColor[t.signal_type] || 'var(--muted)';
      return '<div class="mkt-trend-card">'
        + '<div class="mkt-trend-card-head">'
        + '<span class="mkt-trend-name">' + (t.name || '') + '</span>'
        + '<span class="mkt-trend-signal" style="color:' + sigColor + '">' + (t.signal_type || '') + '</span>'
        + '<span class="mkt-score-pill" style="border-color:' + scoreColor + ';color:' + scoreColor + '">' + score + '</span>'
        + '</div>'
        + (t.insight ? '<div class="mkt-trend-insight">' + t.insight + '</div>' : '')
        + (t.evidence_summary ? '<div class="mkt-trend-evidence">📊 ' + t.evidence_summary + '</div>' : '')
        + '</div>';
    }).join('');

    const meta = data.raw_count ? '<div class="mkt-date-label">分析報告數：' + data.raw_count + ' 篇</div>' : '';
    const summary = data.summary ? '<div class="mkt-trend-summary">' + data.summary + '</div>' : '';

    panel.innerHTML = meta + cards + summary;
  }

  // ── Threads ─────────────────────────────────────────────────────────────────

  async function loadThread(username) {
    const contentId = 'mkt-thread-content';
    if (!username) return;
    setLoading(contentId, '抓取 @' + username + ' 的貼文並分析中，約需 15-30 秒…');
    lockRefresh('mkt-thread-go');
    try {
      const data = await apiFetch('/api/market/thread?username=' + encodeURIComponent(username));
      const panel = el(contentId);
      if (panel) {
        // Convert **bold** and ── separators to HTML
        var html = (data.text || '（無資料）')
          .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
          .replace(/──+/g, '<hr class="mkt-thread-hr">')
          .replace(/\n/g, '<br>');
        panel.innerHTML = '<div class="mkt-thread-report">' + html + '</div>';
      }
    } catch (e) {
      setError(contentId, '分析失敗：' + e.message);
    } finally {
      unlockRefresh('mkt-thread-go');
    }
  }

  // ── Public entry ───────────────────────────────────────────────────────────

  window.marketLoad = function () {
    if (!el('mkt-panel-flow')) return;
    _loaded = {};
    activateSubtab('flow');
  };

  // ── Events ─────────────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', function () {
    // Sub-tab clicks
    var tabBar = document.querySelector('.mkt-tab-bar');
    if (tabBar) {
      tabBar.addEventListener('click', function (e) {
        var btn = e.target.closest('.mkt-tab-btn');
        if (btn && btn.dataset.tab) activateSubtab(btn.dataset.tab);
      });
    }

    // Flow type filter
    var flowFilter = document.querySelector('.mkt-flow-filter');
    if (flowFilter) {
      flowFilter.addEventListener('click', function (e) {
        var btn = e.target.closest('.mkt-filter-btn');
        if (!btn) return;
        flowFilter.querySelectorAll('.mkt-filter-btn').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        _flowType = btn.dataset.type || 'listed';
        _loaded['flow'] = false;
        loadFlow();
      });
    }

    // Scan type filter
    var scanFilter = document.querySelector('.mkt-scan-filter');
    if (scanFilter) {
      scanFilter.addEventListener('click', function (e) {
        var btn = e.target.closest('.mkt-filter-btn');
        if (!btn) return;
        scanFilter.querySelectorAll('.mkt-filter-btn').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        _scanType = btn.dataset.type || 'strong';
        _loaded['scan'] = false;
        loadScan();
      });
    }

    // Refresh buttons
    ['flow', 'us-macro', 'tw-macro', 'overview', 'macro', 'scan', 'trend'].forEach(function (name) {
      var btn = el('mkt-' + name + '-refresh');
      if (btn) {
        btn.addEventListener('click', function () {
          _loaded[name] = false;
          loadSubtab(name);
        });
      }
    });

    var twMacroUpdateBtn = el('mkt-tw-macro-update');
    if (twMacroUpdateBtn) {
      twMacroUpdateBtn.addEventListener('click', function () {
        manualRefreshTwMacro();
      });
    }

    // Calendar refresh — always goes through the build endpoint
    var calRefreshBtn = el('mkt-calendar-refresh');
    if (calRefreshBtn) {
      calRefreshBtn.addEventListener('click', function () {
        buildCalendarCache('mkt-calendar-content');
      });
    }

    // Threads preset buttons
    document.querySelectorAll('.mkt-thread-preset').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var uname = btn.dataset.username || '';
        var input = el('mkt-thread-input');
        if (input) input.value = uname;
        loadThread(uname);
      });
    });

    // Threads go button + enter key
    var threadGo = el('mkt-thread-go');
    var threadInput = el('mkt-thread-input');
    if (threadGo) {
      threadGo.addEventListener('click', function () {
        var uname = (threadInput ? threadInput.value : '').trim();
        if (uname) loadThread(uname);
      });
    }
    if (threadInput) {
      threadInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          var uname = threadInput.value.trim();
          if (uname) loadThread(uname);
        }
      });
    }
  });
})();
