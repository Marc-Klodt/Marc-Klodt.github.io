const LadeplanPacker3D = (() => {
  'use strict';

  const EPS = 1e-6;

  function boxesOverlap(a, b) {
    return (
      a.x < b.x + b.length - EPS &&
      a.x + a.length > b.x + EPS &&
      a.y < b.y + b.width - EPS &&
      a.y + a.width > b.y + EPS &&
      a.z < b.z + b.height - EPS &&
      a.z + a.height > b.z + EPS
    );
  }

  function fitsInBin(x, y, z, length, width, height, truckL, truckW, truckH) {
    return (
      x >= -EPS &&
      y >= -EPS &&
      z >= -EPS &&
      x + length <= truckL + EPS &&
      y + width <= truckW + EPS &&
      z + height <= truckH + EPS
    );
  }

  function canPlace(x, y, z, length, width, height, placed, truckL, truckW, truckH) {
    if (!fitsInBin(x, y, z, length, width, height, truckL, truckW, truckH)) return false;
    const candidate = { x, y, z, length, width, height };
    return !placed.some((item) => boxesOverlap(candidate, item));
  }

  function snapDown(value, gridStep) {
    if (gridStep <= 0) return Math.round(value * 1000) / 1000;
    return Math.floor((value + EPS) / gridStep) * gridStep;
  }

  function snapUp(value, gridStep) {
    if (gridStep <= 0) return Math.round(value * 1000) / 1000;
    return Math.ceil((value - EPS) / gridStep) * gridStep;
  }

  function placementScore(x, y, z) {
    return z * 1_000_000 + x * 10_000 + y;
  }

  function collectCandidatePositions(truckL, truckW, truckH, length, width, height, placed, gridStep) {
    const candidates = [];
    const seen = new Set();
    const add = (x, y, z) => {
      const sx = gridStep > 0 ? snapDown(x, gridStep) : Math.round(x * 1000) / 1000;
      const sy = gridStep > 0 ? snapDown(y, gridStep) : Math.round(y * 1000) / 1000;
      const sz = gridStep > 0 ? snapDown(z, gridStep) : Math.round(z * 1000) / 1000;
      if (!fitsInBin(sx, sy, sz, length, width, height, truckL, truckW, truckH)) return;
      const key = `${sx.toFixed(4)}|${sy.toFixed(4)}|${sz.toFixed(4)}`;
      if (seen.has(key)) return;
      seen.add(key);
      candidates.push({ x: sx, y: sy, z: sz });
    };

    add(0, 0, 0);
    placed.forEach((item) => {
      const rightX = item.x + item.length;
      const topY = item.y + item.width;
      const topZ = item.z + item.height;
      if (gridStep > 0) {
        add(snapUp(rightX, gridStep), item.y, item.z);
        add(item.x, snapUp(topY, gridStep), item.z);
        add(item.x, item.y, snapUp(topZ, gridStep));
      } else {
        add(rightX, item.y, item.z);
        add(item.x, topY, item.z);
        add(item.x, item.y, topZ);
      }
    });

    const step = gridStep > 0 ? gridStep : 0.05;
    const maxXi = gridStep > 0 ? Math.floor((truckL - length + EPS) / gridStep) : null;
    const maxYi = gridStep > 0 ? Math.floor((truckW - width + EPS) / gridStep) : null;
    const maxZi = gridStep > 0 ? Math.floor((truckH - height + EPS) / gridStep) : null;

    if (gridStep > 0) {
      for (let zi = 0; zi <= maxZi; zi += 1) {
        for (let yi = 0; yi <= maxYi; yi += 1) {
          for (let xi = 0; xi <= maxXi; xi += 1) {
            add(xi * gridStep, yi * gridStep, zi * gridStep);
          }
        }
      }
    } else {
      for (let z = 0; z <= truckH - height + EPS; z += step) {
        for (let y = 0; y <= truckW - width + EPS; y += step) {
          for (let x = 0; x <= truckL - length + EPS; x += step) {
            add(x, y, z);
          }
        }
      }
    }

    return candidates;
  }

  function findBestPosition(truckL, truckW, truckH, length, width, height, placed, { gridStep }) {
    let best = null;
    const candidates = collectCandidatePositions(
      truckL, truckW, truckH, length, width, height, placed, gridStep,
    );

    candidates.forEach(({ x, y, z }) => {
      if (!canPlace(x, y, z, length, width, height, placed, truckL, truckW, truckH)) return;
      const score = placementScore(x, y, z);
      if (!best || score < best.score) {
        best = { x, y, z, score };
      }
    });

    return best;
  }

  function validatePlaced(placed, truckL, truckW, truckH) {
    for (let i = 0; i < placed.length; i += 1) {
      const a = placed[i];
      if (!fitsInBin(a.x, a.y, a.z, a.length, a.width, a.height, truckL, truckW, truckH)) return false;
      for (let j = i + 1; j < placed.length; j += 1) {
        if (boxesOverlap(a, placed[j])) return false;
      }
    }
    return true;
  }

  function packOnce(truckL, truckW, truckH, items, { allowRotate, gridStep, sortFn }) {
    const sorted = sortFn(items.map((item) => ({ ...item })));
    const placed = [];
    const unplaced = [];

    sorted.forEach((item) => {
      const baseH = item.height || 0.5;
      const orientations = allowRotate
        ? [
          [item.length, item.width, baseH],
          [item.width, item.length, baseH],
        ]
        : [[item.length, item.width, baseH]];

      let best = null;

      orientations.forEach(([length, width, height]) => {
        if (length > truckL + EPS || width > truckW + EPS || height > truckH + EPS) return;
        const pos = findBestPosition(truckL, truckW, truckH, length, width, height, placed, { gridStep });
        if (pos && (!best || pos.score < best.score)) {
          best = { ...pos, length, width, height };
        }
      });

      if (best) {
        placed.push({
          ...item,
          x: best.x,
          y: best.y,
          z: best.z,
          length: best.length,
          width: best.width,
          height: best.height,
        });
      } else {
        unplaced.push(item);
      }
    });

    const usedVolume = placed.reduce((sum, item) => sum + item.length * item.width * item.height, 0);
    const totalVolume = truckL * truckW * truckH;

    return {
      placed,
      unplaced,
      utilization: totalVolume > 0 ? usedVolume / totalVolume : 0,
      placedCount: placed.length,
      usedWeight: placed.reduce((sum, item) => sum + (item.weight || 0), 0),
      valid: validatePlaced(placed, truckL, truckW, truckH),
    };
  }

  const SORT_STRATEGIES = {
    volumeDesc: (items) => items.sort(
      (a, b) => (b.length * b.width * (b.height || 0.5)) - (a.length * a.width * (a.height || 0.5)),
    ),
    areaDesc: (items) => items.sort((a, b) => (b.length * b.width) - (a.length * a.width)),
    heightDesc: (items) => items.sort(
      (a, b) => (b.height || 0) - (a.height || 0) || (b.length * b.width) - (a.length * a.width),
    ),
    weightDesc: (items) => items.sort(
      (a, b) => (b.weight || 0) - (a.weight || 0) || (b.length * b.width) - (a.length * a.width),
    ),
  };

  function resultScore(result) {
    if (!result.valid) return -Infinity;
    return result.placedCount * 1_000_000 + result.utilization * 10_000 - result.unplaced.length * 100;
  }

  function packBest(truckL, truckW, truckH, items, options = {}) {
    const {
      allowRotate = true,
      gridStep = 0,
      maxWeight = Infinity,
    } = options;

    if (!items.length) {
      return { placed: [], unplaced: [], utilization: 0, placedCount: 0, usedWeight: 0 };
    }

    let bestResult = null;

    Object.values(SORT_STRATEGIES).forEach((sortFn) => {
      const result = packOnce(truckL, truckW, truckH, items, { allowRotate, gridStep, sortFn });
      if (!result.valid) return;
      const score = resultScore(result);
      if (!bestResult || score > bestResult.rankScore) {
        bestResult = { ...result, rankScore: score };
      }
    });

    if (!bestResult) {
      return {
        placed: [],
        unplaced: items.map((item) => ({ ...item })),
        utilization: 0,
        placedCount: 0,
        usedWeight: 0,
      };
    }

    delete bestResult.rankScore;
    delete bestResult.valid;
    return bestResult;
  }

  return { packBest, boxesOverlap };
})();
