import { AxiosError, AxiosHeaders, type AxiosResponse } from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, toApiError } from "./api-error";

function axiosErrorWith(status: number, data: unknown): AxiosError {
  const config = { headers: new AxiosHeaders() };
  const response = { status, data, statusText: "", headers: {}, config } as AxiosResponse;
  return new AxiosError("Request failed", "ERR_BAD_RESPONSE", config, undefined, response);
}

describe("toApiError", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("keeps the backend envelope's message, status and field errors", () => {
    const error = toApiError(
      axiosErrorWith(400, {
        success: false,
        data: null,
        message: "Validation failed",
        errors: [{ field: "scopeAdminUnitId", message: "Invalid UUID" }],
      }),
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ message: "Validation failed", status: 400, kind: "http" });
    expect(error.fieldErrors).toEqual([{ field: "scopeAdminUnitId", message: "Invalid UUID" }]);
  });

  it("flags 401s so AuthContext can sign the user out", () => {
    const error = toApiError(axiosErrorWith(401, { success: false, data: null, message: "Invalid or expired token" }));
    expect(error.isUnauthorized).toBe(true);
  });

  it("replaces a non-envelope body (e.g. a proxy's HTML error page) with a plain message", () => {
    const error = toApiError(axiosErrorWith(502, "<html>Bad Gateway</html>"));
    expect(error).toMatchObject({ status: 502, message: "The server ran into a problem. Please try again shortly." });
  });

  it("reports a timeout as a timeout", () => {
    vi.stubGlobal("navigator", { onLine: true });
    const error = toApiError(new AxiosError("timeout", "ECONNABORTED"));
    expect(error).toMatchObject({ kind: "timeout", status: null });
  });

  it("says the user is offline when the browser knows it is", () => {
    vi.stubGlobal("navigator", { onLine: false });
    expect(toApiError(new AxiosError("Network Error", "ERR_NETWORK")).kind).toBe("offline");
  });

  it("wraps unknown throwables without leaking their message", () => {
    const error = toApiError(new Error("TypeError: x is undefined"));
    expect(error.message).toBe("Something unexpected went wrong.");
  });
});
