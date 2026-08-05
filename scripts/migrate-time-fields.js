// One-time migration: replaces the old free-text `time` field on every
// existing src/_events/*.md file with structured start_time/end_time
// (24-hour HH:MM) plus an optional time_note for anything a plain range
// can't capture. Safe to re-run — files without a `time` field are skipped.
//
// Usage: node scripts/migrate-time-fields.js
//
// Doesn't touch git — review with `git status` / `git diff` before committing.

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

// Canonical field order (matches src/admin/config.yml), with the old
// "time" field replaced by start_time/end_time/time_note in the same slot.
const FIELD_ORDER = [
  "title", "town", "category", "subtag", "audience",
  "start_date", "end_date", "recurrence_rule",
  "start_time", "end_time", "time_note",
  "location", "address", "description", "link", "image",
  "source_name", "source_contact", "status", "featured",
];

const MERIDIEM_RE = /\b(AM|PM|am|pm)\b/;

function to24Hour(hour, minute, meridiem) {
  let h = parseInt(hour, 10);
  const m = minute ? parseInt(minute, 10) : 0;
  const mer = meridiem.toUpperCase();
  if (mer === "AM") {
    if (h === 12) h = 0;
  } else {
    if (h !== 12) h += 12;
  }
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Returns { start_time, end_time, time_note } or null if totally unparseable.
function parseTime(raw) {
  const text = raw.trim();

  if (/^all day$/i.test(text)) {
    return { start_time: null, end_time: null, time_note: "All Day" };
  }

  // Full range: "4:00-10:00 PM", "10:15 AM - 1:15 PM (drop-in slots)"
  const rangeMatch = text.match(
    /^(\d{1,2})(?::(\d{2}))?\s*(AM|PM|am|pm)?\s*[-–—]\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM|am|pm)\s*(.*)$/
  );
  if (rangeMatch) {
    const [, h1, m1, mer1, h2, m2, mer2, trailing] = rangeMatch;
    const endMeridiem = mer2;
    const startMeridiem = mer1 || mer2; // "4:00-10:00 PM" -> 4:00 inherits PM
    const start_time = to24Hour(h1, m1, startMeridiem);
    const end_time = to24Hour(h2, m2, endMeridiem);
    const time_note = trailing.trim() || null;
    return { start_time, end_time, time_note };
  }

  // Single time only, e.g. "7:00 am", or messy text with one time in it
  // like "Doors 7:00 PM / Music 7:30 PM" — keep the original as a note
  // since a single start_time can't capture the nuance.
  const singleMatch = text.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM|am|pm)/);
  if (singleMatch) {
    const [fullMatch, h, m, mer] = singleMatch;
    const start_time = to24Hour(h, m, mer);
    const isCleanSingleTime = text === fullMatch.trim();
    return { start_time, end_time: null, time_note: isCleanSingleTime ? null : text };
  }

  return null;
}

function toISODateIfDate(value) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

function parseFrontMatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return null;
  const doc = yaml.load(match[1]);
  if (!doc || typeof doc !== "object") return null;
  // Front matter dates (e.g. "start_date: 2026-08-04") get auto-parsed into
  // JS Date objects by YAML — normalize back to plain YYYY-MM-DD strings.
  doc.start_date = toISODateIfDate(doc.start_date);
  doc.end_date = toISODateIfDate(doc.end_date);
  return doc;
}

function buildFrontMatter(doc) {
  return (
    FIELD_ORDER.filter((key) => key in doc)
      .map((key) => `${key}: ${JSON.stringify(doc[key])}`)
      .join("\n") + "\n"
  );
}

function main() {
  const eventsDir = path.join(__dirname, "..", "src", "_events");
  const files = fs.readdirSync(eventsDir).filter((f) => f.endsWith(".md"));

  let migrated = 0;
  let skipped = 0;
  const needsReview = [];

  for (const file of files) {
    const filePath = path.join(eventsDir, file);
    const content = fs.readFileSync(filePath, "utf8");
    const doc = parseFrontMatter(content);
    if (!doc) {
      console.log(`? ${file}: couldn't parse front matter, skipped`);
      skipped++;
      continue;
    }

    if (!("time" in doc)) {
      skipped++; // already migrated or never had a time field
      continue;
    }

    const rawTime = doc.time;
    const parsed = parseTime(String(rawTime));
    delete doc.time;

    if (!parsed) {
      console.log(`⚠ ${file}: couldn't parse time "${rawTime}" — needs manual fix`);
      needsReview.push(file);
      doc.start_time = null;
      doc.end_time = null;
      doc.time_note = String(rawTime);
    } else {
      doc.start_time = parsed.start_time;
      doc.end_time = parsed.end_time;
      doc.time_note = parsed.time_note;
      console.log(
        `✓ ${file}: "${rawTime}" -> start=${parsed.start_time} end=${parsed.end_time} note=${JSON.stringify(parsed.time_note)}`
      );
    }

    fs.writeFileSync(filePath, `---\n${buildFrontMatter(doc)}---\n`, "utf8");
    migrated++;
  }

  console.log(`\n${migrated} file(s) migrated, ${skipped} skipped (no time field).`);
  if (needsReview.length) {
    console.log(`\n${needsReview.length} file(s) need manual review (time couldn't be parsed):`);
    needsReview.forEach((f) => console.log(`  - ${f}`));
  }
}

main();
