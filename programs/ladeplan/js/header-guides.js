(function initLadeplanHeaderGuides() {
  function openDialog(id) {
    closeDialogs();
    const dialog = document.getElementById(id);
    if (!dialog) return;
    dialog.classList.remove('hidden');
    const btn = id === 'dialog-guide' ? document.getElementById('btn-guide') : document.getElementById('btn-info');
    if (btn) btn.setAttribute('aria-expanded', 'true');
  }

  function closeDialogs() {
    ['dialog-guide', 'dialog-info'].forEach((id) => {
      const dialog = document.getElementById(id);
      if (dialog) dialog.classList.add('hidden');
    });
    ['btn-guide', 'btn-info'].forEach((id) => {
      const btn = document.getElementById(id);
      if (btn) btn.setAttribute('aria-expanded', 'false');
    });
  }

  function bind() {
    const btnGuide = document.getElementById('btn-guide');
    const btnInfo = document.getElementById('btn-info');
    const dialogGuide = document.getElementById('dialog-guide');
    const dialogInfo = document.getElementById('dialog-info');

    if (!btnGuide || !btnInfo || !dialogGuide || !dialogInfo) return;

    btnGuide.addEventListener('click', () => {
      if (dialogGuide.classList.contains('hidden')) openDialog('dialog-guide');
      else closeDialogs();
    });
    btnInfo.addEventListener('click', () => {
      if (dialogInfo.classList.contains('hidden')) openDialog('dialog-info');
      else closeDialogs();
    });
    document.querySelectorAll('[data-close-dialog]').forEach((el) => {
      el.addEventListener('click', closeDialogs);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeDialogs();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();
