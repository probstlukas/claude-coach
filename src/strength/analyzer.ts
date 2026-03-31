/**
 * Strength Training Data Analyzer
 *
 * Takes raw parsed Strong CSV data and computes all insights:
 * KPIs, exercise aggregates, weekly volume, muscle distribution, PRs, plateau detection
 */

import type {
  StrengthData,
  StrengthExercise,
  StrengthExerciseSession,
  StrengthKPIs,
  StrengthMuscleDistribution,
  StrengthSet,
  StrengthTrend,
  StrengthVolumeWeek,
  StrengthWorkoutSession,
  MuscleGroup,
} from "../schema/training-plan.js";
import type { ParsedStrengthData } from "./parser.js";
import { parseDurationToMinutes } from "./parser.js";

// ============================================================================
// Muscle Group Classification
// ============================================================================

const MUSCLE_GROUP_PATTERNS: { group: MuscleGroup; patterns: string[] }[] = [
  {
    group: "Chest",
    patterns: [
      "bench press",
      "chest fly",
      "chest press",
      "incline chest",
      "push up",
      "push-up",
      "dip",
    ],
  },
  {
    group: "Back",
    patterns: [
      "lat pulldown",
      "pull up",
      "pull-up",
      "chin up",
      "chin-up",
      "row",
      "back extension",
      "t bar",
      "t-bar",
      "romanian deadlift",
      "deadlift",
    ],
  },
  {
    group: "Shoulders",
    patterns: [
      "shoulder press",
      "lateral raise",
      "arnold press",
      "overhead press",
      "reverse fly",
      "face pull",
      "front raise",
      "military press",
      "upright row",
    ],
  },
  {
    group: "Biceps",
    patterns: [
      "bicep curl",
      "preacher curl",
      "hammer curl",
      "incline curl",
      "concentration curl",
      "cable curl",
    ],
  },
  {
    group: "Triceps",
    patterns: [
      "triceps extension",
      "triceps pushdown",
      "tricep pushdown",
      "cable kickback",
      "skull crusher",
      "close grip bench",
    ],
  },
  {
    group: "Legs",
    patterns: [
      "squat",
      "leg press",
      "leg extension",
      "leg curl",
      "lunge",
      "hip adductor",
      "hip abductor",
      "calf raise",
      "hack squat",
      "step up",
      "glute",
      "hip thrust",
    ],
  },
  {
    group: "Core",
    patterns: [
      "crunch",
      "plank",
      "hanging leg raise",
      "knee raise",
      "ab ",
      "sit up",
      "sit-up",
      "wood chop",
      "russian twist",
    ],
  },
];

function classifyMuscleGroup(exerciseName: string): MuscleGroup {
  const lower = exerciseName.toLowerCase();
  for (const { group, patterns } of MUSCLE_GROUP_PATTERNS) {
    if (patterns.some((p) => lower.includes(p))) {
      return group;
    }
  }
  // Default fallback based on common exercise words
  if (lower.includes("press")) return "Chest";
  if (lower.includes("curl")) return "Biceps";
  if (lower.includes("raise")) return "Shoulders";
  return "Core"; // fallback
}

// ============================================================================
// Week Helpers
// ============================================================================

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

function getDayOfWeek(dateStr: string): string {
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return days[new Date(dateStr).getDay()];
}

// ============================================================================
// Main Analyzer
// ============================================================================

