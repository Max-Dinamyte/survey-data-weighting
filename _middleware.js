// Runs in front of every request to this Pages project (static files included)
// because it lives at functions/_middleware.js. See:
// https://developers.cloudflare.com/pages/functions/middleware/
//
// Protects the whole site with a single shared username/password using
// standard HTTP Basic Auth — the browser's own login prompt, no cookies or
// custom login page to maintain. Set these in the Cloudflare Pages dashboard
// under Settings > Environment variables (see README.md):
//   SITE_PASSWORD  (required)
//   SITE_USER      (optional, defaults to "user")

export async function onRequest(context) {
  const { request, env } = context;

  const expectedPassword = env.SITE_PASSWORD;
  const expectedUser = env.SITE_USER || "user";

  // Fail closed: if the password hasn't been configured yet, block instead
  // of silently serving the site unprotected.
  if (!expectedPassword) {
    return new Response("This site requires SITE_PASSWORD to be set in the Cloudflare Pages project's environment variables.", {
      status: 500,
    });
  }

  const authHeader = request.headers.get("Authorization");

  if (authHeader) {
    const [scheme, encoded] = authHeader.split(" ");
    if (scheme === "Basic" && encoded) {
      let decoded = "";
      try {
        decoded = atob(encoded);
      } catch (err) {
        decoded = "";
      }
      const sepIndex = decoded.indexOf(":");
      const suppliedUser = sepIndex >= 0 ? decoded.slice(0, sepIndex) : decoded;
      const suppliedPassword = sepIndex >= 0 ? decoded.slice(sepIndex + 1) : "";

      if (suppliedUser === expectedUser && suppliedPassword === expectedPassword) {
        return context.next();
      }
    }
  }

  return new Response("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Survey weighting tool", charset="UTF-8"',
    },
  });
}
