(function () {
  'use strict';

  var balanceChart = null;

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

  // Expose for hub.js to call when tab activates
  window.ptDashboardLoad = loadAll;
})();
