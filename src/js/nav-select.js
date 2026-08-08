(function () {
  document.querySelectorAll(".nav-select").forEach(function (select) {
    select.addEventListener("change", function () {
      if (select.value) window.location.href = select.value;
    });
  });
})();
