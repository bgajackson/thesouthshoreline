function toISODateString(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value;
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
    const d = new Date(dateObj);
    return d.toLocaleDateString("en-US", {
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
