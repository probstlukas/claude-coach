<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { Chart, registerables } from "chart.js";
  import type { StrengthData } from "../../schema/training-plan.js";

  Chart.register(...registerables);

  interface Props {
    strengthData: StrengthData;
  }

  let { strengthData }: Props = $props();

  // Track chart instances for cleanup
  let charts: Chart[] = [];

  // Exercise detail expansion state
  let expandedExercise = $state<string | null>(null);
  let exerciseCharts: Chart[] = [];

  function destroyCharts(list: Chart[]) {
    list.forEach((c) => c.destroy());
    list.length = 0;
  }

  const muscleColors: Record<string, string> = {
    Chest: "#3b82f6",
    Back: "#8b5cf6",
    Shoulders: "#f59e0b",
    Biceps: "#10b981",
    Triceps: "#ef4444",
    Legs: "#06b6d4",
    Core: "#f97316",
  };

  const trendLabels: Record<string, { text: string; color: string }> = {
    gaining: { text: "↑ Gaining", color: "#10b981" },
    plateau: { text: "→ Plateau", color: "#f59e0b" },
    declining: { text: "↓ Declining", color: "#ef4444" },
    inactive: { text: "⏸ Inactive", color: "#6b7280" },
    insufficient_data: { text: "— New", color: "#6b7280" },
  };

  function fmtNum(n: number): string {
    return n.toLocaleString("en-US");
  }

  function fmtDate(d: string): string {
    return new Date(d).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  const chartDefaults = {
    color: "#94a3b8",
    borderColor: "rgba(148, 163, 184, 0.1)",
    font: { family: "'Outfit', 'Inter', system-ui, sans-serif" },
  };

  function toggleExercise(name: string) {
    if (expandedExercise === name) {
      expandedExercise = null;
      destroyCharts(exerciseCharts);
    } else {
      expandedExercise = name;
      destroyCharts(exerciseCharts);
      // Wait for DOM to render the canvas elements
      requestAnimationFrame(() => renderExerciseCharts(name));
    }
  }

  function renderExerciseCharts(exerciseName: string) {
    const ex = strengthData.exercises.find((e) => e.name === exerciseName);
    if (!ex) return;

    const labels = ex.sessions.map((s) => fmtDate(s.date));
    const weightData = ex.sessions.map((s) => s.maxWeight);
    const volumeData = ex.sessions.map((s) => s.totalVolume);

    // Max weight chart
    const weightCanvas = document.getElementById(
      `chart-weight-${CSS.escape(exerciseName)}`
    ) as HTMLCanvasElement | null;
    if (weightCanvas) {
      const ctx = weightCanvas.getContext("2d");
      if (ctx) {
        exerciseCharts.push(
          new Chart(ctx, {
            type: "line",
            data: {
              labels,
              datasets: [
                {
                  label: "Max Weight (kg)",
                  data: weightData,
                  borderColor: "#3b82f6",
                  backgroundColor: "rgba(59, 130, 246, 0.1)",
                  fill: true,
                  tension: 0.3,
                  pointRadius: 3,
                },
              ],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: {
                x: {
                  ticks: { color: chartDefaults.color, maxTicksLimit: 8 },
                  grid: { color: chartDefaults.borderColor },
                },
                y: {
                  ticks: { color: chartDefaults.color },
                  grid: { color: chartDefaults.borderColor },
                },
              },
            },
          })
        );
      }
    }

    // Volume chart
    const volCanvas = document.getElementById(
      `chart-volume-${CSS.escape(exerciseName)}`
    ) as HTMLCanvasElement | null;
    if (volCanvas) {
      const ctx = volCanvas.getContext("2d");
      if (ctx) {
        exerciseCharts.push(
          new Chart(ctx, {
            type: "bar",
            data: {
              labels,
              datasets: [
                {
                  label: "Session Volume (kg)",
                  data: volumeData,
                  backgroundColor: "rgba(139, 92, 246, 0.6)",
                  borderRadius: 4,
                },
              ],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: {
                x: {
                  ticks: { color: chartDefaults.color, maxTicksLimit: 8 },
                  grid: { color: chartDefaults.borderColor },
                },
                y: {
                  ticks: { color: chartDefaults.color },
                  grid: { color: chartDefaults.borderColor },
                },
              },
            },
          })
        );
      }
    }
  }

  onMount(() => {
    // Weekly Volume chart
    const weeklyCtx = (
      document.getElementById("chart-weekly-volume") as HTMLCanvasElement
    )?.getContext("2d");
    if (weeklyCtx) {
      charts.push(
        new Chart(weeklyCtx, {
          type: "line",
          data: {
            labels: strengthData.weeklyVolume.map((w) => w.weekLabel),
            datasets: [
              {
                label: "Volume (kg)",
                data: strengthData.weeklyVolume.map((w) => w.totalVolume),
                borderColor: "#3b82f6",
                backgroundColor: "rgba(59, 130, 246, 0.15)",
                fill: true,
                tension: 0.3,
                pointRadius: 2,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: {
                ticks: { color: chartDefaults.color, maxTicksLimit: 12 },
                grid: { color: chartDefaults.borderColor },
              },
              y: {
                ticks: { color: chartDefaults.color, callback: (v) => `${Number(v) / 1000}k` },
                grid: { color: chartDefaults.borderColor },
              },
            },
          },
        })
      );
    }

    // Workout Frequency chart
    const freqCtx = (
      document.getElementById("chart-workout-freq") as HTMLCanvasElement
    )?.getContext("2d");
    if (freqCtx) {
      charts.push(
        new Chart(freqCtx, {
          type: "bar",
          data: {
            labels: strengthData.weeklyVolume.map((w) => w.weekLabel),
            datasets: [
              {
                label: "Workouts",
                data: strengthData.weeklyVolume.map((w) => w.workoutCount),
                backgroundColor: "rgba(16, 185, 129, 0.6)",
                borderRadius: 4,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: {
                ticks: { color: chartDefaults.color, maxTicksLimit: 12 },
                grid: { color: chartDefaults.borderColor },
              },
              y: {
                ticks: { color: chartDefaults.color, stepSize: 1 },
                grid: { color: chartDefaults.borderColor },
              },
            },
          },
        })
      );
    }

    // Day of Week chart
    const dayCtx = (document.getElementById("chart-day-of-week") as HTMLCanvasElement)?.getContext(
      "2d"
    );
    if (dayCtx) {
      charts.push(
        new Chart(dayCtx, {
          type: "bar",
          data: {
            labels: strengthData.dayOfWeekDistribution.map((d) => d.day.slice(0, 3)),
            datasets: [
              {
                label: "Workouts",
                data: strengthData.dayOfWeekDistribution.map((d) => d.count),
                backgroundColor: "rgba(249, 115, 22, 0.6)",
                borderRadius: 4,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: {
                ticks: { color: chartDefaults.color },
                grid: { color: chartDefaults.borderColor },
              },
              y: {
                ticks: { color: chartDefaults.color, stepSize: 1 },
                grid: { color: chartDefaults.borderColor },
              },
            },
          },
        })
      );
    }

    // Muscle Distribution doughnut
    const muscleCtx = (
      document.getElementById("chart-muscle-dist") as HTMLCanvasElement
    )?.getContext("2d");
    if (muscleCtx) {
      charts.push(
        new Chart(muscleCtx, {
          type: "doughnut",
          data: {
            labels: strengthData.muscleDistribution.map((m) => m.muscleGroup),
            datasets: [
              {
                data: strengthData.muscleDistribution.map((m) => m.sets),
                backgroundColor: strengthData.muscleDistribution.map(
                  (m) => muscleColors[m.muscleGroup] || "#6b7280"
                ),
                borderWidth: 0,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: "right",
                labels: {
                  color: chartDefaults.color,
                  padding: 12,
                  usePointStyle: true,
                  pointStyleWidth: 10,
                  font: { size: 12 },
                },
              },
            },
          },
        })
      );
    }

    // Top Exercises horizontal bar
    const topEx = strengthData.exercises.slice(0, 15);
    const topCtx = (
      document.getElementById("chart-top-exercises") as HTMLCanvasElement
    )?.getContext("2d");
    if (topCtx) {
      charts.push(
        new Chart(topCtx, {
          type: "bar",
          data: {
            labels: topEx.map((e) => (e.name.length > 25 ? e.name.slice(0, 25) + "…" : e.name)),
            datasets: [
              {
                label: "Total Volume (kg)",
                data: topEx.map((e) => e.totalVolume),
                backgroundColor: topEx.map((e) => muscleColors[e.muscleGroup] || "#6b7280"),
                borderRadius: 4,
              },
            ],
          },
          options: {
            indexAxis: "y",
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: {
                ticks: { color: chartDefaults.color, callback: (v) => `${Number(v) / 1000}k` },
                grid: { color: chartDefaults.borderColor },
              },
              y: {
                ticks: { color: chartDefaults.color, font: { size: 11 } },
                grid: { display: false },
              },
            },
          },
        })
      );
    }
  });

  onDestroy(() => {
    destroyCharts(charts);
    destroyCharts(exerciseCharts);
  });

  // Top 10 exercises for detail section
  const topExercises = $derived(strengthData.exercises.slice(0, 10));

  // Exercises with plateau/declining trends
  const flaggedExercises = $derived(
    strengthData.exercises.filter((e) => e.trend === "plateau" || e.trend === "declining")
  );
</script>

<div class="strength-dashboard">
  <h2 class="section-title">Strength Insights</h2>
  <p class="section-subtitle">
    {fmtDate(strengthData.kpis.dateRange.start)} — {fmtDate(strengthData.kpis.dateRange.end)}
  </p>

  <!-- KPI Cards -->
  <div class="kpi-grid">
    <div class="kpi-card">
      <div class="kpi-value">{fmtNum(strengthData.kpis.totalWorkouts)}</div>
      <div class="kpi-label">Workouts</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-value">
        {fmtNum(strengthData.kpis.totalVolume)} <span class="kpi-unit">kg</span>
      </div>
      <div class="kpi-label">Total Volume</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-value">{strengthData.kpis.totalHours}</div>
      <div class="kpi-label">Total Hours</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-value">
        {strengthData.kpis.avgWorkoutMinutes} <span class="kpi-unit">min</span>
      </div>
      <div class="kpi-label">Avg Duration</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-value">{fmtNum(strengthData.kpis.totalWorkingSets)}</div>
      <div class="kpi-label">Working Sets</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-value kpi-value-small">{strengthData.kpis.mostTrainedExercise}</div>
      <div class="kpi-label">Most Trained</div>
    </div>
  </div>

  <!-- Charts Row 1: Volume + Frequency -->
  <div class="charts-row">
    <div class="chart-card">
      <h3>Weekly Volume</h3>
      <div class="chart-container"><canvas id="chart-weekly-volume"></canvas></div>
    </div>
    <div class="chart-card">
      <h3>Workout Frequency</h3>
      <div class="chart-container"><canvas id="chart-workout-freq"></canvas></div>
    </div>
  </div>

  <!-- Charts Row 2: Day of Week + Muscle Distribution -->
  <div class="charts-row">
    <div class="chart-card">
      <h3>Training Days</h3>
      <div class="chart-container chart-sm"><canvas id="chart-day-of-week"></canvas></div>
    </div>
    <div class="chart-card">
      <h3>Muscle Distribution</h3>
      <div class="chart-container chart-sm"><canvas id="chart-muscle-dist"></canvas></div>
    </div>
  </div>

  <!-- Top Exercises -->
  <div class="chart-card chart-card-full">
    <h3>Top 15 Exercises by Volume</h3>
    <div class="chart-container chart-tall"><canvas id="chart-top-exercises"></canvas></div>
  </div>

  <!-- Exercise Progress -->
  <h2 class="section-title" style="margin-top: 2rem;">Exercise Progress</h2>
  <div class="exercise-list">
    {#each topExercises as ex}
      <div class="exercise-card" class:expanded={expandedExercise === ex.name}>
        <button class="exercise-header" onclick={() => toggleExercise(ex.name)}>
          <div class="exercise-info">
            <span
              class="muscle-badge"
              style="background: {muscleColors[ex.muscleGroup] || '#6b7280'}">{ex.muscleGroup}</span
            >
            <span class="exercise-name">{ex.name}</span>
          </div>
          <div class="exercise-stats">
            <span class="trend-badge" style="color: {trendLabels[ex.trend]?.color || '#6b7280'}"
              >{trendLabels[ex.trend]?.text || ex.trend}</span
            >
            <span class="stat">Best: {ex.bestWeight}kg</span>
            <span class="stat">{ex.sessions.length} sessions</span>
            <span class="expand-icon">{expandedExercise === ex.name ? "▾" : "▸"}</span>
          </div>
        </button>
        {#if expandedExercise === ex.name}
          <div class="exercise-detail">
            <div class="detail-stats">
              <div><strong>Total Sets:</strong> {fmtNum(ex.totalSets)}</div>
              <div><strong>Total Volume:</strong> {fmtNum(Math.round(ex.totalVolume))} kg</div>
              <div>
                <strong>Best Weight:</strong>
                {ex.bestWeight} kg ({ex.pr?.weight.date ? fmtDate(ex.pr.weight.date) : "N/A"})
              </div>
              <div>
                <strong>Best Set Volume:</strong>
                {fmtNum(Math.round(ex.bestVolume))} kg ({ex.pr?.volume.date
                  ? fmtDate(ex.pr.volume.date)
                  : "N/A"})
              </div>
            </div>
            <div class="detail-charts">
              <div class="detail-chart">
                <h4>Max Weight Over Time</h4>
                <div class="chart-container chart-sm">
                  <canvas id="chart-weight-{ex.name}"></canvas>
                </div>
              </div>
              <div class="detail-chart">
                <h4>Volume Per Session</h4>
                <div class="chart-container chart-sm">
                  <canvas id="chart-volume-{ex.name}"></canvas>
                </div>
              </div>
            </div>
          </div>
        {/if}
      </div>
    {/each}
  </div>

  <!-- Plateau / Declining Alerts -->
  {#if flaggedExercises.length > 0}
    <h2 class="section-title" style="margin-top: 2rem;">Plateau & Decline Alerts</h2>
    <div class="alerts-grid">
      {#each flaggedExercises as ex}
        <div class="alert-card" class:declining={ex.trend === "declining"}>
          <div class="alert-header">
            <span
              class="muscle-badge"
              style="background: {muscleColors[ex.muscleGroup] || '#6b7280'}">{ex.muscleGroup}</span
            >
            <span class="trend-badge" style="color: {trendLabels[ex.trend]?.color}"
              >{trendLabels[ex.trend]?.text}</span
            >
          </div>
          <div class="alert-name">{ex.name}</div>
          <div class="alert-detail">Best: {ex.bestWeight}kg · {ex.sessions.length} sessions</div>
        </div>
      {/each}
    </div>
  {/if}

  <!-- Recent PRs -->
  {#if strengthData.recentPRs.length > 0}
    <h2 class="section-title" style="margin-top: 2rem;">Recent PRs</h2>
    <div class="pr-table-wrapper">
      <table class="pr-table">
        <thead>
          <tr>
            <th>Exercise</th>
            <th>Type</th>
            <th>Value</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {#each strengthData.recentPRs.slice(0, 20) as pr}
            <tr>
              <td>{pr.exercise}</td>
              <td>
                <span
                  class="pr-type-badge"
                  class:weight={pr.type === "weight"}
                  class:volume={pr.type === "volume"}
                >
                  {pr.type === "weight" ? "Weight" : "Volume"}
                </span>
              </td>
              <td class="pr-value"
                >{fmtNum(Math.round(pr.value))} {pr.type === "weight" ? "kg" : "kg"}</td
              >
              <td class="pr-date">{fmtDate(pr.date)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<style>
  .strength-dashboard {
    max-width: 1200px;
    margin: 0 auto;
  }

  .section-title {
    font-size: 1.4rem;
    font-weight: 700;
    color: var(--text-primary);
    margin-bottom: 0.25rem;
  }

  .section-subtitle {
    color: var(--text-muted);
    font-size: 0.9rem;
    margin-bottom: 1.5rem;
  }

  /* KPI Cards */
  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 1rem;
    margin-bottom: 2rem;
  }

  .kpi-card {
    background: var(--bg-secondary);
    border: 1px solid var(--border-subtle);
    border-radius: 12px;
    padding: 1.25rem;
    text-align: center;
  }

  .kpi-value {
    font-size: 1.6rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .kpi-value-small {
    font-size: 1rem;
  }

  .kpi-unit {
    font-size: 0.9rem;
    font-weight: 400;
    color: var(--text-muted);
  }

  .kpi-label {
    font-size: 0.8rem;
    color: var(--text-muted);
    margin-top: 0.25rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  /* Charts */
  .charts-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .chart-card {
    background: var(--bg-secondary);
    border: 1px solid var(--border-subtle);
    border-radius: 12px;
    padding: 1.25rem;
  }

  .chart-card h3 {
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--text-secondary);
    margin-bottom: 0.75rem;
  }

  .chart-card-full {
    margin-bottom: 1rem;
  }

  .chart-container {
    position: relative;
    height: 250px;
  }

  .chart-sm {
    height: 200px;
  }

  .chart-tall {
    height: 400px;
  }

  /* Exercise Progress */
  .exercise-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .exercise-card {
    background: var(--bg-secondary);
    border: 1px solid var(--border-subtle);
    border-radius: 12px;
    overflow: hidden;
    transition: border-color 0.2s;
  }

  .exercise-card:hover {
    border-color: var(--border-medium);
  }

  .exercise-card.expanded {
    border-color: var(--accent);
  }

  .exercise-header {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1.25rem;
    background: transparent;
    border: none;
    color: var(--text-primary);
    cursor: pointer;
    font: inherit;
    text-align: left;
  }

  .exercise-info {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .muscle-badge {
    font-size: 0.7rem;
    font-weight: 600;
    padding: 0.2rem 0.5rem;
    border-radius: 6px;
    color: white;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .exercise-name {
    font-weight: 600;
  }

  .exercise-stats {
    display: flex;
    align-items: center;
    gap: 1rem;
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  .trend-badge {
    font-weight: 600;
    font-size: 0.85rem;
  }

  .stat {
    color: var(--text-muted);
  }

  .expand-icon {
    color: var(--text-muted);
    font-size: 0.8rem;
  }

  .exercise-detail {
    padding: 0 1.25rem 1.25rem;
    border-top: 1px solid var(--border-subtle);
  }

  .detail-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 0.5rem;
    padding: 1rem 0;
    font-size: 0.9rem;
    color: var(--text-secondary);
  }

  .detail-charts {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  .detail-chart h4 {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-muted);
    margin-bottom: 0.5rem;
  }

  /* Alerts */
  .alerts-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 0.75rem;
  }

  .alert-card {
    background: var(--bg-secondary);
    border: 1px solid var(--border-subtle);
    border-left: 3px solid #f59e0b;
    border-radius: 8px;
    padding: 1rem;
  }

  .alert-card.declining {
    border-left-color: #ef4444;
  }

  .alert-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .alert-name {
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 0.25rem;
  }

  .alert-detail {
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  /* PR Table */
  .pr-table-wrapper {
    overflow-x: auto;
    border-radius: 12px;
    border: 1px solid var(--border-subtle);
  }

  .pr-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
  }

  .pr-table thead {
    background: var(--bg-tertiary);
  }

  .pr-table th {
    padding: 0.75rem 1rem;
    text-align: left;
    font-weight: 600;
    color: var(--text-muted);
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .pr-table td {
    padding: 0.65rem 1rem;
    border-top: 1px solid var(--border-subtle);
    color: var(--text-secondary);
  }

  .pr-table tbody tr:hover {
    background: var(--bg-secondary);
  }

  .pr-type-badge {
    font-size: 0.75rem;
    padding: 0.15rem 0.5rem;
    border-radius: 4px;
    font-weight: 600;
  }

  .pr-type-badge.weight {
    background: rgba(59, 130, 246, 0.15);
    color: #3b82f6;
  }

  .pr-type-badge.volume {
    background: rgba(139, 92, 246, 0.15);
    color: #8b5cf6;
  }

  .pr-value {
    font-weight: 600;
    color: var(--text-primary);
  }

  .pr-date {
    color: var(--text-muted);
  }

  /* Responsive */
  @media (max-width: 768px) {
    .charts-row {
      grid-template-columns: 1fr;
    }

    .detail-charts {
      grid-template-columns: 1fr;
    }

    .exercise-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.5rem;
    }

    .exercise-stats {
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .kpi-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
</style>
