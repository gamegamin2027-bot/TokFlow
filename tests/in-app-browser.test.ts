import { describe, expect, it } from "vitest";
import { inAppBrowser } from "@/lib/in-app-browser";

function withUserAgent(ua: string) {
  Object.defineProperty(globalThis, "navigator", { value: { userAgent: ua }, configurable: true });
}

describe("détection du navigateur intégré", () => {
  it("reconnaît les applications qui bloquent les téléchargements", () => {
    withUserAgent("Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 TikTok 26.1.3 trill_2023");
    expect(inAppBrowser()).toBe("TikTok");
    withUserAgent("Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Instagram 310.0.0");
    expect(inAppBrowser()).toBe("Instagram");
    withUserAgent("Mozilla/5.0 (Linux; Android 12; wv) AppleWebKit/537.36 Version/4.0");
    expect(inAppBrowser()).toBe("Android");
  });

  it("ne signale rien dans un vrai navigateur", () => {
    withUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/134.0 Safari/537.36");
    expect(inAppBrowser()).toBeNull();
    withUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile/15E148 Safari/604.1");
    expect(inAppBrowser()).toBeNull();
  });
});
