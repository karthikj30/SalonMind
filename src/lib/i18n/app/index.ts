import "server-only";
import as from "./as";
import bn from "./bn";
import gu from "./gu";
import hi from "./hi";
import kn from "./kn";
import ml from "./ml";
import mr from "./mr";
import or from "./or";
import pa from "./pa";
import ta from "./ta";
import te from "./te";
import ur from "./ur";

/**
 * Owner-dashboard dictionaries (hand-translated, keyed by the exact English UI string). Only the selected
 * language is sent to the browser. Anything missing falls back to /api/i18n/ui (free translation, cached).
 */
const DICTS: Record<string, Record<string, string>> = { hi, bn, mr, ta, te, gu, ur, kn, or, ml, pa, as };
export const APP_LANGS = Object.keys(DICTS);
export const appDict = (lang: string | null | undefined): Record<string, string> => DICTS[lang ?? ""] ?? {};
