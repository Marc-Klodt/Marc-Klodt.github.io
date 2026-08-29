(() => {
  'use strict';

  const AD_SLOT_ROOT_ID = 'ad-slot';
  const AD_SLOT_PANEL_COUNT = 4;

  /** Interne Inhaltszuordnung pro Fenster (unabhängig von sichtbarer Nummerierung). */
  const AD_PANEL_CONTENT = Object.freeze({
    1: 'beer',
    2: 'vehicles',
    3: 'restaurants',
    4: 'games',
  });

  /** Wechselintervall pro Fenster in Millisekunden. */
  const AD_PANEL_INTERVAL_MS = Object.freeze({
    1: 15000,
    2: 18000,
    3: 13000,
    4: 20000,
  });

  function getAdPanelNumber(panel) {
    const raw = panel?.dataset?.adPanel;
    const panelNumber = Number.parseInt(raw, 10);
    if (!Number.isInteger(panelNumber) || panelNumber < 1) return null;
    return panelNumber;
  }

  function getAdPanel(panelNumber) {
    if (!Number.isInteger(panelNumber) || panelNumber < 1) return null;
    const slot = document.getElementById(AD_SLOT_ROOT_ID);
    if (!slot) return null;
    return (
      slot.querySelector(`.ad-slot-content[data-ad-panel="${panelNumber}"]`)
      || document.getElementById(`ad-slot-content-${panelNumber}`)
    );
  }

  function getAllAdPanels(root) {
    const slot = root || document.getElementById(AD_SLOT_ROOT_ID);
    if (!slot) return [];
    return Array.from(slot.querySelectorAll('.ad-slot-content'))
      .map((panel) => ({ panel, panelNumber: getAdPanelNumber(panel) }))
      .filter((entry) => entry.panelNumber != null)
      .sort((a, b) => a.panelNumber - b.panelNumber)
      .map((entry) => entry.panel);
  }

  function getAdPanelContentType(panelNumber) {
    if (!Number.isInteger(panelNumber) || panelNumber < 1) return null;
    return AD_PANEL_CONTENT[panelNumber] ?? null;
  }

  function getAdPanelContentTypeForPanel(panel) {
    return getAdPanelContentType(getAdPanelNumber(panel));
  }

  function getAdPanelIntervalMs(panelNumber) {
    if (!Number.isInteger(panelNumber) || panelNumber < 1) return null;
    return AD_PANEL_INTERVAL_MS[panelNumber] ?? null;
  }

  function getAdPanelIntervalMsForPanel(panel) {
    return getAdPanelIntervalMs(getAdPanelNumber(panel));
  }

  window.AdSlots = {
    ROOT_ID: AD_SLOT_ROOT_ID,
    PANEL_COUNT: AD_SLOT_PANEL_COUNT,
    PANEL_CONTENT: AD_PANEL_CONTENT,
    PANEL_INTERVAL_MS: AD_PANEL_INTERVAL_MS,
    getPanelNumber: getAdPanelNumber,
    getPanel: getAdPanel,
    getAllPanels: getAllAdPanels,
    getPanelContentType: getAdPanelContentType,
    getPanelContentTypeForPanel: getAdPanelContentTypeForPanel,
    getPanelIntervalMs: getAdPanelIntervalMs,
    getPanelIntervalMsForPanel: getAdPanelIntervalMsForPanel,
  };
})();
