import type { Locale } from "../config";
import { getLocale } from "../server";
import { de } from "./de";
import { en } from "./en";
import { es } from "./es";
import { fr, type Pages } from "./fr";
import { it } from "./it";
import { pt } from "./pt";

const pages: Record<Locale, Pages> = { fr, en, es, de, pt, it };

/** Textes des pages secondaires dans la langue du visiteur. */
export async function getPages(): Promise<Pages> {
  return pages[await getLocale()];
}
export type { Pages };
