// Bulk-imports events from a CSV export of the "Bulk Event Import" Google
// Sheet template into src/_events/*.md files.
//
// Usage: node scripts/import-events.js path/to/exported.csv
//
// Doesn't touch git — review the new files with `git status` / `git diff`
// and commit/push them yourself once they look right.

const fs = require("fs");
const path = require("path");
const { parse } = require("csv-parse/sync");

const TOWNS = require("../src/_data/towns.json").map((t) => t.name);
const CATEGORIES = require("../src/_data/categories.json").map((c) => c.name);
const AUDIENCES = ["Family/Kids", "All Ages", "21+"];
const STATUSES = ["pending", "approved", "rejected"];

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

function isValidDate(str) {
  return /^\d{4}-\d{2}-\d{2}$/.test(str);
}

function isValidTime(str) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(str);
}

function parseBoolean(value) {
  return /^(true|yes|1|x)$/i.test((value || "").trim());
}

// Every value round-trips through JSON.stringify, same trick used by the
// submit-event Worker — valid YAML for strings/numbers/booleans/null/objects,
// sidesteps hand-rolling YAML escaping for free-text fields.
function buildFrontMatter(fields) {
  return (
    Object.entries(fields)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join("\n") + "\n"
  );
}

function importRow(row, index) {
  const title = (row.title || "").trim();
  const town = (row.town || "").trim();
  const category = (row.category || "").trim();
  const audience = (row.audience || "").trim();
  const start_date = (row.start_date || "").trim();
  const end_date = (row.end_date || "").trim();
  const start_time = (row.start_time || "").trim();
  const end_time = (row.end_time || "").trim();
  const time_note = (row.time_note || "").trim();
  const location = (row.location || "").trim();
  const description = (row.description || "").trim();
  const status = ((row.status || "").trim() || "approved").toLowerCase();

  const errors = [];
  if (!title) errors.push("missing title");
  if (!TOWNS.includes(town)) errors.push(`invalid town "${town}" (expected one of ${TOWNS.join(", ")})`);
  if (!CATEGORIES.includes(category)) errors.push(`invalid category "${category}" (expected one of ${CATEGORIES.join(", ")})`);
  if (!AUDIENCES.includes(audience)) errors.push(`invalid audience "${audience}" (expected one of ${AUDIENCES.join(", ")})`);
  if (!isValidDate(start_date)) errors.push(`invalid start_date "${start_date}" (expected YYYY-MM-DD)`);
  if (end_date && !isValidDate(end_date)) errors.push(`invalid end_date "${end_date}" (expected YYYY-MM-DD)`);
  if (!isValidTime(start_time)) errors.push(`invalid start_time "${start_time}" (expected 24-hour HH:MM, e.g. 19:00)`);
  if (end_time && !isValidTime(end_time)) errors.push(`invalid end_time "${end_time}" (expected 24-hour HH:MM, e.g. 22:00)`);
  if (!location) errors.push("missing location");
  if (!description) errors.push("missing description");
  if (!STATUSES.includes(status)) errors.push(`invalid status "${status}"`);

  if (errors.length) {
    return { ok: false, title: title || `row ${index + 2}`, errors };
  }

  const frequency = (row.recurrence_frequency || "").trim();
  const recurrence_rule = frequency
    ? {
        frequency,
        season_start: (row.season_start || "").trim() || null,
        season_end: (row.season_end || "").trim() || null,
      }
    : null;

  const slug = slugify(title);
  const shortId = Math.random().toString(36).slice(2, 10);
  const filename = `${start_date}-${slug}-${shortId}.md`;

  const frontMatter = buildFrontMatter({
    title,
    town,
    category,
    subtag: (row.subtag || "").trim() || null,
    audience,
    start_date,
    end_date: end_date || null,
    recurrence_rule,
    start_time,
    end_time: end_time || null,
    time_note: time_note || null,
    location,
    address: (row.address || "").trim() || null,
    description,
    link: (row.link || "").trim() || null,
    image: (row.image || "").trim() || null,
    source_name: (row.source_name || "").trim() || null,
    source_contact: (row.source_contact || "").trim() || null,
    status,
    featured: parseBoolean(row.featured),
  });

  return { ok: true, title, filename, content: `---\n${frontMatter}---\n` };
}

function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error("Usage: node scripts/import-events.js <path-to-csv>");
    process.exit(1);
  }

  const raw = fs.readFileSync(csvPath, "utf8");
  let rows;
  try {
    rows = parse(raw, { columns: true, skip_empty_lines: true, trim: true });
  } catch (err) {
    console.error(`Couldn't parse the CSV: ${err.message}`);
    console.error(
      "This usually means a text field (like description) contains a comma but isn't wrapped in double quotes. " +
        "Find the line mentioned above and wrap that field's value in \"...\"."
    );
    process.exit(1);
  }

  const eventsDir = path.join(__dirname, "..", "src", "_events");
  let imported = 0;
  const failures = [];

  rows.forEach((row, index) => {
    const result = importRow(row, index);
    if (!result.ok) {
      failures.push(result);
      return;
    }
    fs.writeFileSync(path.join(eventsDir, result.filename), result.content, "utf8");
    imported++;
    console.log(`✓ ${result.title} -> src/_events/${result.filename}`);
  });

  console.log(`\n${imported} event(s) imported.`);
  if (failures.length) {
    console.log(`${failures.length} row(s) skipped:`);
    failures.forEach((f) => console.log(`  - ${f.title}: ${f.errors.join(", ")}`));
  }
  if (imported) {
    console.log("\nReview with `git status` / `git diff`, then commit and push when ready.");
  }
}

main();
