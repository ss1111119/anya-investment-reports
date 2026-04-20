(function () {
  'use strict';

  let _loaded = false;

  // ── Helpers ──────────────────────────────────────────────────────────────

  function esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function dot(icon) {
    return '<span class="kol-dot kol-dot--' + esc(icon) + '"></span>';
  }

  function badge(bb, score) {
    var cls = bb === 'Bullish' ? 'bullish' : bb === 'Bearish' ? 'bearish' : 'neutral';
    var label = bb === 'Bullish' ? '多' : bb === 'Bearish' ? '空' : '中';
    return '<span class="kol-badge kol-badge--' + cls + '">' + label + ' ' + esc(score) + '</span>';
  }

  // ── Render ───────────────────────────────────────────────────────────────

  function renderStatusGrid(kols) {
    var grid = document.getElementById('kol-status-grid');
    if (!grid) return;
    if (!kols || kols.length === 0) {
      grid.innerHTML = '<p class="kol-empty">尚無 KOL 資料。</p>';
      return;
    }
    grid.innerHTML = kols.map(function (k) {
      return (
        '<div class="kol-status-card" data-key="' + esc(k.key) + '">' +
          '<div class="kol-card-header">' +
            dot(k.status_icon) +
            '<span class="kol-card-name">' + esc(k.display_name) + '</span>' +
          '</div>' +
          '<div class="kol-card-platform">' + esc(k.platform) + '</div>' +
          '<div class="kol-card-time">' + esc(k.time_str) + '</div>' +
          '<div class="kol-card-preview">' + esc(k.short_summary) + '</div>' +
        '</div>'
      );
    }).join('');
  }

  function renderSummaryCard(item) {
    var themes = (item.key_themes || []).map(function (t) {
      return '<span class="kol-theme-chip">' + esc(t) + '</span>';
    }).join('');

    var transcriptSection = '';
    if (item.has_transcript && item.platform_post_id) {
      transcriptSection =
        '<details class="kol-transcript-details">' +
          '<summary>原始逐字稿</summary>' +
          '<div class="kol-transcript-body" data-post-id="' + esc(item.platform_post_id) + '">載入中...</div>' +
        '</details>';
    }

    return (
      '<div class="kol-summary-card">' +
        '<div class="kol-summary-head">' +
          badge(item.bullish_bearish, item.sentiment_score) +
          '<span class="kol-summary-time">' + esc(item.time_str) + '</span>' +
        '</div>' +
        (themes ? '<div class="kol-themes">' + themes + '</div>' : '') +
        '<pre class="kol-summary-text">' + esc(item.summary) + '</pre>' +
        transcriptSection +
      '</div>'
    );
  }

  // ── API ──────────────────────────────────────────────────────────────────

  async function loadStatus() {
    var grid = document.getElementById('kol-status-grid');
    if (grid) grid.innerHTML = '<p class="kol-loading">載入中...</p>';
    try {
      var res = await fetch('/api/kol/status');
      var data = await res.json();
      renderStatusGrid(data.kols);
      var ts = document.getElementById('kol-last-updated');
      if (ts) {
        ts.textContent = '更新: ' + new Date(data.generated_at).toLocaleTimeString('zh-TW');
      }
    } catch (e) {
      if (grid) grid.innerHTML = '<p class="kol-empty">載入失敗，請稍後重試。</p>';
    }
  }

  async function loadSummaries(username) {
    var panel = document.getElementById('kol-detail-panel');
    var grid = document.getElementById('kol-status-grid');
    var nameEl = document.getElementById('kol-detail-name');
    var list = document.getElementById('kol-summaries-list');

    if (panel) panel.style.display = '';
    if (grid) grid.style.display = 'none';
    if (nameEl) nameEl.textContent = username;
    if (list) list.innerHTML = '<p class="kol-loading">載入中...</p>';

    try {
      var res = await fetch('/api/kol/summaries?username=' + encodeURIComponent(username) + '&limit=10');
      var data = await res.json();
      if (list) {
        list.innerHTML = data.kols.length
          ? data.kols.map(renderSummaryCard).join('')
          : '<p class="kol-empty">此 KOL 目前無摘要記錄。</p>';
      }
      // Update detail panel title with display name
      if (nameEl && data.kols.length) {
        nameEl.textContent = data.kols[0].display_name || username;
      }
    } catch (e) {
      if (list) list.innerHTML = '<p class="kol-empty">載入失敗，請稍後重試。</p>';
    }
  }

  async function loadTranscript(postId, el) {
    if (el.dataset.loaded) return;
    el.dataset.loaded = '1';
    el.textContent = '載入中...';
    try {
      var res = await fetch('/api/kol/transcript/' + encodeURIComponent(postId));
      var data = await res.json();
      el.textContent = data.transcript || '（此集無逐字稿）';
    } catch (e) {
      el.textContent = '逐字稿載入失敗。';
    }
  }

  // ── Events ───────────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', function () {
    var refreshBtn = document.getElementById('kol-refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () {
        _loaded = false;
        loadStatus();
      });
    }

    var closeBtn = document.getElementById('kol-detail-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        var panel = document.getElementById('kol-detail-panel');
        var grid = document.getElementById('kol-status-grid');
        if (panel) panel.style.display = 'none';
        if (grid) grid.style.display = '';
      });
    }

    var grid = document.getElementById('kol-status-grid');
    if (grid) {
      grid.addEventListener('click', function (e) {
        var card = e.target.closest('.kol-status-card');
        if (card && card.dataset.key) {
          loadSummaries(card.dataset.key);
        }
      });
    }

    var list = document.getElementById('kol-summaries-list');
    if (list) {
      list.addEventListener('toggle', function (e) {
        if (e.target.tagName === 'DETAILS' && e.target.open) {
          var body = e.target.querySelector('.kol-transcript-body');
          if (body && body.dataset.postId) {
            loadTranscript(body.dataset.postId, body);
          }
        }
      }, true);
    }
  });

  // ── Public ───────────────────────────────────────────────────────────────

  window.kolLoad = function () {
    if (_loaded) return;
    _loaded = true;
    loadStatus();
  };
})();
