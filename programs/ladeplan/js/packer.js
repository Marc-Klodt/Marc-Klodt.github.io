const LadeplanPacker = (() => {
  'use strict';

  const EPS = 1e-6;

  function rectsOverlap(a, b) {
    return (
      a.x < b.x + b.length - EPS &&
      a.x + a.length > b.x + EPS &&
      a.y < b.y + b.width - EPS &&
      a.y + a.width > b.y + EPS
    );
  }

  function fitsInBin(x, y, length, width, truckL, truckW) {
    return (
      x >= -EPS &&
      y >= -EPS &&
      x + length <= truckL + EPS &&
      y + width <= truckW + EPS
    );
  }

  function canPlace(x, y, length, width, placed, truckL, truckW) {
    if (!fitsInBin(x, y, length, width, truckL, truckW)) return false;
    const candidate = { x, y, length, width };
    return !placed.some((item) => rectsOverlap(candidate, item));
  }

  function snapDown(value, gridStep) {
    if (gridStep <= 0) return Math.round(value * 1000) / 1000;
    return Math.floor((value + EPS) / gridStep) * gridStep;
  }

  function snapUp(value, gridStep) {
    if (gridStep <= 0) return Math.round(value * 1000) / 1000;
    return Math.ceil((value - EPS) / gridStep) * gridStep;
  }

  /** Beladung ab Stirnwand (x = 0): zuerst links entlang der Stirnseite (y), dann in Fahrtrichtung (x). */
  function placementScore(x, y) {
    return x * 100000 + y;
  }

  function collectCandidatePositions(truckL, truckW, length, width, placed, gridStep) {
    const candidates = [];
    const seen = new Set();
    const add = (x, y) => {
      const sx = gridStep > 0 ? snapDown(x, gridStep) : Math.round(x * 1000) / 1000;
      const sy = gridStep > 0 ? snapDown(y, gridStep) : Math.round(y * 1000) / 1000;
      if (sx + length > truckL + EPS || sy + width > truckW + EPS) return;
      const key = `${sx.toFixed(6)}|${sy.toFixed(6)}`;
      if (seen.has(key)) return;
      seen.add(key);
      candidates.push({ x: sx, y: sy });
    };

    add(0, 0);
    placed.forEach((item) => {
      const rightX = item.x + item.length;
      const topY = item.y + item.width;
      if (gridStep > 0) {
        add(snapUp(rightX, gridStep), item.y);
        add(item.x, snapUp(topY, gridStep));
      } else {
        add(rightX, item.y);
        add(item.x, topY);
      }
    });

    if (gridStep > 0) {
      const maxXi = Math.floor((truckL - length + EPS) / gridStep);
      const maxYi = Math.floor((truckW - width + EPS) / gridStep);
      for (let yi = 0; yi <= maxYi; yi += 1) {
        for (let xi = 0; xi <= maxXi; xi += 1) {
          add(xi * gridStep, yi * gridStep);
        }
      }
    } else {
      const xStep = 0.05;
      const yStep = 0.05;
      for (let y = 0; y <= truckW - width + EPS; y += yStep) {
        for (let x = 0; x <= truckL - length + EPS; x += xStep) {
          add(x, y);
        }
      }
    }

    return candidates;
  }

  function findBestPosition(truckL, truckW, length, width, placed, { gridStep }) {
    let best = null;
    const candidates = collectCandidatePositions(truckL, truckW, length, width, placed, gridStep);

    candidates.forEach(({ x: sx, y: sy }) => {
      if (!canPlace(sx, sy, length, width, placed, truckL, truckW)) return;
      const score = placementScore(sx, sy);
      if (!best || score < best.score) {
        best = { x: sx, y: sy, score };
      }
    });

    return best;
  }

  function validatePlaced(placed, truckL, truckW) {
    for (let i = 0; i < placed.length; i += 1) {
      const a = placed[i];
      if (!fitsInBin(a.x, a.y, a.length, a.width, truckL, truckW)) return false;
      for (let j = i + 1; j < placed.length; j += 1) {
        if (rectsOverlap(a, placed[j])) return false;
      }
    }
    return true;
  }

  function packOnce(truckL, truckW, items, { allowRotate, gridStep, sortFn }) {
    const sorted = sortFn(items.map((item) => ({ ...item })));
    const placed = [];
    const unplaced = [];

    sorted.forEach((item) => {
      const orientations = allowRotate
        ? [[item.length, item.width], [item.width, item.length]]
        : [[item.length, item.width]];

      let best = null;

      orientations.forEach(([length, width]) => {
        if (length > truckL + EPS || width > truckW + EPS) return;
        const pos = findBestPosition(truckL, truckW, length, width, placed, { gridStep });
        if (pos && (!best || pos.score < best.score)) {
          best = { ...pos, length, width };
        }
      });

      if (best) {
        placed.push({
          ...item,
          x: best.x,
          y: best.y,
          length: best.length,
          width: best.width,
        });
      } else {
        unplaced.push(item);
      }
    });

    const usedArea = placed.reduce((sum, item) => sum + item.length * item.width, 0);
    const totalArea = truckL * truckW;

    return {
      placed,
      unplaced,
      utilization: totalArea > 0 ? usedArea / totalArea : 0,
      placedCount: placed.length,
      usedWeight: placed.reduce((sum, item) => sum + (item.weight || 0), 0),
      valid: validatePlaced(placed, truckL, truckW),
    };
  }

  const SORT_STRATEGIES = {
    areaDesc: (items) => items.sort((a, b) => (b.length * b.width) - (a.length * a.width)),
    maxSideDesc: (items) => items.sort(
      (a, b) => Math.max(b.length, b.width) - Math.max(a.length, a.width),
    ),
    perimeterDesc: (items) => items.sort(
      (a, b) => (b.length + b.width) - (a.length + a.width),
    ),
    widthDesc: (items) => items.sort((a, b) => b.width - a.width || b.length - a.length),
    lengthDesc: (items) => items.sort((a, b) => b.length - a.length || b.width - a.width),
    weightDesc: (items) => items.sort(
      (a, b) => (b.weight || 0) - (a.weight || 0) || (b.length * b.width) - (a.length * a.width),
    ),
  };

  function resultScore(result) {
    if (!result.valid) return -Infinity;
    return (
      result.placedCount * 1_000_000 +
      result.utilization * 10_000 -
      result.unplaced.length * 100
    );
  }

  function buildMultiResult(truckPlaced, trailerPlaced, unplaced, truckL, truckW, trailerL, trailerW) {
    const truckArea = truckL * truckW;
    const trailerArea = trailerL * trailerW;
    const totalArea = truckArea + trailerArea;
    const usedTruck = truckPlaced.reduce((sum, item) => sum + item.length * item.width, 0);
    const usedTrailer = trailerPlaced.reduce((sum, item) => sum + item.length * item.width, 0);
    const usedArea = usedTruck + usedTrailer;
    const usedWeight = [...truckPlaced, ...trailerPlaced].reduce(
      (sum, item) => sum + (item.weight || 0),
      0,
    );

    return {
      truck: truckPlaced,
      trailer: trailerPlaced,
      unplaced,
      utilization: totalArea > 0 ? usedArea / totalArea : 0,
      truckUtilization: truckArea > 0 ? usedTruck / truckArea : 0,
      trailerUtilization: trailerArea > 0 ? usedTrailer / trailerArea : 0,
      placedCount: truckPlaced.length + trailerPlaced.length,
      usedWeight,
      valid: validatePlaced(truckPlaced, truckL, truckW)
        && validatePlaced(trailerPlaced, trailerL, trailerW),
    };
  }

  function multiResultScore(result) {
    if (!result.valid) return -Infinity;
    return (
      result.placedCount * 1_000_000 +
      result.utilization * 10_000 -
      result.unplaced.length * 100
    );
  }

  function packBestMultiBed(truckL, truckW, trailerL, trailerW, items, options = {}) {
    const {
      allowRotate = true,
      gridStep = 0,
      maxWeight = Infinity,
    } = options;

    if (!items.length) {
      return {
        truck: [],
        trailer: [],
        unplaced: [],
        utilization: 0,
        placedCount: 0,
        usedWeight: 0,
        valid: true,
      };
    }

    let workItems = items.map((item) => ({ ...item }));
    let rejectedByWeight = [];

    if (Number.isFinite(maxWeight)) {
      const weightSorted = SORT_STRATEGIES.weightDesc(workItems);
      let weightBudget = 0;
      const allowed = [];

      weightSorted.forEach((item) => {
        const w = item.weight || 0;
        if (weightBudget + w <= maxWeight + EPS) {
          allowed.push(item);
          weightBudget += w;
        } else {
          rejectedByWeight.push(item);
        }
      });
      workItems = allowed;
    }

    const packOpts = { allowRotate, gridStep, maxWeight: Infinity };
    let bestResult = null;

    // Immer zuerst Zugfahrzeug beladen, Rest auf den Anhänger
    Object.values(SORT_STRATEGIES).forEach((sortFn) => {
      const truckResult = packOnce(truckL, truckW, workItems, { allowRotate, gridStep, sortFn });
      if (!truckResult.valid) return;
      const trailerResult = packBest(trailerL, trailerW, truckResult.unplaced, packOpts);
      const result = buildMultiResult(
        truckResult.placed,
        trailerResult.placed,
        [...trailerResult.unplaced, ...rejectedByWeight],
        truckL,
        truckW,
        trailerL,
        trailerW,
      );
      const score = multiResultScore(result);
      if (!bestResult || score > bestResult.rankScore) {
        bestResult = { ...result, rankScore: score };
      }
    });

    delete bestResult.rankScore;
    delete bestResult.valid;
    return bestResult;
  }

  function packBest(truckL, truckW, items, options = {}) {
    const {
      allowRotate = true,
      gridStep = 0,
      maxWeight = Infinity,
    } = options;

    if (!items.length) {
      return { placed: [], unplaced: [], utilization: 0, placedCount: 0, usedWeight: 0, valid: true };
    }

    let bestResult = null;

    Object.values(SORT_STRATEGIES).forEach((sortFn) => {
      const result = packOnce(truckL, truckW, items, { allowRotate, gridStep, sortFn });
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

    if (Number.isFinite(maxWeight) && bestResult.usedWeight > maxWeight) {
      const weightSorted = SORT_STRATEGIES.weightDesc(items.map((item) => ({ ...item })));
      let weightBudget = 0;
      const allowed = [];
      const rejectedByWeight = [];

      weightSorted.forEach((item) => {
        const w = item.weight || 0;
        if (weightBudget + w <= maxWeight + EPS) {
          allowed.push(item);
          weightBudget += w;
        } else {
          rejectedByWeight.push(item);
        }
      });

      let weightBest = null;
      Object.values(SORT_STRATEGIES).forEach((sortFn) => {
        const result = packOnce(truckL, truckW, allowed, { allowRotate, gridStep, sortFn });
        if (!result.valid) return;
        const score = resultScore(result);
        if (!weightBest || score > weightBest.rankScore) {
          weightBest = { ...result, rankScore: score };
        }
      });

      if (weightBest) {
        weightBest.unplaced = [...weightBest.unplaced, ...rejectedByWeight];
        bestResult = weightBest;
      }
    }

    delete bestResult.rankScore;
    delete bestResult.valid;
    return bestResult;
  }

  return { packBest, packBestMultiBed, rectsOverlap };
})();
