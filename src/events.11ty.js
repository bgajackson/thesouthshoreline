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
      start_time: event.data.start_time || null,
      end_time: event.data.end_time || null,
      time_note: event.data.time_note || null,
      location: event.data.location,
      description: event.data.description || null,
      link: event.data.link || null,
      featured: !!event.data.featured,
    }));
    return JSON.stringify(events);
  }
};
