// ============================================================
// GPA engine — Frisco ISD weighted GPA
//
// Per-class GPA  = (weight - (100 - grade) * 0.1) * credit
// Weighted GPA   = Σ(per-class GPA) / Σ(credit)
//
// Verified against the reference spreadsheet:
//   AP Hum Geo (97, w6, c0.5) -> 2.85
//   Tennis     (100, w5, c0.5) -> 2.50
//   Σ = 17.95 / 3.5 = 5.1286
// ============================================================

export const WEIGHTS = {
  AP: 6.0,    // AP / IB / Dual Credit / OnRamps
  ADV: 5.5,   // Pre-AP (PAP) / GT / Honors / Advanced
  REG: 5.0,   // On-level / regular
};

export const WEIGHT_OPTIONS = [
  { value: 6.0, label: '6.0 — AP / IB / Dual Credit' },
  { value: 5.5, label: '5.5 — PAP / GT / Honors / Advanced' },
  { value: 5.0, label: '5.0 — Regular / On-level' },
];

// Heuristic: infer a course's weight from its name (and optional course code).
// Handles full classwork names ("AP Human Geography", "Chemistry Adv") AND the
// abbreviated transcript forms ("APHUMGEOW", "APPRECAL"). In Frisco, AP/advanced
// course codes also start with a letter (e.g. "A3360100"), which we use as a hint.
// Order matters — PAP / Pre-AP must be tested before the bare "AP" rule.
export function detectWeight(name, code) {
  const n = (name || '').toUpperCase();
  const nz = n.replace(/\s+/g, '');
  const c = (code || '').toUpperCase().trim();

  if (/PRE-?\s?AP|\bPAP\b/.test(n)) return WEIGHTS.ADV;
  if (/\bIB\b/.test(n)) return WEIGHTS.AP;
  if (/\bAP\b/.test(n) || /^AP[A-Z]/.test(nz) || /^A\d/.test(c)) return WEIGHTS.AP;
  if (/DUAL\s?CR|\bDC\b|ON-?RAMPS?/.test(n)) return WEIGHTS.AP;
  if (/\bGT\b|GIFTED/.test(n)) return WEIGHTS.ADV;
  if (/\bHON(?:ORS)?\b/.test(n)) return WEIGHTS.ADV;
  if (/\bADV(?:ANCED)?\b/.test(n)) return WEIGHTS.ADV;

  return WEIGHTS.REG;
}

export function weightLabel(w) {
  if (w >= 6) return 'AP';
  if (w >= 5.5) return 'Adv';
  return 'Reg';
}

export function weightTagClass(w) {
  if (w >= 6) return 'tag-w6';
  if (w >= 5.5) return 'tag-w55';
  return 'tag-w5';
}

// Parse a grade string like "85.33%" or "97" into a number, or null.
export function parseGrade(s) {
  if (s == null) return null;
  const m = String(s).match(/(-?\d+(\.\d+)?)/);
  if (!m) return null;
  const v = parseFloat(m[1]);
  return Number.isFinite(v) ? v : null;
}

export function classGpa(grade, weight, credit) {
  if (grade == null) return null;
  return (weight - (100 - grade) * 0.1) * credit;
}

// HAC posts each SEMESTER grade as a whole number (88.5 -> 89). Round a
// quarter average the same way before it feeds the GPA.
export function roundGrade(g) {
  return g == null ? null : Math.round(g);
}

// HAC's OFFICIAL semester grade = round(average(each quarter rounded)). The final
// re-round is what HAC posts to the transcript (Eng 1 85.33,92.29 -> 89;
// AP Human Geo 92.5,97.5 -> 96). Use this for cumulative / transcript matching.
export function semesterGrade(quarterAverages) {
  const r = quarterAverages.filter((x) => x != null).map((x) => Math.round(x));
  if (!r.length) return null;
  return Math.round(r.reduce((a, b) => a + b, 0) / r.length);
}

// "Live" semester average = average of the whole-number quarter grades WITHOUT
// the final re-round. Keeps a live semester GPA consistent with its quarter
// GPAs (so it never reads higher than both quarters from a .5 round-up).
export function liveSemesterAverage(quarterAverages) {
  const r = quarterAverages.filter((x) => x != null).map((x) => Math.round(x));
  if (!r.length) return null;
  return Math.round((r.reduce((a, b) => a + b, 0) / r.length) * 100) / 100;
}

// Unweighted 4.0-scale points for a numeric grade (Texas: passing is 70).
//   90-100 -> 4.0   80-89 -> 3.0   70-79 -> 2.0   below 70 (failing) -> 0.0
export function unweightedPoints(grade) {
  if (grade == null) return null;
  if (grade >= 90) return 4.0;
  if (grade >= 80) return 3.0;
  if (grade >= 70) return 2.0;
  return 0.0;
}

// rows: [{ grade, weight, credit, include }]
export function weightedGpa(rows) {
  let points = 0;
  let credits = 0;
  for (const r of rows) {
    if (!r.include) continue;
    if (r.grade == null) continue;
    const g = classGpa(r.grade, r.weight, r.credit);
    if (g == null) continue;
    points += g;
    credits += r.credit;
  }
  return {
    gpa: credits > 0 ? points / credits : 0,
    points,
    credits,
  };
}

// Unweighted GPA on the 4.0 scale (credit-weighted average of letter points).
export function unweightedGpa(rows) {
  let points = 0;
  let credits = 0;
  for (const r of rows) {
    if (!r.include) continue;
    const p = unweightedPoints(r.grade);
    if (p == null) continue;
    points += p * r.credit;
    credits += r.credit;
  }
  return { gpa: credits > 0 ? points / credits : 0, credits };
}

// Letter grade + css class for a numeric average (Texas 100-scale)
export function letterGrade(g) {
  if (g == null) return { letter: '—', cls: 'g-na' };
  if (g >= 90) return { letter: 'A', cls: 'g-a' };
  if (g >= 80) return { letter: 'B', cls: 'g-b' };
  if (g >= 75) return { letter: 'C', cls: 'g-c' };
  if (g >= 70) return { letter: 'D', cls: 'g-d' };
  return { letter: 'F', cls: 'g-f' };
}

export function fmtGpa(n) {
  return (Math.round(n * 10000) / 10000).toFixed(4);
}
