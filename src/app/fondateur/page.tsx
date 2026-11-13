import { redirect } from "next/navigation";
import { SupportCenter } from "@/components/support-center";
import { currentFounder } from "@/lib/server/auth";
import { databaseConfigured } from "@/lib/server/db";
import { DatabaseMissing } from "./database-missing";

export default async function FounderHome() {
  if (!databaseConfigured()) return <DatabaseMissing />;
  const email = await currentFounder();
  if (!email) redirect("/fondateur/connexion");
  return <SupportCenter founderEmail={email} />;
}
