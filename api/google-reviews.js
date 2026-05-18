const GOOGLE_PLACE_DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json";

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "s-maxage=21600, stale-while-revalidate=86400");
  res.end(JSON.stringify(payload));
}

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function safeReview(review) {
  return {
    author_name: String(review.author_name || "Google reviewer").slice(0, 80),
    author_url: review.author_url || "",
    rating: Number(review.rating || 0),
    relative_time_description: String(review.relative_time_description || "").slice(0, 80),
    text: String(review.text || "").slice(0, 700)
  };
}

export default async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    return sendJson(res, 200, { ok: true });
  }

  if (req.method !== "GET") {
    return sendJson(res, 405, { ok: false, error: "Method not allowed" });
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  const placeId = process.env.GOOGLE_PLACE_ID;

  if (!apiKey || !placeId) {
    return sendJson(res, 200, {
      ok: true,
      configured: false,
      rating: null,
      review_count: null,
      reviews: [],
      google_url: "https://g.page/r/CfdTIVLfW3goEBM/review"
    });
  }

  try {
    const params = new URLSearchParams({
      place_id: placeId,
      fields: "name,rating,user_ratings_total,reviews,url",
      key: apiKey
    });

    const response = await fetch(`${GOOGLE_PLACE_DETAILS_URL}?${params.toString()}`);
    const data = await response.json();

    if (!response.ok || data.status !== "OK") {
      return sendJson(res, 200, {
        ok: true,
        configured: true,
        status: "unavailable",
        reviews: [],
        google_url: "https://g.page/r/CfdTIVLfW3goEBM/review"
      });
    }

    const result = data.result || {};
    return sendJson(res, 200, {
      ok: true,
      configured: true,
      status: "loaded",
      name: result.name || "1stStep.ai",
      rating: result.rating || null,
      review_count: result.user_ratings_total || null,
      google_url: result.url || "https://g.page/r/CfdTIVLfW3goEBM/review",
      reviews: Array.isArray(result.reviews) ? result.reviews.slice(0, 3).map(safeReview) : []
    });
  } catch (error) {
    return sendJson(res, 200, {
      ok: true,
      configured: true,
      status: "failed_non_blocking",
      reviews: [],
      google_url: "https://g.page/r/CfdTIVLfW3goEBM/review"
    });
  }
}
