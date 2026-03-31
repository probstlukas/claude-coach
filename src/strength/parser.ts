/**
 * Strong App CSV Parser
 *
 * Parses CSV exports from the Strong workout tracking app.
 * CSV columns: Date, Workout Name, Duration, Exercise Name, Set Order, Weight, Reps, Distance, Seconds, Notes, Workout Notes, RPE
 */

export interface RawSet {
  date: string;
  workoutName: string;
  duration: string;
  exerciseName: string;
  setOrder: string;
  weight: number;
  reps: number;
  distance: number;
  seconds: number;
  notes: string;
  workoutNotes: string;
  rpe: number;
}

export interface ParsedStrengthData {
  sets: RawSet[];
  workoutDates: Map<string, { name: string; duration: string }>;
}

/**
 * Parse a CSV line handling quoted fields (fields may contain commas inside quotes)
 */
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

/**
 * Parse duration string like "1h 23m" or "45m" or "1h" to minutes
 */
export function parseDurationToMinutes(duration: string): number {
  let minutes = 0;
  const hourMatch = duration.match(/(\d+)h/);
  const minMatch = duration.match(/(\d+)m/);
  const secMatch = duration.match(/(\d+)s/);

  if (hourMatch) minutes += parseInt(hourMatch[1]) * 60;
  if (minMatch) minutes += parseInt(minMatch[1]);
  if (secMatch) minutes += parseInt(secMatch[1]) / 60;

  return minutes;
}

/**
 * Parse Strong app CSV content into structured data
 */
export function parseStrongCSV(csvContent: string): ParsedStrengthData {
  const lines = csvContent.split("\n").filter((l) => l.trim().length > 0);

  if (lines.length === 0) {
    throw new Error("CSV file is empty");
  }

  // Skip header row
  const header = lines[0].toLowerCase();
  if (!header.includes("date") || !header.includes("exercise name")) {
    throw new Error("Invalid Strong CSV format: missing expected columns (Date, Exercise Name)");
  }

  const sets: RawSet[] = [];
  const workoutDates = new Map<string, { name: string; duration: string }>();

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i]);
    if (fields.length < 7) continue;

    const setOrder = fields[4];
    // Skip rest timer rows
    if (setOrder === "Rest Timer") continue;

    const date = fields[0];
    const workoutName = fields[1];
    const duration = fields[2];

    const rawSet: RawSet = {
      date,
      workoutName,
      duration,
      exerciseName: fields[3],
      setOrder,
      weight: parseFloat(fields[5]) || 0,
      reps: parseInt(fields[6]) || 0,
      distance: parseFloat(fields[7]) || 0,
      seconds: parseFloat(fields[8]) || 0,
      notes: fields[9] || "",
      workoutNotes: fields[10] || "",
      rpe: parseFloat(fields[11]) || 0,
    };

    sets.push(rawSet);

    // Track unique workouts by date+name
    const key = `${date}||${workoutName}`;
    if (!workoutDates.has(key)) {
      workoutDates.set(key, { name: workoutName, duration });
    }
  }

  return { sets, workoutDates };
}
