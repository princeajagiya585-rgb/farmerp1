/**
 * Turn an Axios/DRF error into a readable, user-facing message.
 *
 * DRF returns validation errors as { field: ["msg", ...], ... } or
 * { detail: "msg" }, and non_field_errors for form-level problems. Without
 * this, components stringify the whole object and show a raw JSON blob.
 */
export function formatApiError(err, fallback = "Something went wrong.") {
  const data = err?.response?.data;

  if (data == null) {
    // No response body — network error, timeout, or the server is asleep.
    if (err?.code === "ECONNABORTED") return "The request timed out. Please try again.";
    if (err?.message === "Network Error") return "Cannot reach the server. Check your connection.";
    return fallback;
  }

  if (typeof data === "string") return data;
  if (data.detail) return String(data.detail);

  if (typeof data === "object") {
    const parts = [];
    for (const [key, val] of Object.entries(data)) {
      const msg = Array.isArray(val) ? val.join(" ") : String(val);
      // Don't prefix the generic "non_field_errors" bucket with a field label.
      parts.push(key === "non_field_errors" ? msg : `${key}: ${msg}`);
    }
    if (parts.length) return parts.join("\n");
  }

  return fallback;
}
