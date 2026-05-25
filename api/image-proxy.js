const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

function detectImageType(buffer, upstreamContentType) {
  const contentType = upstreamContentType.split(";")[0].trim().toLowerCase();
  if (contentType.startsWith("image/")) return contentType;

  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "image/png";
  }

  if (buffer.length >= 6 && ["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString("ascii"))) {
    return "image/gif";
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }

  if (buffer.length >= 12 && buffer.subarray(4, 12).toString("ascii") === "ftypavif") {
    return "image/avif";
  }

  const start = buffer.subarray(0, 256).toString("utf8").trimStart().toLowerCase();
  if (start.startsWith("<svg") || start.startsWith("<?xml")) {
    return "image/svg+xml";
  }

  return "";
}

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

    const imageBuffer = Buffer.from(await upstream.arrayBuffer());
    const contentType = detectImageType(imageBuffer, upstream.headers.get("content-type") || "");

    if (!contentType) {
      response.status(415).json({ error: "URL does not point to an image" });
      return;
    }

    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=604800");
    response.setHeader("Content-Type", contentType);
    response.status(200).send(imageBuffer);
  } catch {
    response.status(502).json({ error: "Image proxy failed" });
  }
}
