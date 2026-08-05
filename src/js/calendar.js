(function () {
  var root = document.getElementById("calendar-grid");
  if (!root) return;

  var monthLabel = document.getElementById("cal-month-label");
  var daysEl = document.getElementById("cal-days");
  var emptyEl = document.getElementById("cal-empty");
  var prevBtn = document.getElementById("cal-prev");
  var nextBtn = document.getElementById("cal-next");
  var todayHeading = document.getElementById("today-heading");
  var todayContent = document.getElementById("today-content");
  var todayBack = document.getElementById("today-back");
  var originalTodayHTML = todayContent ? todayContent.innerHTML : "";

  var today = new Date();
  var viewYear = today.getFullYear();
  var viewMonth = today.getMonth();
  var eventsByDate = {};
  var selectedCell = null;

  function dateKey(y, m, d) {
    return y + "-" + String(m + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
  }

  function indexEvents(events) {
    eventsByDate = {};
    events.forEach(function (event) {
      var start = new Date(event.start_date + "T00:00:00");
      var end = event.end_date ? new Date(event.end_date + "T00:00:00") : start;
      // A bad end_date (e.g. entered before start_date by mistake) would
      // otherwise make the event vanish from the calendar entirely — fall
      // back to treating it as single-day rather than dropping it.
      if (end < start) end = start;
      var cursor = new Date(start);
      while (cursor <= end) {
        var key = dateKey(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
        (eventsByDate[key] = eventsByDate[key] || []).push(event);
        cursor.setDate(cursor.getDate() + 1);
      }
    });
  }

  function resetToToday() {
    if (selectedCell) selectedCell.classList.remove("cal-day--selected");
    selectedCell = null;
    if (todayHeading) todayHeading.textContent = "Today on the Line";
    if (todayContent) todayContent.innerHTML = originalTodayHTML;
    if (todayBack) todayBack.hidden = true;
  }

  function render() {
    resetToToday();

    monthLabel.textContent = new Date(viewYear, viewMonth, 1).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });

    daysEl.innerHTML = "";

    var firstOfMonth = new Date(viewYear, viewMonth, 1);
    var startOffset = firstOfMonth.getDay();
    var daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    var totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;
    var cursorDate = new Date(viewYear, viewMonth, 1 - startOffset);
    var monthHasEvents = false;

    for (var i = 0; i < totalCells; i++) {
      var cellDate = new Date(cursorDate);
      var key = dateKey(cellDate.getFullYear(), cellDate.getMonth(), cellDate.getDate());
      var dayEvents = eventsByDate[key] || [];
      var isCurrentMonth = cellDate.getMonth() === viewMonth;
      var isToday = cellDate.toDateString() === today.toDateString();

      if (isCurrentMonth && dayEvents.length) monthHasEvents = true;

      var cell = document.createElement("div");
      cell.className = "cal-day" +
        (isCurrentMonth ? " cal-day--current-month" : "") +
        (isToday ? " cal-day--today" : "") +
        (dayEvents.length ? " cal-day--has-events" : "");

      var num = document.createElement("div");
      num.className = "cal-day__num";
      num.textContent = cellDate.getDate();
      cell.appendChild(num);

      if (dayEvents.length) {
        var dot = document.createElement("span");
        dot.className = "cal-day__dot";
        dot.title = dayEvents.length + " event" + (dayEvents.length > 1 ? "s" : "");
        cell.appendChild(dot);

        cell.setAttribute("role", "button");
        cell.setAttribute("tabindex", "0");
        cell.addEventListener("click", function (evts, date, cellEl) {
          return function () { selectDay(evts, date, cellEl); };
        }(dayEvents, cellDate, cell));
      }

      daysEl.appendChild(cell);
      cursorDate.setDate(cursorDate.getDate() + 1);
    }

    emptyEl.hidden = monthHasEvents;
  }

  // "19" -> "7 PM" — mirrors the formatHourLabel() in .eleventy.js
  function formatHourLabel(hour24) {
    var h = parseInt(hour24, 10);
    var period = h >= 12 ? "PM" : "AM";
    var hour12 = h % 12 === 0 ? 12 : h % 12;
    return hour12 + " " + period;
  }

  // Mirrors the groupByHour() Eleventy filter — "All Day" first, then
  // chronological by hour.
  function groupByHour(events) {
    var sorted = events.slice().sort(function (a, b) {
      return (a.start_time || "").localeCompare(b.start_time || "");
    });
    var buckets = [];
    var indexByKey = {};
    sorted.forEach(function (event) {
      var key = event.start_time ? event.start_time.slice(0, 2) : "allday";
      if (!(key in indexByKey)) {
        indexByKey[key] = buckets.length;
        buckets.push({ key: key, label: key === "allday" ? "All Day" : formatHourLabel(key), events: [] });
      }
      buckets[indexByKey[key]].events.push(event);
    });
    buckets.sort(function (a, b) {
      if (a.key === "allday") return -1;
      if (b.key === "allday") return 1;
      return a.key.localeCompare(b.key);
    });
    return buckets;
  }

  function buildEventLineList(events) {
    var container = document.createDocumentFragment();
    groupByHour(events).forEach(function (group) {
      var heading = document.createElement("h3");
      heading.className = "hour-heading";
      heading.textContent = group.label;
      container.appendChild(heading);

      var list = document.createElement("div");
      list.className = "event-line-list";
      group.events.forEach(function (event) {
        var line = document.createElement("div");
        line.className = "event-line";

        var left = document.createElement("div");
        left.className = "event-line__left";

        var titleLink = document.createElement("a");
        titleLink.className = "event-line__title";
        titleLink.href = "/events/" + event.slug + "/";
        titleLink.textContent = event.title;
        left.appendChild(titleLink);

        var tags = document.createElement("div");
        tags.className = "event-line__tags";
        tags.textContent = event.category + (event.subtag ? " · " + event.subtag : "") + " · " + event.town;
        left.appendChild(tags);

        var location = document.createElement("div");
        location.className = "event-line__location";
        location.textContent = event.location;

        line.appendChild(left);
        line.appendChild(location);
        list.appendChild(line);
      });
      container.appendChild(list);
    });
    return container;
  }

  function selectDay(events, date, cellEl) {
    if (selectedCell) selectedCell.classList.remove("cal-day--selected");
    selectedCell = cellEl;
    selectedCell.classList.add("cal-day--selected");

    var isToday = date.toDateString() === today.toDateString();

    if (todayHeading) {
      todayHeading.textContent = isToday
        ? "Today on the Line"
        : date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    }

    if (todayContent) {
      todayContent.innerHTML = "";
      todayContent.appendChild(buildEventLineList(events));
    }

    if (todayBack) todayBack.hidden = isToday;

    if (todayHeading) todayHeading.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (todayBack) todayBack.addEventListener("click", resetToToday);

  prevBtn.addEventListener("click", function () {
    viewMonth -= 1;
    if (viewMonth < 0) { viewMonth = 11; viewYear -= 1; }
    render();
  });

  nextBtn.addEventListener("click", function () {
    viewMonth += 1;
    if (viewMonth > 11) { viewMonth = 0; viewYear += 1; }
    render();
  });

  fetch("/events.json")
    .then(function (res) { return res.json(); })
    .then(function (events) {
      indexEvents(events);
      render();
    })
    .catch(function () {
      render();
    });
})();
