/**
 * Détection des séquences (« bannières ») d'une vidéo à partir de signatures d'images.
 *
 * Module pur : aucune dépendance à FFmpeg ni au système de fichiers, donc testable seul.
 * Entrée : des images réduites (RGB) échantillonnées à cadence fixe.
 *
 * Principe :
 * - chaque image est résumée par un histogramme de couleurs par zone (ce qui change quand le
 *   sujet change) et une vignette de luminance (la composition) ;
 * - pour chaque instant, on compare les images d'AVANT à celles d'APRÈS, paire par paire, et on
 *   garde la médiane : un flash ou un effet lumineux de quelques images ne déplace pas la médiane,
 *   alors qu'un vrai changement de séquence (coupe franche ou fondu) la fait monter durablement ;
 * - un mouvement de caméra ou un zoom continu produit un niveau élevé mais régulier, sans pic :
 *   on exige donc un pic nettement au-dessus du niveau environnant.
 */

export const SIGNATURE_SIZE = 32; // images analysées en 32×32
const GRID = 4; // l'image est divisée en 4×4 zones
const CELLS = GRID * GRID;
const CELL = SIGNATURE_SIZE / GRID; // 8 pixels de côté
const CHROMA = 4; // histogramme de teinte 4×4 par zone (indépendant de la luminosité)
const TONES = 4; // histogramme de luminosité par zone
const SUB = 4; // mini-vignette 4×4 par zone (composition)
const PER_CELL = CHROMA * CHROMA + TONES + SUB * SUB;
/** Nombre de zones retenues pour mesurer un changement (les plus modifiées). */
const TOP_CELLS = 4;

/**
 * Résumé compact d'une image (576 octets). Chaque zone a son propre résumé, ce qui permet de
 * voir un changement qui n'occupe qu'une partie de l'écran : beaucoup de vidéos de bannières
 * montrent la bannière dans un cadre, sur un fond fixe avec du texte.
 */
export type Signature = { data: Uint8Array; blank: boolean };
export type { BannerSegment as Segment, BannerSensitivity as Sensitivity, BannerVerdict as Verdict } from "./types";
import type { BannerSegment as Segment, BannerSensitivity as Sensitivity, BannerVerdict as Verdict } from "./types";

export type DetectionResult = {
  segments: Segment[];
  /** Force de chaque frontière retenue (0–1), dans l'ordre. */
  boundaries: { time: number; strength: number; kind: "cut" | "transition" }[];
  verdict: Verdict;
  /** Explication lisible du verdict, sans surinterprétation. */
  reason: string;
};

const scratch = new Float32Array(CELLS * PER_CELL);

/** Résume une image RGB24 de SIGNATURE_SIZE × SIGNATURE_SIZE pixels. */
export function signatureOf(rgb: Uint8Array): Signature {
  const n = SIGNATURE_SIZE;
  const pixels = n * n;
  const acc = scratch.fill(0);
  let sum = 0;
  let sumSq = 0;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const o = (y * n + x) * 3;
      const r = rgb[o];
      const g = rgb[o + 1];
      const b = rgb[o + 2];
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      const base = ((y >> 3) * GRID + (x >> 3)) * PER_CELL;
      // Teinte (Cb, Cr) répartie en douceur sur les cases voisines : un léger changement
      // d'éclairage ou de saturation ne fait pas « sauter » l'image d'une case à l'autre.
      const cb = Math.min(CHROMA - 1, Math.max(0, (((b - l) * 0.564 * 2 + 128) / 255) * (CHROMA - 1)));
      const cr = Math.min(CHROMA - 1, Math.max(0, (((r - l) * 0.713 * 2 + 128) / 255) * (CHROMA - 1)));
      const cb0 = Math.min(CHROMA - 2, Math.floor(cb));
      const cr0 = Math.min(CHROMA - 2, Math.floor(cr));
      const fb = cb - cb0;
      const fr = cr - cr0;
      acc[base + cb0 * CHROMA + cr0] += (1 - fb) * (1 - fr);
      acc[base + cb0 * CHROMA + cr0 + 1] += (1 - fb) * fr;
      acc[base + (cb0 + 1) * CHROMA + cr0] += fb * (1 - fr);
      acc[base + (cb0 + 1) * CHROMA + cr0 + 1] += fb * fr;
      const tp = (l / 255) * (TONES - 1);
      const t0 = Math.min(TONES - 2, Math.floor(tp));
      acc[base + CHROMA * CHROMA + t0] += 1 - (tp - t0);
      acc[base + CHROMA * CHROMA + t0 + 1] += tp - t0;
      acc[base + CHROMA * CHROMA + TONES + ((y & 7) >> 1) * SUB + ((x & 7) >> 1)] += l;
      sum += l;
      sumSq += l * l;
    }
  }
  const mean = sum / pixels;
  const variance = Math.max(0, sumSq / pixels - mean * mean);
  // Vignette centrée et normalisée : décrit la composition, pas la luminosité globale.
  const scale = Math.sqrt(variance) + 12;
  const data = new Uint8Array(CELLS * PER_CELL);
  const perCell = CELL * CELL;
  for (let c = 0; c < CELLS; c++) {
    const base = c * PER_CELL;
    for (let i = 0; i < CHROMA * CHROMA + TONES; i++) data[base + i] = Math.round((acc[base + i] / perCell) * 255);
    for (let i = CHROMA * CHROMA + TONES; i < PER_CELL; i++) data[base + i] = Math.min(255, Math.max(0, Math.round(((acc[base + i] / 4 - mean) / scale) * 48 + 128)));
  }
  return { data, blank: variance < 4 }; // image quasi unie (noir, blanc, aplat)
}

