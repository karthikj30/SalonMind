import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export function done(path: string, msg: string): never {
  revalidatePath(path);
  redirect(`${path}${path.includes("?") ? "&" : "?"}msg=${encodeURIComponent(msg)}`);
}
export function fail(path: string, error: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(error)}`);
}
export type SP = Promise<Record<string, string | undefined>>;
