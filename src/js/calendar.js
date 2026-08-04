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

  function buildEventCard(event) {
    var card = document.createElement("article");
    card.className = "event-card" + (event.featured ? " event-card--featured" : "");

    var meta = document.createElement("div");
    meta.className = "event-card__meta";
    var category = document.createElement("span");
    category.className = "event-card__category";
    category.textContent = event.category + (event.subtag ? " · " + event.subtag : "");
    var town = document.createElement("span");
    town.className = "event-card__town";
    town.textContent = event.town;
    meta.appendChild(category);
    meta.appendChild(town);
    card.appendChild(meta);

    var title = document.createElement("h3");
    title.className = "event-card__title";
    var titleLink = document.createElement("a");
    titleLink.href = "/events/" + event.slug + "/";
    titleLink.textContent = event.title;
    title.appendChild(titleLink);
    card.appendChild(title);

    if (event.time) {
      var when = document.createElement("p");
      when.className = "event-card__when";
      when.textContent = event.time;
      card.appendChild(when);
    }

    var where = document.createElement("p");
    where.className = "event-card__where";
    where.textContent = event.location;
    card.appendChild(where);

    if (event.description) {
      var desc = document.createElement("p");
      desc.className = "event-card__desc";
      desc.textContent = event.description;
      card.appendChild(desc);
    }

    if (event.link) {
      var link = document.createElement("a");
      link.className = "event-card__link";
      link.href = event.link;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = "More info";
      card.appendChild(link);
    }

    return card;
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
      var list = document.createElement("div");
      list.className = "event-list";
      events.forEach(function (event) {
        list.appendChild(buildEventCard(event));
      });
      todayContent.innerHTML = "";
      todayContent.appendChild(list);
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
