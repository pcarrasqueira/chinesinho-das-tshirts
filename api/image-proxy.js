const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
const MAX_REDIRECT_DEPTH = 2;

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

function decodeHtmlEntities(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function extractImageUrlFromHtml(html, baseUrl) {
  const patterns = [
    /<meta[^>]+(?:property|name)=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']og:image(?::secure_url)?["']/i,
    /<meta[^>]+(?:property|name)=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']twitter:image(?::src)?["']/i,
    /<img[^>]+src=["']([^"']+)["']/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (!match?.[1]) continue;

    try {
      return new URL(decodeHtmlEntities(match[1]), baseUrl).toString();
    } catch {
      continue;
    }
  }

  return "";
}

async function fetchImage(imageUrl, depth = 0) {
  const upstream = await fetch(imageUrl, {
    redirect: "follow",
    headers: {
      Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      Referer: imageUrl.origin,
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    },
  });

  if (!upstream.ok) {
    return { status: upstream.status, error: "Could not fetch image" };
  }

  const imageBuffer = Buffer.from(await upstream.arrayBuffer());
  const upstreamContentType = upstream.headers.get("content-type") || "";
  const contentType = detectImageType(imageBuffer, upstreamContentType);

  if (contentType) {
    return { contentType, imageBuffer };
  }

  const isHtml = upstreamContentType.toLowerCase().includes("text/html");
  if (isHtml && depth < MAX_REDIRECT_DEPTH) {
    const html = imageBuffer.toString("utf8");
    const nestedImageUrl = extractImageUrlFromHtml(html, upstream.url || imageUrl.toString());

    if (nestedImageUrl) {
      return fetchImage(new URL(nestedImageUrl), depth + 1);
    }
  }

  return { status: 415, error: "URL does not point to an image" };
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
    const result = await fetchImage(imageUrl);

    if (result.error) {
      response.status(result.status).json({ error: result.error });
      return;
    }

    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=604800");
    response.setHeader("Content-Type", result.contentType);
    response.status(200).send(result.imageBuffer);
  } catch {
    response.status(502).json({ error: "Image proxy failed" });
  }
}
