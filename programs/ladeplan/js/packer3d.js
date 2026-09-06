const LadeplanPacker3D = (() => {
  'use strict';

  const EPS = 1e-6;
  const SUPPORT_TOL = 0.002;

  function normalizeNotStackable(value) {
    if (value === true || value === 1) return true;
    if (value === false || value === 0 || value == null) return false;
    if (typeof value === 'string') return value.toLowerCase() === 'true';
    return false;
  }

  function isStackableSupport(item) {
    return !normalizeNotStackable(item.notStackable);
  }

  function boxesOverlap(a, b) {
    return (
      a.x < b.x + b.length - EPS &&
      a.x + a.length > b.x + EPS &&
      a.y < b.y + b.width - EPS &&
      a.y + b.width > b.y + EPS &&
      a.z < b.z + b.height - EPS &&
      a.z + b.height > b.z + EPS
    );
  }

  function boxesConflict(a, b, tol = 0.01) {
    if (!(
      a.x < b.x + b.length - tol &&
      a.x + a.length > b.x + tol &&
      a.y < b.y + b.width - tol &&
      a.y + a.width > b.y + tol
    )) return false;
    if (a.z >= b.z + b.height - tol) return false;
    if (b.z >= a.z + a.height - tol) return false;
    const depthX = Math.min(a.x + a.length, b.x + b.length) - Math.max(a.x, b.x);
    const depthY = Math.min(a.y + a.width, b.y + b.width) - Math.max(a.y, b.y);
    const depthZ = Math.min(a.z + a.height, b.z + b.height) - Math.max(a.z, b.z);
    return depthX > tol && depthY > tol && depthZ > tol;
  }

  function overlapsXYRect(x, y, length, width, item) {
    return (
      x < item.x + item.length - EPS &&
      x + length > item.x + EPS &&
      y < item.y + item.width - EPS &&
      y + width > item.y + EPS
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

  function snapDown(value, gridStep) {
    if (gridStep <= 0) return Math.round(value * 1000) / 1000;
    return Math.floor((value + EPS) / gridStep) * gridStep;
  }

  function snapUp(value, gridStep) {
    if (gridStep <= 0) return Math.round(value * 1000) / 1000;
    return Math.ceil((value - EPS) / gridStep) * gridStep;
  }

  function snapCoord(value, gridStep) {
    if (gridStep <= 0) return Math.round(value * 1000) / 1000;
    return Math.round(value / gridStep) * gridStep;
  }

  function resolvePlacementZ(x, y, length, width, placed) {
    let supportZ = 0;
    placed.forEach((item) => {
      if (!isStackableSupport(item)) return;
      if (!overlapsXYRect(x, y, length, width, item)) return;
      const top = item.z + item.height;
      if (top > supportZ) supportZ = top;
    });
    return supportZ;
  }

  function resolvePlacementZSnapped(rawZ) {
    if (rawZ <= EPS) return 0;
    return Math.round(rawZ * 1000) / 1000;
  }

  function hasContainmentSupport(x, y, z, length, width, placed) {
    if (z <= EPS) return true;
    return placed.some((item) => {
      if (!isStackableSupport(item)) return false;
      const top = item.z + item.height;
      if (Math.abs(z - top) > SUPPORT_TOL) return false;
      return (
        x >= item.x - SUPPORT_TOL &&
        y >= item.y - SUPPORT_TOL &&
        x + length <= item.x + item.length + SUPPORT_TOL &&
        y + width <= item.y + item.width + SUPPORT_TOL
      );
    });
  }

  function hasPassgenauStackSupport(x, y, z, length, width, placed) {
    return hasContainmentSupport(x, y, z, length, width, placed);
  }

  function hasCompleteStackableSupport(x, y, z, length, width, placed) {
    if (z <= EPS) return true;
    const step = 0.05;
    const nx = Math.max(1, Math.ceil(length / step));
    const ny = Math.max(1, Math.ceil(width / step));
    for (let i = 0; i <= nx; i += 1) {
      for (let j = 0; j <= ny; j += 1) {
        const px = x + (length * i) / nx;
        const py = y + (width * j) / ny;
        const supported = placed.some((item) => {
          if (!isStackableSupport(item)) return false;
          const top = item.z + item.height;
          if (Math.abs(z - top) > SUPPORT_TOL) return false;
          return (
            px >= item.x - EPS &&
            px <= item.x + item.length + EPS &&
            py >= item.y - EPS &&
            py <= item.y + item.width + EPS
          );
        });
        if (!supported) return false;
      }
    }
    return true;
  }

  function hasValidSupport(x, y, z, length, width, placed, packMode, isNotStackable = false) {
    if (z <= EPS) return true;
    if (packMode === 'stack') {
      if (!hasCompleteStackableSupport(x, y, z, length, width, placed)) return false;
      return hasContainmentSupport(x, y, z, length, width, placed);
    }
    return placed.some((item) => {
      if (!isStackableSupport(item)) return false;
      if (!overlapsXYRect(x, y, length, width, item)) return false;
      return Math.abs(z - (item.z + item.height)) <= SUPPORT_TOL;
    });
  }

  function canPlace(x, y, z, length, width, height, placed, truckL, truckW, truckH, packMode, isNotStackable = false) {
    if (!fitsInBin(x, y, z, length, width, height, truckL, truckW, truckH)) return false;
    if (!hasValidSupport(x, y, z, length, width, placed, packMode, isNotStackable)) return false;
    const candidate = { x, y, z, length, width, height };
    return !placed.some((item) => boxesConflict(candidate, item));
  }

  function mergeIntervals(intervals) {
    if (!intervals.length) return [];
    const sorted = intervals.slice().sort((a, b) => a[0] - b[0]);
    const merged = [sorted[0].slice()];
    for (let i = 1; i < sorted.length; i += 1) {
      const [a, b] = sorted[i];
      const last = merged[merged.length - 1];
      if (a <= last[1] + EPS) {
        last[1] = Math.max(last[1], b);
      } else {
        merged.push([a, b]);
      }
    }
    return merged;
  }

  function coveredWidthAtXBand(x, bandLength, items, candidate) {
    const bandItems = items.filter(
      (p) => p.x < x + bandLength - EPS && p.x + p.length > x + EPS,
    );
    const intervals = bandItems.map((p) => [p.y, p.y + p.width]);
    if (candidate) intervals.push([candidate.y, candidate.y + candidate.width]);
    return mergeIntervals(intervals).reduce((sum, [a, b]) => sum + (b - a), 0);
  }

  function floorItems(placed) {
    return placed.filter((p) => p.z <= EPS);
  }

  function widthGapAtXBand(x, length, y, width, placed, truckW) {
    const covered = coveredWidthAtXBand(x, length, floorItems(placed), { y, width });
    return Math.max(0, truckW - covered);
  }

  function floorWidthFillRatio(placed, truckL, truckW) {
    if (truckL <= EPS || truckW <= EPS) return 0;
    const floor = floorItems(placed);
    if (!floor.length) return 0;
    const step = 0.2;
    let totalGap = 0;
    let strips = 0;
    for (let x = 0; x + EPS < truckL; x += step) {
      const covered = coveredWidthAtXBand(x, step, floor, null);
      totalGap += Math.max(0, truckW - covered);
      strips += 1;
    }
    const avgGap = strips > 0 ? totalGap / strips : truckW;
    return Math.max(0, (truckW - avgGap) / truckW);
  }

  function getFloorRows(placed) {
    const floor = floorItems(placed);
    if (!floor.length) return [{ x: 0, yEnd: 0, rowLength: 0 }];
    const rowStarts = [...new Set(floor.map((p) => Math.round(p.x * 1000) / 1000))].sort((a, b) => a - b);
    const rows = [];
    rowStarts.forEach((startX) => {
      const rowItems = floor.filter((p) => Math.abs(p.x - startX) <= EPS);
      if (!rowItems.length) return;
      const yEnd = Math.max(...rowItems.map((p) => p.y + p.width));
      const rowLength = Math.max(...rowItems.map((p) => p.length));
      rows.push({ x: startX, yEnd, rowLength });
    });
    rows.sort((a, b) => a.x - b.x || a.yEnd - b.yEnd);
    return rows;
  }

  function frontierWidthGap(placed, truckW) {
    const rows = getFloorRows(placed);
    if (!rows.length) return { minX: 0, gap: truckW, yEnd: 0 };
    const minX = rows[0].x;
    const rowItems = floorItems(placed).filter(
      (p) => p.x <= minX + EPS && p.x + p.length > minX + EPS,
    );
    const bandLength = rowItems.length
      ? Math.max(...rowItems.map((p) => p.length))
      : 0.2;
    const covered = coveredWidthAtXBand(minX, bandLength, rowItems, null);
    const yEnd = rowItems.length ? Math.max(...rowItems.map((p) => p.y + p.width)) : 0;
    return { minX, gap: Math.max(0, truckW - covered), yEnd };
  }

  function nextRowX(placed) {
    const floor = floorItems(placed);
    if (!floor.length) return 0;
    const rows = getFloorRows(placed);
    return Math.max(...rows.map((r) => r.x + r.rowLength));
  }

  function placementScore(x, y, z, length, width, placed, truckW, packMode, isNotStackable) {
    const gap = z <= EPS ? widthGapAtXBand(x, length, y, width, placed, truckW) : 0;
    let score = x * 100_000 + gap * 10_000 + y;

    if (isNotStackable && z > EPS) {
      score -= 60_000_000;
      score -= z * 2_000;
    } else if (packMode === 'stack' && z > EPS) {
      score -= 50_000_000;
      score += z * 1_000;
    } else {
      score += z * 1_000_000;
      if (y <= EPS) score -= 2_000;
      if (y + width >= truckW - EPS) score -= 2_000;
      if (width >= truckW - EPS) score -= 20_000;
      const frontier = frontierWidthGap(placed, truckW);
      if (Math.abs(x - frontier.minX) <= EPS) {
        score -= 5_000;
      }
      if (frontier.gap > EPS && x > frontier.minX + EPS) {
        score += frontier.gap * 50_000;
      }
    }
    return score;
  }

  function addPassgenauStackCandidates(addXY, length, width, item) {
    const fitsInside = (x, y) => (
      x >= item.x - SUPPORT_TOL &&
      y >= item.y - SUPPORT_TOL &&
      x + length <= item.x + item.length + SUPPORT_TOL &&
      y + width <= item.y + item.width + SUPPORT_TOL
    );
    const positions = [
      [item.x, item.y],
      [item.x + item.length - length, item.y],
      [item.x, item.y + item.width - width],
      [item.x + item.length - length, item.y + item.width - width],
      [item.x + (item.length - length) / 2, item.y + (item.width - width) / 2],
    ];
    positions.forEach(([x, y]) => {
      if (fitsInside(x, y)) addXY(x, y, true);
    });
  }

  function collectCandidateXY(truckL, truckW, length, width, placed, gridStep, packMode) {
    const candidates = [];
    const seen = new Set();
    const addXY = (x, y, exact = false) => {
      const sx = exact
        ? Math.round(x * 1000) / 1000
        : (gridStep > 0 ? snapCoord(x, gridStep) : Math.round(x * 1000) / 1000);
      const sy = exact
        ? Math.round(y * 1000) / 1000
        : (gridStep > 0 ? snapCoord(y, gridStep) : Math.round(y * 1000) / 1000);
      if (sx + length > truckL + EPS || sy + width > truckW + EPS) return;
      if (sx < -EPS || sy < -EPS) return;
      const key = `${sx.toFixed(4)}|${sy.toFixed(4)}`;
      if (seen.has(key)) return;
      seen.add(key);
      candidates.push({ x: sx, y: sy });
    };

    addXY(0, 0);
    addXY(0, truckW - width, true);

    const floor = floorItems(placed);
    floor.forEach((item) => {
      const rightX = item.x + item.length;
      const topY = item.y + item.width;
      addXY(rightX, item.y, true);
      addXY(item.x, topY, true);
      addXY(rightX, topY, true);
      addXY(item.x, truckW - width, true);
      addXY(rightX, truckW - width, true);
      if (truckW - topY + EPS >= width) {
        addXY(item.x, topY, true);
        addXY(rightX, topY, true);
      }
      if (item.y + EPS >= width) {
        addXY(item.x, item.y - width, true);
        addXY(rightX, item.y - width, true);
      }
    });

    const rows = getFloorRows(placed);
    rows.forEach((row) => {
      addXY(row.x, row.yEnd, true);
      if (row.yEnd + width <= truckW + EPS) addXY(row.x, row.yEnd, true);
      addXY(row.x, truckW - width, true);
    });
    const rowX = nextRowX(placed);
    if (rowX + length <= truckL + EPS) {
      addXY(rowX, 0, true);
      addXY(rowX, truckW - width, true);
    }

    if (!floor.length) {
      addXY(0, truckW - width, true);
    }

    placed.forEach((item) => {
      if (!isStackableSupport(item)) return;
      if (packMode === 'stack') {
        addPassgenauStackCandidates(addXY, length, width, item);
      }
    });

    if (gridStep > 0) {
      const maxXi = Math.floor((truckL - length + EPS) / gridStep);
      const maxYi = Math.floor((truckW - width + EPS) / gridStep);
      for (let yi = 0; yi <= maxYi; yi += 1) {
        for (let xi = 0; xi <= maxXi; xi += 1) {
          addXY(xi * gridStep, yi * gridStep);
        }
      }
    } else {
      const step = 0.05;
      for (let y = 0; y <= truckW - width + EPS; y += step) {
        for (let x = 0; x <= truckL - length + EPS; x += step) {
          addXY(x, y);
        }
      }
    }

    return candidates;
  }

  function choosePositionPool(valid, placed, truckW, packMode, isNotStackable) {
    const floorPool = valid.filter((p) => p.z <= EPS);
    const stackedPool = valid.filter((p) => p.z > EPS);

    if (packMode === 'floor') {
      return floorPool;
    }

    if (isNotStackable) {
      if (stackedPool.length) return stackedPool;
      return floorPool;
    }

    if (stackedPool.length) {
      return stackedPool;
    }

    return floorPool;
  }

  function findBestPosition(truckL, truckW, truckH, length, width, height, placed, { gridStep, packMode, isNotStackable = false }) {
    const valid = [];
    const candidates = collectCandidateXY(truckL, truckW, length, width, placed, gridStep, packMode);

    candidates.forEach(({ x, y }) => {
      const rawZ = packMode === 'floor' ? 0 : resolvePlacementZ(x, y, length, width, placed);
      const z = resolvePlacementZSnapped(rawZ);
      if (!canPlace(x, y, z, length, width, height, placed, truckL, truckW, truckH, packMode, isNotStackable)) return;
      valid.push({
        x,
        y,
        z,
        score: placementScore(x, y, z, length, width, placed, truckW, packMode, isNotStackable),
      });
    });

    if (!valid.length) return null;

    const pool = choosePositionPool(valid, placed, truckW, packMode, isNotStackable);
    if (!pool.length) return null;

    return pool.reduce((best, p) => (!best || p.score < best.score ? p : best), null);
  }

  function validatePlaced(placed, truckL, truckW, truckH, packMode) {
    for (let i = 0; i < placed.length; i += 1) {
      const a = placed[i];
      if (!fitsInBin(a.x, a.y, a.z, a.length, a.width, a.height, truckL, truckW, truckH)) return false;
      if (!hasValidSupport(a.x, a.y, a.z, a.length, a.width, placed.filter((p) => p.id !== a.id), packMode, normalizeNotStackable(a.notStackable))) return false;
      for (let j = i + 1; j < placed.length; j += 1) {
        if (boxesConflict(a, placed[j])) return false;
      }
    }
    return true;
  }

  function getOrientations(item, allowRotate, truckW) {
    const baseH = item.height || 0.5;
    const orientations = [[item.length, item.width, baseH]];
    if (allowRotate && Math.abs(item.length - item.width) > EPS) {
      orientations.push([item.width, item.length, baseH]);
    }
    orientations.sort((a, b) => {
      const aFull = a[1] >= truckW - EPS ? 1 : 0;
      const bFull = b[1] >= truckW - EPS ? 1 : 0;
      if (bFull !== aFull) return bFull - aFull;
      const aGap = Math.abs(truckW - a[1]);
      const bGap = Math.abs(truckW - b[1]);
      if (Math.abs(aGap - bGap) > EPS) return aGap - bGap;
      return (b[0] * b[1]) - (a[0] * a[1]);
    });
    return orientations;
  }

  function notStackableLast(sortFn) {
    return (items) => {
      const stackable = items.filter((item) => isStackableSupport(item));
      const notStackable = items.filter((item) => !isStackableSupport(item));
      sortFn(stackable);
      sortFn(notStackable);
      return [...stackable, ...notStackable];
    };
  }

  function normalizeItem(item) {
    return {
      ...item,
      notStackable: normalizeNotStackable(item.notStackable),
    };
  }

  function packOnce(truckL, truckW, truckH, items, { allowRotate, gridStep, sortFn, maxWeight = Infinity, packMode = 'stack' }) {
    const sorted = sortFn(items.map((item) => normalizeItem(item)));
    const placed = [];
    const unplaced = [];
    let usedWeight = 0;

    sorted.forEach((item) => {
      const itemWeight = item.weight || 0;
      if (usedWeight + itemWeight > maxWeight + EPS) {
        unplaced.push(item);
        return;
      }

      const origL = item.length;
      const origW = item.width;
      const isNotStackable = normalizeNotStackable(item.notStackable);
      let best = null;

      getOrientations(item, allowRotate, truckW).forEach(([length, width, height]) => {
        if (length > truckL + EPS || width > truckW + EPS || height > truckH + EPS) return;
        const pos = findBestPosition(truckL, truckW, truckH, length, width, height, placed, {
          gridStep,
          packMode,
          isNotStackable,
        });
        if (pos && (!best || pos.score < best.score)) {
          best = { ...pos, length, width, height };
        }
      });

      if (best) {
        const rotated = Math.abs(best.length - origL) > EPS || Math.abs(best.width - origW) > EPS;
        placed.push({
          ...item,
          x: best.x,
          y: best.y,
          z: best.z,
          length: best.length,
          width: best.width,
          height: best.height,
          rotation: rotated ? (((item.rotation || 0) + 90) % 360) : (item.rotation || 0),
        });
        usedWeight += itemWeight;
      } else {
        unplaced.push(item);
      }
    });

    const usedVolume = placed.reduce((sum, item) => sum + item.length * item.width * item.height, 0);
    const totalVolume = truckL * truckW * truckH;
    const floorArea = placed.reduce((sum, item) => sum + item.length * item.width, 0);
    const totalFloor = truckL * truckW;

    return {
      placed,
      unplaced,
      utilization: totalVolume > 0 ? usedVolume / totalVolume : 0,
      floorUtilization: totalFloor > 0 ? floorArea / totalFloor : 0,
      widthFillRatio: floorWidthFillRatio(placed, truckL, truckW),
      placedCount: placed.length,
      usedWeight,
      valid: validatePlaced(placed, truckL, truckW, truckH, packMode),
    };
  }

  const SORT_STRATEGIES = {
    widthDesc: (items) => items.sort((a, b) => b.width - a.width || b.length - a.length),
    footprintDesc: (items) => items.sort(
      (a, b) => (b.length * b.width) - (a.length * a.width) || (b.height || 0) - (a.height || 0),
    ),
    areaDesc: (items) => items.sort((a, b) => (b.length * b.width) - (a.length * a.width)),
    volumeDesc: (items) => items.sort(
      (a, b) => (b.length * b.width * (b.height || 0.5)) - (a.length * a.width * (a.height || 0.5)),
    ),
    maxSideDesc: (items) => items.sort(
      (a, b) => Math.max(b.length, b.width) - Math.max(a.length, a.width),
    ),
    heightDesc: (items) => items.sort(
      (a, b) => (b.height || 0) - (a.height || 0) || (b.length * b.width) - (a.length * a.width),
    ),
    heightAsc: (items) => items.sort(
      (a, b) => (a.height || 0) - (b.height || 0) || (b.length * b.width) - (a.length * a.width),
    ),
    lengthDesc: (items) => items.sort((a, b) => b.length - a.length || b.width - a.width),
    weightDesc: (items) => items.sort(
      (a, b) => (b.weight || 0) - (a.weight || 0) || (b.length * b.width) - (a.length * a.width),
    ),
  };

  function resultScore(result, packMode, truckW) {
    if (!result.valid) return -Infinity;
    const stackedCount = result.placed.filter((p) => p.z > EPS).length;
    const widthFill = result.widthFillRatio || 0;
    const frontier = frontierWidthGap(result.placed, truckW);
    const frontierPenalty = frontier.gap * 100_000;
    const notStackableOnTop = result.placed.filter((p) => p.notStackable && p.z > EPS).length;
    if (packMode === 'floor') {
      return (
        result.placedCount * 1_000_000
        + widthFill * 200_000
        + result.floorUtilization * 80_000
        + result.utilization * 1_000
        - frontierPenalty
        - result.unplaced.length * 100
      );
    }
    return (
      result.placedCount * 1_000_000
      + stackedCount * 100_000
      + notStackableOnTop * 50_000
      + widthFill * 80_000
      + result.floorUtilization * 40_000
      + result.utilization * 10_000
      - frontierPenalty
      - result.unplaced.length * 100
    );
  }

  function packBest(truckL, truckW, truckH, items, options = {}) {
    const {
      allowRotate = true,
      gridStep = 0,
      maxWeight = Infinity,
      packMode = 'stack',
    } = options;

    if (!items.length) {
      return { placed: [], unplaced: [], utilization: 0, floorUtilization: 0, placedCount: 0, usedWeight: 0 };
    }

    let bestResult = null;

    const sortStrategies = {
      ...Object.fromEntries(
        Object.entries(SORT_STRATEGIES).map(([key, sortFn]) => [key, notStackableLast(sortFn)]),
      ),
      widthFitAsc: notStackableLast((items) => items.sort((a, b) => {
        const aFit = Math.min(Math.abs(a.width - truckW), Math.abs(a.length - truckW));
        const bFit = Math.min(Math.abs(b.width - truckW), Math.abs(b.length - truckW));
        return aFit - bFit || (b.length * b.width) - (a.length * a.width);
      })),
    };

    Object.values(sortStrategies).forEach((sortFn) => {
      const result = packOnce(truckL, truckW, truckH, items, { allowRotate, gridStep, sortFn, maxWeight, packMode });
      if (!result.valid) return;
      const score = resultScore(result, packMode, truckW);
      if (!bestResult || score > bestResult.rankScore) {
        bestResult = { ...result, rankScore: score };
      }
    });

    if (!bestResult) {
      let fallback = null;
      Object.values(sortStrategies).forEach((sortFn) => {
        const result = packOnce(truckL, truckW, truckH, items, { allowRotate, gridStep, sortFn, maxWeight, packMode });
        if (!fallback || result.placedCount > fallback.placedCount) {
          fallback = result;
        }
      });
      if (fallback && fallback.placedCount > 0) {
        bestResult = { ...fallback, rankScore: -Infinity };
      } else {
        return {
          placed: [],
          unplaced: items.map((item) => ({ ...item })),
          utilization: 0,
          floorUtilization: 0,
          placedCount: 0,
          usedWeight: 0,
        };
      }
    }

    delete bestResult.rankScore;
    delete bestResult.valid;
    return bestResult;
  }

  return { packBest, boxesOverlap };
})();
