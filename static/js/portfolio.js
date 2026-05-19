(function () {
  'use strict';

  const STOP_LOSS_DEFAULT   = -30;
  const TAKE_PROFIT_DEFAULT = 150;

  var _positions = [];
  var _addFormOpen = false;

  let sortKey     = 'pnlPct';
  let sortDir     = -1;
  let filterMode  = 'all';
  let slThreshold = STOP_LOSS_DEFAULT;
  let tpThreshold = TAKE_PROFIT_DEFAULT;
  const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 小時

  let _diagCache      = null; // { report, generatedAt }
  let _stockDiagCache = Object.create(null); // symbol → { report, generatedAt }
  let _overrides  = Object.create(null);
  let _editingSymbol = null;

  function getThresholds() {
    var slEl = document.getElementById('pf-sl-threshold');
    var tpEl = document.getElementById('pf-tp-threshold');
    slThreshold = slEl ? (parseFloat(slEl.value) || STOP_LOSS_DEFAULT)   : STOP_LOSS_DEFAULT;
    tpThreshold = tpEl ? (parseFloat(tpEl.value) || TAKE_PROFIT_DEFAULT) : TAKE_PROFIT_DEFAULT;
  }

  function signal(r) {
    if (r.pnlPct === null) return null;
    if (r.pnlPct <= slThreshold) return 'stop-loss';
    if (r.pnlPct >= tpThreshold) return 'take-profit';
    return null;
  }

  function fmt(n, decimals) {
    if (n === null || n === undefined) return '--';
    return n.toLocaleString('zh-TW', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }

  function fmtSigned(n) {
    if (n === null || n === undefined) return '<span class="pf-null">--</span>';
    var cls  = n >= 0 ? 'pf-up' : 'pf-down';
    var sign = n >= 0 ? '+' : '';
    return '<span class="' + cls + '">' + sign + n.toLocaleString('zh-TW') + '</span>';
  }

  function fmtPct(n) {
    if (n === null || n === undefined) return '<span class="pf-null">--</span>';
    var cls  = n >= 0 ? 'pf-up' : 'pf-down';
    var sign = n >= 0 ? '+' : '';
    return '<span class="' + cls + '">' + sign + n.toFixed(2) + '%</span>';
  }

  function escapeAttr(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function nameCellHtml(r) {
    var badges = '';
    if (r.type === 'etf')   badges += '<span class="pf-badge pf-badge-etf">ETF</span>';
    if (r.type === 'other') badges += '<span class="pf-badge pf-badge-other">金融商品</span>';
    var sig = signal(r);
    if (sig === 'stop-loss')   badges += '<span class="pf-badge pf-badge-sl">⚠ 停損</span>';
    if (sig === 'take-profit') badges += '<span class="pf-badge pf-badge-tp">✓ 停利</span>';
    var badgeHtml = badges ? ' ' + badges : '';

    if (r.symbol) {
      var sym = r.symbol.replace(/'/g, '');
      return '<a class="pf-name-link" href="#workbench" onclick="pfJumpToWorkbench(\'' + sym + '\');return false;">' +
        r.name + '</a>' + badgeHtml;
    }
    return r.name + badgeHtml;
  }

  function isCacheValid(entry) {
    return entry && entry.report && entry.generatedAt &&
      (Date.now() - entry.generatedAt) < CACHE_TTL_MS;
  }

  function fmtCacheTime(ts) {
    if (!ts) return '';
    var d   = new Date(ts);
    var now = new Date();
    var isToday = d.toDateString() === now.toDateString();
    var hhmm = d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0');
    return isToday ? ('生成於 ' + hhmm) : ('生成於 ' + (d.getMonth()+1) + '/' + d.getDate() + ' ' + hhmm);
  }

  function loadDiagCache() {
    try {
      var raw = localStorage.getItem('anya-pf-diag');
      if (raw) {
        var parsed = JSON.parse(raw);
        if (isCacheValid(parsed.portfolio)) _diagCache = parsed.portfolio;
        if (parsed.stocks) {
          Object.keys(parsed.stocks).forEach(function(sym) {
            if (isCacheValid(parsed.stocks[sym])) _stockDiagCache[sym] = parsed.stocks[sym];
          });
        }
      }
    } catch(e) {}
  }

  function saveDiagCache() {
    try {
      var payload = { portfolio: _diagCache, stocks: _stockDiagCache };
      localStorage.setItem('anya-pf-diag', JSON.stringify(payload));
    } catch(e) {}
  }

  function loadOverrides() {
    try {
      var raw = localStorage.getItem('anya-pf-overrides');
      if (raw) _overrides = JSON.parse(raw);
    } catch(e) {}
  }

  function saveOverrides() {
    try {
      localStorage.setItem('anya-pf-overrides', JSON.stringify(_overrides));
    } catch(e) {}
  }

  function effectiveRow(r) {
    var key = r.symbol || r.name;
    var ov  = _overrides[key] || {};
    return Object.assign({}, r, ov);
  }

  function editRowHtml(r) {
    var key = escapeAttr(r.symbol || r.name);
    function inp(field, val, step) {
      var v = (val !== null && val !== undefined) ? val : '';
      return '<input class="pf-edit-input" type="number" data-field="' + field +
        '" value="' + v + '" step="' + (step || 'any') + '">';
    }
    return '<tr class="pf-row-editing">' +
      '<td>' + escapeAttr(r.name) + '</td>' +
      '<td>' + inp('price',     r.price,     '0.01') + '</td>' +
      '<td>' + inp('avg',       r.avg,       '0.01') + '</td>' +
      '<td>' + inp('shares',    r.shares,    '1')    + '</td>' +
      '<td>' + inp('available', r.available, '1')    + '</td>' +
      '<td colspan="2"><span class="pf-null">儲存後計算</span></td>' +
      '<td>' + inp('pnl',    r.pnl,    '1')    + '</td>' +
      '<td>' + inp('pnlPct', r.pnlPct, '0.01') + '</td>' +
      '<td class="pf-ai-cell">' +
        '<button class="pf-save-btn"   data-symbol="' + key + '" title="儲存">✓</button>' +
        '<button class="pf-cancel-btn" data-symbol="' + key + '" title="取消">✗</button>' +
        '<button class="pf-reset-btn"  data-symbol="' + key + '" title="回復預設">↩</button>' +
      '</td>' +
      '<td></td>' +
      '</tr>';
  }

  function actionCellHtml(r) {
    var sym = escapeAttr(r.symbol || r.name);
    var editBtn = '<button type="button" class="pf-edit-btn" data-symbol="' + sym + '" title="編輯">✏</button>';
    if (!r.symbol) return editBtn;
    return '<button type="button" class="pf-row-ai-btn" data-symbol="' + escapeAttr(r.symbol) + '">AI 分析</button> ' + editBtn;
  }

  function computeSummary(rows) {
    var totalPnl = 0, totalCost = 0, totalMV = 0;
    var profit = 0, loss = 0, stockPnl = 0, etfPnl = 0;
    var slCount = 0, tpCount = 0;

    rows.forEach(function (r) {
      if (r.pnl !== null) totalPnl += r.pnl;
      if (r.avg !== null) totalCost += r.avg * r.shares;
      totalMV += r.price * r.shares;
      if (r.pnl !== null && r.pnl > 0) profit++;
      if (r.pnl !== null && r.pnl < 0) loss++;
      if (r.type === 'stock' && r.pnl !== null) stockPnl += r.pnl;
      if (r.type === 'etf'   && r.pnl !== null) etfPnl   += r.pnl;
      var sig = signal(r);
      if (sig === 'stop-loss')   slCount++;
      if (sig === 'take-profit') tpCount++;
    });

    var returnPct = totalCost > 0 ? (totalPnl / totalCost * 100) : null;
    return {
      totalPnl: totalPnl, totalCost: totalCost, totalMV: totalMV,
      returnPct: returnPct, profit: profit, loss: loss,
      stockPnl: stockPnl, etfPnl: etfPnl,
      slCount: slCount, tpCount: tpCount,
      alertCount: slCount + tpCount,
    };
  }

  function applyFilter(rows) {
    if (filterMode === 'stock')  return rows.filter(function (r) { return r.type === 'stock'; });
    if (filterMode === 'etf')    return rows.filter(function (r) { return r.type === 'etf'; });
    if (filterMode === 'profit') return rows.filter(function (r) { return r.pnl !== null && r.pnl > 0; });
    if (filterMode === 'loss')   return rows.filter(function (r) { return r.pnl !== null && r.pnl < 0; });
    if (filterMode === 'alert')  return rows.filter(function (r) { return signal(r) !== null; });
    return rows;
  }

  function marketValue(r) {
    return r.price != null && r.shares != null ? r.price * r.shares : null;
  }

  function recoveryPct(r) {
    if (r.avg == null || r.price == null || r.price <= 0) return null;
    if (r.avg <= r.price) return null; // 已獲利，不需回本
    return (r.avg - r.price) / r.price * 100;
  }

  function getSortValue(r, key) {
    if (key === 'marketValue')  return marketValue(r);
    if (key === 'recoveryPct')  return recoveryPct(r);
    return r[key];
  }

  function applySort(rows) {
    return rows.slice().sort(function (a, b) {
      var av = getSortValue(a, sortKey), bv = getSortValue(b, sortKey);
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      if (sortKey === 'name') return sortDir * av.localeCompare(bv, 'zh-TW');
      return sortDir * (av - bv);
    });
  }

  function setEl(id, html, isText) {
    var el = document.getElementById(id);
    if (!el) return;
    if (isText) el.textContent = html; else el.innerHTML = html;
  }

  function loadPositions() {
    var tbody = document.getElementById('pf-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:1.5rem;color:#888;">載入中…</td></tr>';
    fetch('/api/portfolio/positions-store')
      .then(function(res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function(data) {
        _positions = data.positions || [];
        if (_positions.length === 0 && !_addFormOpen) {
          if (tbody) tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:2rem;color:#888;">目前無持倉，點擊「＋ 新增持倉」開始新增</td></tr>';
          ['pf-count','pf-profit-count','pf-loss-count','pf-alert-count','pf-sl-count','pf-tp-count'].forEach(function(id){ setEl(id, 0, true); });
          return;
        }
        render();
      })
      .catch(function(err) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:1.5rem;color:#c00;">載入失敗：' + err.message + '</td></tr>';
      });
  }

  function addFormRowHtml() {
    return '<tr class="pf-add-form-row">' +
      '<td><input class="pf-input" data-field="symbol" placeholder="代碼*" style="width:60px">' +
      '    <input class="pf-input" data-field="name"   placeholder="名稱"   style="width:70px"></td>' +
      '<td>--</td>' +
      '<td><input class="pf-input" data-field="avg"    placeholder="成本"   style="width:60px" type="number"></td>' +
      '<td><input class="pf-input" data-field="shares" placeholder="股數*"  style="width:60px" type="number"></td>' +
      '<td>--</td><td>--</td><td>--</td><td>--</td>' +
      '<td><select class="pf-input" data-field="type" style="width:60px"><option value="stock">股票</option><option value="etf">ETF</option></select></td>' +
      '<td><button class="pf-save-add-btn pf-btn">確認</button> <button class="pf-cancel-add-btn pf-btn">取消</button></td>' +
      '<td></td>' +
      '</tr>';
  }

  function render() {
    getThresholds();
    var filtered = applyFilter(_positions);
    var sorted   = applySort(filtered);
    var s        = computeSummary(filtered);
    var sAll     = computeSummary(_positions);

    // ── Header cards (always full portfolio) ──
    setEl('pf-total-pnl-hero', fmtSigned(sAll.totalPnl));
    setEl('pf-market-value', sAll.totalMV.toLocaleString('zh-TW'), true);
    setEl('pf-total-cost', Math.round(sAll.totalCost).toLocaleString('zh-TW'), true);

    var retEl = document.getElementById('pf-overall-return');
    if (retEl && sAll.returnPct !== null) {
      var sign = sAll.returnPct >= 0 ? '+' : '';
      retEl.className = 'pf-card-value ' + (sAll.returnPct >= 0 ? 'pf-up' : 'pf-down');
      retEl.textContent = sign + sAll.returnPct.toFixed(2) + '%';
    }

    setEl('pf-count', _positions.length, true);
    setEl('pf-profit-count', sAll.profit, true);
    setEl('pf-loss-count', sAll.loss, true);
    setEl('pf-stock-pnl', fmtSigned(sAll.stockPnl));
    setEl('pf-etf-pnl', fmtSigned(sAll.etfPnl));
    setEl('pf-alert-count', sAll.alertCount, true);
    setEl('pf-sl-count', sAll.slCount, true);
    setEl('pf-tp-count', sAll.tpCount, true);

    // ── Sort/filter button states ──
    document.querySelectorAll('.pf-sort-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-sort') === sortKey);
    });

    document.querySelectorAll('#pf-table thead th[data-sort]').forEach(function (th) {
      var key = th.getAttribute('data-sort');
      th.classList.remove('sort-asc', 'sort-desc');
      if (key === sortKey) th.classList.add(sortDir === 1 ? 'sort-asc' : 'sort-desc');
    });

    // ── Rows ──
    var tbody = document.getElementById('pf-tbody');
    if (!tbody) return;

    var addFormHtml = _addFormOpen ? addFormRowHtml() : '';
    tbody.innerHTML = addFormHtml + sorted.map(function (rawR) {
      var r = effectiveRow(rawR);
      var editKey = r.symbol || r.name;
      if (_editingSymbol && editKey === _editingSymbol) return editRowHtml(r);

      var sig = signal(r);
      var rowCls = '';
      if      (sig === 'stop-loss')    rowCls = 'pf-row-sl';
      else if (sig === 'take-profit')  rowCls = 'pf-row-tp';
      else if (r.pnl !== null && r.pnl >= 0) rowCls = 'pf-row-profit';
      else if (r.pnl !== null && r.pnl < 0)  rowCls = 'pf-row-loss';

      var mv   = marketValue(r);
      var rPct = recoveryPct(r);
      var mvHtml = mv !== null
        ? mv.toLocaleString('zh-TW', { maximumFractionDigits: 0 })
        : '<span class="pf-null">--</span>';
      var rPctHtml = rPct !== null
        ? '<span class="pf-recovery">+' + rPct.toFixed(1) + '%</span>'
        : '<span class="pf-null">--</span>';

      return '<tr class="' + rowCls + '">' +
        '<td>' + nameCellHtml(r) + '</td>' +
        '<td>' + fmt(r.price, 2) + '</td>' +
        '<td>' + (r.avg !== null ? fmt(r.avg, 2) : '<span class="pf-null">--</span>') + '</td>' +
        '<td>' + r.shares.toLocaleString('zh-TW') + '</td>' +
        '<td>' + r.available.toLocaleString('zh-TW') + '</td>' +
        '<td>' + mvHtml + '</td>' +
        '<td>' + rPctHtml + '</td>' +
        '<td>' + fmtSigned(r.pnl) + '</td>' +
        '<td>' + fmtPct(r.pnlPct) + '</td>' +
        '<td class="pf-ai-cell">' + actionCellHtml(r) + '</td>' +
        '<td><button class="pf-del-btn pf-btn" data-symbol="' + (r.symbol || '') + '" title="刪除">🗑</button></td>' +
        '</tr>';
    }).join('');

    // ── Tfoot total (filtered) ──
    setEl('pf-total-mv', s.totalMV.toLocaleString('zh-TW', { maximumFractionDigits: 0 }), true);
    setEl('pf-total-pnl', fmtSigned(s.totalPnl));
  }

  // ── AI Diagnosis ──

  function mdToHtml(text) {
    if (!text) return '';
    // Escape HTML entities first
    var s = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Split into blocks by blank lines
    var blocks = s.split(/\n{2,}/);
    var html = blocks.map(function (block) {
      block = block.trim();
      if (!block) return '';

      // Heading: ## or ###
      if (/^###\s+/.test(block)) {
        return '<h4 class="pf-md-h">' + inlineToHtml(block.replace(/^###\s+/, '')) + '</h4>';
      }
      if (/^##\s+/.test(block)) {
        return '<h3 class="pf-md-h">' + inlineToHtml(block.replace(/^##\s+/, '')) + '</h3>';
      }
      if (/^#\s+/.test(block)) {
        return '<h3 class="pf-md-h">' + inlineToHtml(block.replace(/^#\s+/, '')) + '</h3>';
      }

      // List block
      var lines = block.split('\n');
      var isBullet  = lines.every(function (l) { return /^\s*[-*]\s+/.test(l) || l.trim() === ''; });
      var isOrdered = lines.every(function (l) { return /^\s*\d+\.\s+/.test(l) || l.trim() === ''; });

      if (isBullet) {
        var items = lines.filter(function (l) { return l.trim(); }).map(function (l) {
          return '<li>' + inlineToHtml(l.replace(/^\s*[-*]\s+/, '')) + '</li>';
        });
        return '<ul class="pf-md-ul">' + items.join('') + '</ul>';
      }
      if (isOrdered) {
        var items = lines.filter(function (l) { return l.trim(); }).map(function (l) {
          return '<li>' + inlineToHtml(l.replace(/^\s*\d+\.\s+/, '')) + '</li>';
        });
        return '<ol class="pf-md-ol">' + items.join('') + '</ol>';
      }

      // Paragraph (with inline line breaks)
      return '<p class="pf-md-p">' + inlineToHtml(lines.join('<br>')) + '</p>';
    }).join('');

    return html;
  }

  function inlineToHtml(s) {
    return s
      .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.+?)\*\*/g,     '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g,         '<em>$1</em>');
  }

  function showDiagPanel(title, contentHtml, isHtml, generatedAt) {
    var panel   = document.getElementById('pf-diag-panel');
    var body    = document.getElementById('pf-diag-body');
    var label   = document.getElementById('pf-diag-title');
    var timeEl  = document.getElementById('pf-diag-time');
    if (!panel || !body || !label) return;

    label.textContent = title || 'AI 診斷';
    if (timeEl) timeEl.textContent = generatedAt ? fmtCacheTime(generatedAt) : '';
    if (isHtml) body.innerHTML = contentHtml;
    else body.textContent = contentHtml;
    panel.style.display = '';
  }

  function buildDiagPayload() {
    getThresholds();
    return _positions.map(function (r) {
      return {
        name:   r.name,
        price:  r.price,
        avg:    r.avg,
        shares: r.shares,
        pnl:    r.pnl,
        pnlPct: r.pnlPct,
        type:   r.type,
        signal: signal(r),
      };
    });
  }

  function runDiagnosis() {
    var panel = document.getElementById('pf-diag-panel');
    var body  = document.getElementById('pf-diag-body');
    var btn   = document.getElementById('pf-ai-btn');
    if (!panel || !body || !btn) return;

    if (isCacheValid(_diagCache)) {
      showDiagPanel('AI 投資組合診斷', mdToHtml(_diagCache.report), true, _diagCache.generatedAt);
      return;
    }

    btn.disabled    = true;
    btn.textContent = '診斷中…';
    showDiagPanel('AI 投資組合診斷', '<span class="pf-diag-loading">AI 正在分析您的投資組合，約需 15–40 秒…</span>', true);

    fetch('/api/portfolio/diagnosis', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ positions: buildDiagPayload() }),
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.error && !data.report) {
          showDiagPanel('AI 投資組合診斷', '<span class="pf-diag-error">診斷失敗：' + data.error + '</span>', true);
        } else {
          _diagCache = { report: data.report, generatedAt: Date.now() };
          saveDiagCache();
          showDiagPanel('AI 投資組合診斷', mdToHtml(data.report), true, _diagCache.generatedAt);
        }
      })
      .catch(function (err) {
        showDiagPanel('AI 投資組合診斷', '<span class="pf-diag-error">網路錯誤：' + err.message + '</span>', true);
      })
      .finally(function () {
        btn.disabled    = false;
        btn.textContent = 'AI 診斷';
      });
  }

  function loadSingleStockDiagnosis(symbol, buttonEl) {
    var panel = document.getElementById('pf-diag-panel');
    var body  = document.getElementById('pf-diag-body');
    if (!panel || !body || !symbol) return;

    var cacheKey    = String(symbol).toUpperCase();
    var row         = _positions.find(function (d) { return d.symbol === symbol; });
    var displayName = (row && row.name) || cacheKey;

    if (isCacheValid(_stockDiagCache[cacheKey])) {
      var cached = _stockDiagCache[cacheKey];
      showDiagPanel(displayName + ' · 持倉診斷', mdToHtml(cached.report), true, cached.generatedAt);
      return;
    }

    // 防止重複請求（同一 symbol 正在進行中）
    if (_stockDiagCache[cacheKey + '__loading']) return;
    _stockDiagCache[cacheKey + '__loading'] = true;

    if (buttonEl) {
      buttonEl.disabled    = true;
      buttonEl.textContent = '分析中…';
    }

    showDiagPanel(displayName + ' · 持倉診斷',
      '<span class="pf-diag-loading">' + displayName + ' 分析中，請稍候（約 15–30 秒）…</span>', true);

    var reqBody = {
      symbol:    symbol,
      name:      displayName,
      price:     row ? row.price     : null,
      avg:       row ? row.avg       : null,
      shares:    row ? row.shares    : null,
      available: row ? row.available : null,
      pnl:       row ? row.pnl       : null,
      pnlPct:    row ? row.pnlPct    : null,
      signal:    row ? signal(row)   : null,
    };

    fetch('/api/portfolio/stock-diagnosis', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(reqBody),
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.error && !data.report) {
          showDiagPanel(displayName + ' · 持倉診斷',
            '<span class="pf-diag-error">分析失敗：' + data.error + '</span>', true);
          return;
        }
        _stockDiagCache[cacheKey] = { report: data.report || '', generatedAt: Date.now() };
        saveDiagCache();
        var entry = _stockDiagCache[cacheKey];
        showDiagPanel(displayName + ' · 持倉診斷', mdToHtml(entry.report || '此分析目前無資料。'), true, entry.generatedAt);
      })
      .catch(function (err) {
        showDiagPanel(displayName + ' · 持倉診斷',
          '<span class="pf-diag-error">網路錯誤：' + err.message + '</span>', true);
      })
      .finally(function () {
        delete _stockDiagCache[cacheKey + '__loading'];
        if (buttonEl) {
          buttonEl.disabled    = false;
          buttonEl.textContent = 'AI 分析';
        }
      });
  }

  function init() {
    document.querySelectorAll('.pf-sort-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var key = btn.getAttribute('data-sort');
        if (key === sortKey) sortDir = -sortDir;
        else { sortKey = key; sortDir = key === 'name' ? 1 : -1; }
        render();
      });
    });

    document.querySelectorAll('.pf-filter-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        filterMode = btn.getAttribute('data-filter');
        document.querySelectorAll('.pf-filter-btn').forEach(function (b) {
          b.classList.toggle('active', b === btn);
        });
        render();
      });
    });

    document.querySelectorAll('#pf-table thead th[data-sort]').forEach(function (th) {
      th.addEventListener('click', function () {
        var key = th.getAttribute('data-sort');
        if (key === sortKey) sortDir = -sortDir;
        else { sortKey = key; sortDir = key === 'name' ? 1 : -1; }
        render();
      });
    });

    ['pf-sl-threshold', 'pf-tp-threshold'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('change', function () {
        _diagCache = null;
        _stockDiagCache = Object.create(null);
        saveDiagCache();
        render();
      });
    });

    var aiBtn     = document.getElementById('pf-ai-btn');
    var diagClose = document.getElementById('pf-diag-close');
    if (aiBtn)     aiBtn.addEventListener('click', runDiagnosis);
    if (diagClose) diagClose.addEventListener('click', function () {
      var panel = document.getElementById('pf-diag-panel');
      if (panel) panel.style.display = 'none';
    });

    var tbody = document.getElementById('pf-tbody');
    if (tbody) {
      tbody.addEventListener('click', function (event) {
        // AI 分析
        var aiBtn = event.target.closest('.pf-row-ai-btn');
        if (aiBtn) { loadSingleStockDiagnosis(aiBtn.getAttribute('data-symbol'), aiBtn); return; }

        // ✏ 編輯
        var editBtn = event.target.closest('.pf-edit-btn');
        if (editBtn) { _editingSymbol = editBtn.getAttribute('data-symbol'); render(); return; }

        // ✓ 儲存
        var saveBtn = event.target.closest('.pf-save-btn');
        if (saveBtn) {
          var sym = saveBtn.getAttribute('data-symbol');
          var row = saveBtn.closest('tr');
          var ov  = {};
          ['price','avg','shares','available','pnl','pnlPct'].forEach(function(f) {
            var inp = row.querySelector('[data-field="' + f + '"]');
            if (inp) { var v = inp.value.trim(); ov[f] = v === '' ? null : parseFloat(v); }
          });
          _overrides[sym] = ov;
          saveOverrides();
          _diagCache = null;
          delete _stockDiagCache[sym.toUpperCase()];
          _editingSymbol = null;
          render();
          return;
        }

        // ✗ 取消
        var cancelBtn = event.target.closest('.pf-cancel-btn');
        if (cancelBtn) { _editingSymbol = null; render(); return; }

        // ↩ 重置
        var resetBtn = event.target.closest('.pf-reset-btn');
        if (resetBtn) {
          delete _overrides[resetBtn.getAttribute('data-symbol')];
          saveOverrides();
          _editingSymbol = null;
          render();
          return;
        }

        // 🗑 刪除
        var delBtn = event.target.closest('.pf-del-btn');
        if (delBtn) {
          var sym = delBtn.getAttribute('data-symbol');
          fetch('/api/portfolio/positions-store/' + encodeURIComponent(sym), { method: 'DELETE' })
            .then(function(res) {
              if (!res.ok) throw new Error('HTTP ' + res.status);
              var idx = _positions.findIndex(function(p) { return p.symbol === sym; });
              if (idx !== -1) _positions.splice(idx, 1);
              render();
            })
            .catch(function(err) { alert('刪除失敗：' + err.message); });
          return;
        }

        // ✓ 確認新增
        var saveAddBtn = event.target.closest('.pf-save-add-btn');
        if (saveAddBtn) {
          var formRow = tbody.querySelector('.pf-add-form-row');
          if (!formRow) return;
          var symVal    = (formRow.querySelector('[data-field="symbol"]').value || '').trim();
          var sharesVal = (formRow.querySelector('[data-field="shares"]').value || '').trim();
          if (!symVal || !sharesVal) { alert('代碼與股數為必填'); return; }
          var payload = {
            symbol: symVal,
            name:   (formRow.querySelector('[data-field="name"]').value || '').trim() || symVal,
            type:   formRow.querySelector('[data-field="type"]').value || 'stock',
            avg:    parseFloat(formRow.querySelector('[data-field="avg"]').value) || null,
            shares: parseInt(sharesVal, 10),
          };
          fetch('/api/portfolio/positions-store', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
            .then(function(res) {
              if (res.status === 409) { alert('代碼已存在'); throw new Error('duplicate'); }
              if (!res.ok) throw new Error('HTTP ' + res.status);
              return res.json();
            })
            .then(function(data) {
              _positions.push(data.position);
              _addFormOpen = false;
              render();
            })
            .catch(function(err) { if (err.message !== 'duplicate') alert('新增失敗：' + err.message); });
          return;
        }

        // ✗ 取消新增
        var cancelAddBtn = event.target.closest('.pf-cancel-add-btn');
        if (cancelAddBtn) { _addFormOpen = false; render(); return; }
      });
    }

    var addBtn = document.getElementById('pf-add-btn');
    if (addBtn) addBtn.addEventListener('click', function() {
      _addFormOpen = true;
      render();
      var tbody2 = document.getElementById('pf-tbody');
      if (tbody2) { var inp = tbody2.querySelector('[data-field="symbol"]'); if (inp) inp.focus(); }
    });

    var refreshBtn = document.getElementById('pf-refresh-price-btn');
    if (refreshBtn) refreshBtn.addEventListener('click', updatePrices);

    loadOverrides();
    loadDiagCache();
    loadPositions();
  }

  function updatePrices() {
    var btn     = document.getElementById('pf-refresh-price-btn');
    var timeEl  = document.getElementById('pf-refresh-time');
    if (btn) { btn.disabled = true; btn.textContent = '更新中…'; }
    if (timeEl) timeEl.textContent = '';

    var symbols = _positions.map(function(r) { return r.symbol; }).filter(Boolean);
    var batches = [];
    for (var i = 0; i < symbols.length; i += 30) batches.push(symbols.slice(i, i + 30));

    var updated = 0, failed = 0;

    Promise.all(batches.map(function(batch) {
      return fetch('/api/workbench/quotes-batch?symbols=' + batch.join(','))
        .then(function(res) { return res.json(); })
        .then(function(data) {
          var quotes = data.quotes || {};
          Object.keys(quotes).forEach(function(sym) {
            var q = quotes[sym];
            if (q && q.last_price != null) {
              var ov = _overrides[sym] || {};
              _overrides[sym] = Object.assign({}, ov, { price: q.last_price });
              updated++;
            } else {
              failed++;
            }
          });
        });
    }))
    .then(function() {
      saveOverrides();
      var now = new Date();
      var hhmm = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
      if (timeEl) timeEl.textContent = '更新於 ' + hhmm + (failed ? '（' + failed + ' 檔失敗）' : '');
      render();
    })
    .catch(function(err) {
      if (timeEl) timeEl.textContent = '更新失敗：' + err.message;
    })
    .finally(function() {
      if (btn) { btn.disabled = false; btn.textContent = '↻ 更新市價'; }
    });
  }

  window.portfolioLoad = init;

  document.addEventListener('DOMContentLoaded', function () {
    if (document.getElementById('pf-tbody')) init();
  });
})();

// ── 個股跳轉到工作台（全域，供 onclick 屬性使用）──
window.pfJumpToWorkbench = function (symbol) {
  location.hash = '#workbench';
  setTimeout(function () {
    var inp = document.getElementById('symbol-input');
    var btn = document.getElementById('lookup-btn');
    if (inp) inp.value = symbol;
    if (btn) btn.click();
  }, 80);
};
