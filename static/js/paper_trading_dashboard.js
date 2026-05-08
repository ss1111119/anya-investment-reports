(function () {
  'use strict';

  var balanceChart = null;
  var _pnlInterval = null;

  function fmt(n) {
    if (n == null) return '-';
    return Number(n).toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  function fmtPct(n) {
    if (n == null) return '-';
    var v = Number(n);
    return (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
  }

  function colorClass(n) {
    if (n == null) return '';
    return Number(n) >= 0 ? 'pt-pos' : 'pt-neg';
  }

  function renderHealthBar(h) {
    var bar = document.getElementById('pt-health-bar');
    var badges = document.getElementById('pt-health-badges');
    if (!bar || !badges) return;

    var items = [];
    var hasAlert = false;

    // Circuit Breaker
    if (h.circuit_breaker) {
      hasAlert = true;
      var since = h.circuit_breaker_since ? h.circuit_breaker_since.slice(0, 10) : '';
      items.push('<span class="pt-hbadge pt-hbadge--crit">⛔ Circuit Breaker ON' + (since ? ' (' + since + ')' : '') + '</span>');
    } else {
      items.push('<span class="pt-hbadge pt-hbadge--ok">✓ 交易正常</span>');
    }

    // 回撤
    if (h.drawdown_pct < -5) {
      hasAlert = true;
      items.push('<span class="pt-hbadge pt-hbadge--warn">回撤 ' + h.drawdown_pct + '%</span>');
    }

    // 閒置天數
    if (h.days_since_last_trade >= 7) {
      hasAlert = true;
      items.push('<span class="pt-hbadge pt-hbadge--warn">⏸ ' + h.days_since_last_trade + ' 天無交易</span>');
    } else if (h.days_since_last_trade >= 0) {
      items.push('<span class="pt-hbadge pt-hbadge--muted">距上次交易 ' + h.days_since_last_trade + ' 天</span>');
    }

    // 貸款逾期
    if (h.loan_overdue) {
      hasAlert = true;
      items.push('<span class="pt-hbadge pt-hbadge--crit">💳 貸款逾期 (' + (h.next_payment_date || '').slice(0, 10) + ')</span>');
    }

    badges.innerHTML = items.join('');
    bar.style.display = '';
    bar.className = 'pt-health-bar' + (hasAlert ? ' pt-health-bar--alert' : '');
  }

  function loadSummary() {
    fetch('/api/paper-trading/summary')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.error) return;
        var el = function (id) { return document.getElementById(id); };
        el('pt-balance') && (el('pt-balance').textContent = '$' + fmt(d.balance));
        el('pt-total-assets') && (el('pt-total-assets').textContent = '$' + fmt(d.total_assets));
        el('pt-stock-value') && (el('pt-stock-value').textContent = '$' + fmt(d.stock_value));
        el('pt-position-count') && (el('pt-position-count').textContent = d.position_count);
        el('pt-position-count-hero') && (el('pt-position-count-hero').textContent = d.position_count);
        if (d.health) renderHealthBar(d.health);
      })
      .catch(function () {});
  }

  function loadPositions() {
    fetch('/api/paper-trading/positions')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var tbody = document.getElementById('pt-positions-body');
        if (!tbody) return;
        var rows = d.positions || [];
        if (rows.length === 0) {
          tbody.innerHTML = '<tr><td colspan="9" class="pt-placeholder">目前無持倉</td></tr>';
          return;
        }
        tbody.innerHTML = rows.map(function (p) {
          var plClass = colorClass(p.profit_loss);
          return '<tr>' +
            '<td>' + (p.stock_code || '-') + '</td>' +
            '<td>' + (p.stock_name || '-') + '</td>' +
            '<td>' + fmt(p.quantity) + '</td>' +
            '<td>' + fmt(p.avg_cost) + '</td>' +
            '<td>' + fmt(p.current_price) + '</td>' +
            '<td>' + fmt(p.market_value) + '</td>' +
            '<td class="' + plClass + '">' + fmt(p.profit_loss) + '</td>' +
            '<td class="' + plClass + '">' + fmtPct(p.profit_loss_pct) + '</td>' +
            '<td>' + (p.updated_at ? p.updated_at.slice(0, 16) : '-') + '</td>' +
            '</tr>';
        }).join('');
      })
      .catch(function () {
        var tbody = document.getElementById('pt-positions-body');
        if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="pt-placeholder">載入失敗</td></tr>';
      });
  }

  function loadTransactions() {
    fetch('/api/paper-trading/transactions')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var tbody = document.getElementById('pt-transactions-body');
        if (!tbody) return;
        var rows = d.transactions || [];
        if (rows.length === 0) {
          tbody.innerHTML = '<tr><td colspan="10" class="pt-placeholder">尚無交易紀錄</td></tr>';
          return;
        }
        tbody.innerHTML = rows.map(function (t) {
          var typeLabel = { BUY: '買入', SELL: '賣出', LOAN_PAYMENT: '還款', DIVIDEND: '股息' }[t.trans_type] || t.trans_type;
          var amtClass = t.amount >= 0 ? 'pt-pos' : 'pt-neg';
          return '<tr>' +
            '<td>' + (t.created_at ? t.created_at.slice(0, 16) : '-') + '</td>' +
            '<td>' + typeLabel + '</td>' +
            '<td>' + (t.stock_code || '-') + '</td>' +
            '<td>' + fmt(t.price) + '</td>' +
            '<td>' + fmt(t.quantity) + '</td>' +
            '<td class="' + amtClass + '">' + (t.amount >= 0 ? '+' : '') + fmt(t.amount) + '</td>' +
            '<td>' + fmt(t.fee) + '</td>' +
            '<td>' + fmt(t.tax) + '</td>' +
            '<td>' + fmt(t.balance_after) + '</td>' +
            '<td>' + (t.note || '-') + '</td>' +
            '</tr>';
        }).join('');
      })
      .catch(function () {
        var tbody = document.getElementById('pt-transactions-body');
        if (tbody) tbody.innerHTML = '<tr><td colspan="10" class="pt-placeholder">載入失敗</td></tr>';
      });
  }

  function loadBalanceChart() {
    fetch('/api/paper-trading/balance-history')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var canvas = document.getElementById('pt-balance-chart');
        if (!canvas) return;
        var history = d.history || [];
        var labels = history.map(function (h) { return h.date || ''; });
        var values = history.map(function (h) { return h.balance; });

        if (balanceChart) {
          balanceChart.destroy();
          balanceChart = null;
        }

        balanceChart = new Chart(canvas, {
          type: 'line',
          data: {
            labels: labels,
            datasets: [{
              label: '現金餘額',
              data: values,
              borderColor: '#76a9ff',
              backgroundColor: 'rgba(118, 169, 255, 0.08)',
              borderWidth: 2,
              pointRadius: 2,
              fill: true,
              tension: 0.3,
            }],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: function (ctx) {
                    return '$' + Number(ctx.raw).toLocaleString('zh-TW');
                  },
                },
              },
            },
            scales: {
              x: {
                ticks: { color: '#8da1bf', maxTicksLimit: 8, font: { size: 11 } },
                grid: { color: 'rgba(148,163,184,0.08)' },
              },
              y: {
                ticks: {
                  color: '#8da1bf',
                  font: { size: 11 },
                  callback: function (v) { return '$' + Number(v).toLocaleString('zh-TW'); },
                },
                grid: { color: 'rgba(148,163,184,0.08)' },
              },
            },
          },
        });
      })
      .catch(function () {});
  }

  function loadRecapContent(date) {
    var el = document.getElementById('pt-recap-content');
    if (!el || !date) return;
    el.innerHTML = '<p style="color:#8da1bf">載入中…</p>';
    fetch('/api/paper-trading/recaps/' + date)
      .then(function (r) { return r.json(); })
      .then(function (d) {
        el.innerHTML = d.html || '<p style="color:#8da1bf">（無內容）</p>';
      })
      .catch(function () { el.innerHTML = '<p style="color:#f87171">載入失敗</p>'; });
  }

  function loadRecaps() {
    fetch('/api/paper-trading/recaps')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var sel = document.getElementById('pt-recap-date');
        if (!sel) return;
        var dates = d.dates || [];
        sel.innerHTML = dates.length === 0
          ? '<option value="">（無報告）</option>'
          : dates.map(function (dt) {
              return '<option value="' + dt + '">' + dt + '</option>';
            }).join('');
        if (dates.length > 0) loadRecapContent(dates[0]);
      })
      .catch(function () {});
  }

  function loadAll() {
    loadSummary();
    loadPositions();
    loadTransactions();
    loadBalanceChart();
    loadRecaps();
    loadPerformance();
    loadPnlSummary();
    loadAccuracyTrend();
    if (_pnlInterval) clearInterval(_pnlInterval);
    _pnlInterval = setInterval(loadPnlSummary, 60000);
  }

  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('pt-refresh-btn');
    if (btn) btn.addEventListener('click', loadAll);

    document.addEventListener('change', function (e) {
      if (e.target && e.target.id === 'pt-recap-date') {
        loadRecapContent(e.target.value);
      }
    });

    loadAll();
  });

  // ── Strategy Performance ─────────────────────────────────────────────────

  var _perfCharts = {};

  function destroyChart(id) {
    if (_perfCharts[id]) { _perfCharts[id].destroy(); delete _perfCharts[id]; }
  }

  function stockBar(item) {
    var sign = item.pnl >= 0 ? 'pt-pos' : 'pt-neg';
    var wr = item.trades > 0 ? Math.round(item.wins / item.trades * 100) : 0;
    return '<div class="pt-perf-stock-row">' +
      '<span class="pt-perf-stock-code">' + item.code + '</span>' +
      '<span class="' + sign + '">' + (item.pnl >= 0 ? '+' : '') + item.pnl.toLocaleString() + '</span>' +
      '<span class="pt-perf-stock-wr">' + item.trades + '筆 ' + wr + '%</span>' +
      '</div>';
  }

  function loadPerformance() {
    fetch('/api/paper-trading/performance')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.error) return;
        var s = d.summary || {};

        // Summary bar
        var sumEl = document.getElementById('pt-perf-summary');
        if (sumEl) {
          var pnlClass = (s.total_realized_pnl || 0) >= 0 ? 'pt-pos' : 'pt-neg';
          sumEl.innerHTML =
            '<span class="pt-perf-stat">總交易 <b>' + (s.total_trades || 0) + '</b> 筆</span>' +
            '<span class="pt-perf-stat">整體勝率 <b>' + (s.overall_win_rate || 0) + '%</b></span>' +
            '<span class="pt-perf-stat">已實現損益 <b class="' + pnlClass + '">' +
              ((s.total_realized_pnl || 0) >= 0 ? '+' : '') + (s.total_realized_pnl || 0).toLocaleString() + '</b></span>';
        }

        // Cumulative PnL
        var cum = d.cumulative_pnl || [];
        destroyChart('cumulative');
        var cumCtx = document.getElementById('pt-cumulative-chart');
        if (cumCtx && cum.length) {
          _perfCharts['cumulative'] = new Chart(cumCtx, {
            type: 'line',
            data: {
              labels: cum.map(function (p) { return p.date; }),
              datasets: [{
                data: cum.map(function (p) { return p.cumulative_pnl; }),
                borderColor: '#76a9ff', backgroundColor: 'rgba(118,169,255,0.08)',
                pointRadius: 0, tension: 0.3, fill: true,
              }]
            },
            options: {
              plugins: { legend: { display: false } },
              scales: {
                x: { ticks: { color: '#8da1bf', font: { size: 10 }, maxTicksLimit: 6 }, grid: { display: false } },
                y: { ticks: { color: '#8da1bf', font: { size: 10 }, callback: function(v) { return (v>=0?'+':'')+v.toLocaleString(); } }, grid: { color: 'rgba(148,163,184,0.08)' } }
              }
            }
          });
        }

        // Monthly PnL
        var mon = d.monthly || [];
        destroyChart('monthly');
        var monCtx = document.getElementById('pt-monthly-chart');
        if (monCtx && mon.length) {
          _perfCharts['monthly'] = new Chart(monCtx, {
            type: 'bar',
            data: {
              labels: mon.map(function (m) { return m.month; }),
              datasets: [{
                data: mon.map(function (m) { return m.pnl; }),
                backgroundColor: mon.map(function (m) { return m.pnl >= 0 ? 'rgba(74,222,128,0.6)' : 'rgba(251,113,133,0.6)'; }),
                borderRadius: 4,
              }]
            },
            options: {
              plugins: { legend: { display: false } },
              scales: {
                x: { ticks: { color: '#8da1bf', font: { size: 10 } }, grid: { display: false } },
                y: { ticks: { color: '#8da1bf', font: { size: 10 }, callback: function(v) { return (v>=0?'+':'')+v.toLocaleString(); } }, grid: { color: 'rgba(148,163,184,0.08)' } }
              }
            }
          });
        }

        // Rolling win rate
        var roll = d.rolling_win_rate || [];
        destroyChart('winrate');
        var wrCtx = document.getElementById('pt-winrate-chart');
        if (wrCtx && roll.length) {
          _perfCharts['winrate'] = new Chart(wrCtx, {
            type: 'line',
            data: {
              labels: roll.map(function (r) { return r.date; }),
              datasets: [{
                data: roll.map(function (r) { return r.win_rate; }),
                borderColor: '#f6c453', backgroundColor: 'rgba(246,196,83,0.08)',
                pointRadius: 2, tension: 0.3, fill: true,
              }]
            },
            options: {
              plugins: { legend: { display: false } },
              scales: {
                x: { ticks: { color: '#8da1bf', font: { size: 10 }, maxTicksLimit: 6 }, grid: { display: false } },
                y: { min: 0, max: 100, ticks: { color: '#8da1bf', font: { size: 10 }, callback: function(v) { return v + '%'; } }, grid: { color: 'rgba(148,163,184,0.08)' } }
              }
            }
          });
        }

        // Top / Bottom stocks
        var topEl = document.getElementById('pt-top-stocks');
        var botEl = document.getElementById('pt-bottom-stocks');
        if (topEl) topEl.innerHTML = (d.top_stocks || []).map(stockBar).join('');
        if (botEl) botEl.innerHTML = (d.bottom_stocks || []).map(stockBar).join('');

        // Key events
        var evEl = document.getElementById('pt-key-events');
        if (evEl && (d.key_events || []).length) {
          evEl.innerHTML = '<div class="pt-perf-chart-title" style="margin-top:16px">關鍵事件</div>' +
            (d.key_events || []).map(function (e) {
              return '<div class="pt-perf-event"><span class="pt-perf-event-date">' + e.date + '</span>' +
                '<span class="pt-perf-event-label">' + e.event + '</span>' +
                '<span class="pt-muted">×' + e.count + '</span></div>';
            }).join('');
        }
      })
      .catch(function () {});
  }

  // ── P&L Summary + Accuracy Trend (paper-trading-observability) ──────────

  var accuracyChart = null;

  function fmtNTD(v) {
    if (v == null) return '無法取得即時價格';
    var n = Math.round(Number(v));
    return (n >= 0 ? '+' : '') + n.toLocaleString('zh-TW') + ' NT$';
  }

  function fmtPctSigned(v) {
    if (v == null) return '—';
    return (Number(v) * 100).toFixed(2) + '%';
  }

  function loadPnlSummary() {
    fetch('/api/paper-trading/pnl-summary')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var uEl = document.getElementById('pnl-unrealized-value');
        var rEl = document.getElementById('pnl-realized-value');
        var wrEl = document.getElementById('pnl-win-rate');
        var ddEl = document.getElementById('pnl-drawdown-value');

        if (uEl) {
          uEl.textContent = d.unrealized_pnl == null ? '無法取得即時價格' : fmtNTD(d.unrealized_pnl);
          uEl.className = 'pnl-card-value ' + (d.unrealized_pnl != null && d.unrealized_pnl >= 0 ? 'pt-pos' : 'pt-neg');
        }
        if (rEl) {
          rEl.textContent = fmtNTD(d.realized_pnl);
          rEl.className = 'pnl-card-value ' + (d.realized_pnl >= 0 ? 'pt-pos' : 'pt-neg');
        }
        if (wrEl) wrEl.textContent = d.win_rate == null ? '—' : fmtPctSigned(d.win_rate);
        if (ddEl) {
          ddEl.textContent = fmtPctSigned(d.max_drawdown);
          ddEl.className = 'pnl-card-value pt-neg';
        }
      })
      .catch(function () {});
  }

  function loadAccuracyTrend() {
    fetch('/api/paper-trading/accuracy-trend?days=30')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var trend = d.trend || [];
        var titleEl = document.getElementById('accuracy-trend-title');
        var canvas = document.getElementById('accuracy-trend-chart');
        if (!canvas) return;

        var labels = trend.map(function (t) { return t.date.slice(5); }); // MM-DD
        var values = trend.map(function (t) { return t.win_rate != null ? (t.win_rate * 100).toFixed(1) : null; });

        if (trend.length < 5 && titleEl) {
          titleEl.textContent = '30 天信號勝率趨勢（資料累積中）';
        }

        if (accuracyChart) { accuracyChart.destroy(); accuracyChart = null; }
        accuracyChart = new Chart(canvas, {
          type: 'line',
          data: {
            labels: labels,
            datasets: [{
              label: '勝率 %',
              data: values,
              borderColor: '#38bdf8',
              backgroundColor: 'rgba(56,189,248,0.1)',
              tension: 0.3,
              pointRadius: 3,
              spanGaps: true,
            }]
          },
          options: {
            plugins: { legend: { display: false } },
            scales: {
              x: { ticks: { color: '#8da1bf', font: { size: 10 }, maxTicksLimit: 8 }, grid: { display: false } },
              y: { min: 0, max: 100, ticks: { color: '#8da1bf', font: { size: 10 }, callback: function (v) { return v + '%'; } }, grid: { color: 'rgba(148,163,184,0.08)' } }
            }
          }
        });
      })
      .catch(function () {});
  }

  // Expose for hub.js to call when tab activates
  window.ptDashboardLoad = loadAll;
})();
