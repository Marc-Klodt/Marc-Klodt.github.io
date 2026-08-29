(() => {
  'use strict';

  const panelState = new WeakMap();

  const AD_CATALOGS = {
    beer: [
      { title: 'Bitburger', slogan: 'Bitte ein Bit!', icon: '🍺' },
      { title: 'Beck\'s', slogan: 'Das Bier der Hansestadt', icon: '🍺' },
      { title: 'Warsteiner', slogan: 'Eins gehört dazu.', icon: '🍺' },
      { title: 'Krombacher', slogan: 'Eine Perle der Natur.', icon: '🍺' },
      { title: 'Veltins', slogan: 'Grün ist das Leben.', icon: '🍺' },
      { title: 'Paulaner', slogan: 'Du bist Paulaner.', icon: '🍺' },
      { title: 'Löwenbräu', slogan: 'Löwen stark. Seit 1383.', icon: '🍺' },
      { title: 'Spaten', slogan: 'Münchner Bier von Weltklasse.', icon: '🍺' },
      { title: 'Augustiner', slogan: 'Edles Bier aus München.', icon: '🍺' },
      { title: 'Erdinger', slogan: 'Die Weißbier-Meisterbrauerei.', icon: '🍺' },
      { title: 'Franziskaner', slogan: 'Für echte Genießer.', icon: '🍺' },
      { title: 'Weihenstephan', slogan: 'Die älteste Brauerei der Welt.', icon: '🍺' },
      { title: 'Hasseröder', slogan: 'Das frische Bier aus dem Harz.', icon: '🍺' },
      { title: 'Jever', slogan: 'Wenn\'s um Geschmack geht.', icon: '🍺' },
      { title: 'Flensburger', slogan: 'Frisch vom Fass.', icon: '🍺' },
      { title: 'Holsten', slogan: 'Holsten macht Lust auf mehr.', icon: '🍺' },
      { title: 'DAB', slogan: 'Original Dortmunder.', icon: '🍺' },
      { title: 'Radeberger', slogan: 'Das Bier der Sachsen.', icon: '🍺' },
      { title: 'Köstritzer', slogan: 'Schwarzbier mit Charakter.', icon: '🍺' },
      { title: 'Clausthaler', slogan: 'Nicht alkoholfrei. Clausthaler.', icon: '🍺' },
      { title: 'Oettinger', slogan: 'Einfach gutes Bier.', icon: '🍺' },
      { title: 'Karlsberg', slogan: 'Frisch & freundlich.', icon: '🍺' },
      { title: 'Fürstenberg', slogan: 'Schwarzwald-Perle seit 1283.', icon: '🍺' },
      { title: 'Rothaus', slogan: 'Zäpfle – badisches Brauwerk.', icon: '🍺' },
      { title: 'Andechs', slogan: 'Klosterbrauerei Andechs.', icon: '🍺' },
      { title: 'Benediktiner', slogan: 'Bayerisch. Kloster. Bier.', icon: '🍺' },
      { title: 'Tegernseer', slogan: 'Alpenfrische im Glas.', icon: '🍺' },
      { title: 'Ayinger', slogan: 'Privatbrauerei seit 1878.', icon: '🍺' },
      { title: 'Schneider Weisse', slogan: 'Meine Weißbierstunde.', icon: '🍺' },
      { title: 'Astra', slogan: 'Hamburg, meine Perle – Prost!', icon: '🍺' },
      { title: 'Berliner Kindl', slogan: 'Typisch Berlin.', icon: '🍺' },
      { title: 'Corona', slogan: 'Find your beach.', icon: '🍺' },
      { title: 'Heineken', slogan: 'Open your world.', icon: '🍺' },
      { title: 'Guinness', slogan: 'Made of more.', icon: '🍺' },
      { title: 'Budweiser', slogan: 'King of Beers.', icon: '🍺' },
    ],
    vehicles: [
      { title: 'Mercedes-Benz', slogan: 'Das Beste oder nichts.', icon: '🚗' },
      { title: 'BMW', slogan: 'Freude am Fahren.', icon: '🚗' },
      { title: 'Audi', slogan: 'Vorsprung durch Technik.', icon: '🚗' },
      { title: 'Volkswagen', slogan: 'Das Auto.', icon: '🚗' },
      { title: 'Porsche', slogan: 'Es gibt kein Substitut.', icon: '🏎️' },
      { title: 'Opel', slogan: 'The future is everyone\'s.', icon: '🚗' },
      { title: 'Ford', slogan: 'Built Ford Tough.', icon: '🚙' },
      { title: 'Toyota', slogan: 'Let\'s Go Places.', icon: '🚗' },
      { title: 'Honda', slogan: 'The Power of Dreams.', icon: '🚗' },
      { title: 'Hyundai', slogan: 'Progress for Humanity.', icon: '🚗' },
      { title: 'Kia', slogan: 'Movement that inspires.', icon: '🚗' },
      { title: 'Tesla', slogan: 'Accelerating the world\'s transition.', icon: '⚡' },
      { title: 'Renault', slogan: 'Passion for life.', icon: '🚗' },
      { title: 'Peugeot', slogan: 'Motion & Emotion.', icon: '🚗' },
      { title: 'Citroën', slogan: 'Inspired by You.', icon: '🚗' },
      { title: 'Fiat', slogan: 'Dolce Vita on four wheels.', icon: '🚗' },
      { title: 'Volvo', slogan: 'For life.', icon: '🚗' },
      { title: 'Škoda', slogan: 'Simply Clever.', icon: '🚗' },
      { title: 'SEAT', slogan: 'Enjoy the unexpected.', icon: '🚗' },
      { title: 'Mazda', slogan: 'Feel Alive.', icon: '🚗' },
      { title: 'Nissan', slogan: 'Innovation that excites.', icon: '🚗' },
      { title: 'Mitsubishi', slogan: 'Drive your ambition.', icon: '🚗' },
      { title: 'Lexus', slogan: 'Experience Amazing.', icon: '🚗' },
      { title: 'Jaguar', slogan: 'Copy nothing.', icon: '🐆' },
      { title: 'Land Rover', slogan: 'Above and beyond.', icon: '🚙' },
      { title: 'MINI', slogan: 'Is it MINI?', icon: '🚗' },
      { title: 'smart', slogan: 'open your mind.', icon: '🚗' },
      { title: 'Alfa Romeo', slogan: 'La meccanica delle emozioni.', icon: '🏎️' },
      { title: 'Ferrari', slogan: 'Only those who dare, truly live.', icon: '🏎️' },
      { title: 'Lamborghini', slogan: 'Expect the unexpected.', icon: '🏎️' },
      { title: 'MAN', slogan: 'Efficiency in motion.', icon: '🚛' },
      { title: 'Scania', slogan: 'Driving the shift.', icon: '🚛' },
      { title: 'Volvo Trucks', slogan: 'Driving progress.', icon: '🚛' },
      { title: 'DAF', slogan: 'Driving excellence.', icon: '🚛' },
      { title: 'Iveco', slogan: 'Your partner on the road.', icon: '🚛' },
      { title: 'Renault Trucks', slogan: 'Passion for performance.', icon: '🚛' },
      { title: 'Mercedes-Benz Trucks', slogan: 'Trucks you can trust.', icon: '🚛' },
    ],
    restaurants: [
      { title: 'McDonald\'s', slogan: 'I\'m lovin\' it.', icon: '🍔' },
      { title: 'Burger King', slogan: 'Have it your way.', icon: '🍔' },
      { title: 'KFC', slogan: 'It\'s finger lickin\' good.', icon: '🍗' },
      { title: 'Subway', slogan: 'Eat fresh.', icon: '🥪' },
      { title: 'Pizza Hut', slogan: 'No one outpizzas the Hut.', icon: '🍕' },
      { title: 'Domino\'s', slogan: 'Pizza delivered hot.', icon: '🍕' },
      { title: 'Starbucks', slogan: 'Fall. Starts. Now.', icon: '☕' },
      { title: 'Nordsee', slogan: 'Frisch aus dem Meer.', icon: '🐟' },
      { title: 'Vapiano', slogan: 'Ciao, frisch gekocht.', icon: '🍝' },
      { title: 'Hans im Glück', slogan: 'Burgergrill & Bar.', icon: '🍔' },
      { title: 'Block House', slogan: 'Steaks since 1968.', icon: '🥩' },
      { title: 'L\'Osteria', slogan: 'XXL Pizza & Pasta.', icon: '🍝' },
      { title: 'Peter Pane', slogan: 'Burger mit Charakter.', icon: '🍔' },
      { title: 'Dean & David', slogan: 'Fresh thinking. Fresh food.', icon: '🥗' },
      { title: 'Wienerwald', slogan: 'Hendl & mehr.', icon: '🍗' },
      { title: 'Five Guys', slogan: 'All the way.', icon: '🍔' },
      { title: 'Dunkin\'', slogan: 'America runs on Dunkin\'.', icon: '🍩' },
      { title: 'Nando\'s', slogan: 'PERi-PERi chicken.', icon: '🍗' },
      { title: 'Sushi Circle', slogan: 'Frisch. Schnell. Lecker.', icon: '🍣' },
      { title: 'CoCo ICHIBANYA', slogan: 'Japanese curry house.', icon: '🍛' },
      { title: 'Hard Rock Cafe', slogan: 'Love all, serve all.', icon: '🎸' },
      { title: 'TGI Fridays', slogan: 'In here, it\'s always Friday.', icon: '🍹' },
      { title: 'Yum Yum', slogan: 'Thai fast & fresh.', icon: '🍜' },
      { title: 'Maharadscha', slogan: 'Indisch wie zu Hause.', icon: '🍛' },
      { title: 'Trattoria', slogan: 'Buon appetito!', icon: '🍝' },
      { title: 'Kebap Haus', slogan: 'Frisch vom Grill.', icon: '🥙' },
      { title: 'Asia Wok', slogan: 'Wok to go.', icon: '🥡' },
      { title: 'Café Extrablatt', slogan: 'Frühstück den ganzen Tag.', icon: '☕' },
      { title: 'Backwerk', slogan: 'Frisch gebacken.', icon: '🥐' },
      { title: 'Ditsch', slogan: 'Die Brezel.', icon: '🥨' },
    ],
    games: [
      { title: 'Elden Ring', slogan: 'Rise, Tarnished.', icon: '🎮' },
      { title: 'Grand Theft Auto VI', slogan: 'Vice City awaits.', icon: '🎮' },
      { title: 'EA SPORTS FC', slogan: 'The club is yours.', icon: '⚽' },
      { title: 'Call of Duty', slogan: 'Squad up. Drop in.', icon: '🔫' },
      { title: 'Minecraft', slogan: 'Build anything.', icon: '⛏️' },
      { title: 'Cyberpunk 2077', slogan: 'Welcome to Night City.', icon: '🌃' },
      { title: 'The Witcher 3', slogan: 'A story-driven open world.', icon: '⚔️' },
      { title: 'Red Dead Redemption 2', slogan: 'Outlaws for life.', icon: '🤠' },
      { title: 'The Legend of Zelda', slogan: 'Hyrule awaits.', icon: '🗡️' },
      { title: 'Super Mario', slogan: 'Jump into adventure.', icon: '🍄' },
      { title: 'God of War', slogan: 'Ragnarök is coming.', icon: '🪓' },
      { title: 'Horizon', slogan: 'Brave a new world.', icon: '🏹' },
      { title: 'Assassin\'s Creed', slogan: 'History is our playground.', icon: '🗡️' },
      { title: 'Baldur\'s Gate 3', slogan: 'Gather your party.', icon: '🐉' },
      { title: 'Hogwarts Legacy', slogan: 'Your legacy begins.', icon: '🪄' },
      { title: 'Starfield', slogan: 'Explore the stars.', icon: '🚀' },
      { title: 'Forza Horizon', slogan: 'Drive your dreams.', icon: '🏎️' },
      { title: 'Gran Turismo', slogan: 'Real driving simulator.', icon: '🏁' },
      { title: 'Fortnite', slogan: 'Battle Royale.', icon: '🎯' },
      { title: 'Apex Legends', slogan: 'Conquer with character.', icon: '🎯' },
      { title: 'Counter-Strike 2', slogan: 'For glory. For CS.', icon: '💣' },
      { title: 'Diablo IV', slogan: 'Return to darkness.', icon: '👹' },
      { title: 'Star Wars Jedi', slogan: 'Survive the Empire.', icon: '✨' },
      { title: 'Spider-Man 2', slogan: 'Be greater. Together.', icon: '🕷️' },
      { title: 'Final Fantasy XVI', slogan: 'A new tale begins.', icon: '⚔️' },
      { title: 'Resident Evil', slogan: 'Survival horror redefined.', icon: '🧟' },
      { title: 'Street Fighter 6', slogan: 'Fight for glory.', icon: '👊' },
      { title: 'Helldivers 2', slogan: 'Liberty or death.', icon: '🪖' },
      { title: 'Palworld', slogan: 'Craft. Battle. Explore.', icon: '🐾' },
      { title: 'Steam', slogan: 'Thousands of PC games.', icon: '💻' },
      { title: 'PlayStation', slogan: 'Play Has No Limits.', icon: '🎮' },
      { title: 'Xbox', slogan: 'Power your dreams.', icon: '🎮' },
      { title: 'Nintendo Switch', slogan: 'Switch and play.', icon: '🎮' },
    ],
  };

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getCatalogForPanel(panelNumber) {
    const contentType = window.AdSlots?.getPanelContentType(panelNumber);
    if (!contentType) return null;
    return AD_CATALOGS[contentType] ?? null;
  }

  function pickRandomAd(catalog, lastTitle) {
    if (!catalog?.length) return null;
    if (catalog.length === 1) return catalog[0];
    let next = catalog[Math.floor(Math.random() * catalog.length)];
    while (next.title === lastTitle) {
      next = catalog[Math.floor(Math.random() * catalog.length)];
    }
    return next;
  }

  function renderPanelAd(ad) {
    return `
      <article class="panel-ad-card" aria-live="polite">
        <span class="panel-ad-icon" aria-hidden="true">${escapeHtml(ad.icon)}</span>
        <div class="panel-ad-copy">
          <p class="panel-ad-title">${escapeHtml(ad.title)}</p>
          <p class="panel-ad-slogan">${escapeHtml(ad.slogan)}</p>
        </div>
      </article>
    `;
  }

  function showRandomPanelAd(container, state) {
    const ad = pickRandomAd(state.catalog, state.lastTitle);
    if (!ad) return;
    state.lastTitle = ad.title;
    container.classList.remove('panel-ad-visible');
    requestAnimationFrame(() => {
      container.innerHTML = renderPanelAd(ad);
      requestAnimationFrame(() => {
        container.classList.add('panel-ad-visible');
      });
    });
  }

  function initPanelAdRotation(container) {
    if (!container) return;

    const panelNumber = window.AdSlots?.getPanelNumber(container) ?? null;
    const catalog = getCatalogForPanel(panelNumber);
    const intervalMs = window.AdSlots?.getPanelIntervalMs(panelNumber);
    if (!catalog?.length || !intervalMs) return;

    let state = panelState.get(container);
    if (!state) {
      state = {
        timer: null,
        lastTitle: null,
        panelNumber,
        contentType: window.AdSlots?.getPanelContentType(panelNumber) ?? null,
        catalog,
      };
      panelState.set(container, state);
    } else {
      state.panelNumber = panelNumber;
      state.contentType = window.AdSlots?.getPanelContentType(panelNumber) ?? state.contentType;
      state.catalog = catalog;
    }
    if (state.timer) clearInterval(state.timer);

    container.classList.add('panel-ad-slot-active');
    showRandomPanelAd(container, state);
    state.timer = setInterval(() => {
      showRandomPanelAd(container, state);
    }, intervalMs);
  }

  function initAllPanelAdRotations(root) {
    const panels = window.AdSlots?.getAllPanels(root) ?? [];
    panels.forEach((panel) => {
      initPanelAdRotation(panel);
    });
  }

  window.initPanelAdRotation = initPanelAdRotation;
  window.initAllPanelAdRotations = initAllPanelAdRotations;
  window.initBeerAdRotation = initPanelAdRotation;
  window.initAllBeerAdRotations = initAllPanelAdRotations;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initAllPanelAdRotations();
    });
  } else {
    initAllPanelAdRotations();
  }
})();
