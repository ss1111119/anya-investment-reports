(function () {
  'use strict';

  const SUBTABS = ['flow', 'calendar', 'overview', 'macro', 'scan', 'trend', 'thread'];
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
      panel.innerHTML = '<div class="mkt-empty">日曆快取尚未建立，請等待下次定期更新或透過 LINE bot /cal 指令觸發。</div>';
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

  function renderMacro(containerId, data) {
    const panel = el(containerId);
    if (!panel) return;
    const levelMap = { GREEN: { label: '安全', cls: 'mkt-level-green' }, YELLOW: { label: '警戒', cls: 'mkt-level-yellow' }, RED: { label: '危險', cls: 'mkt-level-red' }, UNKNOWN: { label: '未知', cls: '' } };
    const lv = levelMap[data.level] || levelMap['UNKNOWN'];

    const reasons = (data.reasons || []).map(function (r) {
      return '<li>' + r + '</li>';
    }).join('');

    const indKeys = ['TSM', 'Nasdaq_Fut', 'SP500_Fut', 'USDTWD', 'N225'];
    const indRows = indKeys.filter(function (k) { return data.indicators && data.indicators[k]; }).map(function (k) {
      const v = data.indicators[k];
      const pct = v.pct_change !== undefined ? v.pct_change : null;
      const price = v.price !== undefined ? v.price : null;
      const pctStr = pct !== null ? (pct >= 0 ? '+' : '') + Number(pct).toFixed(2) + '%' : '';
      const priceStr = price !== null ? Number(price).toFixed(2) : '';
      const cls = pct !== null ? (pct >= 0 ? 'mkt-up' : 'mkt-dn') : '';
      return '<tr><td>' + k + '</td><td>' + priceStr + '</td><td class="' + cls + '">' + pctStr + '</td></tr>';
    }).join('');

    panel.innerHTML =
      '<div class="mkt-macro-header">'
      + '<span class="mkt-level-badge ' + lv.cls + '">' + lv.label + '</span>'
      + '</div>'
      + '<ul class="mkt-reasons">' + reasons + '</ul>'
      + (indRows ? '<table class="mkt-table"><thead><tr><th>指標</th><th>價格</th><th>漲跌</th></tr></thead><tbody>' + indRows + '</tbody></table>' : '');
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
    ['flow', 'calendar', 'overview', 'macro', 'scan', 'trend'].forEach(function (name) {
      var btn = el('mkt-' + name + '-refresh');
      if (btn) {
        btn.addEventListener('click', function () {
          _loaded[name] = false;
          loadSubtab(name);
        });
      }
    });

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
