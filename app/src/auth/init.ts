import { supabase } from "../cloud/client";
import { cloud } from "../cloud/status";
import { notify } from "../store/store";
import { onSignedIn, onSignedOut } from "./session";

export function initAuth(): void {
  if (!supabase) return;

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY") {
      cloud.recovery = true;
      notify();
      return;
    }
    if (event === "SIGNED_OUT") {
      onSignedOut();
      return;
    }
    if (!session) return;
    if (cloud.uid === session.user.id && cloud.status === "synced") return;
    void onSignedIn(session);
  });

  supabase.auth.getSession()
    .then(({ data }) => {
      cloud.checked = true;
      notify();
      if (data.session && !cloud.uid) void onSignedIn(data.session);
    })
    .catch((error: unknown) => {
      cloud.checked = true;
      notify();
      console.warn("Sesión:", error);
    });
}
