const GOOGLE_PLACE_DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json";
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const FALLBACK_REVIEW_URL = "https://g.page/r/CfdTIVLfW3goEBM/review";

const googleReviewsCache = globalThis.__firststepGoogleReviewsCache || {
  key: "",
  expiresAt: 0,
  payload: null
};

globalThis.__firststepGoogleReviewsCache = googleReviewsCache;

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

function fallbackPayload(status, configured = false) {
  return {
    ok: true,
    configured,
    status,
    rating: null,
    review_count: null,
    reviews: [],
    google_url: FALLBACK_REVIEW_URL,
    cache: {
      status: "fallback",
      ttl_seconds: Math.floor(CACHE_TTL_MS / 1000)
    }
  };
}

function cachedPayload(cacheStatus) {
  return {
    ...googleReviewsCache.payload,
    cache: {
      status: cacheStatus,
      ttl_seconds: Math.max(0, Math.floor((googleReviewsCache.expiresAt - Date.now()) / 1000))
    }
  };
}

function hasCachedData(cacheKey) {
  return googleReviewsCache.key === cacheKey && googleReviewsCache.payload;
}

function hasFreshCachedData(cacheKey) {
  return hasCachedData(cacheKey) && googleReviewsCache.expiresAt > Date.now();
}

function setCachedData(cacheKey, payload) {
  googleReviewsCache.key = cacheKey;
  googleReviewsCache.expiresAt = Date.now() + CACHE_TTL_MS;
  googleReviewsCache.payload = payload;
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
  const cacheKey = placeId || "missing-place-id";

  if (!apiKey || !placeId) {
    return sendJson(res, 200, fallbackPayload("skipped_not_configured", false));
  }

  if (hasFreshCachedData(cacheKey)) {
    return sendJson(res, 200, cachedPayload("hit"));
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
      if (hasCachedData(cacheKey)) {
        return sendJson(res, 200, cachedPayload("stale_google_unavailable"));
      }

      return sendJson(res, 200, fallbackPayload("unavailable", true));
    }

    const result = data.result || {};
    const payload = {
      ok: true,
      configured: true,
      status: "loaded",
      name: result.name || "1stStep.ai",
      rating: result.rating || null,
      review_count: result.user_ratings_total || null,
      google_url: result.url || FALLBACK_REVIEW_URL,
      reviews: Array.isArray(result.reviews) ? result.reviews.slice(0, 3).map(safeReview) : []
    };

    setCachedData(cacheKey, payload);
    return sendJson(res, 200, cachedPayload("miss_loaded"));
  } catch (error) {
    if (hasCachedData(cacheKey)) {
      return sendJson(res, 200, cachedPayload("stale_fetch_failed"));
    }

    return sendJson(res, 200, fallbackPayload("failed_non_blocking", true));
  }
}
