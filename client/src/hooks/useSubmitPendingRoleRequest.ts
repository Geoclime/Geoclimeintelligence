import { useEffect, useRef } from "react";
import { errorMessage } from "../transport/api-error";
import { savePendingRoleRequest, takePendingRoleRequest } from "../utils/pending-role-request";
import { JOINING_AS } from "../utils/roles";
import { useAuth } from "./useAuth";
import { useToast } from "./useToast";

/**
 * Sends the role asked for on the sign-up form, once the new account is signed in for the first
 * time (it couldn't be sent before: unverified accounts aren't signed in). Mounted once, in the
 * signed-in shell. If sending fails, the request is put back to try on the next sign-in.
 */
export function useSubmitPendingRoleRequest() {
  const { status, user, requestRole } = useAuth();
  const { showToast } = useToast();
  const attempted = useRef<string | null>(null);

  useEffect(() => {
    if (status !== "signed-in" || !user?.email || attempted.current === user.id) return;
    attempted.current = user.id;
    const email = user.email;
    const pending = takePendingRoleRequest(email);
    // Nothing to send, a request already open, or the role already given (an admin was quick).
    if (!pending || user.roleRequest || user.role !== "general_public") return;

    requestRole(pending).then(
      () =>
        showToast({
          type: "success",
          message: `Your request for ${JOINING_AS[pending.role].label.toLowerCase()} access was sent to the administrators. Until it's approved, you have public access.`,
        }),
      (error: unknown) => {
        savePendingRoleRequest(email, pending);
        showToast({ type: "error", message: `Your role request couldn't be sent yet (${errorMessage(error)}). We'll try again next time you sign in, or you can send it from your profile.` });
      },
    );
  }, [status, user, requestRole, showToast]);
}
