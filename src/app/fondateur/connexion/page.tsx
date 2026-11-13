import { redirect } from "next/navigation";
import { FounderAuth } from "@/components/founder-auth";
import { currentFounder, needsFounderSetup } from "@/lib/server/auth";
import { databaseConfigured } from "@/lib/server/db";
import { DatabaseMissing } from "../database-missing";

export default async function FounderLogin() {
  if (!databaseConfigured()) return <DatabaseMissing />;
  if (await currentFounder()) redirect("/fondateur");
  return <FounderAuth mode={(await needsFounderSetup()) ? "setup" : "login"} />;
}
