import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Launch guard for decision 137. Once the owner switches on Supabase Auth's
 * captcha protection (Attack Protection › Captcha), every protected Auth call
 * sent WITHOUT a Turnstile token is refused (`captcha_failed`): sign-in,
 * sign-up, password reset or a confirmation resend that forgot the token
 * would break for every visitor the day the switch is turned on, while every
 * test in mock mode stays green.
 *
 * So this scans the application's source for each protected call and checks
 * that its argument list carries a `captchaToken`. A new call site that does
 * not fails here, before it reaches production.
 */

/** The webapp root: `src/`, the App Router's `app/` (server routes) and the root `proxy.ts`. */
const ROOT = join(__dirname, "..", "..", "..");
const SCANNED = [join(ROOT, "src"), join(ROOT, "app"), join(ROOT, "proxy.ts")];

/** The Auth methods Supabase checks a captcha token on. */
const PROTECTED = ["signInWithPassword", "signUp", "resetPasswordForEmail", "resend", "signInWithIdToken", "signInWithOtp", "signInAnonymously"];

function sourceFiles(dir: string): string[] {
  if (!statSync(dir).isDirectory()) return [dir];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) && !name.endsWith(".d.ts") ? [path] : [];
  });
}

/** The text of a call's argument list, from its opening parenthesis to the matching one. */
function argumentsOf(source: string, open: number): string {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "(") depth++;
    else if (source[i] === ")" && --depth === 0) return source.slice(open, i + 1);
  }
  return source.slice(open);
}

interface CallSite {
  file: string;
  method: string;
  args: string;
}

function protectedCalls(): CallSite[] {
  const pattern = new RegExp(`\\.auth\\.(${PROTECTED.join("|")})\\s*\\(`, "g");
  return SCANNED.flatMap(sourceFiles).flatMap((path) => {
    const source = readFileSync(path, "utf8");
    return Array.from(source.matchAll(pattern), (match) => ({
      file: relative(ROOT, path).replace(/\\/g, "/"),
      method: match[1],
      args: argumentsOf(source, (match.index ?? 0) + match[0].length - 1),
    }));
  });
}

describe("captcha on protected Auth calls (decision 137)", () => {
  const calls = protectedCalls();

  it("finds the application's Auth call sites (the scan itself works)", () => {
    const methods = new Set(calls.map((call) => call.method));
    for (const method of ["signInWithPassword", "signUp", "resetPasswordForEmail", "resend", "signInWithIdToken"]) {
      expect(methods, `no ${method} call found: the scan is broken or the call moved`).toContain(method);
    }
  });

  it.each(protectedCalls().map((call) => [`${call.file} › ${call.method}`, call] as const))("%s sends a captcha token", (_, call) => {
    expect(call.args, `${call.file}: auth.${call.method}() must pass options.captchaToken`).toMatch(/\bcaptchaToken\b/);
  });
});
