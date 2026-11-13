import type { Locale } from "./config";
import { en } from "./en";
import { fr, type Dictionary } from "./fr";

export type { Dictionary };
export const dictionaries: Record<Locale, Dictionary> = { fr, en };
