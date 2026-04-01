/**
 * ICS (iCalendar) Export
 *
 * Generates iCalendar files (RFC 5545) for importing training plans
 * into Google Calendar, Apple Calendar, Outlook, etc.
 *
 * Each workout becomes an all-day event on its scheduled date.
 */

import type {
  TrainingPlan,
  Workout,
  TrainingDay,
  Sport,
  SpecialEvent,
} from "../../../schema/training-plan.js";
import { formatDuration, getSportIcon } from "../utils.js";

/**
 * Format date as iCalendar DATE value (YYYYMMDD)
 */
function formatIcsDate(dateStr: string): string {
  return dateStr.replace(/-/g, "");
}

/**
 * Escape special characters for iCalendar text fields
 * According to RFC 5545, we need to escape: backslash, semicolon, comma, newline
 */
function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, "\\\\") // Escape backslashes first
    .replace(/;/g, "\\;") // Semicolon
    .replace(/,/g, "\\,") // Comma
    .replace(/\n/g, "\\n"); // Convert real newlines to ICS \n LAST
}

/**
 * Fold long lines according to RFC 5545 (max 75 octets per line)
 */
function foldLine(line: string): string {
  const maxLength = 75;
  if (line.length <= maxLength) {
    return line;
  }

  const result: string[] = [];
  let remaining = line;

  // First line can be full length
  result.push(remaining.substring(0, maxLength));
  remaining = remaining.substring(maxLength);

  // Continuation lines start with space and have length 74 (75 - 1 for space)
  while (remaining.length > 0) {
    result.push(" " + remaining.substring(0, 74));
    remaining = remaining.substring(74);
  }

  return result.join("\r\n");
}

/**
 * Generate a unique identifier for an event
 */
function generateUid(workoutId: string, date: string): string {
  return `${workoutId}-${date}@claude-coach`;
}

/**
 * Generate a VEVENT for a workout
 */
function generateVevent(workout: Workout, day: TrainingDay, planName: string): string {
  const uid = generateUid(workout.id, day.date);
  const dateStr = formatIcsDate(day.date);
  const sportEmoji = getSportIcon(workout.sport as Sport);
  const duration = formatDuration(workout.durationMinutes);

  // Summary: emoji + sport type + workout name
  const summary = escapeIcsText(
    `${sportEmoji} ${workout.sport.charAt(0).toUpperCase() + workout.sport.slice(1)}: ${workout.name}`
  );

  // Description: include all workout details
  // Use real newlines here — escapeIcsText converts them to ICS \n format
  let description = "";
  if (workout.description) {
    description += workout.description + "\n\n";
  }
  if (duration) {
    description += `Duration: ${duration}\n`;
  }
  if (workout.primaryZone) {
    description += `Target Zone: ${workout.primaryZone}\n`;
  }
  if (workout.humanReadable) {
    description += "\nWorkout Structure:\n" + workout.humanReadable;
  }
  description = escapeIcsText(description.trim());

  // Categories for filtering
  const categories = [workout.sport, workout.type, planName].join(",");

  const lines = [
    "BEGIN:VEVENT",
    foldLine(`UID:${uid}`),
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z`,
    `DTSTART;VALUE=DATE:${dateStr}`,
    `DTEND;VALUE=DATE:${dateStr}`, // All-day event
    foldLine(`SUMMARY:${summary}`),
    foldLine(`DESCRIPTION:${description}`),
    foldLine(`CATEGORIES:${escapeIcsText(categories)}`),
    `TRANSP:TRANSPARENT`, // Don't block time (shows as free)
    "END:VEVENT",
  ];

  return lines.join("\r\n");
}

/**
 * Generate a complete iCalendar file for the training plan
 */
export function generateIcs(plan: TrainingPlan): string {
  const now = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const eventName = plan.meta?.event ?? "Training Plan";
  const eventDate = plan.meta?.eventDate ?? "";

  const header = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Claude Coach//Training Plan//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(eventName)} Training`,
    `X-WR-CALDESC:${escapeIcsText(`Training plan for ${eventName} on ${eventDate}`)}`,
  ].join("\r\n");

  const events: string[] = [];

  // Generate events for all workouts
  for (const week of plan.weeks ?? []) {
    for (const day of week.days ?? []) {
      for (const workout of day.workouts ?? []) {
        // Skip rest days without actual workouts
        if (workout.sport === "rest" && !workout.name) {
          continue;
        }
        events.push(generateVevent(workout, day, eventName));
      }
    }
  }

  // Add special events (exams, travel, etc.)
  for (const event of plan.specialEvents ?? []) {
    const eventTypeEmojis: Record<string, string> = {
      exam: "\u{1F4DD}",
      travel: "\u2708\uFE0F",
      social: "\u{1F389}",
      work: "\u{1F4BC}",
      medical: "\u{1FA7A}",
      other: "\u{1F4CC}",
    };
    const emoji = eventTypeEmojis[event.type] || "\u{1F4CC}";
    let eventDesc = event.notes || "";
    if (event.trainingAdjustment) {
      const adj = event.trainingAdjustment;
      eventDesc += "\n\nTraining adjustment:";
      if (adj.noTraining) eventDesc += "\n- No training this day";
      else if (adj.lightWorkoutOk) eventDesc += "\n- Light workout OK (e.g., easy run)";
      if (adj.restBefore) eventDesc += "\n- Rest day scheduled before";
      if (adj.restAfter) eventDesc += "\n- Rest day scheduled after";
    }

    const specialEvent = [
      "BEGIN:VEVENT",
      `UID:${event.id}@claude-coach`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${formatIcsDate(event.date)}`,
      `DTEND;VALUE=DATE:${formatIcsDate(event.endDate || event.date)}`,
      foldLine(`SUMMARY:${emoji} ${escapeIcsText(event.name)}`),
      foldLine(`DESCRIPTION:${escapeIcsText(eventDesc.trim())}`),
      `CATEGORIES:${event.type},special-event`,
      `TRANSP:OPAQUE`,
      "END:VEVENT",
    ].join("\r\n");
    events.push(specialEvent);
  }

  // Add a race day event if we have a date
  if (eventDate) {
    const raceDayEvent = [
      "BEGIN:VEVENT",
      `UID:race-day@claude-coach`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${formatIcsDate(eventDate)}`,
      `DTEND;VALUE=DATE:${formatIcsDate(eventDate)}`,
      foldLine(`SUMMARY:\u{1F3C6} RACE DAY: ${escapeIcsText(eventName)}`),
      foldLine(`DESCRIPTION:${escapeIcsText(`Race day for ${eventName}!`)}`),
      `CATEGORIES:race,${escapeIcsText(eventName)}`,
      `TRANSP:OPAQUE`, // Block time for race day
      "END:VEVENT",
    ].join("\r\n");
    events.push(raceDayEvent);
  }

  const footer = "END:VCALENDAR";

  return header + "\r\n" + events.join("\r\n") + "\r\n" + footer;
}
