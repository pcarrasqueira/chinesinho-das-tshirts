const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

export default async function handler(request, response) {
  const rawUrl = request.query?.url;

  if (!rawUrl || Array.isArray(rawUrl)) {
    response.status(400).json({ error: "Missing image URL" });
    return;
  }

  let imageUrl;
  try {
    imageUrl = new URL(rawUrl);
  } catch {
    response.status(400).json({ error: "Invalid image URL" });
    return;
  }

  if (!ALLOWED_PROTOCOLS.has(imageUrl.protocol)) {
    response.status(400).json({ error: "Unsupported image URL protocol" });
    return;
  }

  try {
    const upstream = await fetch(imageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 ChinesinhoDasTshirts/1.0",
      },
    });

    if (!upstream.ok) {
      response.status(upstream.status).json({ error: "Could not fetch image" });
      return;
    }

    const contentType = upstream.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      response.status(415).json({ error: "URL does not point to an image" });
      return;
    }

    const imageBuffer = Buffer.from(await upstream.arrayBuffer());
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=604800");
    response.setHeader("Content-Type", contentType);
    response.status(200).send(imageBuffer);
  } catch {
    response.status(502).json({ error: "Image proxy failed" });
  }
}
