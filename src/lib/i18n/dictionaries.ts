import type { Locale } from "./config";
import { de } from "./de";
import { en } from "./en";
import { es } from "./es";
import { fr, type Dictionary } from "./fr";
import { it } from "./it";
import { pt } from "./pt";

export type { Dictionary };
export const dictionaries: Record<Locale, Dictionary> = { fr, en, es, de, pt, it };
