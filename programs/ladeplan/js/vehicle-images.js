const VehicleImages = (() => {
  'use strict';

  const BASE = 'assets/vehicles/';

  const IMAGE_BY_ID = {
    sprinter: 'sprinter.png',
    transporter_35t: 'transporter.png',
    lk_75t_plane: 'lk-plane.png',
    lk_12t_plane: 'lk-plane.png',
    lk_18t: 'lk-plane.png',
    lk_75t_koffer: 'lk-box.png',
    lk_12t_koffer: 'lk-box.png',
    sattel_standard: 'sattel.png',
    sattel_mega: 'sattel-mega.png',
    sattel_kurz: 'sattel-kurz.png',
    anhaenger_plane: 'anhaenger.png',
    anhaenger_lang: 'anhaenger-lang.png',
    kuehl: 'kuehl.png',
    tieflader: 'tieflader.png',
    custom: 'generic.png',
  };

  function getImageSrc(truckId) {
    const file = IMAGE_BY_ID[truckId] || 'generic.png';
    return BASE + file;
  }

  return { getImageSrc };
})();
