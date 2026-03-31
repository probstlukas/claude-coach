/**
 * Running Data Analyzer
 *
 * Takes raw Strava activity data and computes running insights:
 * KPIs, weekly/monthly volume, HR zones, pace progression, run types
 */

import type {
  RunActivity,
  RunningData,
  RunningKPIs,
  RunningVolumeWeek,
  RunningMonthVolume,
  RunningHRZoneDistribution,
  RunningPaceProgression,
  RunType,
} from "../schema/training-plan.js";

// ============================================================================
// Types for raw Strava data
// ============================================================================

export interface RawStravaRun {
  id: number;
  name: string;
  sport_type: string;
  date: string;
  moving_time: number;
  distance: number;
  average_speed: number;
  max_speed: number;
  average_heartrate: number | null;
  max_heartrate: number | null;
  total_elevation_gain: number;
  suffer_score: number | null;
  calories: number | null;
  workout_type: number | null;
}

// ============================================================================
// Helpers
// ============================================================================

function formatPace(secsPerKm: number): string {
  const mins = Math.floor(secsPerKm / 60);
  const secs = Math.round(secsPerKm % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}/km`;
}

function speedToPace(speedMs: number): number {
  if (speedMs <= 0) return 0;
  return 1000 / speedMs; // seconds per km
}

function getMonday(dateStr: string): string {
  const date = new Date(dateStr);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setDate(date.getDate() + diff);
  return monday.toISOString().split("T")[0];
}

function formatWeekLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${months[date.getMonth()]} ${date.getDate()}`;
}

function getMonthKey(dateStr: string): string {
  return dateStr.slice(0, 7); // "2026-03"
}

