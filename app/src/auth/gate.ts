import { PIN_MAX_FAILS, failsOf, hasPin } from "./pin";
import { cloud } from "../cloud/status";

export type GateMode = "" | "loading" | "login" | "recovery" | "pin";

export function gateMode(): GateMode {
  if (!cloud.enabled) return "";
  if (!cloud.checked) return "loading";
  if (cloud.recovery) return "recovery";
  if (!cloud.uid) return "login";
  if (hasPin(cloud.uid) && !cloud.unlocked) {
    return cloud.passwordFallback || failsOf(cloud.uid) >= PIN_MAX_FAILS ? "login" : "pin";
  }
  return "";
}
