import { NextResponse } from "next/server";

/**
 * Lien entre le site et l'application Android TokFlow : Android n'affiche le site en plein écran,
 * sans barre d'adresse, que si le site reconnaît ici la signature de l'application.
 */
const ANDROID_APP = {
  package: "app.tokflow.android",
  fingerprint: "67:9F:CE:D7:B9:2F:84:53:AC:CD:B0:1E:F7:0D:FD:3B:18:DF:C0:5D:6C:A3:26:A3:8B:B0:3C:25:82:B0:54:65",
};

export const dynamic = "force-static";

export function GET() {
  return NextResponse.json([
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { namespace: "android_app", package_name: ANDROID_APP.package, sha256_cert_fingerprints: [ANDROID_APP.fingerprint] },
    },
  ]);
}
