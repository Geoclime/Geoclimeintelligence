import type {
  DailyForecastItem,
  PredictionDrivers,
  PredictionHorizon,
  PredictionRiskLevel,
} from "./flood-prediction.types";

export interface ScoringInputs {
  horizon: PredictionHorizon;
  days: DailyForecastItem[];
  peakDischargeM3s: number | null;
  meanDischargeM3s: number | null;
  /** From FloodRiskService.area(): 0-100, or null if no susceptibility map is live */
  percentHighOrVeryHighRisk: number | null;
  /** From DrainageService.summary(): blocked + overflowing + damaged */
  blockedDrainsCount: number;
  totalDrainsCount: number;
  /** From FloodExtentService.history(): active flood extents not yet receded */
  activeFloodsCount: number;
  /** Historical CHIRPS mean for this calendar month (mm), or null */
  historicalMonthAverageMm: number | null;
  /** Latest month or expected monthly rainfall (mm), for seasonal comparison */
  expectedMonthlyRainfallMm: number | null;
}

export interface ScoredPrediction {
  riskLevel: PredictionRiskLevel;
  likelihoodScore: number;
  forecastRainfallMm: number;
  peakDailyRainfallMm: number;
  peakDayDate: string | null;
  riverDischargeM3s: number | null;
  riverDischargeRatio: number | null;
  drivers: PredictionDrivers;
}

const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, Math.round(n)));
const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Maps a 0-100 flood likelihood score to the platform's standard alert severity vocabulary.
 */
export function scoreToRiskLevel(score: number): PredictionRiskLevel {
  if (score >= 80) return "severe";
  if (score >= 60) return "warning";
  if (score >= 35) return "watch";
  return "normal";
}

/**
 * Scores peak single-day rainfall and 7-day total using the daily guide in docs/rainfall.md:
 * - < 25 mm/day: ordinary (0-30)
 * - 25-50 mm/day: heavy; street flooding possible where drainage is poor (30-60)
 * - 50-100 mm/day: very heavy; flooding likely in low-lying/built-up areas (60-88)
 * - > 100 mm/day: extreme; widespread flooding likely (88-100)
 */
export function scoreDailyRain(peakDayMm: number, total7dMm: number): number {
  let peakScore = 0;
  if (peakDayMm <= 0) peakScore = 0;
  else if (peakDayMm < 25) peakScore = (peakDayMm / 25) * 30;
  else if (peakDayMm < 50) peakScore = 30 + ((peakDayMm - 25) / 25) * 30;
  else if (peakDayMm < 100) peakScore = 60 + ((peakDayMm - 50) / 50) * 28;
  else peakScore = 88 + Math.min(12, ((peakDayMm - 100) / 80) * 12);

  // Sustained multi-day rain adds saturation pressure even when no single day is extreme
  const cumulativeBonus = Math.min(20, (total7dMm / 250) * 20);
  return clamp(peakScore * 0.85 + cumulativeBonus);
}

/**
 * Deterministic multi-factor flood prediction scorer.
 * Combines 7-day weather & river discharge with terrain susceptibility, drainage condition,
 * active flood extents, and 10-year monthly rainfall baseline.
 */
