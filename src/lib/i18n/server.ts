import "server-only";
import { cookies } from "next/headers";
import { dict, LANG_COOKIE } from "./ui";

export async function getDict() {
  const lang = (await cookies()).get(LANG_COOKIE)?.value ?? "en";
  return { lang, t: dict(lang) };
}
