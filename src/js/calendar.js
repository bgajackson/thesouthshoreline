(function () {
  var root = document.getElementById("calendar-grid");
  if (!root) return;

  var monthLabel = document.getElementById("cal-month-label");
  var daysEl = document.getElementById("cal-days");
  var emptyEl = document.getElementById("cal-empty");
  var prevBtn = document.getElementById("cal-prev");
  var nextBtn = document.getElementById("cal-next");

  var today = new Date();
  var viewYear = today.getFullYear();
  var viewMonth = today.getMonth();
  var eventsByDate = {};

  function dateKey(y, m, d) {
    return y + "-" + String(m + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
  }

  function indexEvents(events) {
    eventsByDate = {};
    events.forEach(function (event) {
      var start = new Date(event.start_date + "T00:00:00");
      var end = event.end_date ? new Date(event.end_date + "T00:00:00") : start;
      var cursor = new Date(start);
      while (cursor <= end) {
        var key = dateKey(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
        (eventsByDate[key] = eventsByDate[key] || []).push(event);
        cursor.setDate(cursor.getDate() + 1);
      }
    });
  }

  function render() {
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

        cell.addEventListener("click", function (evts) {
          return function () { showDayEvents(evts); };
        }(dayEvents));
      }

      daysEl.appendChild(cell);
      cursorDate.setDate(cursorDate.getDate() + 1);
    }

    emptyEl.hidden = monthHasEvents;
  }

  function showDayEvents(events) {
    var existing = root.querySelector(".calendar-grid__day-detail");
    if (existing) existing.remove();

    var detail = document.createElement("div");
    detail.className = "calendar-grid__day-detail";
    events.forEach(function (event) {
      var link = document.createElement("a");
      link.href = "/events/" + event.slug + "/";
      link.textContent = event.title + (event.time ? " — " + event.time : "");
      link.style.display = "block";
      detail.appendChild(link);
    });
    root.appendChild(detail);
  }

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
