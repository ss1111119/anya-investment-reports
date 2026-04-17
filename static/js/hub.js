(function () {
  'use strict';

  const REPORTS_BASE = 'https://ss1111119.github.io/anya-investment-reports/';
  const TABS = ['workbench', 'ops', 'reports', 'trading', 'stockroom'];
  const DEFAULT_TAB = 'workbench';

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function activateTab(name) {
    if (!TABS.includes(name)) name = DEFAULT_TAB;

    TABS.forEach(function (t) {
      const section = document.getElementById('tab-' + t);
      const btn = document.querySelector('.hub-tab[data-tab="' + t + '"]');
      if (!section || !btn) return;
      const isActive = t === name;
      section.classList.toggle('active', isActive);
      btn.classList.toggle('active', isActive);
    });

    // Update hash without adding to browser history
    history.replaceState(null, '', '#' + name);

    // Update iframe src when reports tab becomes active
    if (name === 'reports') {
      updateReportsIframe();
    }

    // Reload paper trading dashboard when trading tab becomes active
    if (name === 'trading' && typeof window.ptDashboardLoad === 'function') {
      window.ptDashboardLoad();
    }

    // Load stock control room when stockroom tab becomes active
    if (name === 'stockroom' && typeof window.scLoad === 'function') {
      window.scLoad();
    }
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

  document.addEventListener('DOMContentLoaded', function () {
    // Tab click handlers
    document.querySelectorAll('.hub-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        activateTab(btn.getAttribute('data-tab'));
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

    // Read hash and activate initial tab
    const hash = (location.hash || '').replace('#', '');
    activateTab(TABS.includes(hash) ? hash : DEFAULT_TAB);
  });
})();
