(function () {
  var widget = document.getElementById("tides-widget");
  if (!widget) return;

  var status = widget.querySelector(".tides-widget__status");

  function parseLocal(t) {
    // NOAA returns "YYYY-MM-DD HH:MM" in local station time.
    var parts = t.split(/[- :]/);
    return new Date(parts[0], parts[1] - 1, parts[2], parts[3], parts[4]);
  }

  function formatTime(date) {
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }

  fetch("/api/tides")
    .then(function (res) {
      if (!res.ok) throw new Error("tides request failed");
      return res.json();
    })
    .then(function (data) {
      var predictions = (data.predictions || []).map(function (p) {
        return { time: parseLocal(p.t), type: p.type, height: p.v };
      });

      if (!predictions.length) {
        status.textContent = "Tide data is unavailable right now.";
        return;
      }

      var now = new Date();
      var next = predictions.find(function (p) { return p.time > now; });
      var today = predictions.filter(function (p) {
        return p.time.toDateString() === now.toDateString();
      });

      widget.removeChild(status);

      if (next) {
        var nextEl = document.createElement("p");
        nextEl.className = "tides-widget__next";
        nextEl.textContent = (next.type === "H" ? "Next high tide: " : "Next low tide: ") + formatTime(next.time);
        widget.appendChild(nextEl);
      }

      var list = document.createElement("ul");
      list.className = "tides-widget__list";
      (today.length ? today : predictions.slice(0, 4)).forEach(function (p) {
        var li = document.createElement("li");
        var label = document.createElement("span");
        label.textContent = p.type === "H" ? "High" : "Low";
        var time = document.createElement("span");
        time.textContent = formatTime(p.time);
        li.appendChild(label);
        li.appendChild(time);
        list.appendChild(li);
      });
      widget.appendChild(list);
    })
    .catch(function () {
      status.textContent = "Couldn't load tide data.";
    });
})();
