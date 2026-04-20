(function () {
  'use strict';

  var _loaded = false;
  var _currentCat = 'all';

  var SOURCE_LABELS = {
    'cnyes': '鉅亨',
    'cnyes_history': '鉅亨(歷史)',
    'google_news_rss': 'Google RSS',
    'finnhub': 'Finnhub',
    'gnews': 'GNews',
    'guardian': 'Guardian',
    'newsapi_org': 'NewsAPI',
    'newsapi_ai': 'NewsAPI.ai',
  };

  var CAT_LABELS = {
    'tw_stock': '台股', 'us_stock': '美股', 'ai_news': 'AI',
    'headline': '頭條', 'geopolitics': '地緣政治',
    'technology': '科技', 'global_finance': '全球金融',
  };

  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function sourceLabel(s) { return SOURCE_LABELS[s] || s; }
  function catLabel(c) { return CAT_LABELS[c] || c; }

  // ── Stats bar ─────────────────────────────────────────────────────────────

  function renderStats(data) {
    var bar = document.getElementById('news-stats-bar');
    var asOf = document.getElementById('news-as-of');
    if (!bar) return;
    if (asOf) asOf.textContent = '今日統計截至 ' + (data.as_of || '');

    var html = '<span class="news-stat-total">今日 <b>' + (data.today_total || 0) + '</b> 筆</span>';
    (data.by_source || []).forEach(function (s) {
      html += '<span class="news-stat-src"><b>' + esc(sourceLabel(s.source)) + '</b> ' +
              s.count + ' 筆 <span class="news-muted">' + s.last_fetch + '</span></span>';
    });
    bar.innerHTML = html;
  }

  // ── News list ──────────────────────────────────────────────────────────────

  function renderList(items) {
    var list = document.getElementById('news-list');
    if (!list) return;
    if (!items || items.length === 0) {
      list.innerHTML = '<p class="news-empty">此分類目前無新聞。</p>';
      return;
    }
    list.innerHTML = items.map(function (n) {
      var cat = n.category ? '<span class="news-cat-badge">' + esc(catLabel(n.category)) + '</span>' : '';
      var src = '<span class="news-src-badge">' + esc(sourceLabel(n.source)) + '</span>';
      var link = n.url
        ? '<a href="' + esc(n.url) + '" target="_blank" rel="noopener" class="news-title">' + esc(n.title) + '</a>'
        : '<span class="news-title">' + esc(n.title) + '</span>';
      return '<div class="news-item">' +
        '<div class="news-item-meta">' + cat + src + '<span class="news-time">' + esc(n.time_str) + '</span></div>' +
        '<div class="news-item-title">' + link + '</div>' +
        '</div>';
    }).join('');
  }

  // ── API calls ─────────────────────────────────────────────────────────────

  function loadStats() {
    fetch('/api/news/stats')
      .then(function (r) { return r.json(); })
      .then(renderStats)
      .catch(function () {});
  }

  function loadFeed(cat) {
    var list = document.getElementById('news-list');
    if (list) list.innerHTML = '<p class="news-empty">載入中...</p>';
    var url = '/api/news/feed?limit=50' + (cat && cat !== 'all' ? '&category=' + encodeURIComponent(cat) : '');
    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (d) { renderList(d.items || []); })
      .catch(function () {
        if (list) list.innerHTML = '<p class="news-empty">載入失敗，請稍後重試。</p>';
      });
  }

  // ── Events ────────────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', function () {
    var refreshBtn = document.getElementById('news-refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () {
        _loaded = false;
        window.newsLoad();
      });
    }

    // Category filter
    var filterBar = document.querySelector('.news-filter-bar');
    if (filterBar) {
      filterBar.addEventListener('click', function (e) {
        var btn = e.target.closest('.news-filter-btn');
        if (!btn) return;
        filterBar.querySelectorAll('.news-filter-btn').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        _currentCat = btn.dataset.cat || 'all';
        loadFeed(_currentCat);
      });
    }
  });

  // ── Public ────────────────────────────────────────────────────────────────

  window.newsLoad = function () {
    if (_loaded) return;
    _loaded = true;
    loadStats();
    loadFeed(_currentCat);
  };
})();