export function computeFloodPrediction(input: ScoringInputs): ScoredPrediction {
  const total7dMm = round1(input.days.reduce((sum, d) => sum + d.rainfallMm, 0));
  let peakDailyRainfallMm = 0;
  let peakDayDate: string | null = null;
  for (const d of input.days) {
    if (d.rainfallMm > peakDailyRainfallMm) {
      peakDailyRainfallMm = round1(d.rainfallMm);
      peakDayDate = d.date;
    }
  }

  // 1. Forecast Rain Score (weight 35% for 7d, 30% for seasonal)
  let forecastRainScore: number;
  let forecastRainfallMm: number;
  if (input.horizon === "seasonal") {
    const monthlyExpected = round1(input.expectedMonthlyRainfallMm ?? input.historicalMonthAverageMm ?? total7dMm * 4.2);
    forecastRainfallMm = monthlyExpected;
    // Scale from docs/rainfall.md: <110 low, 110-330 moderate, >330 high, >430 very high
    if (monthlyExpected < 110) forecastRainScore = clamp((monthlyExpected / 110) * 25);
    else if (monthlyExpected < 330) forecastRainScore = clamp(25 + ((monthlyExpected - 110) / 220) * 35);
    else if (monthlyExpected < 450) forecastRainScore = clamp(60 + ((monthlyExpected - 330) / 120) * 25);
    else forecastRainScore = clamp(85 + ((monthlyExpected - 450) / 200) * 15);
  } else {
    forecastRainfallMm = total7dMm;
    forecastRainScore = scoreDailyRain(peakDailyRainfallMm, total7dMm);
  }

  // 2. River Discharge Anomaly Score (weight 15%)
  let riverDischargeRatio: number | null = null;
  let riverDischargeScore = 0;
  if (input.peakDischargeM3s !== null && input.meanDischargeM3s !== null && input.meanDischargeM3s > 0) {
    riverDischargeRatio = round2(input.peakDischargeM3s / input.meanDischargeM3s);
    if (riverDischargeRatio <= 1) riverDischargeScore = clamp(riverDischargeRatio * 25);
    else if (riverDischargeRatio <= 2) riverDischargeScore = clamp(25 + (riverDischargeRatio - 1) * 45);
    else riverDischargeScore = clamp(70 + Math.min(30, (riverDischargeRatio - 2) * 30));
  }

  // 3. Terrain Susceptibility Score (weight 20%)
  // From FloodRiskService: percentHighOrVeryHigh (in Rivers State, LGAs range from ~10% to ~75%)
  const susceptibilityScore =
    input.percentHighOrVeryHighRisk === null ? 30 : clamp(Math.min(100, input.percentHighOrVeryHighRisk * 1.35));

  // 4. Drainage Vulnerability Score (weight 15%)
  let drainageVulnerabilityScore = 20; // baseline when uninspected
  if (input.totalDrainsCount > 0) {
    const blockedShare = input.blockedDrainsCount / input.totalDrainsCount;
    const countBoost = Math.min(35, input.blockedDrainsCount * 12);
    drainageVulnerabilityScore = clamp(blockedShare * 65 + countBoost);
  }

  // 5. Ground Saturation & Active Flood History Score (weight 15%)
  let groundSaturationScore = 0;
  if (input.historicalMonthAverageMm !== null) {
    // Wet season baseline (June-Oct averages 300-420mm in Rivers State)
    groundSaturationScore += Math.min(55, (input.historicalMonthAverageMm / 420) * 55);
  }
  if (input.activeFloodsCount > 0) {
    groundSaturationScore += Math.min(55, 25 + input.activeFloodsCount * 15);
  }
  groundSaturationScore = clamp(groundSaturationScore);

  // Weighted composite score
  const rawComposite =
    forecastRainScore * 0.35 +
    riverDischargeScore * 0.15 +
    susceptibilityScore * 0.2 +
    drainageVulnerabilityScore * 0.15 +
    groundSaturationScore * 0.15;

  // Boost when heavy rain meets blocked drains or active flooding on the ground
  let synergyBoost = 0;
  if (peakDailyRainfallMm >= 50 && (input.blockedDrainsCount > 0 || (input.percentHighOrVeryHighRisk ?? 0) >= 40)) {
    synergyBoost += 10;
  }
  if (input.activeFloodsCount > 0 && (peakDailyRainfallMm >= 25 || forecastRainfallMm >= 80)) {
    synergyBoost += 10;
  }

  const likelihoodScore = clamp(rawComposite + synergyBoost);
  const riskLevel = scoreToRiskLevel(likelihoodScore);

  const factors: string[] = [];
  if (input.horizon === "7d") {
    if (peakDailyRainfallMm >= 50 && peakDayDate) {
      factors.push(`Very heavy rain forecast (${peakDailyRainfallMm} mm on ${peakDayDate}, ${total7dMm} mm over 7 days)`);
    } else if (peakDailyRainfallMm >= 25 && peakDayDate) {
      factors.push(`Heavy daily rain forecast (${peakDailyRainfallMm} mm on ${peakDayDate}, ${total7dMm} mm over 7 days)`);
    } else {
      factors.push(`${total7dMm} mm total rain forecast over the next 7 days`);
    }
  } else {
    factors.push(
      `Seasonal baseline of ${forecastRainfallMm} mm/month${
        input.historicalMonthAverageMm !== null ? ` (10-year average: ${round1(input.historicalMonthAverageMm)} mm)` : ""
      }`,
    );
  }

  if (riverDischargeRatio !== null && riverDischargeRatio >= 1.25) {
    factors.push(`River discharge at ${Math.round(riverDischargeRatio * 100)}% of usual seasonal flow`);
  }
  if (input.percentHighOrVeryHighRisk !== null) {
    factors.push(`${input.percentHighOrVeryHighRisk}% of terrain is high or very high flood susceptibility`);
  }
  if (input.blockedDrainsCount > 0) {
    factors.push(
      `${input.blockedDrainsCount} of ${input.totalDrainsCount} recorded ${
        input.totalDrainsCount === 1 ? "drain needs" : "drains need"
      } attention (blocked, overflowing or damaged)`,
    );
  }
  if (input.activeFloodsCount > 0) {
    factors.push(`${input.activeFloodsCount} active ${input.activeFloodsCount === 1 ? "flood" : "floods"} still on the ground`);
  }

  return {
    riskLevel,
    likelihoodScore,
    forecastRainfallMm,
    peakDailyRainfallMm,
    peakDayDate,
    riverDischargeM3s: input.peakDischargeM3s !== null ? round1(input.peakDischargeM3s) : null,
    riverDischargeRatio,
    drivers: {
      forecastRainScore,
      riverDischargeScore,
      susceptibilityScore,
      drainageVulnerabilityScore,
      groundSaturationScore,
      factors,
      metrics: {
        percentHighOrVeryHighRisk: input.percentHighOrVeryHighRisk,
        blockedDrainsCount: input.blockedDrainsCount,
        totalDrainsCount: input.totalDrainsCount,
        activeFloodsCount: input.activeFloodsCount,
        historicalMonthAverageMm: input.historicalMonthAverageMm !== null ? round1(input.historicalMonthAverageMm) : null,
      },
    },
  };
}
