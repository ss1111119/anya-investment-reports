(function () {
  'use strict';

  const REPORTS_BASE = 'https://ss1111119.github.io/anya-investment-reports/';
  const TABS = ['workbench', 'ops', 'reports', 'gemini', 'trading', 'stockroom', 'kol', 'news', 'market'];
  const DEFAULT_TAB = 'workbench';
  let activeTab = DEFAULT_TAB;
  let geminiSettingsSnapshot = null;

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function resolveTabFromHash(hash) {
    const name = (hash || '').replace('#', '');
    return TABS.includes(name) ? name : DEFAULT_TAB;
  }

  function renderTab(name) {
    if (!TABS.includes(name)) name = DEFAULT_TAB;
    activeTab = name;

    TABS.forEach(function (t) {
      const section = document.getElementById('tab-' + t);
      const btn = document.querySelector('.hub-tab[data-tab="' + t + '"]');
      if (!section || !btn) return;
      const isActive = t === name;
      section.classList.toggle('active', isActive);
      btn.classList.toggle('active', isActive);
    });

    // Update iframe src when reports tab becomes active
    if (name === 'reports') {
      updateReportsIframe();
    }

    if (name === 'gemini') {
      loadGeminiSettings().catch(function (error) {
        setGeminiMessage(error.message || '無法載入 Gemini 設定', 'error');
      });
    }

    // Reload paper trading dashboard when trading tab becomes active
    if (name === 'trading' && typeof window.ptDashboardLoad === 'function') {
      window.ptDashboardLoad();
    }

    // Load stock control room when stockroom tab becomes active
    if (name === 'stockroom' && typeof window.scLoad === 'function') {
      window.scLoad();
    }

    // Load KOL dashboard when kol tab becomes active
    if (name === 'kol' && typeof window.kolLoad === 'function') {
      window.kolLoad();
    }

    // Load news dashboard when news tab becomes active
    if (name === 'news' && typeof window.newsLoad === 'function') {
      window.newsLoad();
    }

    // Load market dashboard when market tab becomes active
    if (name === 'market' && typeof window.marketLoad === 'function') {
      window.marketLoad();
    }
  }

  function setHash(name) {
    if (!TABS.includes(name)) name = DEFAULT_TAB;
    if (location.hash.replace('#', '') === name) return;
    location.hash = '#' + name;
  }

  function syncFromHash() {
    const resolved = resolveTabFromHash(location.hash);
    if (location.hash && !TABS.includes(location.hash.replace('#', ''))) {
      if (location.hash.replace('#', '') !== DEFAULT_TAB) {
        location.hash = '#' + DEFAULT_TAB;
      }
    }
    renderTab(resolved);
  }

  function buildReportsUrl() {
    const dateInput = document.getElementById('report-date');
    const typeSelect = document.getElementById('report-type');
    const date = (dateInput && dateInput.value) || today();
    const type = (typeSelect && typeSelect.value) || 'morning';
    return REPORTS_BASE + '?date=' + date + '&type=' + type;
  }

  function updateReportsIframe() {
    const frame = document.getElementById('reports-frame');
    if (!frame) return;
    const url = buildReportsUrl();
    if (frame.src !== url) {
      frame.src = url;
    }
  }

  function geminiSourceLabel(source) {
    return source === 'override' ? 'runtime override' : 'environment default';
  }

  function setGeminiMessage(text, kind) {
    const message = document.getElementById('gemini-settings-message');
    const status = document.getElementById('gemini-settings-status');
    if (message) {
      message.textContent = text || '';
      message.dataset.kind = kind || '';
    }
    if (status && text) {
      status.textContent = text;
    }
  }

  function fillGeminiSelect(id, options, value) {
    const select = document.getElementById(id);
    if (!select) return;
    const current = value == null ? '' : String(value);
    const items = Array.isArray(options) ? options.slice() : [];
    if (current && items.indexOf(current) === -1) {
      items.unshift(current);
    }
    select.innerHTML = '';
    items.forEach(function (item) {
      const option = document.createElement('option');
      option.value = item;
      option.textContent = item;
      if (item === current) option.selected = true;
      select.appendChild(option);
    });
    if (current && items.indexOf(current) === -1) {
      select.value = current;
    }
  }

  function applyGeminiSettings(payload) {
    const sourcePayload = Object.assign({}, geminiSettingsSnapshot || {}, payload || {});
    sourcePayload.effective = (payload && payload.effective) ? payload.effective : (geminiSettingsSnapshot && geminiSettingsSnapshot.effective) ? geminiSettingsSnapshot.effective : {};
    sourcePayload.options = (payload && payload.options) ? payload.options : (geminiSettingsSnapshot && geminiSettingsSnapshot.options) ? geminiSettingsSnapshot.options : {};
    const effective = sourcePayload.effective;
    const options = sourcePayload.options;
    const valueMap = {
      'gemini-model': effective.gemini_model,
      'gemini-model-pro': effective.gemini_model_pro,
      'gemini-model-chat': effective.gemini_model_chat,
      'gemini-queue-wait-timeout': effective.gemini_queue_wait_timeout_seconds,
      'gemini-queue-exec-timeout': effective.gemini_queue_exec_timeout_seconds,
      'gemini-queue-retry-max-attempts': effective.gemini_queue_retry_max_attempts,
    };
    const sourceMap = {
      'gemini-model-source': effective.gemini_model,
      'gemini-model-pro-source': effective.gemini_model_pro,
      'gemini-model-chat-source': effective.gemini_model_chat,
      'gemini-queue-wait-timeout-source': effective.gemini_queue_wait_timeout_seconds,
      'gemini-queue-exec-timeout-source': effective.gemini_queue_exec_timeout_seconds,
      'gemini-queue-retry-max-source': effective.gemini_queue_retry_max_attempts,
    };

    fillGeminiSelect('gemini-model', options.gemini_model, valueMap['gemini-model'].value);
    fillGeminiSelect('gemini-model-pro', options.gemini_model_pro, valueMap['gemini-model-pro'].value);
    fillGeminiSelect('gemini-model-chat', options.gemini_model_chat, valueMap['gemini-model-chat'].value);

    const waitTimeout = document.getElementById('gemini-queue-wait-timeout');
    const execTimeout = document.getElementById('gemini-queue-exec-timeout');
    const retryAttempts = document.getElementById('gemini-queue-retry-max-attempts');
    if (waitTimeout && valueMap['gemini-queue-wait-timeout']) waitTimeout.value = valueMap['gemini-queue-wait-timeout'].value;
    if (execTimeout && valueMap['gemini-queue-exec-timeout']) execTimeout.value = valueMap['gemini-queue-exec-timeout'].value;
    if (retryAttempts && valueMap['gemini-queue-retry-max-attempts']) retryAttempts.value = valueMap['gemini-queue-retry-max-attempts'].value;

    Object.keys(sourceMap).forEach(function (id) {
      const el = document.getElementById(id);
      const meta = sourceMap[id];
      if (!el || !meta) return;
      el.textContent = geminiSourceLabel(meta.source);
    });

    geminiSettingsSnapshot = sourcePayload;
    setGeminiMessage('設定已載入', 'ok');
  }

  async function loadGeminiSettings() {
    const response = await fetch('/api/workbench/gemini-settings');
    if (!response.ok) {
      throw new Error('無法載入 Gemini 設定');
    }
    const payload = await response.json();
    applyGeminiSettings(payload);
  }

  async function saveGeminiSettings(event) {
    event.preventDefault();
    const message = document.getElementById('gemini-settings-message');
    if (message) message.textContent = '儲存中...';

    const payload = {
      gemini_model: document.getElementById('gemini-model')?.value || null,
      gemini_model_pro: document.getElementById('gemini-model-pro')?.value || null,
      gemini_model_chat: document.getElementById('gemini-model-chat')?.value || null,
      gemini_queue_wait_timeout_seconds: Number(document.getElementById('gemini-queue-wait-timeout')?.value || 0),
      gemini_queue_exec_timeout_seconds: Number(document.getElementById('gemini-queue-exec-timeout')?.value || 0),
      gemini_queue_retry_max_attempts: Number(document.getElementById('gemini-queue-retry-max-attempts')?.value || 0),
    };

    const response = await fetch('/api/workbench/gemini-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.detail || '儲存失敗');
    }
    applyGeminiSettings(result);
    setGeminiMessage('設定已儲存並套用', 'ok');
  }

  document.addEventListener('DOMContentLoaded', function () {
    // Tab click handlers
    document.querySelectorAll('.hub-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setHash(btn.getAttribute('data-tab'));
      });
    });

    // Set default date to today
    const dateInput = document.getElementById('report-date');
    if (dateInput && !dateInput.value) {
      dateInput.value = today();
    }

    // Reports toolbar change handlers
    ['report-date', 'report-type'].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('change', function () {
          // Only update iframe if reports tab is currently active
          const reportsSection = document.getElementById('tab-reports');
          if (reportsSection && reportsSection.classList.contains('active')) {
            updateReportsIframe();
          }
        });
      }
    });

    const geminiForm = document.getElementById('gemini-settings-form');
    if (geminiForm) {
      geminiForm.addEventListener('submit', function (event) {
        saveGeminiSettings(event).catch(function (error) {
          setGeminiMessage(error.message || '儲存失敗', 'error');
        });
      });
    }

    window.addEventListener('hashchange', syncFromHash);

    // Read hash and activate initial tab
    syncFromHash();
  });
})();