export function analyzeStrengthData(parsed: ParsedStrengthData): StrengthData {
  const { sets, workoutDates } = parsed;

  if (sets.length === 0) {
    throw new Error("No workout data found in CSV");
  }

  // ---- Build exercise sessions ----
  const exerciseMap = new Map<string, Map<string, { workoutName: string; sets: StrengthSet[] }>>();

  for (const raw of sets) {
    if (!exerciseMap.has(raw.exerciseName)) {
      exerciseMap.set(raw.exerciseName, new Map());
    }
    const dateMap = exerciseMap.get(raw.exerciseName)!;
    if (!dateMap.has(raw.date)) {
      dateMap.set(raw.date, { workoutName: raw.workoutName, sets: [] });
    }

    const isWarmup = raw.setOrder === "W" || raw.setOrder.toLowerCase() === "w";
    const volume = raw.weight * raw.reps;

    dateMap.get(raw.date)!.sets.push({
      setOrder: raw.setOrder,
      weight: raw.weight,
      reps: raw.reps,
      isWarmup,
      volume,
    });
  }

  // ---- Build exercise objects ----
  const exercises: StrengthExercise[] = [];

  for (const [name, dateMap] of exerciseMap) {
    const sessions: StrengthExerciseSession[] = [];
    let totalSets = 0;
    let totalVolume = 0;
    let bestWeight = 0;
    let bestVolume = 0;
    let bestWeightDate = "";
    let bestVolumeDate = "";

    const sortedDates = [...dateMap.keys()].sort();

    for (const date of sortedDates) {
      const { workoutName, sets: sessionSets } = dateMap.get(date)!;
      const workingSets = sessionSets.filter((s) => !s.isWarmup);
      const maxWeight = Math.max(0, ...sessionSets.map((s) => s.weight));
      const sessionVolume = sessionSets.reduce((sum, s) => sum + s.volume, 0);
      const sessionReps = sessionSets.reduce((sum, s) => sum + s.reps, 0);

      sessions.push({
        date,
        workoutName,
        sets: sessionSets,
        maxWeight,
        totalVolume: sessionVolume,
        totalSets: sessionSets.length,
        totalReps: sessionReps,
      });

      totalSets += sessionSets.length;
      totalVolume += sessionVolume;

      if (maxWeight > bestWeight) {
        bestWeight = maxWeight;
        bestWeightDate = date;
      }

      // Best single-set volume
      for (const s of sessionSets) {
        if (s.volume > bestVolume) {
          bestVolume = s.volume;
          bestVolumeDate = date;
        }
      }
    }

    const muscleGroup = classifyMuscleGroup(name);
    const trend = detectTrend(sessions);

    exercises.push({
      name,
      muscleGroup,
      sessions,
      totalSets,
      totalVolume,
      bestWeight,
      bestVolume,
      trend,
      pr: {
        weight: { value: bestWeight, date: bestWeightDate },
        volume: { value: bestVolume, date: bestVolumeDate },
      },
    });
  }

  // Sort exercises by total volume descending
  exercises.sort((a, b) => b.totalVolume - a.totalVolume);

  // ---- Build workout sessions ----
  const workouts: StrengthWorkoutSession[] = [];
  const workoutExercises = new Map<string, Set<string>>();
  const workoutVolumes = new Map<string, number>();
  const workoutSetCounts = new Map<string, number>();

  for (const raw of sets) {
    const key = `${raw.date}||${raw.workoutName}`;
    if (!workoutExercises.has(key)) {
      workoutExercises.set(key, new Set());
      workoutVolumes.set(key, 0);
      workoutSetCounts.set(key, 0);
    }
    workoutExercises.get(key)!.add(raw.exerciseName);
    workoutVolumes.set(key, (workoutVolumes.get(key) || 0) + raw.weight * raw.reps);
    workoutSetCounts.set(key, (workoutSetCounts.get(key) || 0) + 1);
  }

  for (const [key, info] of workoutDates) {
    const [date] = key.split("||");
    workouts.push({
      date,
      name: info.name,
      duration: info.duration,
      durationMinutes: parseDurationToMinutes(info.duration),
      exercises: [...(workoutExercises.get(key) || [])],
      totalVolume: workoutVolumes.get(key) || 0,
      totalSets: workoutSetCounts.get(key) || 0,
    });
  }

  workouts.sort((a, b) => a.date.localeCompare(b.date));

  // ---- KPIs ----
  const totalDurationMinutes = workouts.reduce((sum, w) => sum + w.durationMinutes, 0);
  const allDates = workouts.map((w) => w.date).sort();
  const workingSetsTotal = sets.filter(
    (s) => s.setOrder !== "W" && s.setOrder.toLowerCase() !== "w"
  ).length;

  // Find most trained exercise by working sets
  const exerciseSetCounts = new Map<string, number>();
  for (const s of sets) {
    if (s.setOrder !== "W" && s.setOrder.toLowerCase() !== "w") {
      exerciseSetCounts.set(s.exerciseName, (exerciseSetCounts.get(s.exerciseName) || 0) + 1);
    }
  }
  const mostTrained = [...exerciseSetCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "N/A";

  const kpis: StrengthKPIs = {
    totalWorkouts: workouts.length,
    totalVolume: Math.round(sets.reduce((sum, s) => sum + s.weight * s.reps, 0)),
    totalHours: Math.round((totalDurationMinutes / 60) * 10) / 10,
    avgWorkoutMinutes: Math.round(totalDurationMinutes / workouts.length) || 0,
    totalWorkingSets: workingSetsTotal,
    mostTrainedExercise: mostTrained,
    dateRange: {
      start: allDates[0] || "",
      end: allDates[allDates.length - 1] || "",
    },
  };

  // ---- Weekly Volume ----
  const weekMap = new Map<string, { volume: number; count: number }>();
  for (const w of workouts) {
    const monday = getMonday(w.date);
    if (!weekMap.has(monday)) {
      weekMap.set(monday, { volume: 0, count: 0 });
    }
    const week = weekMap.get(monday)!;
    week.volume += w.totalVolume;
    week.count += 1;
  }

  const weeklyVolume: StrengthVolumeWeek[] = [...weekMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, data]) => ({
      weekStart,
      weekLabel: formatWeekLabel(weekStart),
      totalVolume: Math.round(data.volume),
      workoutCount: data.count,
    }));

  // ---- Muscle Distribution ----
  const muscleSetCounts = new Map<MuscleGroup, number>();
  for (const ex of exercises) {
    const workingSetCount = ex.sessions.reduce(
      (sum, s) => sum + s.sets.filter((set) => !set.isWarmup).length,
      0
    );
    muscleSetCounts.set(
      ex.muscleGroup,
      (muscleSetCounts.get(ex.muscleGroup) || 0) + workingSetCount
    );
  }

  const totalMuscleSets = [...muscleSetCounts.values()].reduce((sum, v) => sum + v, 0);
  const muscleDistribution: StrengthMuscleDistribution[] = [...muscleSetCounts.entries()]
    .map(([muscleGroup, setsCount]) => ({
      muscleGroup,
      sets: setsCount,
      percentage: Math.round((setsCount / totalMuscleSets) * 1000) / 10,
    }))
    .sort((a, b) => b.sets - a.sets);

  // ---- Day of Week Distribution ----
  const dayCounts = new Map<string, number>();
  const dayOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  for (const day of dayOrder) dayCounts.set(day, 0);

  for (const w of workouts) {
    const day = getDayOfWeek(w.date);
    dayCounts.set(day, (dayCounts.get(day) || 0) + 1);
  }

  const dayOfWeekDistribution = dayOrder.map((day) => ({ day, count: dayCounts.get(day) || 0 }));

  // ---- Recent PRs ----
  const allPRs: { exercise: string; type: "weight" | "volume"; value: number; date: string }[] = [];

  for (const ex of exercises) {
    if (ex.pr) {
      if (ex.pr.weight.value > 0) {
        allPRs.push({
          exercise: ex.name,
          type: "weight",
          value: ex.pr.weight.value,
          date: ex.pr.weight.date,
        });
      }
      if (ex.pr.volume.value > 0) {
        allPRs.push({
          exercise: ex.name,
          type: "volume",
          value: ex.pr.volume.value,
          date: ex.pr.volume.date,
        });
      }
    }
  }

  allPRs.sort((a, b) => b.date.localeCompare(a.date));
  const recentPRs = allPRs.slice(0, 30);

  return {
    kpis,
    exercises,
    workouts,
    weeklyVolume,
    muscleDistribution,
    dayOfWeekDistribution,
    recentPRs,
  };
}

// ============================================================================
// Trend / Plateau Detection
// ============================================================================

function detectTrend(sessions: StrengthExerciseSession[]): StrengthTrend {
  if (sessions.length < 6) return "insufficient_data";

  // Check if last session was more than 60 days ago
  const lastDate = new Date(sessions[sessions.length - 1].date);
  const now = new Date();
  const daysSinceLast = (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceLast > 60) return "inactive";

  // Compare last 3 sessions' max weight to previous 3
  const recent3 = sessions.slice(-3);
  const previous3 = sessions.slice(-6, -3);

  const recentAvg = recent3.reduce((sum, s) => sum + s.maxWeight, 0) / 3;
  const previousAvg = previous3.reduce((sum, s) => sum + s.maxWeight, 0) / 3;

  const diff = recentAvg - previousAvg;

  if (Math.abs(diff) <= 1) return "plateau";
  if (diff > 2) return "gaining";
  if (diff < -2) return "declining";
  return "plateau";
}