const cellScores = new Float32Array(CELLS);

/**
 * Distance entre deux images, de 0 (identiques) à 1 (sans rapport) : moyenne des zones les
 * plus modifiées. Un changement complet dans un quart de l'écran compte donc pleinement.
 */
export function distance(a: Signature, b: Signature): number {
  const x = a.data;
  const y = b.data;
  for (let c = 0; c < CELLS; c++) {
    let i = c * PER_CELL;
    let chroma = 0;
    for (const end = i + CHROMA * CHROMA; i < end; i++) chroma += Math.abs(x[i] - y[i]);
    let tones = 0;
    for (const end = i + TONES; i < end; i++) tones += Math.abs(x[i] - y[i]);
    let shape = 0;
    for (const end = i + SUB * SUB; i < end; i++) shape += Math.abs(x[i] - y[i]);
    cellScores[c] = 0.4 * (chroma / 510) + 0.2 * (tones / 510) + 0.4 * Math.min(1, shape / (SUB * SUB * 48));
  }
  // Moyenne des TOP_CELLS plus grandes valeurs (sélection partielle, sans tri complet).
  let total = 0;
  for (let k = 0; k < TOP_CELLS; k++) {
    let best = 0;
    for (let c = 1; c < CELLS; c++) if (cellScores[c] > cellScores[best]) best = c;
    total += cellScores[best];
    cellScores[best] = -1;
  }
  return total / TOP_CELLS;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((x, y) => x - y);
  const m = sorted.length >> 1;
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
}

const THRESHOLDS: Record<Sensitivity, { cut: number; transition: number; ratio: number }> = {
  low: { cut: 0.34, transition: 0.38, ratio: 2.4 },
  normal: { cut: 0.2, transition: 0.3, ratio: 1.8 },
  high: { cut: 0.17, transition: 0.26, ratio: 1.6 },
};

export type DetectOptions = {
  /** Horodatage de chaque image (secondes). */
  times: number[];
  duration: number;
  sensitivity?: Sensitivity;
  /** Durée minimale d'une séquence (secondes). */
  minSegment?: number;
};

function percentile(values: number[], q: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((x, y) => x - y);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
}

/**
 * Score de rupture à chaque image : différence entre les images d'avant et d'après (médiane de
 * plusieurs paires, donc insensible à un flash), diminuée de l'agitation interne de chaque côté
 * (un plan qui bouge beaucoup n'est pas une rupture). `gap` écarte les images du milieu, ce qui
 * permet de voir un fondu comme une rupture entre ce qui le précède et ce qui le suit.
 */
