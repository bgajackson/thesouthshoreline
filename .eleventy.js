function toISODateString(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value;
}

// "19:00" -> "7:00 PM"
function formatTime(time24) {
  if (!time24) return "";
  const [h, m] = time24.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

// "19" -> "7 PM"
function formatHourLabel(hour24) {
  const h = parseInt(hour24, 10);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12} ${period}`;
}

// Groups events into [{ label: "All Day"|"7 PM", events: [...] }, ...],
// "All Day" (events with no start_time) first, then chronological by hour.
function groupByHour(events) {
  if (!Array.isArray(events)) return [];
  const sorted = [...events].sort((a, b) => (a.data.start_time || "").localeCompare(b.data.start_time || ""));
  const buckets = [];
  const indexByKey = new Map();
  sorted.forEach((event) => {
    const st = event.data.start_time;
    const key = st ? st.slice(0, 2) : "allday";
    if (!indexByKey.has(key)) {
      indexByKey.set(key, buckets.length);
      buckets.push({ key, label: key === "allday" ? "All Day" : formatHourLabel(key), events: [] });
    }
    buckets[indexByKey.get(key)].events.push(event);
  });
  buckets.sort((a, b) => (a.key === "allday" ? -1 : b.key === "allday" ? 1 : a.key.localeCompare(b.key)));
  return buckets;
}

// Groups events into [{ date: "YYYY-MM-DD", events: [...] }, ...] by
// start_date, chronological. Multi-day events are grouped under their
// start_date only.
function groupByDate(events) {
  if (!Array.isArray(events)) return [];
  const map = new Map();
  events.forEach((event) => {
    const key = event.data.start_date;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(event);
  });
  return Array.from(map.keys())
    .sort()
    .map((date) => ({ date, events: map.get(date) }));
}

module.exports = function (eleventyConfig) {
  // Copy static assets straight through to the output
  eleventyConfig.addPassthroughCopy("src/css");
  eleventyConfig.addPassthroughCopy("src/js");
  eleventyConfig.addPassthroughCopy("src/images");
  eleventyConfig.addPassthroughCopy("src/admin");
  eleventyConfig.addPassthroughCopy("src/icon.svg");
  eleventyConfig.addPassthroughCopy("src/logo.svg");
  eleventyConfig.addPassthroughCopy("src/favicon-16x16.png");
  eleventyConfig.addPassthroughCopy("src/favicon-32x32.png");
  eleventyConfig.addPassthroughCopy("src/apple-touch-icon.png");

  // All approved events, soonest first. Pending/rejected submissions never
  // reach the public build — Decap CMS reads src/_events directly instead.
  //
  // Unquoted YAML dates (e.g. `start_date: 2026-08-03`) get auto-parsed into
  // JS Date objects by the front-matter parser. Normalizing to "YYYY-MM-DD"
  // strings here means every downstream filter/template can do plain string
  // comparisons instead of juggling both types.
  eleventyConfig.addCollection("events", function (collectionApi) {
    return collectionApi
      .getFilteredByGlob("src/_events/*.md")
      .filter((event) => event.data.status === "approved")
      .map((event) => {
        event.data.start_date = toISODateString(event.data.start_date);
        event.data.end_date = toISODateString(event.data.end_date);
        return event;
      })
      .sort((a, b) => a.data.start_date.localeCompare(b.data.start_date));
  });

  eleventyConfig.addFilter("readableDate", (dateObj) => {
    if (!dateObj) return "";
    // Force UTC on both ends — "YYYY-MM-DD" strings parse as UTC midnight,
    // and formatting in the server/browser's local timezone can otherwise
    // shift the displayed date back a day in negative UTC offsets.
    const d = new Date(dateObj);
    return d.toLocaleDateString("en-US", {
      timeZone: "UTC",
      weekday: "short",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  });

  eleventyConfig.addFilter("isoDate", (dateObj) => {
    if (!dateObj) return "";
    return new Date(dateObj).toISOString().slice(0, 10);
  });

  // "19:00" -> "7:00 PM"
  eleventyConfig.addFilter("formatTime", formatTime);

  // start_time + optional end_time -> "7:00 PM" or "7:00 PM – 10:00 PM".
  // Returns "" (falsy) when there's no start_time, e.g. an "All Day" event —
  // callers fall back to time_note in that case.
  eleventyConfig.addFilter("displayTime", (startTime, endTime) => {
    if (!startTime) return "";
    return endTime ? `${formatTime(startTime)} – ${formatTime(endTime)}` : formatTime(startTime);
  });

  eleventyConfig.addFilter("groupByHour", groupByHour);
  eleventyConfig.addFilter("groupByDate", groupByDate);

  // Events happening today (by start/end date range), used on the homepage.
  eleventyConfig.addFilter("happeningToday", (events) => {
    if (!Array.isArray(events)) return [];
    const today = new Date().toISOString().slice(0, 10);
    return events.filter((event) => {
      const start = event.data.start_date;
      const end = event.data.end_date || event.data.start_date;
      return start <= today && today <= end;
    });
  });

  // Events with a start date today or later.
  eleventyConfig.addFilter("upcoming", (events) => {
    if (!Array.isArray(events)) return [];
    const today = new Date().toISOString().slice(0, 10);
    return events.filter((event) => {
      const end = event.data.end_date || event.data.start_date;
      return end >= today;
    });
  });

  // Filters take the human-readable name (e.g. "Duxbury"), matching the
  // exact value stored in each event's front matter.
  eleventyConfig.addFilter("byTown", (events, townName) => {
    if (!Array.isArray(events)) return [];
    return events.filter((event) => event.data.town === townName);
  });

  eleventyConfig.addFilter("byCategory", (events, categoryName) => {
    if (!Array.isArray(events)) return [];
    return events.filter((event) => event.data.category === categoryName);
  });

  eleventyConfig.addFilter("head", (arr, n) => {
    if (!Array.isArray(arr)) return arr;
    return arr.slice(0, n);
  });

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data",
    },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
};
