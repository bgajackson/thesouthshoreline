function toISODate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value;
}

module.exports = class {
  data() {
    return {
      permalink: "/events.json",
      eleventyExcludeFromCollections: true,
    };
  }

  render(data) {
    const events = (data.collections.events || []).map((event) => ({
      slug: event.fileSlug,
      title: event.data.title,
      town: event.data.town,
      category: event.data.category,
      subtag: event.data.subtag || null,
      start_date: toISODate(event.data.start_date),
      end_date: toISODate(event.data.end_date),
      time: event.data.time || null,
      location: event.data.location,
      featured: !!event.data.featured,
    }));
    return JSON.stringify(events);
  }
};
