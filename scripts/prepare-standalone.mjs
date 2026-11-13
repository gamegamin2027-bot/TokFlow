// Copie les fichiers statiques dans le bundle autonome (.next/standalone),
// afin que `node .next/standalone/server.js` serve l'application complète.
import { cpSync, existsSync } from "node:fs";

cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
if (existsSync("public")) cpSync("public", ".next/standalone/public", { recursive: true });
console.log("✓ Bundle autonome prêt : .next/standalone");
