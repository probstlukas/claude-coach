<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { Chart, registerables } from "chart.js";
  import type { RunningData, RunActivity } from "../../schema/training-plan.js";

  Chart.register(...registerables);

  interface Props {
    runningData: RunningData;
  }

  let { runningData }: Props = $props();

  let charts: Chart[] = [];

  const zoneColors = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#dc2626"];
  const runTypeColors: Record<string, string> = {
    easy: "#10b981",
    moderate: "#3b82f6",
    tempo: "#f59e0b",
    interval: "#ef4444",
    long: "#8b5cf6",
    race: "#ec4899",
    trail: "#06b6d4",
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

  function fmtPace(secsPerKm: number): string {
    const mins = Math.floor(secsPerKm / 60);
    const secs = Math.round(secsPerKm % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  function fmtDuration(secs: number): string {
    const h = Math.floor(secs / 3600);
    const m = Math.round((secs % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  const chartDefaults = {
    color: "#94a3b8",
    borderColor: "rgba(148, 163, 184, 0.1)",
  };

  // Which table to show
  let activeTable = $state<"longest" | "fastest">("longest");

  onMount(() => {
    // Weekly Mileage
    const weeklyCtx = (
      document.getElementById("run-chart-weekly") as HTMLCanvasElement
    )?.getContext("2d");
    if (weeklyCtx) {
      charts.push(
        new Chart(weeklyCtx, {
          type: "bar",
          data: {
            labels: runningData.weeklyVolume.map((w) => w.weekLabel),
            datasets: [
              {
                label: "Distance (km)",
                data: runningData.weeklyVolume.map((w) => w.distanceKm),
                backgroundColor: "rgba(59, 130, 246, 0.6)",
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
                ticks: { color: chartDefaults.color, maxTicksLimit: 15 },
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

    // Monthly Volume
    const monthlyCtx = (
      document.getElementById("run-chart-monthly") as HTMLCanvasElement
    )?.getContext("2d");
    if (monthlyCtx) {
      charts.push(
        new Chart(monthlyCtx, {
          type: "bar",
          data: {
            labels: runningData.monthlyVolume.map((m) => m.monthLabel),
            datasets: [
              {
                label: "Distance (km)",
                data: runningData.monthlyVolume.map((m) => m.distanceKm),
                backgroundColor: "rgba(139, 92, 246, 0.6)",
                borderRadius: 6,
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
                ticks: { color: chartDefaults.color },
                grid: { color: chartDefaults.borderColor },
              },
            },
          },
        })
      );
    }

    // Pace Progression
    const paceCtx = (document.getElementById("run-chart-pace") as HTMLCanvasElement)?.getContext(
      "2d"
    );
    if (paceCtx) {
      charts.push(
        new Chart(paceCtx, {
          type: "line",
          data: {
            labels: runningData.paceProgression.map((p) => p.month),
            datasets: [
              {
                label: "Avg Pace (sec/km)",
                data: runningData.paceProgression.map((p) => p.avgPaceSecsPerKm),
                borderColor: "#10b981",
                backgroundColor: "rgba(16, 185, 129, 0.1)",
                fill: true,
                tension: 0.3,
                pointRadius: 4,
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
                reverse: true,
                ticks: {
                  color: chartDefaults.color,
                  callback: (v) => fmtPace(Number(v)),
                },
                grid: { color: chartDefaults.borderColor },
              },
            },
          },
        })
      );
    }

    // HR Zone Distribution
    const hrCtx = (document.getElementById("run-chart-hr-zones") as HTMLCanvasElement)?.getContext(
      "2d"
    );
    if (hrCtx) {
      charts.push(
        new Chart(hrCtx, {
          type: "doughnut",
          data: {
            labels: runningData.hrZoneDistribution.map((z) => `Z${z.zone} ${z.name}`),
            datasets: [
              {
                data: runningData.hrZoneDistribution.map((z) => z.runCount),
                backgroundColor: zoneColors,
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

    // Run Type Distribution
    const typeCtx = (document.getElementById("run-chart-type") as HTMLCanvasElement)?.getContext(
      "2d"
    );
    if (typeCtx) {
      charts.push(
        new Chart(typeCtx, {
          type: "doughnut",
          data: {
            labels: runningData.runTypeDistribution.map(
              (t) => t.type.charAt(0).toUpperCase() + t.type.slice(1)
            ),
            datasets: [
              {
                data: runningData.runTypeDistribution.map((t) => t.count),
                backgroundColor: runningData.runTypeDistribution.map(
                  (t) => runTypeColors[t.type] || "#6b7280"
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

    // Day of Week
    const dayCtx = (document.getElementById("run-chart-day") as HTMLCanvasElement)?.getContext(
      "2d"
    );
    if (dayCtx) {
      charts.push(
        new Chart(dayCtx, {
          type: "bar",
          data: {
            labels: runningData.dayOfWeekDistribution.map((d) => d.day.slice(0, 3)),
            datasets: [
              {
                label: "Runs",
                data: runningData.dayOfWeekDistribution.map((d) => d.count),
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

    // Weekly Avg Pace over time
    const weekPaceCtx = (
      document.getElementById("run-chart-weekly-pace") as HTMLCanvasElement
    )?.getContext("2d");
    if (weekPaceCtx) {
      const weeksWithRuns = runningData.weeklyVolume.filter((w) => w.avgPaceSecsPerKm > 0);
      charts.push(
        new Chart(weekPaceCtx, {
          type: "line",
          data: {
            labels: weeksWithRuns.map((w) => w.weekLabel),
            datasets: [
              {
                label: "Avg Pace",
                data: weeksWithRuns.map((w) => w.avgPaceSecsPerKm),
                borderColor: "#f59e0b",
                backgroundColor: "rgba(245, 158, 11, 0.1)",
                fill: true,
                tension: 0.3,
                pointRadius: 3,
              },
              {
                label: "Avg HR",
                data: weeksWithRuns.map((w) => w.avgHeartrate),
                borderColor: "#ef4444",
                backgroundColor: "transparent",
                tension: 0.3,
                pointRadius: 3,
                yAxisID: "y1",
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                labels: { color: chartDefaults.color, usePointStyle: true, pointStyleWidth: 10 },
              },
            },
            scales: {
              x: {
                ticks: { color: chartDefaults.color, maxTicksLimit: 12 },
                grid: { color: chartDefaults.borderColor },
              },
              y: {
                reverse: true,
                ticks: { color: "#f59e0b", callback: (v) => fmtPace(Number(v)) },
                grid: { color: chartDefaults.borderColor },
              },
              y1: {
                position: "right",
                ticks: { color: "#ef4444" },
                grid: { display: false },
              },
            },
          },
        })
      );
    }
  });

  onDestroy(() => {
    charts.forEach((c) => c.destroy());
    charts.length = 0;
  });

  function tableRuns(tab: "longest" | "fastest"): RunActivity[] {
    return tab === "longest" ? runningData.longestRuns : runningData.fastestRuns;
  }
</script>

<div class="running-dashboard">
  <h2 class="section-title">Running Insights</h2>
  <p class="section-subtitle">
    {fmtDate(runningData.kpis.dateRange.start)} — {fmtDate(runningData.kpis.dateRange.end)}
  </p>

  <!-- KPI Cards -->
  <div class="kpi-grid">
    <div class="kpi-card">
      <div class="kpi-value">{fmtNum(runningData.kpis.totalRuns)}</div>
      <div class="kpi-label">Runs</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-value">
        {fmtNum(runningData.kpis.totalDistanceKm)} <span class="kpi-unit">km</span>
      </div>
      <div class="kpi-label">Total Distance</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-value">{runningData.kpis.totalHours}</div>
      <div class="kpi-label">Total Hours</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-value">{runningData.kpis.avgPacePerKm}</div>
      <div class="kpi-label">Avg Pace</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-value">{runningData.kpis.avgHeartrate} <span class="kpi-unit">bpm</span></div>
      <div class="kpi-label">Avg HR</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-value">
        {fmtNum(runningData.kpis.totalElevation)} <span class="kpi-unit">m</span>
      </div>
      <div class="kpi-label">Elevation Gain</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-value">{runningData.kpis.longestRunKm} <span class="kpi-unit">km</span></div>
      <div class="kpi-label">Longest Run</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-value">{runningData.kpis.fastestPacePerKm}</div>
      <div class="kpi-label">Fastest Pace</div>
    </div>
  </div>

  <!-- Weekly Mileage + Monthly Volume -->
  <div class="charts-row">
    <div class="chart-card">
      <h3>Weekly Mileage</h3>
      <div class="chart-container"><canvas id="run-chart-weekly"></canvas></div>
    </div>
    <div class="chart-card">
      <h3>Monthly Volume</h3>
      <div class="chart-container"><canvas id="run-chart-monthly"></canvas></div>
    </div>
  </div>

  <!-- Pace Progression + Weekly Pace & HR -->
  <div class="charts-row">
    <div class="chart-card">
      <h3>Pace Progression (Monthly Avg)</h3>
      <div class="chart-container"><canvas id="run-chart-pace"></canvas></div>
    </div>
    <div class="chart-card">
      <h3>Weekly Pace & Heart Rate</h3>
      <div class="chart-container"><canvas id="run-chart-weekly-pace"></canvas></div>
    </div>
  </div>

  <!-- HR Zones + Run Types -->
  <div class="charts-row">
    <div class="chart-card">
      <h3>Heart Rate Zones</h3>
      <div class="chart-container chart-sm"><canvas id="run-chart-hr-zones"></canvas></div>
      <div class="zone-legend">
        {#each runningData.hrZoneDistribution as z, i}
          <div class="zone-row">
            <span class="zone-dot" style="background: {zoneColors[i]}"></span>
            <span class="zone-name">Z{z.zone}</span>
            <span class="zone-hr">{z.hrLow}-{z.hrHigh} bpm</span>
            <span class="zone-pct">{z.percentage}%</span>
          </div>
        {/each}
      </div>
    </div>
    <div class="chart-card">
      <h3>Run Types</h3>
      <div class="chart-container chart-sm"><canvas id="run-chart-type"></canvas></div>
    </div>
  </div>

  <!-- Day of Week -->
  <div class="charts-row">
    <div class="chart-card">
      <h3>Preferred Running Days</h3>
      <div class="chart-container chart-sm"><canvas id="run-chart-day"></canvas></div>
    </div>
    <div class="chart-card empty-card">
      <h3>Quick Stats</h3>
      <div class="quick-stats">
        <div class="quick-stat">
          <span class="qs-label">Avg run distance</span>
          <span class="qs-value"
            >{Math.round((runningData.kpis.totalDistanceKm / runningData.kpis.totalRuns) * 10) / 10} km</span
          >
        </div>
        <div class="quick-stat">
          <span class="qs-label">Avg run duration</span>
          <span class="qs-value"
            >{Math.round((runningData.kpis.totalHours / runningData.kpis.totalRuns) * 60)} min</span
          >
        </div>
        <div class="quick-stat">
          <span class="qs-label">Avg elevation/run</span>
          <span class="qs-value"
            >{Math.round(runningData.kpis.totalElevation / runningData.kpis.totalRuns)} m</span
          >
        </div>
        <div class="quick-stat">
          <span class="qs-label">Avg runs/week</span>
          <span class="qs-value"
            >{Math.round((runningData.kpis.totalRuns / runningData.weeklyVolume.length) * 10) /
              10}</span
          >
        </div>
      </div>
    </div>
  </div>

  <!-- Top Runs Table -->
  <h2 class="section-title" style="margin-top: 2rem;">Notable Runs</h2>
  <div class="table-tabs">
    <button
      class="table-tab"
      class:active={activeTable === "longest"}
      onclick={() => (activeTable = "longest")}
    >
      Longest
    </button>
    <button
      class="table-tab"
      class:active={activeTable === "fastest"}
      onclick={() => (activeTable = "fastest")}
    >
      Fastest
    </button>
  </div>
  <div class="run-table-wrapper">
    <table class="run-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Name</th>
          <th>Distance</th>
          <th>Pace</th>
          <th>Duration</th>
          <th>HR</th>
          <th>Elev</th>
          <th>Type</th>
        </tr>
      </thead>
      <tbody>
        {#each tableRuns(activeTable) as run}
          <tr>
            <td class="run-date">{fmtDate(run.date)}</td>
            <td>{run.name}</td>
            <td class="run-value">{Math.round((run.distanceMeters / 1000) * 10) / 10} km</td>
            <td class="run-value">{fmtPace(run.averagePaceSecsPerKm)}/km</td>
            <td>{fmtDuration(run.movingTimeSeconds)}</td>
            <td>{run.averageHeartrate ? `${Math.round(run.averageHeartrate)} bpm` : "—"}</td>
            <td>{Math.round(run.elevationGain)} m</td>
            <td>
              <span
                class="type-badge"
                style="background: {runTypeColors[run.runType] || '#6b7280'}"
              >
                {run.runType}
              </span>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<style>
  .running-dashboard {
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

  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
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
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .kpi-unit {
    font-size: 0.85rem;
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

  .chart-container {
    position: relative;
    height: 250px;
  }

  .chart-sm {
    height: 200px;
  }

  .zone-legend {
    margin-top: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .zone-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8rem;
  }

  .zone-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .zone-name {
    font-weight: 600;
    color: var(--text-secondary);
    width: 24px;
  }

  .zone-hr {
    color: var(--text-muted);
    flex: 1;
  }

  .zone-pct {
    font-weight: 600;
    color: var(--text-secondary);
  }

  .quick-stats {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 0.5rem 0;
  }

  .quick-stat {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .qs-label {
    font-size: 0.9rem;
    color: var(--text-muted);
  }

  .qs-value {
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .table-tabs {
    display: flex;
    gap: 0.25rem;
    margin-bottom: 0.75rem;
    background: var(--bg-secondary);
    padding: 0.25rem;
    border-radius: 8px;
    border: 1px solid var(--border-subtle);
    width: fit-content;
  }

  .table-tab {
    padding: 0.4rem 1rem;
    border-radius: 6px;
    border: none;
    background: transparent;
    color: var(--text-muted);
    font: inherit;
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .table-tab.active {
    background: var(--accent);
    color: white;
  }

  .table-tab:not(.active):hover {
    color: var(--text-primary);
    background: var(--bg-tertiary);
  }

  .run-table-wrapper {
    overflow-x: auto;
    border-radius: 12px;
    border: 1px solid var(--border-subtle);
  }

  .run-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
  }

  .run-table thead {
    background: var(--bg-tertiary);
  }

  .run-table th {
    padding: 0.75rem 1rem;
    text-align: left;
    font-weight: 600;
    color: var(--text-muted);
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .run-table td {
    padding: 0.65rem 1rem;
    border-top: 1px solid var(--border-subtle);
    color: var(--text-secondary);
  }

  .run-table tbody tr:hover {
    background: var(--bg-secondary);
  }

  .run-date {
    color: var(--text-muted);
    white-space: nowrap;
  }

  .run-value {
    font-weight: 600;
    color: var(--text-primary);
  }

  .type-badge {
    font-size: 0.7rem;
    font-weight: 600;
    padding: 0.15rem 0.5rem;
    border-radius: 4px;
    color: white;
    text-transform: capitalize;
  }

  @media (max-width: 768px) {
    .charts-row {
      grid-template-columns: 1fr;
    }

    .kpi-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
</style>
