// Càlculs de ritme: predicció de Riegel a partir del darrer test i zones d'entrenament.
import { DAY } from './plan.js';

export const fmt = s => { s = Math.round(s); const m = Math.floor(s / 60), r = s % 60; return `${m}:${String(r).padStart(2, '0')}`; };
export const fmtH = s => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), r = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`; };
export const parseT = str => { const p = String(str).trim().split(':').map(Number); if (!p.length || p.some(isNaN)) return null; return p.reduce((a, v) => a * 60 + v, 0) || null; };
export const riegel = (t, d, d2) => t * Math.pow(d2 / d, 1.06);

export function latestTest(tests) { return [...(tests || [])].sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] || null; }

export function fitness(tests, now = Date.now()) {
  const t = latestTest(tests); if (!t) return null;
  const dist = +t.dist, secs = +t.secs;
  const age = (now - new Date(t.date).getTime()) / DAY;
  const adj = age > 120 ? 12 : 0; // test antic: +12″/km de marge
  const p = d => riegel(secs, dist, d) / d + adj;
  return { test: t, adj, mp: p(42.195), hm: p(21.0975), k10: p(10), k5: p(5), pred: riegel(secs, dist, 42.195) + adj * 42.195 };
}

export function zones(tests, goalPace = 300) {
  const f = fitness(tests); const mp = f ? f.mp : 330;
  return {
    SU: `${fmt(mp + 40)}–${fmt(mp + 75)}/km`,
    UM: `${fmt(f ? (f.hm + f.k10) / 2 : 310)}/km`,
    IN: `${fmt(f ? f.k10 : 300)}/km`,
    RMO: `${fmt(goalPace)}/km`,
    suLow: mp + 40, suHigh: mp + 75
  };
}

/** Substitueix {SU} {UM} {IN} {RMO} pels ritmes. wrap: funció per embolcallar (HTML) o res (text pla). */
export function fillPaces(txt, z, wrap = v => v) {
  return String(txt || '').replace(/\{(SU|UM|IN|RMO)\}/g, (m, k) => wrap(z[k]));
}
