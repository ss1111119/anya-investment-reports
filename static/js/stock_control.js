(function () {
  'use strict';

  function fmt(n) {
    if (n == null) return '-';
    return Number(n).toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  function fmtChg(n) {
    if (n == null) return '-';
    var v = Number(n);
    return (v >= 0 ? '+' : '') + v.toFixed(2);
  }

  function fmtPct(n) {
    if (n == null) return '-';
    var v = Number(n);
    return (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
  }

  function clsPN(n) {
    if (n == null) return '';
    return Number(n) >= 0 ? 'sc-pos' : 'sc-neg';
  }

  // ── Data fetch ──────────────────────────────────────────────────────────────

  function loadAll() {
    loadTaiexChart();
    fetch('/api/workbench/control-room-summary')
      .then(function (r) { return r.json(); })
      .then(function (summary) {
        var watchlist = summary.watchlist || [];
        var alerts = summary.alerts || {};
        var positions = summary.positions || {};
        var market = summary.market || {};

        renderMarket(market);
        renderPositions(positions);

        if (watchlist.length === 0) {
          renderWatchlist([], {}, {}, {});
          updateTimestamp();
          return;
        }

        fetch('/api/workbench/quotes-batch?symbols=' + watchlist.join(','))
          .then(function (r) { return r.json(); })
          .then(function (batchData) {
            var quotes = batchData.quotes || {};
            renderWatchlist(watchlist, quotes, alerts, positions);
            updateTimestamp();
          })
          .catch(function () {
            renderWatchlist(watchlist, {}, alerts, positions);
            updateTimestamp();
          });
      })
      .catch(function () {
        renderMarket({});
        renderWatchlist([], {}, {}, {});
        renderPositions({});
        updateTimestamp();
      });
  }

  // ── Market overview banner ───────────────────────────────────────────────────

  function fmtYi(n) {
    if (n == null) return '-';
    var v = Number(n);
    return (v >= 0 ? '+' : '') + v.toFixed(1) + '億';
  }

  function renderMarket(market) {
    var el = document.getElementById('sc-market-banner');
    if (!el) return;

    var taiex = market.taiex || {};
    var inst = market.institutional || {};

    var price = taiex.price;
    var chg = taiex.change;
    var chgPct = taiex.change_percent;
    var priceCls = clsPN(chg);

    var priceHtml = price != null
      ? '<span class="sc-market-value ' + priceCls + '">' + fmt(price) + '</span>' +
        '<span class="sc-market-sub ' + priceCls + '">' + fmtChg(chg) + ' (' + fmtPct(chgPct) + ')</span>'
      : '<span class="sc-market-value">--</span>';

    var foreignCls = clsPN(inst.foreign_net);
    var trustCls = clsPN(inst.trust_net);
    var dealerCls = clsPN(inst.dealer_net);
    var breadth = market.breadth || {};

    el.innerHTML =
      '<div class="sc-market-item">' +
        '<span class="sc-market-label">加權指數</span>' +
        priceHtml +
      '</div>' +
      '<div class="sc-market-divider"></div>' +
      '<div class="sc-market-item">' +
        '<span class="sc-market-label">漲 / 跌</span>' +
        '<span class="sc-market-value">' +
          '<span class="sc-pos">' + (breadth.up_count || '--') + '</span>' +
          ' / ' +
          '<span class="sc-neg">' + (breadth.down_count || '--') + '</span>' +
        '</span>' +
      '</div>' +
      '<div class="sc-market-item">' +
        '<span class="sc-market-label">成交值</span>' +
        '<span class="sc-market-value">' + (breadth.trade_value != null ? breadth.trade_value + '億' : '--') + '</span>' +
      '</div>' +
      '<div class="sc-market-divider"></div>' +
      '<div class="sc-market-item">' +
        '<span class="sc-market-label">外資</span>' +
        '<span class="sc-market-value ' + foreignCls + '">' + fmtYi(inst.foreign_net) + '</span>' +
      '</div>' +
      '<div class="sc-market-item">' +
        '<span class="sc-market-label">投信</span>' +
        '<span class="sc-market-value ' + trustCls + '">' + fmtYi(inst.trust_net) + '</span>' +
      '</div>' +
      '<div class="sc-market-item">' +
        '<span class="sc-market-label">自營商</span>' +
        '<span class="sc-market-value ' + dealerCls + '">' + fmtYi(inst.dealer_net) + '</span>' +
      '</div>' +
      (inst.date ? '<span class="sc-market-sub" style="margin-left:auto">' + inst.date + '</span>' : '');
  }

  // ── Watchlist panel with cross-reference markers ─────────────────────────────

  function renderWatchlist(watchlist, quotes, alerts, positions) {
    var tbody = document.getElementById('sc-watchlist-body');
    if (!tbody) return;

    if (watchlist.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="sc-placeholder">追蹤清單為空</td></tr>';
      return;
    }

    tbody.innerHTML = watchlist.map(function (sym) {
      var q = quotes[sym] || {};
      var price = q.last_price;
      var chg = q.change;
      var chgPct = q.change_percent;
      var name = q.name || sym;

      // Alert badge
      var symAlerts = alerts[sym] || [];
      var alertBadge = '--';
      if (symAlerts.length > 0) {
        var a = symAlerts[0];
        if (a.direction === 'above') {
          alertBadge = '<span class="sc-alert-up">↑' + fmt(a.threshold) + '</span>';
        } else {
          alertBadge = '<span class="sc-alert-down">↓' + fmt(a.threshold) + '</span>';
        }
      }

      // Position marker
      var posBadge = positions[sym] ? '<span class="sc-in-pos">✓</span>' : '--';

      var chgCls = clsPN(chg);

      return '<tr class="sc-row-clickable" data-sym="' + sym + '" title="點擊查看 ' + sym + ' K線">' +
        '<td><strong>' + sym + '</strong></td>' +
        '<td>' + name + '</td>' +
        '<td>' + fmt(price) + '</td>' +
        '<td class="' + chgCls + '">' + fmtChg(chg) + '</td>' +
        '<td class="' + chgCls + '">' + fmtPct(chgPct) + '</td>' +
        '<td>' + alertBadge + '</td>' +
        '<td>' + posBadge + '</td>' +
        '</tr>';
    }).join('');

    // Bind click to load chart for that symbol
    tbody.querySelectorAll('tr[data-sym]').forEach(function (row) {
      row.addEventListener('click', function () {
        var s = row.getAttribute('data-sym');
        var input = document.getElementById('sc-chart-input');
        if (input) input.value = s;
        loadTaiexChart(s);
        document.getElementById('sc-tv-container') &&
          document.getElementById('sc-tv-container').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  // ── Positions summary panel ───────────────────────────────────────────────────

  function renderPositions(positions) {
    var tbody = document.getElementById('sc-positions-body');
    if (!tbody) return;

    var keys = Object.keys(positions);
    if (keys.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="sc-placeholder">目前無持倉</td></tr>';
      return;
    }

    tbody.innerHTML = keys.map(function (sym) {
      var p = positions[sym];
      var plCls = clsPN(p.profit_loss);
      return '<tr>' +
        '<td><strong>' + sym + '</strong></td>' +
        '<td>' + (p.stock_name || '-') + '</td>' +
        '<td>' + fmt(p.quantity) + '</td>' +
        '<td class="' + plCls + '">' + fmtPct(p.profit_loss_pct) + '</td>' +
        '<td class="' + plCls + '">' + fmt(p.profit_loss) + '</td>' +
        '</tr>';
    }).join('');
  }

  // ── Timestamp ────────────────────────────────────────────────────────────────

  function updateTimestamp() {
    var el = document.getElementById('sc-last-updated');
    if (!el) return;
    var now = new Date();
    var hh = String(now.getHours()).padStart(2, '0');
    var mm = String(now.getMinutes()).padStart(2, '0');
    var ss = String(now.getSeconds()).padStart(2, '0');
    el.textContent = '最後更新：' + hh + ':' + mm + ':' + ss;
  }

  // ── ECharts TAIEX K-line chart ────────────────────────────────────────────────

  var _taiexChart = null;

  function loadTaiexChart(symbol) {
    var container = document.getElementById('sc-tv-container');
    if (!container || typeof echarts === 'undefined') return;
    var sym = symbol || '^TWII';

    fetch('/api/workbench/taiex-chart?symbol=' + encodeURIComponent(sym) + '&days=120')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.error || !d.dates) return;
        var titleEl = document.getElementById('sc-chart-title');
        if (titleEl) titleEl.textContent = (d.name || d.symbol || sym) + ' 走勢';
        renderTaiexChart(container, d);
      })
      .catch(function () {});
  }

  function renderTaiexChart(container, d) {
    if (_taiexChart) { _taiexChart.dispose(); }
    _taiexChart = echarts.init(container, 'dark');

    var upColor = '#34d399';
    var downColor = '#f87171';

    function itemColor(data) {
      return data[1] >= data[0] ? upColor : downColor;
    }

    function fmtVolumeAxis(value) {
      var n = Number(value) || 0;
      if (n >= 100000000) return (n / 100000000).toFixed(1) + '億';
      if (n >= 10000) return (n / 10000).toFixed(0) + '萬';
      return String(Math.round(n));
    }

    var option = {
      backgroundColor: 'transparent',
      animation: false,
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
        backgroundColor: '#0e1627',
        borderColor: 'rgba(148,163,184,0.2)',
        textStyle: { color: '#c8d8ec', fontSize: 12 },
      },
      legend: {
        data: ['K線', 'MA5', 'MA10', 'MA20', 'MA60'],
        top: 0,
        textStyle: { color: '#8da1bf', fontSize: 11 },
        inactiveColor: '#3a4a60',
      },
      axisPointer: { link: [{ xAxisIndex: 'all' }] },
      dataZoom: [
        { type: 'inside', xAxisIndex: [0, 1, 2, 3], start: 40, end: 100 },
        { type: 'slider', xAxisIndex: [0, 1, 2, 3], start: 40, end: 100,
          bottom: 2, height: 20, borderColor: 'transparent',
          fillerColor: 'rgba(118,169,255,0.12)',
          textStyle: { color: '#8da1bf', fontSize: 10 } },
      ],
      grid: [
        { left: 60, right: 16, top: 32, height: '44%' },   // K線
        { left: 60, right: 16, top: '56%', height: '12%' }, // Volume
        { left: 60, right: 16, top: '72%', height: '10%' }, // KD
        { left: 60, right: 16, top: '85%', height: '10%' }, // MACD
      ],
      xAxis: [
        { type: 'category', data: d.dates, gridIndex: 0, axisLabel: { show: false }, axisLine: { lineStyle: { color: '#2a3a50' } } },
        { type: 'category', data: d.dates, gridIndex: 1, axisLabel: { show: false }, axisLine: { lineStyle: { color: '#2a3a50' } } },
        { type: 'category', data: d.dates, gridIndex: 2, axisLabel: { show: false }, axisLine: { lineStyle: { color: '#2a3a50' } } },
        { type: 'category', data: d.dates, gridIndex: 3, axisLabel: { color: '#8da1bf', fontSize: 10 }, axisLine: { lineStyle: { color: '#2a3a50' } } },
      ],
      yAxis: [
        { scale: true, gridIndex: 0, splitLine: { lineStyle: { color: 'rgba(148,163,184,0.08)' } }, axisLabel: { color: '#8da1bf', fontSize: 10 } },
        { scale: true, gridIndex: 1, splitNumber: 2, splitLine: { lineStyle: { color: 'rgba(148,163,184,0.08)' } }, axisLabel: { color: '#8da1bf', fontSize: 10, formatter: fmtVolumeAxis, margin: 10 } },
        { scale: true, gridIndex: 2, splitNumber: 2, max: 100, min: 0, splitLine: { lineStyle: { color: 'rgba(148,163,184,0.08)' } }, axisLabel: { color: '#8da1bf', fontSize: 10 } },
        { scale: true, gridIndex: 3, splitNumber: 2, splitLine: { lineStyle: { color: 'rgba(148,163,184,0.08)' } }, axisLabel: { color: '#8da1bf', fontSize: 10 } },
      ],
      series: [
        {
          name: 'K線', type: 'candlestick', xAxisIndex: 0, yAxisIndex: 0,
          data: d.ohlcv,
          itemStyle: { color: upColor, color0: downColor, borderColor: upColor, borderColor0: downColor },
        },
        { name: 'MA5',  type: 'line', xAxisIndex: 0, yAxisIndex: 0, data: d.ma5,  smooth: true, lineStyle: { width: 1, color: '#fbbf24' }, showSymbol: false },
        { name: 'MA10', type: 'line', xAxisIndex: 0, yAxisIndex: 0, data: d.ma10, smooth: true, lineStyle: { width: 1, color: '#a78bfa' }, showSymbol: false },
        { name: 'MA20', type: 'line', xAxisIndex: 0, yAxisIndex: 0, data: d.ma20, smooth: true, lineStyle: { width: 1, color: '#38bdf8' }, showSymbol: false },
        { name: 'MA60', type: 'line', xAxisIndex: 0, yAxisIndex: 0, data: d.ma60, smooth: true, lineStyle: { width: 1, color: '#fb923c' }, showSymbol: false },
        {
          name: '成交量', type: 'bar', xAxisIndex: 1, yAxisIndex: 1,
          data: d.volumes.map(function (v, i) {
            return { value: v, itemStyle: { color: itemColor(d.ohlcv[i]) } };
          }),
        },
        { name: 'K9', type: 'line', xAxisIndex: 2, yAxisIndex: 2, data: d.kd.k, smooth: true, lineStyle: { width: 1, color: '#fbbf24' }, showSymbol: false },
        { name: 'D9', type: 'line', xAxisIndex: 2, yAxisIndex: 2, data: d.kd.d, smooth: true, lineStyle: { width: 1, color: '#c084fc' }, showSymbol: false },
        {
          name: 'OSC', type: 'bar', xAxisIndex: 3, yAxisIndex: 3,
          data: d.macd.histogram.map(function (v) {
            return { value: v, itemStyle: { color: v >= 0 ? upColor : downColor } };
          }),
        },
        { name: 'DIF', type: 'line', xAxisIndex: 3, yAxisIndex: 3, data: d.macd.dif, smooth: true, lineStyle: { width: 1, color: '#38bdf8' }, showSymbol: false },
        { name: 'DEA', type: 'line', xAxisIndex: 3, yAxisIndex: 3, data: d.macd.dea, smooth: true, lineStyle: { width: 1, color: '#fb923c' }, showSymbol: false },
      ],
    };

    _taiexChart.setOption(option);
    window.addEventListener('resize', function () { _taiexChart && _taiexChart.resize(); });
  }

  // ── Init ─────────────────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('sc-refresh-btn');
    if (btn) btn.addEventListener('click', loadAll);

    var goBtn = document.getElementById('sc-chart-go');
    var input = document.getElementById('sc-chart-input');

    function doChartSearch() {
      var sym = input && input.value.trim();
      if (sym) loadTaiexChart(sym);
    }

    if (goBtn) goBtn.addEventListener('click', doChartSearch);
    if (input) input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') doChartSearch();
    });
  });

  // Expose for hub.js tab activation callback
  window.scLoad = loadAll;
})();
