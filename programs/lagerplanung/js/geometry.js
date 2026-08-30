(function (global) {
  "use strict";

  const EPS = 0.001;

  function dist(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return Math.hypot(dx, dy);
  }

  function sub(a, b) {
    return { x: a.x - b.x, y: a.y - b.y };
  }

  function add(a, b) {
    return { x: a.x + b.x, y: a.y + b.y };
  }

  function scale(v, s) {
    return { x: v.x * s, y: v.y * s };
  }

  function lerp(a, b, t) {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }

  function snap(v, grid) {
    if (!grid) return v;
    return Math.round(v / grid) * grid;
  }

  function snapPoint(p, grid) {
    return { x: snap(p.x, grid), y: snap(p.y, grid) };
  }

  function orthoFrom(origin, target) {
    const dx = target.x - origin.x;
    const dy = target.y - origin.y;
    if (Math.abs(dx) >= Math.abs(dy)) return { x: target.x, y: origin.y };
    return { x: origin.x, y: target.y };
  }

  function polygonArea(points) {
    if (!points || points.length < 3) return 0;
    let sum = 0;
    for (let i = 0; i < points.length; i += 1) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      sum += a.x * b.y - b.x * a.y;
    }
    return Math.abs(sum) / 2;
  }

  function polygonBounds(points) {
    if (!points.length) return { x: 0, y: 0, w: 1000, d: 800 };
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    points.forEach((p) => {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    });
    return { x: minX, y: minY, w: maxX - minX, d: maxY - minY };
  }

  function pointInPolygon(p, points) {
    if (!points || points.length < 3) return false;
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
      const a = points[i];
      const b = points[j];
      const intersect = ((a.y > p.y) !== (b.y > p.y))
        && (p.x < ((b.x - a.x) * (p.y - a.y)) / ((b.y - a.y) || EPS) + a.x);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function projectOnSegment(p, a, b) {
    const ab = sub(b, a);
    const len2 = ab.x * ab.x + ab.y * ab.y;
    if (len2 < EPS) return { point: { x: a.x, y: a.y }, t: 0, dist: dist(p, a) };
    let t = ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / len2;
    t = Math.max(0, Math.min(1, t));
    const point = lerp(a, b, t);
    return { point, t, dist: dist(p, point) };
  }

  function nearestEdge(p, points, closed) {
    if (!points || points.length < 2) return null;
    const last = closed ? points.length : points.length - 1;
    let best = null;
    for (let i = 0; i < last; i += 1) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      const hit = projectOnSegment(p, a, b);
      if (!best || hit.dist < best.dist) {
        best = {
          index: i,
          a,
          b,
          length: dist(a, b),
          ...hit,
        };
      }
    }
    return best;
  }

  function nearestVertex(p, points, maxDist) {
    let best = null;
    points.forEach((pt, index) => {
      const d = dist(p, pt);
      if (d <= maxDist && (!best || d < best.dist)) best = { index, point: pt, dist: d };
    });
    return best;
  }

  function itemBBox(item) {
    const swapped = item.rot === 90 || item.rot === 270;
    return {
      x: item.x,
      y: item.y,
      w: swapped ? item.d : item.w,
      d: swapped ? item.w : item.d,
    };
  }

  function itemCenter(item) {
    const b = itemBBox(item);
    return { x: b.x + b.w / 2, y: b.y + b.d / 2 };
  }

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.d && a.y + a.d > b.y;
  }

  function pointInRect(p, rect) {
    return p.x >= rect.x && p.x <= rect.x + rect.w && p.y >= rect.y && p.y <= rect.y + rect.d;
  }

  function rectInsidePolygon(rect, points) {
    if (!points || points.length < 3) return true;
    const corners = [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.w, y: rect.y },
      { x: rect.x + rect.w, y: rect.y + rect.d },
      { x: rect.x, y: rect.y + rect.d },
    ];
    return corners.every((c) => pointInPolygon(c, points));
  }

  function openingSpan(opening) {
    return {
      start: opening.offset,
      end: opening.offset + opening.width,
    };
  }

  function openingFitsWall(opening, wallLength) {
    return opening.offset >= 0 && opening.offset + opening.width <= wallLength + EPS;
  }

  function clampOpening(opening, wallLength) {
    const width = Math.min(opening.width, wallLength);
    opening.width = width;
    opening.offset = Math.max(0, Math.min(opening.offset, wallLength - width));
    return opening;
  }

  function wallLength(points, index) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    return dist(a, b);
  }

  function pointAlongWall(points, index, offset) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    const len = dist(a, b);
    if (len < EPS) return { x: a.x, y: a.y };
    return lerp(a, b, offset / len);
  }

  function wallNormal(points, index) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    const len = dist(a, b) || 1;
    return { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
  }

  function wallAngle(points, index) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    return Math.atan2(b.y - a.y, b.x - a.x);
  }

  function fmtCm(cm) {
    const rounded = Math.round(cm);
    return `${rounded.toLocaleString("de-DE")} cm`;
  }

  function fmtCmM(cm) {
    const rounded = Math.round(cm);
    if (rounded >= 100) {
      const meters = (rounded / 100).toLocaleString("de-DE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      return `${rounded.toLocaleString("de-DE")} cm (${meters} m)`;
    }
    return `${rounded.toLocaleString("de-DE")} cm`;
  }

  function fmtM2(cm2) {
    const m2 = cm2 / 10000;
    return `${m2.toLocaleString("de-DE", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })} m²`;
  }

  function fmtM(cm) {
    return `${(cm / 100).toLocaleString("de-DE", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })} m`;
  }

  function uid(prefix, seq) {
    return `${prefix}-${seq}`;
  }

  global.LPGeom = {
    EPS,
    dist,
    sub,
    add,
    scale,
    lerp,
    snap,
    snapPoint,
    orthoFrom,
    polygonArea,
    polygonBounds,
    pointInPolygon,
    projectOnSegment,
    nearestEdge,
    nearestVertex,
    itemBBox,
    itemCenter,
    rectsOverlap,
    pointInRect,
    rectInsidePolygon,
    openingSpan,
    openingFitsWall,
    clampOpening,
    wallLength,
    pointAlongWall,
    wallNormal,
    wallAngle,
    fmtCm,
    fmtCmM,
    fmtM2,
    fmtM,
    uid,
  };
})(window);