export function ruptureCurve(frames: Signature[], gap: number, span: number): Float32Array {
  const total = frames.length;
  const out = new Float32Array(total);
  // L'agitation interne est mesurée sur un écart de temps comparable à celui de la comparaison
  // avant/après : un changement lent et continu (dégradé qui évolue, zoom) n'est pas une rupture.
  const lags = [Math.max(2, span - 1), Math.max(2, gap + span)];
  for (let i = 1; i < total; i++) {
    const cross: number[] = [];
    for (let j = 1; j <= span; j++) {
      const a = i - gap - j;
      const b = i + gap + j - 1;
      if (a >= 0 && b < total) cross.push(distance(frames[a], frames[b]));
    }
    if (cross.length < Math.min(span, 3)) continue;
    const inner = (from: number, dir: 1 | -1) => {
      let worst = 0;
      for (const lag of lags) {
        const v: number[] = [];
        for (let j = 0; j < span; j++) {
          const a = from + dir * j;
          const b = a + dir * lag;
          if (a >= 0 && b >= 0 && a < total && b < total) v.push(distance(frames[a], frames[b]));
        }
        worst = Math.max(worst, median(v));
      }
      return worst;
    };
    const left = inner(i - gap - 1, -1);
    const right = inner(i + gap, 1);
    // Quantile bas plutôt que médiane : il faut que la grande majorité des paires diffèrent,
    // ce qui écarte aussi les flashs répétés (effet stroboscopique).
    out[i] = Math.max(0, percentile(cross, 0.3) - (left + right) / 2);
  }
  return out;
}

type Candidate = { frame: number; strength: number; kind: "cut" | "transition" };

function pickPeaks(curve: Float32Array, threshold: number, ratio: number, radius: number, fps: number, kind: Candidate["kind"]): Candidate[] {
  const total = curve.length;
  const found: Candidate[] = [];
  const wide = Math.round(fps * 3);
  for (let i = 1; i < total; i++) {
    const v = curve[i];
    if (v < threshold) continue;
    let isMax = true;
    for (let j = Math.max(1, i - radius); j <= Math.min(total - 1, i + radius) && isMax; j++) {
      if (curve[j] > v || (curve[j] === v && j < i)) isMax = false;
    }
    if (!isMax) continue;
    const around: number[] = [];
    for (let j = Math.max(1, i - wide); j <= Math.min(total - 1, i + wide); j++) around.push(curve[j]);
    // Niveau de fond : un changement continu (zoom, défilement) relève tout le voisinage.
    if (v < percentile(around, 0.3) * ratio + 0.03) continue;
    // Centre du plateau (utile pour un fondu : la frontière est au milieu de la transition).
    let lo = i;
    let hi = i;
    while (lo > 1 && curve[lo - 1] >= v * 0.85) lo--;
    while (hi < total - 1 && curve[hi + 1] >= v * 0.85) hi++;
    found.push({ frame: kind === "cut" ? i : Math.round((lo + hi) / 2), strength: Math.min(1, v), kind });
  }
  return found;
}

/**
 * Coupes franches. Trois conditions :
 * - netteté : l'image j diffère de la précédente, et les images un peu plus loin de part et
 *   d'autre diffèrent aussi (un flash de quelques images ne remplit pas cette condition) ;
 * - contraste : cette différence dépasse nettement l'agitation habituelle du passage (un plan
 *   très mouvementé change beaucoup d'une image à l'autre sans pour autant être coupé) ;
 * - persistance : ce qui suit reste différent de ce qui précède.
 */
function pickCuts(frames: Signature[], threshold: number, span: number): Candidate[] {
  const total = frames.length;
  const sharp = new Float32Array(total);
  for (let j = 3; j < total - 2; j++) {
    sharp[j] = Math.min(distance(frames[j - 1], frames[j]), distance(frames[j - 2], frames[j + 1]), distance(frames[j - 3], frames[j + 2]));
  }
  const window = span * 2;
  const found: Candidate[] = [];
  for (let j = 3; j < total - 2; j++) {
    const v = sharp[j];
    if (v < threshold) continue;
    let isMax = true;
    const around: number[] = [];
    for (let k = Math.max(3, j - window); k <= Math.min(total - 3, j + window); k++) {
      if (k === j) continue;
      if (sharp[k] > v || (sharp[k] === v && k < j)) isMax = false;
      // `sharp` regarde 3 images de chaque côté : on écarte le voisinage immédiat de la coupe.
      if (Math.abs(k - j) > 3) around.push(sharp[k]);
    }
    if (!isMax) continue;
    const contrast = v - 2 * median(around);
    if (contrast < threshold) continue;
    const pairs: number[] = [];
    for (let k = 1; k <= span; k++) {
      if (j - k >= 0 && j + k - 1 < total) pairs.push(distance(frames[j - k], frames[j + k - 1]));
    }
    const persistence = percentile(pairs, 0.3);
    if (persistence < threshold) continue;
    found.push({ frame: j, strength: Math.min(1, Math.min(contrast, persistence)), kind: "cut" });
  }
  return found;
}