function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-");
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${months[parseInt(month) - 1]} ${year.slice(2)}`;
}

function getDayOfWeek(dateStr: string): string {
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return days[new Date(dateStr).getDay()];
}

/**
 * Classify run type based on pace, HR, distance, and duration
 * Uses LTHR of 165 bpm (from user's data)
 */
function classifyRun(run: RawStravaRun, avgPaceAll: number): RunType {
  if (run.sport_type === "TrailRun") return "trail";
  if (run.workout_type === 1) return "race";

  const distKm = run.distance / 1000;
  const pacePerKm = speedToPace(run.average_speed);
  const hr = run.average_heartrate;

  // Long run: > 12km
  if (distKm >= 12) return "long";

  // Use HR if available (LTHR ~165)
  if (hr !== null) {
    if (hr >= 160) return "interval"; // Above threshold
    if (hr >= 150) return "tempo";
    if (hr >= 135) return "moderate";
    return "easy";
  }

  // Fallback to pace comparison
  if (pacePerKm < avgPaceAll * 0.88) return "interval";
  if (pacePerKm < avgPaceAll * 0.95) return "tempo";
  if (pacePerKm > avgPaceAll * 1.08) return "easy";
  return "moderate";
}

// ============================================================================
// HR Zone Definitions (based on LTHR 165)
// ============================================================================

const HR_ZONES = [
  { zone: 1, name: "Recovery", hrLow: 0, hrHigh: 134 },
  { zone: 2, name: "Aerobic", hrLow: 134, hrHigh: 147 },
  { zone: 3, name: "Tempo", hrLow: 147, hrHigh: 157 },
  { zone: 4, name: "Threshold", hrLow: 157, hrHigh: 168 },
  { zone: 5, name: "VO2max", hrLow: 168, hrHigh: 200 },
];

function getHRZone(avgHR: number): number {
  for (const z of HR_ZONES) {
    if (avgHR >= z.hrLow && avgHR < z.hrHigh) return z.zone;
  }
  return 5; // max
}

// ============================================================================
// Main Analyzer
// ============================================================================

export function analyzeRunningData(rawRuns: RawStravaRun[]): RunningData {
  if (rawRuns.length === 0) {
    throw new Error("No running data found");
  }

  // Sort by date ascending
  const sorted = [...rawRuns].sort((a, b) => a.date.localeCompare(b.date));

  // Calculate overall avg pace for run type classification
  const totalDist = sorted.reduce((sum, r) => sum + r.distance, 0);
  const totalTime = sorted.reduce((sum, r) => sum + r.moving_time, 0);
  const avgSpeedAll = totalDist / totalTime;
  const avgPaceAll = speedToPace(avgSpeedAll);

  // Build run activities
  const runs: RunActivity[] = sorted.map((r) => {
    const pacePerKm = speedToPace(r.average_speed);
    return {
      id: r.id,
      name: r.name,
      date: r.date,
      sportType: r.sport_type,
      movingTimeSeconds: r.moving_time,
      distanceMeters: r.distance,
      averagePaceSecsPerKm: pacePerKm,
      averageSpeedMs: r.average_speed,
      maxSpeedMs: r.max_speed,
      averageHeartrate: r.average_heartrate,
      maxHeartrate: r.max_heartrate,
      elevationGain: r.total_elevation_gain || 0,
      sufferScore: r.suffer_score,
      calories: r.calories,
      runType: classifyRun(r, avgPaceAll),
    };
  });

  // ---- KPIs ----
  const totalDistKm = Math.round((totalDist / 1000) * 10) / 10;
  const totalHours = Math.round((totalTime / 3600) * 10) / 10;
  const totalElev = Math.round(sorted.reduce((sum, r) => sum + (r.total_elevation_gain || 0), 0));

  const runsWithHR = sorted.filter((r) => r.average_heartrate !== null);
  const avgHR =
    runsWithHR.length > 0
      ? Math.round(runsWithHR.reduce((sum, r) => sum + r.average_heartrate!, 0) / runsWithHR.length)
      : 0;

  const longestRun = sorted.reduce((max, r) => (r.distance > max.distance ? r : max), sorted[0]);
  const fastestRun = sorted.reduce(
    (max, r) => (r.average_speed > max.average_speed ? r : max),
    sorted[0]
  );

  const kpis: RunningKPIs = {
    totalRuns: sorted.length,
    totalDistanceKm: totalDistKm,
    totalHours,
    avgPacePerKm: formatPace(avgPaceAll),
    avgHeartrate: avgHR,
    totalElevation: totalElev,
    longestRunKm: Math.round((longestRun.distance / 1000) * 10) / 10,
    fastestPacePerKm: formatPace(speedToPace(fastestRun.average_speed)),
    dateRange: {
      start: sorted[0].date,
      end: sorted[sorted.length - 1].date,
    },
  };

  // ---- Weekly Volume ----
  const weekMap = new Map<
    string,
    { distKm: number; count: number; paces: number[]; hrs: number[]; elev: number }
  >();

  for (const r of sorted) {
    const monday = getMonday(r.date);
    if (!weekMap.has(monday)) {
      weekMap.set(monday, { distKm: 0, count: 0, paces: [], hrs: [], elev: 0 });
    }
    const w = weekMap.get(monday)!;
    w.distKm += r.distance / 1000;
    w.count += 1;
    w.paces.push(speedToPace(r.average_speed));
    if (r.average_heartrate) w.hrs.push(r.average_heartrate);
    w.elev += r.total_elevation_gain || 0;
  }

  const weeklyVolume: RunningVolumeWeek[] = [...weekMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, data]) => ({
      weekStart,
      weekLabel: formatWeekLabel(weekStart),
      distanceKm: Math.round(data.distKm * 10) / 10,
      runCount: data.count,
      avgPaceSecsPerKm: Math.round(data.paces.reduce((a, b) => a + b, 0) / data.paces.length),
      avgHeartrate:
        data.hrs.length > 0
          ? Math.round(data.hrs.reduce((a, b) => a + b, 0) / data.hrs.length)
          : null,
      elevationGain: Math.round(data.elev),
    }));

  // ---- Monthly Volume ----
  const monthMap = new Map<string, { distKm: number; count: number; time: number }>();

  for (const r of sorted) {
    const month = getMonthKey(r.date);
    if (!monthMap.has(month)) {
      monthMap.set(month, { distKm: 0, count: 0, time: 0 });
    }
    const m = monthMap.get(month)!;
    m.distKm += r.distance / 1000;
    m.count += 1;
    m.time += r.moving_time;
  }

  const monthlyVolume: RunningMonthVolume[] = [...monthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, data]) => ({
      month,
      monthLabel: formatMonthLabel(month),
      distanceKm: Math.round(data.distKm * 10) / 10,
      runCount: data.count,
      totalHours: Math.round((data.time / 3600) * 10) / 10,
    }));

  // ---- HR Zone Distribution ----
  const zoneCounts = new Map<number, number>();
  for (const z of HR_ZONES) zoneCounts.set(z.zone, 0);

  for (const r of runsWithHR) {
    const zone = getHRZone(r.average_heartrate!);
    zoneCounts.set(zone, (zoneCounts.get(zone) || 0) + 1);
  }

  const hrZoneDistribution: RunningHRZoneDistribution[] = HR_ZONES.map((z) => ({
    ...z,
    runCount: zoneCounts.get(z.zone) || 0,
    percentage:
      runsWithHR.length > 0
        ? Math.round(((zoneCounts.get(z.zone) || 0) / runsWithHR.length) * 1000) / 10
        : 0,
  }));

  // ---- Pace Progression (monthly avg) ----
  const paceByMonth = new Map<string, number[]>();

  for (const r of sorted) {
    const month = getMonthKey(r.date);
    if (!paceByMonth.has(month)) paceByMonth.set(month, []);
    paceByMonth.get(month)!.push(speedToPace(r.average_speed));
  }

  const paceProgression: RunningPaceProgression[] = [...paceByMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, paces]) => {
      const avg = Math.round(paces.reduce((a, b) => a + b, 0) / paces.length);
      return {
        month: formatMonthLabel(month),
        avgPaceSecsPerKm: avg,
        avgPace: formatPace(avg),
      };
    });

  // ---- Run Type Distribution ----
  const typeCounts = new Map<RunType, number>();
  for (const r of runs) {
    typeCounts.set(r.runType, (typeCounts.get(r.runType) || 0) + 1);
  }

  const runTypeDistribution = ([...typeCounts.entries()] as [RunType, number][])
    .map(([type, count]) => ({
      type,
      count,
      percentage: Math.round((count / runs.length) * 1000) / 10,
    }))
    .sort((a, b) => b.count - a.count);

  // ---- Day of Week ----
  const dayOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const dayCounts = new Map<string, { count: number; dist: number }>();
  for (const d of dayOrder) dayCounts.set(d, { count: 0, dist: 0 });

  for (const r of sorted) {
    const day = getDayOfWeek(r.date);
    const d = dayCounts.get(day)!;
    d.count += 1;
    d.dist += r.distance / 1000;
  }

  const dayOfWeekDistribution = dayOrder.map((day) => {
    const d = dayCounts.get(day)!;
    return {
      day,
      count: d.count,
      avgDistanceKm: d.count > 0 ? Math.round((d.dist / d.count) * 10) / 10 : 0,
    };
  });

  // ---- Longest & Fastest Runs (top 10) ----
  const longestRuns = [...runs].sort((a, b) => b.distanceMeters - a.distanceMeters).slice(0, 10);
  const fastestRuns = [...runs]
    .filter((r) => r.distanceMeters >= 3000) // min 3km for meaningful pace
    .sort((a, b) => a.averagePaceSecsPerKm - b.averagePaceSecsPerKm)
    .slice(0, 10);

  return {
    kpis,
    runs,
    weeklyVolume,
    monthlyVolume,
    hrZoneDistribution,
    paceProgression,
    runTypeDistribution,
    dayOfWeekDistribution,
    longestRuns,
    fastestRuns,
  };
}
