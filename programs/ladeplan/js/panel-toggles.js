(() => {

  'use strict';



  const STORAGE_PREFIX = 'ladeplan-panel-';



  function setCollapsed(collapsed, { column, toggle, side, appEl }) {

    column.classList.toggle('is-collapsed', collapsed);

    if (appEl) {

      appEl.classList.toggle(`is-${side}-panel-collapsed`, collapsed);

    }

    toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');

    toggle.setAttribute(

      'aria-label',

      collapsed

        ? (side === 'left' ? 'Linkes Menü einblenden' : 'Rechtes Menü einblenden')

        : (side === 'left' ? 'Linkes Menü ausblenden' : 'Rechtes Menü ausblenden'),

    );

  }



  function initLadeplanPanelToggles(options = {}) {

    const appEl = document.getElementById(options.appId || 'app-layout');

    const columns = options.columns || [];

    columns.forEach(({ columnId, toggleId, side, storageKey }) => {

      const column = document.getElementById(columnId);

      const toggle = document.getElementById(toggleId);

      if (!column || !toggle) return;



      const key = STORAGE_PREFIX + storageKey;

      const ctx = { column, toggle, side, appEl };



      if (localStorage.getItem(key) === 'collapsed') {

        setCollapsed(true, ctx);

      }



      toggle.addEventListener('click', () => {

        const collapsed = !column.classList.contains('is-collapsed');

        setCollapsed(collapsed, ctx);

        localStorage.setItem(key, collapsed ? 'collapsed' : 'expanded');

        window.dispatchEvent(new Event('resize'));

      });

    });

  }



  window.initLadeplanPanelToggles = initLadeplanPanelToggles;

})();
