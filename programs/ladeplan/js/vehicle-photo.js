const VehiclePhotoPanel = (() => {

  'use strict';



  const MAX_W = 225;

  let photo;

  let frame;

  let captionEl;

  let buildCaption = null;



  function defaultCaption(truck) {

    const area = (truck.length * truck.width).toFixed(2);

    return `${truck.name} · Ladefläche ${truck.length.toFixed(2)} × ${truck.width.toFixed(2)} m (${area} m²)`;

  }



  function init(options = {}) {

    photo = document.getElementById('vehicle-photo');

    frame = document.getElementById('vehicle-photo-frame');

    captionEl = document.getElementById('vehicle-photo-caption');

    buildCaption = typeof options.buildCaption === 'function' ? options.buildCaption : defaultCaption;

    if (options.assetBase && typeof VehicleImages !== 'undefined' && VehicleImages.setAssetBase) {

      VehicleImages.setAssetBase(options.assetBase);

    }

    if (options.listenResize !== false) {

      window.addEventListener('resize', resize);

    }

  }



  function resize() {

    if (!photo || !photo.naturalWidth) return;

    const panel = document.getElementById('vehicle-photo-panel');

    const available = panel ? Math.max(100, panel.clientWidth - 32) : MAX_W;

    const maxW = Math.min(MAX_W, available);

    let w = photo.naturalWidth;

    let h = photo.naturalHeight;

    if (w > maxW) {

      const scale = maxW / w;

      w = Math.round(w * scale);

      h = Math.round(h * scale);

    }

    const size = `${w}px`;

    const sizeH = `${h}px`;

    photo.style.width = size;

    photo.style.height = sizeH;

    if (frame) {

      frame.style.width = size;

      frame.style.height = sizeH;

    }

  }



  function clear() {

    if (!photo) return;

    photo.removeAttribute('src');

    photo.alt = '';

    photo.style.width = '0';

    photo.style.height = '0';

    if (frame) {

      frame.style.width = '0';

      frame.style.height = '0';

    }

    if (captionEl) captionEl.textContent = '';

  }



  function update(truck) {

    if (!photo) return;

    if (!truck) {

      clear();

      return;

    }

    const src = typeof VehicleImages !== 'undefined'

      ? VehicleImages.getImageSrc(truck.id)

      : 'assets/vehicles/generic.png';



    photo.style.width = '0';

    photo.style.height = '0';

    if (frame) {

      frame.style.width = '0';

      frame.style.height = '0';

    }



    const onPhotoReady = () => {

      photo.onload = null;

      resize();

    };



    photo.onload = onPhotoReady;

    photo.src = src;

    if (photo.complete) onPhotoReady();



    photo.alt = `${truck.name} – linke Seitenansicht (Referenzbild)`;

    if (captionEl && buildCaption) {

      captionEl.textContent = buildCaption(truck) || '';

    }

  }



  return { init, resize, update, clear };

})();
