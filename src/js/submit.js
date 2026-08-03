(function () {
  var form = document.getElementById("event-form");
  if (!form) return;

  var recurringCheckbox = document.getElementById("recurring");
  var recurrenceFields = document.getElementById("recurrence-fields");
  var submitBtn = document.getElementById("submit-btn");
  var status = document.getElementById("form-status");

  recurringCheckbox.addEventListener("change", function () {
    recurrenceFields.hidden = !recurringCheckbox.checked;
  });

  function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        // reader.result is "data:<mime>;base64,<data>" — keep just the data.
        resolve(reader.result.split(",")[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();

    if (!form.reportValidity()) return;

    var tokenField = form.querySelector('[name="cf-turnstile-response"]');
    var turnstileToken = tokenField ? tokenField.value : "";
    if (!turnstileToken) {
      status.className = "form-status form-status--error";
      status.textContent = "Please complete the verification check above.";
      return;
    }

    submitBtn.disabled = true;
    status.className = "form-status";
    status.textContent = "Submitting…";

    var data = new FormData(form);
    var payload = {
      title: data.get("title"),
      description: data.get("description"),
      town: data.get("town"),
      category: data.get("category"),
      subtag: data.get("subtag") || null,
      audience: data.get("audience"),
      start_date: data.get("start_date"),
      end_date: data.get("end_date") || null,
      time: data.get("time"),
      location: data.get("location"),
      address: data.get("address") || null,
      link: data.get("link") || null,
      source_name: data.get("source_name"),
      source_email: data.get("source_email"),
      source_phone: data.get("source_phone") || null,
      turnstileToken: turnstileToken,
      recurrence_rule: null,
      image: null,
    };

    if (recurringCheckbox.checked) {
      payload.recurrence_rule = {
        frequency: data.get("frequency"),
        season_start: data.get("season_start") || null,
        season_end: data.get("season_end") || null,
      };
    }

    var imageFile = document.getElementById("image").files[0];

    (imageFile ? fileToBase64(imageFile) : Promise.resolve(null))
      .then(function (base64) {
        if (base64) {
          payload.image = { filename: imageFile.name, type: imageFile.type, base64: base64 };
        }
        return fetch("/api/submit-event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      })
      .then(function (res) {
        return res.json().then(function (body) {
          if (!res.ok || !body.ok) throw new Error(body.error || "Submission failed.");
          return body;
        });
      })
      .then(function () {
        status.className = "form-status form-status--success";
        status.textContent = "Thanks! Your event is in for review and will appear on the site once approved.";
        form.reset();
        recurrenceFields.hidden = true;
      })
      .catch(function (err) {
        status.className = "form-status form-status--error";
        status.textContent = err.message || "Something went wrong. Please try again.";
      })
      .finally(function () {
        submitBtn.disabled = false;
      });
  });
})();
