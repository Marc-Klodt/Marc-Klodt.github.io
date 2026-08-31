(() => {

  'use strict';



  function app() {

    return window.Ladeplan3D;

  }



  function escapeXml(value) {

    return String(value ?? '')

      .replace(/&/g, '&amp;')

      .replace(/</g, '&lt;')

      .replace(/>/g, '&gt;')

      .replace(/"/g, '&quot;');

  }



  function downloadBlob(blob, filename) {

    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');

    a.href = url;

    a.download = filename;

    a.click();

    URL.revokeObjectURL(url);

  }



  function getSelectedMode(radioName, fallback = 'all') {

    const selected = document.querySelector(`input[name="${radioName}"]:checked`);

    return selected?.value || fallback;

  }



  function buildListCanvas(mode) {

    const api = app();

    if (!api) return null;

    const truck = api.getTruck();

    const items = api.getItems();

    const canvas = document.createElement('canvas');

    canvas.width = 900;

    canvas.height = Math.max(400, 120 + items.length * (mode === 'beladung' ? 80 : 56));

    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#ffffff';

    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#0f172a';

    ctx.font = 'bold 20px Segoe UI, system-ui, sans-serif';

    const titles = { plan: 'Ladeplan', list: 'Ladegut', both: 'Ladegut + Beladung', beladung: 'Beladung', all: 'Alles' };

    ctx.fillText(`Ladeplan 3D · ${titles[mode] || 'Export'}`, 32, 36);

    if (truck) {

      const bedH = api.getTruckHeight(truck);

      ctx.font = '14px Segoe UI, system-ui, sans-serif';

      ctx.fillStyle = '#475569';

      ctx.fillText(`${truck.name} · ${truck.length.toFixed(2)}×${truck.width.toFixed(2)}×${bedH.toFixed(2)} m · Max. Ladehöhe ${bedH.toFixed(2)} m`, 32, 58);

    }

    let y = 88;

    items.forEach((item, index) => {

      ctx.fillStyle = '#0f172a';

      ctx.font = 'bold 15px Segoe UI, system-ui, sans-serif';

      ctx.fillText(`${index + 1}. ${api.itemLabel(item, index)}`, 32, y);

      y += 20;

      ctx.font = '13px Segoe UI, system-ui, sans-serif';

      ctx.fillStyle = '#334155';

      if (mode !== 'beladung') {

        ctx.fillText(

          `Maße: ${(item.length * 100).toFixed(0)}×${(item.width * 100).toFixed(0)}×${(item.height * 100).toFixed(0)} cm · Position x${item.x.toFixed(2)} y${item.y.toFixed(2)} z${item.z.toFixed(2)} · Gewicht: ${item.weight ?? '—'} kg`,

          48, y,

        );

        y += 18;

      }

      if (mode === 'both' || mode === 'beladung' || mode === 'all') {

        const bel = api.getItemBeladung(item);

        ctx.fillText(`Beladung: ${bel.length ? bel.join(' · ') : '— keine Beladung —'}`, 48, y);

        y += 22;

      } else {

        y += 8;

      }

      y += 8;

    });

    return canvas;

  }



  function buildExportPages(mode) {

    const api = app();

    if (!api) return [];

    const pages = [];

    if (mode === 'plan' || mode === 'both' || mode === 'all') {

      const planCanvas = api.captureExportCanvas();

      if (planCanvas) pages.push({ type: 'plan', canvas: planCanvas });

    }

    if (mode !== 'plan') {

      const listCanvas = buildListCanvas(mode);

      if (listCanvas) pages.push({ type: 'list', canvas: listCanvas });

    }

    if (mode === 'all') {

      ['list', 'both', 'beladung'].forEach((listMode) => {

        if (listMode !== mode) {

          const extra = buildListCanvas(listMode);

          if (extra) pages.push({ type: 'list', canvas: extra });

        }

      });

    }

    return pages;

  }



  function exportPdf(mode) {

    const pages = buildExportPages(mode);

    if (!pages.length) {

      alert('Kein Ladeplan zum Drucken vorhanden.');

      return false;

    }

    const pagesHtml = pages.map((page, index) => {

      const dataUrl = page.canvas.toDataURL('image/png');

      const isLast = index === pages.length - 1;

      const typeClass = page.type === 'list' ? ' export-page-list' : ' export-page-plan';

      return `<section class="export-page${typeClass}${isLast ? ' export-page-last' : ''}"><img src="${dataUrl}" alt="Export ${index + 1}"${isLast ? ' onload="window.print()"' : ''}></section>`;

    }).join('');

    const win = window.open('', '_blank');

    if (!win) {

      alert('Pop-up blockiert – bitte Pop-ups erlauben für PDF-Export.');

      return false;

    }

    win.document.write(`<!DOCTYPE html><html lang="de"><head><title>Ladeplan 3D</title><style>

      body{margin:0;background:#fff}.export-page{display:block;page-break-inside:avoid}

      .export-page img{width:100%;max-width:297mm;height:auto;display:block}

      @media print{.export-page+.export-page{page-break-before:always}.export-page-plan img{max-height:190mm}.export-page-list img{max-height:277mm}}

    </style></head><body>${pagesHtml}</body></html>`);

    win.document.close();

    return true;

  }



  function excelCell(value, type = 'String', wrap = false) {

    const style = wrap ? ' ss:StyleID="Wrap"' : '';

    return `<Cell${style}><Data ss:Type="${type}">${escapeXml(value ?? '')}</Data></Cell>`;

  }



  function excelRow(cells) {

    return `<Row>${cells.join('')}</Row>`;

  }



  function buildExcelBlob(mode) {

    const api = app();

    const truck = api?.getTruck();

    const items = api?.getItems() || [];

    const bedH = truck ? api.getTruckHeight(truck) : 0;

    const rows = [

      excelRow([excelCell('Typ'), excelCell('Ladeplan 3D')]),

      excelRow([excelCell('Fahrzeug'), excelCell(truck?.name || '')]),

      excelRow([excelCell('Laderaum L×B×H (m)'), excelCell(truck ? `${truck.length.toFixed(2)} × ${truck.width.toFixed(2)} × ${bedH.toFixed(2)}` : '')]),

      excelRow([excelCell('Max. Ladehöhe (m)'), excelCell(bedH.toFixed(2), 'Number')]),

      excelRow([excelCell('Erstellt'), excelCell(new Date().toLocaleString('de-DE'))]),

      excelRow([excelCell('')]),

    ];

    if (mode !== 'beladung') {

      rows.push(excelRow([

        excelCell('Nr.'), excelCell('Bezeichnung'), excelCell('L (cm)'), excelCell('B (cm)'), excelCell('H (cm)'),

        excelCell('Gewicht (kg)'), excelCell('X (m)'), excelCell('Y (m)'), excelCell('Z (m)'), excelCell('Rotation (°)'),

      ]));

      items.forEach((item, index) => {

        rows.push(excelRow([

          excelCell(String(index + 1), 'Number'),

          excelCell(api.itemLabel(item, index)),

          excelCell((item.length * 100).toFixed(0), 'Number'),

          excelCell((item.width * 100).toFixed(0), 'Number'),

          excelCell((item.height * 100).toFixed(0), 'Number'),

          excelCell(item.weight != null ? String(item.weight) : ''),

          excelCell(item.x.toFixed(2), 'Number'),

          excelCell(item.y.toFixed(2), 'Number'),

          excelCell(item.z.toFixed(2), 'Number'),

          excelCell(item.rotation || 0, 'Number'),

        ]));

      });

    }

    if (mode === 'both' || mode === 'beladung' || mode === 'all') {

      rows.push(excelRow([excelCell('')]));

      rows.push(excelRow([excelCell('Beladung')]));

      rows.push(excelRow([excelCell('Nr.'), excelCell('Bezeichnung'), excelCell('Inhalt')]));

      items.forEach((item, index) => {

        rows.push(excelRow([

          excelCell(String(index + 1), 'Number'),

          excelCell(api.itemLabel(item, index), 'String', true),

          excelCell(api.getItemBeladung(item).join('\n') || '—', 'String', true),

        ]));

      });

    }

    const xml = `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>

<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">

<Styles><Style ss:ID="Wrap"><Alignment ss:Vertical="Top" ss:WrapText="1"/></Styles>

<Worksheet ss:Name="Ladeplan 3D"><Table>${rows.join('')}</Table></Worksheet></Workbook>`;

    return new Blob([`\ufeff${xml}`], { type: 'application/vnd.ms-excel' });

  }



  function exportExcel(mode) {

    const api = app();

    if (!api?.getItems()?.length && mode !== 'plan') {

      alert('Kein Ladegut zum Export vorhanden.');

      return false;

    }

    downloadBlob(buildExcelBlob(mode), `Ladeplan-3D-${Date.now()}.xls`);

    return true;

  }



  function saveJson() {

    const api = app();

    if (!api) return;

    downloadBlob(

      new Blob([JSON.stringify(api.getStateForExport(), null, 2)], { type: 'application/json' }),

      `Ladeplan-3D-${Date.now()}.json`,

    );

  }



  function openDialog(id) {

    document.getElementById(id)?.classList.remove('hidden');

  }



  function closeDialog(id) {

    document.getElementById(id)?.classList.add('hidden');

  }



  function showCompleteFollowup(text) {

    const textEl = document.getElementById('complete-plan-followup-text');

    if (textEl) textEl.textContent = text;

    document.getElementById('complete-plan-step-formats')?.classList.add('hidden');

    document.getElementById('complete-plan-step-followup')?.classList.remove('hidden');

  }



  function resetCompleteDialog() {

    document.getElementById('complete-plan-step-formats')?.classList.remove('hidden');

    document.getElementById('complete-plan-step-followup')?.classList.add('hidden');

  }



  function initExportDialogs() {

    document.getElementById('btn-print-pdf')?.addEventListener('click', () => exportPdf('all'));

    document.getElementById('btn-print-excel')?.addEventListener('click', () => exportExcel('all'));



    document.getElementById('btn-print-complete')?.addEventListener('click', () => {

      resetCompleteDialog();

      openDialog('complete-plan-dialog');

    });

    document.getElementById('complete-plan-dialog-backdrop')?.addEventListener('click', () => closeDialog('complete-plan-dialog'));

    document.getElementById('complete-plan-btn-cancel')?.addEventListener('click', () => closeDialog('complete-plan-dialog'));

    document.getElementById('complete-plan-btn-pdf')?.addEventListener('click', () => {

      const mode = getSelectedMode('complete-plan-mode', 'all');

      if (exportPdf(mode)) showCompleteFollowup('PDF-Export wurde geöffnet.');

    });

    document.getElementById('complete-plan-btn-excel')?.addEventListener('click', () => {

      const mode = getSelectedMode('complete-plan-mode', 'all');

      if (exportExcel(mode)) showCompleteFollowup('Excel-Datei wurde heruntergeladen.');

    });

    document.getElementById('complete-plan-btn-save')?.addEventListener('click', () => {

      const mode = getSelectedMode('complete-plan-mode', 'all');

      exportPdf(mode);

      exportExcel(mode);

      showCompleteFollowup('PDF und Excel wurden erstellt.');

    });

    document.getElementById('complete-plan-btn-complete-only')?.addEventListener('click', () => {

      app()?.resetPlan();

      app()?.clearUndoHistory?.();

      closeDialog('complete-plan-dialog');

      resetCompleteDialog();

    });

    document.getElementById('complete-plan-btn-continue')?.addEventListener('click', () => {

      closeDialog('complete-plan-dialog');

      resetCompleteDialog();

    });



    document.getElementById('btn-canvas-export')?.addEventListener('click', () => openDialog('canvas-print-dialog'));

    document.getElementById('canvas-print-dialog-backdrop')?.addEventListener('click', () => closeDialog('canvas-print-dialog'));

    document.getElementById('canvas-print-btn-cancel')?.addEventListener('click', () => closeDialog('canvas-print-dialog'));

    document.getElementById('canvas-print-btn-pdf')?.addEventListener('click', () => { exportPdf('plan'); closeDialog('canvas-print-dialog'); });

    document.getElementById('canvas-print-btn-excel')?.addEventListener('click', () => { exportExcel('all'); closeDialog('canvas-print-dialog'); });

    document.getElementById('canvas-print-btn-save')?.addEventListener('click', () => {

      exportPdf('all');

      exportExcel('all');

      closeDialog('canvas-print-dialog');

    });



    document.getElementById('btn-save-plan')?.addEventListener('click', () => openDialog('save-plan-dialog'));

    document.getElementById('save-plan-dialog-backdrop')?.addEventListener('click', () => closeDialog('save-plan-dialog'));

    document.getElementById('save-plan-btn-cancel')?.addEventListener('click', () => closeDialog('save-plan-dialog'));

    document.getElementById('save-plan-btn-json')?.addEventListener('click', () => { saveJson(); closeDialog('save-plan-dialog'); });

    document.getElementById('save-plan-btn-pdf')?.addEventListener('click', () => { exportPdf('all'); closeDialog('save-plan-dialog'); });

    document.getElementById('save-plan-btn-excel')?.addEventListener('click', () => { exportExcel('all'); closeDialog('save-plan-dialog'); });



    document.getElementById('btn-load-json')?.addEventListener('click', () => document.getElementById('file-import')?.click());

    document.getElementById('file-import')?.addEventListener('change', (event) => {

      const file = event.target.files?.[0];

      if (!file) return;

      const reader = new FileReader();

      reader.onload = () => {

        try {

          app()?.loadStateFromData(JSON.parse(reader.result));

          app()?.clearUndoHistory?.();

          app()?.updateUI();

        } catch {

          alert('Datei konnte nicht geladen werden.');

        }

      };

      reader.readAsText(file);

      event.target.value = '';

    });



    document.getElementById('btn-cargo-list')?.addEventListener('click', () => {

      updateCargoListPreview(getSelectedMode('cargo-list-mode', 'list'));

      openDialog('cargo-list-dialog');

    });

    document.getElementById('cargo-list-dialog-backdrop')?.addEventListener('click', () => closeDialog('cargo-list-dialog'));

    document.getElementById('cargo-list-btn-close')?.addEventListener('click', () => closeDialog('cargo-list-dialog'));

    document.getElementById('cargo-list-btn-pdf')?.addEventListener('click', () => exportPdf(getSelectedMode('cargo-list-mode', 'list')));

    document.getElementById('cargo-list-btn-excel')?.addEventListener('click', () => exportExcel(getSelectedMode('cargo-list-mode', 'list')));

    document.querySelectorAll('input[name="cargo-list-mode"]').forEach((radio) => {

      radio.addEventListener('change', () => updateCargoListPreview(radio.value));

    });

  }



  function updateCargoListPreview(mode) {

    const content = document.getElementById('cargo-list-dialog-content');

    const api = app();

    if (!content || !api) return;

    const items = api.getItems();

    if (!items.length) {

      content.innerHTML = '<p class="panel-note">Noch kein Ladegut im Plan.</p>';

      return;

    }

    content.innerHTML = items.map((item, index) => {

      const bel = api.getItemBeladung(item);

      let html = `<div class="cargo-list-preview-item"><strong>${index + 1}. ${api.itemLabel(item, index)}</strong>`;

      if (mode !== 'beladung') {

        html += `<div>${(item.length * 100).toFixed(0)}×${(item.width * 100).toFixed(0)}×${(item.height * 100).toFixed(0)} cm · ${item.weight ?? '—'} kg</div>`;

      }

      if (mode === 'both' || mode === 'beladung' || mode === 'all') {

        html += `<div class="cargo-list-beladung-preview">${bel.length ? bel.map((l) => `<div>${escapeXml(l)}</div>`).join('') : '— keine Beladung —'}</div>`;

      }

      html += '</div>';

      return html;

    }).join('');

  }



  if (document.readyState === 'loading') {

    document.addEventListener('DOMContentLoaded', initExportDialogs);

  } else {

    initExportDialogs();

  }

})();


