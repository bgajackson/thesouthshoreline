// This Worker does three things:
// 1. Handles GitHub OAuth login for Decap CMS, at /api/auth and /api/auth/callback
// 2. Accepts public event submissions at /api/submit-event and commits them
//    to the repo as pending-status files for review in Decap CMS
// 3. Proxies NOAA tide predictions at /api/tides
// Everything else falls through to the built static site.

const TOWNS = ["Duxbury", "Marshfield", "Kingston", "Pembroke"];
const CATEGORIES = ["Live Music", "Restaurant Special", "Family/Kids", "Community/Civic"];
const AUDIENCES = ["Family/Kids", "All Ages", "21+"];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/auth") {
      return handleAuthStart(url, env);
    }

    if (url.pathname === "/api/auth/callback") {
      return handleAuthCallback(url, env);
    }

    if (url.pathname === "/api/submit-event") {
      return handleSubmitEvent(request, env);
    }

    if (url.pathname === "/api/tides") {
      return handleTides(env);
    }

    return env.ASSETS.fetch(request);
  },
};

// --- Decap CMS GitHub OAuth (unchanged pattern from comebirdingwithme) ---

function handleAuthStart(url, env) {
  const redirectUri = `${url.origin}/api/auth/callback`;

  const authUrl = new URL("https://github.com/login/oauth/authorize");
  authUrl.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", "repo");

  return Response.redirect(authUrl.toString(), 302);
}

async function handleAuthCallback(url, env) {
  const code = url.searchParams.get("code");

  if (!code) {
    return new Response("Missing OAuth code from GitHub.", { status: 400 });
  }

  const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
    }),
  });

  const tokenData = await tokenResponse.json();

  if (tokenData.error) {
    return new Response(
      `GitHub authentication error: ${tokenData.error_description || tokenData.error}`,
      { status: 401 }
    );
  }

  const payload = JSON.stringify({ token: tokenData.access_token, provider: "github" });

  const html = `<!doctype html>
<html>
<body>
<script>
(function() {
  function receiveMessage(e) {
    window.opener.postMessage(
      'authorization:github:success:${payload}',
      e.origin
    );
    window.removeEventListener("message", receiveMessage, false);
  }
  window.addEventListener("message", receiveMessage, false);
  window.opener.postMessage("authorizing:github", "*");
})();
</script>
</body>
</html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html" },
  });
}

// --- Event submission ---

async function handleSubmitEvent(request, env) {
  if (request.method !== "POST") {
    return jsonError("Method not allowed", 405);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body.", 400);
  }

  const turnstileOk = await verifyTurnstile(body.turnstileToken, env.TURNSTILE_SECRET_KEY, request);
  if (!turnstileOk) {
    return jsonError("Verification failed. Please try again.", 400);
  }

  const required = ["title", "description", "town", "category", "audience", "start_date", "time", "location", "source_name", "source_email"];
  for (const field of required) {
    if (typeof body[field] !== "string" || !body[field].trim()) {
      return jsonError(`Missing required field: ${field}`, 400);
    }
  }
  if (!TOWNS.includes(body.town)) return jsonError("Invalid town.", 400);
  if (!CATEGORIES.includes(body.category)) return jsonError("Invalid category.", 400);
  if (!AUDIENCES.includes(body.audience)) return jsonError("Invalid audience.", 400);
  if (body.title.length > 120) return jsonError("Title is too long.", 400);
  if (body.description.length > 500) return jsonError("Description is too long.", 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.start_date)) return jsonError("Invalid start date.", 400);

  const sourceContact = [body.source_email, body.source_phone].filter(Boolean).join(", ");
  const slug = slugify(body.title);
  const shortId = crypto.randomUUID().slice(0, 8);
  const baseName = `${body.start_date}-${slug}-${shortId}`;

  let imagePath = null;
  if (body.image && body.image.base64 && body.image.filename) {
    const ext = (body.image.filename.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    imagePath = `/images/uploads/${baseName}.${ext}`;
    try {
      await commitFileToGitHub(env, `src${imagePath}`, body.image.base64, `Event image: ${body.title}`, true);
    } catch {
      imagePath = null; // Don't fail the whole submission over a bad image upload.
    }
  }

  const frontMatter = buildFrontMatter({
    title: body.title,
    town: body.town,
    category: body.category,
    subtag: body.subtag || null,
    audience: body.audience,
    start_date: body.start_date,
    end_date: body.end_date || null,
    recurrence_rule: body.recurrence_rule || null,
    time: body.time,
    location: body.location,
    address: body.address || null,
    description: body.description,
    link: body.link || null,
    image: imagePath,
    source_name: body.source_name,
    source_contact: sourceContact,
    status: "pending",
    featured: false,
  });

  try {
    await commitFileToGitHub(env, `src/_events/${baseName}.md`, `---\n${frontMatter}---\n`, `New event submission: ${body.title}`, false);
  } catch {
    return jsonError("Could not save your submission. Please try again later.", 502);
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
}

async function verifyTurnstile(token, secret, request) {
  if (!token || !secret) return false;
  const formData = new FormData();
  formData.append("secret", secret);
  formData.append("response", token);
  const ip = request.headers.get("CF-Connecting-IP");
  if (ip) formData.append("remoteip", ip);

  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: formData,
  });
  const data = await res.json();
  return !!data.success;
}

async function commitFileToGitHub(env, path, content, message, isBase64Already) {
  const contentBase64 = isBase64Already ? content : utf8ToBase64(content);

  const res = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/contents/${path}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "User-Agent": "thesouthshoreline-worker",
      Accept: "application/vnd.github+json",
    },
    body: JSON.stringify({
      message,
      content: contentBase64,
      branch: "main",
    }),
  });

  if (!res.ok) {
    throw new Error(`GitHub API error ${res.status}: ${await res.text()}`);
  }

  return res.json();
}

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

// Every value round-trips through JSON.stringify, which is valid YAML for
// strings, numbers, booleans, null, and flow-style objects — sidesteps
// hand-rolling YAML escaping for user-submitted text.
function buildFrontMatter(fields) {
  return (
    Object.entries(fields)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join("\n") + "\n"
  );
}

function jsonError(message, status) {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// --- Tides proxy ---

async function handleTides(env) {
  const stationId = env.TIDES_STATION_ID || "8446166";
  const apiUrl =
    "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter" +
    `?product=predictions&application=thesouthshoreline&station=${stationId}` +
    "&datum=MLLW&time_zone=lst_ldt&units=english&interval=hilo&format=json&date=today&range=48";

  const res = await fetch(apiUrl);
  if (!res.ok) {
    return jsonError("Tide data is unavailable right now.", 502);
  }

  const data = await res.json();

  return new Response(
    JSON.stringify({
      stationId,
      stationName: "Duxbury Harbor",
      predictions: data.predictions || [],
    }),
    {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=1800",
      },
    }
  );
}
