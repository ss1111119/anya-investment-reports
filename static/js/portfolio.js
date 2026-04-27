(function () {
  'use strict';

  const STOP_LOSS_DEFAULT   = -30;
  const TAKE_PROFIT_DEFAULT = 150;

  const DATA = [
    { name: '聯電',           symbol: '2303',   type: 'stock', price: 72.70,   avg: 48.79,  shares: 200,   available: 200,   pnl: 4719,    pnlPct: 48.36  },
    { name: '鴻海',           symbol: '2317',   type: 'stock', price: 228.00,  avg: 83.65,  shares: 150,   available: 150,   pnl: 21502,   pnlPct: 171.36 },
    { name: '仁寶',           symbol: '2324',   type: 'stock', price: 30.00,   avg: 23.59,  shares: 1000,  available: 1000,  pnl: 6274,    pnlPct: 26.59  },
    { name: '台積電',         symbol: '2330',   type: 'stock', price: 2265.00, avg: 449.23, shares: 31,    available: 31,    pnl: 55979,   pnlPct: 401.97 },
    { name: '微星',           symbol: '2377',   type: 'stock', price: 93.40,   avg: 137.40, shares: 50,    available: 50,    pnl: -2234,   pnlPct: -32.52 },
    { name: '友達',           symbol: '2409',   type: 'stock', price: 17.35,   avg: 19.45,  shares: 80,    available: 80,    pnl: -192,    pnlPct: -12.34 },
    { name: '聯發科',         symbol: '2454',   type: 'stock', price: 2435.00, avg: 821.47, shares: 15,    available: 15,    pnl: 24042,   pnlPct: 195.11 },
    { name: '義隆',           symbol: '2458',   type: 'stock', price: 136.00,  avg: 129.69, shares: 100,   available: 100,   pnl: 571,     pnlPct: 4.40   },
    { name: '長榮',           symbol: '2603',   type: 'stock', price: 199.50,  avg: 176.65, shares: 40,    available: 40,    pnl: 871,     pnlPct: 12.33  },
    { name: '台灣高鐵',       symbol: '2633',   type: 'stock', price: 26.35,   avg: 33.34,  shares: 50,    available: 50,    pnl: -373,    pnlPct: -22.35 },
    { name: '凱基金',         symbol: '2883',   type: 'stock', price: 20.50,   avg: 9.16,   shares: 1010,  available: 1010,  pnl: 11364,   pnlPct: 122.85 },
    { name: '玉山金',         symbol: '2884',   type: 'stock', price: 32.55,   avg: 21.37,  shares: 60,    available: 26,    pnl: 646,     pnlPct: 51.66  },
    { name: '元大金',         symbol: '2885',   type: 'stock', price: 50.80,   avg: 18.29,  shares: 569,   available: 569,   pnl: 18370,   pnlPct: 176.50 },
    { name: '兆豐金',         symbol: '2886',   type: 'stock', price: 39.80,   avg: 29.62,  shares: 105,   available: 105,   pnl: 1037,    pnlPct: 33.34  },
    { name: '大成',           symbol: '1210',   type: 'stock', price: 53.70,   avg: 50.49,  shares: 108,   available: 108,   pnl: 310,     pnlPct: 5.68   },
    { name: '統一',           symbol: '1216',   type: 'stock', price: 70.50,   avg: 72.80,  shares: 100,   available: 100,   pnl: -271,    pnlPct: -3.72  },
    { name: '聯華食',         symbol: '1227',   type: 'stock', price: 85.90,   avg: 35.86,  shares: 161,   available: 161,   pnl: 7996,    pnlPct: 138.51 },
    { name: '遠東新',         symbol: '1402',   type: 'stock', price: 26.00,   avg: 32.87,  shares: 100,   available: 100,   pnl: -714,    pnlPct: -21.72 },
    { name: '南僑',           symbol: '1702',   type: 'stock', price: 35.60,   avg: 48.64,  shares: 200,   available: 200,   pnl: -2649,   pnlPct: -27.23 },
    { name: '中化生',         symbol: '1762',   type: 'stock', price: 27.55,   avg: 65.50,  shares: 50,    available: 50,    pnl: -1922,   pnlPct: -58.67 },
    { name: '台船',           symbol: '2208',   type: 'stock', price: 20.35,   avg: 29.52,  shares: 200,   available: 200,   pnl: -1866,   pnlPct: -31.61 },
    { name: '台新新光辛特',   symbol: null,     type: 'other', price: 9.39,    avg: null,   shares: 175,   available: 175,   pnl: 1619,    pnlPct: null   },
    { name: '中信金',         symbol: '2891',   type: 'stock', price: 52.70,   avg: 21.40,  shares: 100,   available: 100,   pnl: 3095,    pnlPct: 144.63 },
    { name: '第一金',         symbol: '2892',   type: 'stock', price: 28.35,   avg: 21.14,  shares: 114,   available: 114,   pnl: 793,     pnlPct: 32.90  },
    { name: '統一超',         symbol: '2912',   type: 'stock', price: 226.00,  avg: 269.95, shares: 40,    available: 40,    pnl: -1805,   pnlPct: -16.72 },
    { name: '緯創',           symbol: '3231',   type: 'stock', price: 142.50,  avg: 35.75,  shares: 110,   available: 110,   pnl: 11674,   pnlPct: 296.90 },
    { name: '和碩',           symbol: '4938',   type: 'stock', price: 83.10,   avg: 74.06,  shares: 100,   available: 100,   pnl: 860,     pnlPct: 11.61  },
    { name: '嘉聯益',         symbol: '6153',   type: 'stock', price: 17.90,   avg: 35.12,  shares: 105,   available: 105,   pnl: -1834,   pnlPct: -49.72 },
    { name: '國泰永續高股息', symbol: '00878',  type: 'etf',   price: 25.00,   avg: 14.89,  shares: 1000,  available: 1000,  pnl: 10050,   pnlPct: 67.49  },
    { name: '中信中國高股息', symbol: '00882',  type: 'etf',   price: 15.63,   avg: 15.83,  shares: 100,   available: 100,   pnl: -41,     pnlPct: -2.59  },
    { name: '富邦越南',       symbol: '00885',  type: 'etf',   price: 18.62,   avg: 15.61,  shares: 1000,  available: 1000,  pnl: 2966,    pnlPct: 19.00  },
    { name: '中信關鍵半導體', symbol: '00891',  type: 'etf',   price: 31.24,   avg: 15.41,  shares: 500,   available: 500,   pnl: 7877,    pnlPct: 102.22 },
    { name: '富邦台灣半導體', symbol: '00892',  type: 'etf',   price: 38.10,   avg: 15.52,  shares: 1000,  available: 1000,  pnl: 22488,   pnlPct: 144.90 },
    { name: '台泥',           symbol: '1101',   type: 'stock', price: 24.35,   avg: 41.14,  shares: 57,    available: 57,    pnl: -981,    pnlPct: -41.84 },
    { name: '味全',           symbol: '1201',   type: 'stock', price: 12.70,   avg: 23.31,  shares: 100,   available: 100,   pnl: -1084,   pnlPct: -46.50 },
    { name: '台郡',           symbol: '6269',   type: 'stock', price: 65.40,   avg: 149.67, shares: 30,    available: 30,    pnl: -2553,   pnlPct: -56.86 },
    { name: '櫻花',           symbol: '9911',   type: 'stock', price: 81.80,   avg: 64.34,  shares: 100,   available: 100,   pnl: 1702,    pnlPct: 26.45  },
    { name: '元大台灣50',     symbol: '0050',   type: 'etf',   price: 93.00,   avg: 40.19,  shares: 4954,  available: 4954,  pnl: 260489,  pnlPct: 130.82 },
    { name: '元大高股息',     symbol: '0056',   type: 'etf',   price: 40.90,   avg: 31.46,  shares: 500,   available: 500,   pnl: 4669,    pnlPct: 29.68  },
    { name: '富邦台50',       symbol: '006208', type: 'etf',   price: 215.45,  avg: 109.48, shares: 1016,  available: 1016,  pnl: 107140,  pnlPct: 96.32  },
    { name: '國泰中國A50',    symbol: '00636',  type: 'etf',   price: 28.03,   avg: 30.27,  shares: 200,   available: 200,   pnl: -473,    pnlPct: -7.81  },
    { name: '富邦公司治理',   symbol: '00692',  type: 'etf',   price: 81.10,   avg: 34.75,  shares: 100,   available: 100,   pnl: 4607,    pnlPct: 132.58 },
    { name: '復華富時不動產', symbol: '00712',  type: 'etf',   price: 9.06,    avg: 14.51,  shares: 475,   available: 475,   pnl: -2613,   pnlPct: -37.91 },
    { name: '元大臺灣ESG永續', symbol: '00850', type: 'etf',   price: 76.65,   avg: 33.74,  shares: 200,   available: 200,   pnl: null,    pnlPct: null   },
  ];

  let sortKey     = 'pnlPct';
  let sortDir     = -1;
  let filterMode  = 'all';
  let slThreshold = STOP_LOSS_DEFAULT;
  let tpThreshold = TAKE_PROFIT_DEFAULT;
  let _diagCache  = null;
  let _stockDiagCache = Object.create(null);

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

  function actionCellHtml(r) {
    if (!r.symbol) return '<span class="pf-null">--</span>';
    var symbol = escapeAttr(r.symbol);
    var name = escapeAttr(r.name || r.symbol);
    return '<button type="button" class="pf-row-ai-btn" data-symbol="' + symbol + '" data-name="' + name + '">AI 分析</button>';
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

  function applySort(rows) {
    return rows.slice().sort(function (a, b) {
      var av = a[sortKey], bv = b[sortKey];
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

  function render() {
    getThresholds();
    var filtered = applyFilter(DATA);
    var sorted   = applySort(filtered);
    var s        = computeSummary(filtered);
    var sAll     = computeSummary(DATA);

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

    setEl('pf-count', DATA.length, true);
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

    tbody.innerHTML = sorted.map(function (r) {
      var sig = signal(r);
      var rowCls = '';
      if      (sig === 'stop-loss')    rowCls = 'pf-row-sl';
      else if (sig === 'take-profit')  rowCls = 'pf-row-tp';
      else if (r.pnl !== null && r.pnl >= 0) rowCls = 'pf-row-profit';
      else if (r.pnl !== null && r.pnl < 0)  rowCls = 'pf-row-loss';

      return '<tr class="' + rowCls + '">' +
        '<td>' + nameCellHtml(r) + '</td>' +
        '<td>' + fmt(r.price, 2) + '</td>' +
        '<td>' + (r.avg !== null ? fmt(r.avg, 2) : '<span class="pf-null">--</span>') + '</td>' +
        '<td>' + r.shares.toLocaleString('zh-TW') + '</td>' +
        '<td>' + r.available.toLocaleString('zh-TW') + '</td>' +
        '<td>' + fmtSigned(r.pnl) + '</td>' +
        '<td>' + fmtPct(r.pnlPct) + '</td>' +
        '<td class="pf-ai-cell">' + actionCellHtml(r) + '</td>' +
        '</tr>';
    }).join('');

    // ── Tfoot total (filtered) ──
    setEl('pf-total-pnl', fmtSigned(s.totalPnl));
  }

  // ── AI Diagnosis ──

  function showDiagPanel(title, contentHtml, isHtml) {
    var panel = document.getElementById('pf-diag-panel');
    var body  = document.getElementById('pf-diag-body');
    var label = document.getElementById('pf-diag-title');
    if (!panel || !body || !label) return;

    label.textContent = title || 'AI 診斷';
    if (isHtml) body.innerHTML = contentHtml;
    else body.textContent = contentHtml;
    panel.style.display = '';
  }

  function buildDiagPayload() {
    getThresholds();
    return DATA.map(function (r) {
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

    if (_diagCache) {
      showDiagPanel('AI 投資組合診斷', _diagCache, false);
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
          _diagCache = data.report;
          showDiagPanel('AI 投資組合診斷', data.report, false);
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

  function loadSingleStockDiagnosis(symbol, name, buttonEl) {
    var panel = document.getElementById('pf-diag-panel');
    var body  = document.getElementById('pf-diag-body');
    if (!panel || !body || !symbol) return;

    var cacheKey = String(symbol).toUpperCase();
    var displayName = name || cacheKey;

    if (_stockDiagCache[cacheKey]) {
      showDiagPanel(displayName + ' AI 分析', _stockDiagCache[cacheKey], false);
      return;
    }

    if (buttonEl) {
      buttonEl.disabled = true;
      buttonEl.textContent = '分析中…';
    }

    showDiagPanel(displayName + ' AI 分析', '<span class="pf-diag-loading">' + displayName + ' AI 分析中，請稍候…</span>', true);

    fetch('/api/workbench/research/' + encodeURIComponent(cacheKey) + '/deep-analysis', {
      method: 'GET',
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.error && !data.report) {
          showDiagPanel(displayName + ' AI 分析', '<span class="pf-diag-error">分析失敗：' + data.error + '</span>', true);
          return;
        }
        _stockDiagCache[cacheKey] = data.report || '';
        showDiagPanel(displayName + ' AI 分析', data.report || '此分析目前無資料。', false);
      })
      .catch(function (err) {
        showDiagPanel(displayName + ' AI 分析', '<span class="pf-diag-error">網路錯誤：' + err.message + '</span>', true);
      })
      .finally(function () {
        if (buttonEl) {
          buttonEl.disabled = false;
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
        _diagCache = null; // 門檻改變時清快取
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
        var btn = event.target.closest('.pf-row-ai-btn');
        if (!btn) return;
        loadSingleStockDiagnosis(btn.getAttribute('data-symbol'), btn.getAttribute('data-name'), btn);
      });
    }

    render();
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