export function detectSegments(frames: Signature[], opts: DetectOptions): DetectionResult {
  const total = frames.length;
  const times = opts.times;
  const last = times[total - 1] ?? 0;
  const fps = total > 1 && last > 0 ? (total - 1) / last : 30;
  const duration = Math.max(opts.duration, last + 1 / fps);
  // Une coupe se place entre deux images ; une transition, sur l'image centrale.
  const timeOf = (c: Candidate) => (c.kind === "cut" ? (times[c.frame - 1] + times[c.frame]) / 2 : times[c.frame]);
  const minSegment = opts.minSegment ?? 0.7;
  const t = THRESHOLDS[opts.sensitivity ?? "normal"];
  const single = (reason: string, verdict: Verdict = "single"): DetectionResult => ({ segments: [{ index: 1, start: 0, end: duration }], boundaries: [], verdict, reason });
  if (total < fps * 1.5) return single("La vidéo est trop courte pour contenir plusieurs séquences.");

  const span = Math.max(3, Math.round(fps / 3));
  const gap = Math.max(2, Math.round(fps * 0.35));
  // 1. Coupes franches : deux images voisines très différentes, ET la différence persiste.
  const cuts = pickCuts(frames, t.cut, span);
  const near = Math.max(gap + span + 1, Math.round(fps * 0.9));
  const fades = pickPeaks(ruptureCurve(frames, gap, span), t.transition, t.ratio, gap + span, fps, "transition").filter(
    (f) => !cuts.some((c) => Math.abs(c.frame - f.frame) <= near),
  );
  const boundaries = [...cuts, ...fades].map((c) => ({ ...c, time: timeOf(c) }));

  // 2. Séquences trop courtes : on supprime la frontière la plus faible qui les borde.
  const kept = [...boundaries].sort((a, b) => a.time - b.time);
  for (;;) {
    const edges = [0, ...kept.map((b) => b.time), duration];
    let worst = -1;
    for (let s = 0; s < edges.length - 1; s++) {
      if (edges[s + 1] - edges[s] >= minSegment) continue;
      const candidates = [s - 1, s].filter((b) => b >= 0 && b < kept.length);
      if (!candidates.length) continue;
      const weakest = candidates.reduce((x, y) => (kept[x].strength <= kept[y].strength ? x : y));
      if (worst === -1 || kept[weakest].strength < kept[worst].strength) worst = weakest;
    }
    if (worst === -1) break;
    kept.splice(worst, 1);
  }

  // 3. Séquences, en écartant un court écran uni (noir, blanc) placé entre deux bannières.
  const edges = [0, ...kept.map((b) => b.time), duration];
  const segments: Segment[] = [];
  let f = 0;
  for (let s = 0; s < edges.length - 1; s++) {
    let count = 0;
    let blank = 0;
    for (; f < total && times[f] < edges[s + 1]; f++) {
      count++;
      if (frames[f].blank) blank++;
    }
    if (count && blank / count > 0.9 && edges.length > 2 && edges[s + 1] - edges[s] < 1.5) continue;
    segments.push({ index: segments.length + 1, start: round3(edges[s]), end: round3(edges[s + 1]) });
  }
  if (!segments.length) return single("Aucune séquence exploitable n'a été trouvée.", "uncertain");

  return { segments, boundaries: kept.map(({ time, strength, kind }) => ({ time: round3(time), strength: round3(strength), kind })), ...classify(segments) };
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;

/** Verdict prudent : on décrit ce qui a été mesuré, sans affirmer la nature du contenu. */
export function classify(segments: Segment[]): { verdict: Verdict; reason: string } {
  const n = segments.length;
  if (n === 1) return { verdict: "single", reason: "Une seule séquence continue a été détectée : cette vidéo ressemble à une vidéo classique." };
  const durations = segments.map((s) => s.end - s.start);
  const mean = durations.reduce((a, b) => a + b, 0) / n;
  const spread = Math.sqrt(durations.reduce((a, d) => a + (d - mean) ** 2, 0) / n) / mean;
  const med = median(durations);
  if (n >= 3 && med >= 1 && med <= 15 && spread <= 0.75) {
    return { verdict: "banners", reason: `${n} séquences de durée comparable (environ ${med.toFixed(1).replace(".", ",")} s) : cette vidéo ressemble à une compilation de bannières.` };
  }
  return { verdict: "uncertain", reason: `${n} séquences détectées, de durées irrégulières : il peut s'agir de bannières ou d'un simple montage. Vérifiez les aperçus.` };
}
