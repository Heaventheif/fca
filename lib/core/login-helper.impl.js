var Ae = Object.defineProperty;
var r = (n, s) => Ae(n, "name", { value: s, configurable: !0 });
import ve from "node:events";
import * as Se from "../app/attach-legacy-api.js";
import * as _e from "../compat/api-registry.js";
import be from "../database/models/index.js";
import Ue from "../func/logger.js";
import * as $e from "../remote/remoteClient.js";
import * as $ from "../utils/client.js";
import * as z from "../utils/constants.js";
import * as Le from "./auth-helpers.js";
import * as Ee from "./config.js";
import * as Ce from "./mqtt.js";
import * as Re from "./options.js";
import * as Ne from "./request.js";
import * as Te from "./thread-info-realtime-sync.js";
import * as Z from "./state.js";
const Me = { default: ve },
  O = { default: be },
  o = { default: Ue };
function G(n) {
  return n instanceof Error ? n.message : String(n);
}
r(G, "errMsg");
const W = globalThis,
  { config: b } = (0, Ee.loadConfig)();
let Pe = (0, Ne.createRequestCore)();
let C = Pe.get,
  ae = Pe.post,
  u = Pe.jar,
  Fe = Pe.makeDefaults;
const j = (0, Le.createAuthCore)({ config: b, logger: o.default }),
  xe = j.REGION_MAP;
function He(n) {
  return j.parseRegion(n);
}
r(He, "parseRegion");
async function Be(n, s, c = null, a = null, d = null) {
  return j.loginViaAPI(n, s, c, a, d);
}
r(Be, "loginViaAPI");
async function se(n, s, c = null, a = null) {
  return j.tokensViaAPI(n, s, c ?? null, a ?? null);
}
r(se, "tokensViaAPI");
function Q(n) {
  return j.normalizeCookieHeaderString(n);
}
r(Q, "normalizeCookieHeaderString");
function V(n, s, c) {
  return j.setJarFromPairs(n, s, c);
}
r(V, "setJarFromPairs");
function re(n) {
  const s = ["https://www.facebook.com"],
    c = new Set(),
    a = [];
  for (const d of s) {
    let g = "";
    try {
      g =
        typeof n.getCookieStringSync == "function"
          ? n.getCookieStringSync(d)
          : "";
    } catch {}
    if (g)
      for (const E of g.split(";")) {
        const p = E.trim(),
          w = p.split("=")[0];
        !w || c.has(w) || (c.add(w), a.push(p));
      }
  }
  return a.join("; ");
}
r(re, "cookieHeaderFromJar");
function ee() {
  return O.default && O.default.AppStateBackup
    ? O.default.AppStateBackup
    : null;
}
r(ee, "getBackupModel");
async function ce(n, s, c, a) {
  const d = { userID: String(s || ""), type: c },
    g = await n.findOne({ where: d });
  if (g) {
    (await g.update({ data: a }),
      (0, o.default)(
        `Overwrote existing ${c} backup for user ${d.userID}`,
        "sys",
      ));
    return;
  }
  (await n.create({ ...d, data: a }),
    (0, o.default)(`Created new ${c} backup for user ${d.userID}`, "sys"));
}
r(ce, "upsertBackup");
async function qe(n, s) {
  try {
    const c = ee();
    if (!c) return;
    const a = (0, $.getAppState)(n),
      d = re(n);
    (await ce(c, s, "appstate", JSON.stringify(a)),
      await ce(c, s, "cookie", d),
      (0, o.default)("Backup stored (overwrite mode)", "sys"));
  } catch (c) {
    (0, o.default)(`Failed to save appstate backup ${G(c)}`, "warn");
  }
}
r(qe, "backupAppStateSQL");
async function te(n, s) {
  try {
    const c = ee();
    if (!c) return null;
    const a = await c.findOne({ where: { userID: String(n || ""), type: s } });
    return a ? a.get().data : null;
  } catch {
    return null;
  }
}
r(te, "getLatestBackup");
async function fe(n) {
  try {
    const s = ee();
    if (!s) return null;
    const c = await s.findOne({
      where: { type: n },
      order: [["updatedAt", "DESC"]],
    });
    return c ? c.get().data : null;
  } catch {
    return null;
  }
}
r(fe, "getLatestBackupAny");
async function Je(n, s) {
  const c = [];
  for (const a of s) {
    const d = a.name || a.key,
      g = a.value;
    if (!d || g === void 0) continue;
    const E = a.domain || ".facebook.com",
      p = a.path || "/",
      w = E.replace(/^\./, "");
    let B = "";
    if (a.expirationDate !== void 0) {
      let D;
      if (typeof a.expirationDate == "number") {
        const t = Date.now(),
          i = 365 * 24 * 60 * 60 * 1e3;
        a.expirationDate < (t + i) / 1e3
          ? (D = new Date(a.expirationDate * 1e3))
          : (D = new Date(a.expirationDate));
      } else D = new Date(a.expirationDate);
      B = `; expires=${D.toUTCString()}`;
    } else
      a.expires &&
        (B = `; expires=${(typeof a.expires == "number" ? new Date(a.expires) : new Date(a.expires)).toUTCString()}`);
    const N = r((D = null) => {
        const t = D || E;
        let i = [`${d}=${g}${B}`];
        if (
          (i.push(`Domain=${t}`),
          i.push(`Path=${p}`),
          a.secure === !0 && i.push("Secure"),
          a.httpOnly === !0 && i.push("HttpOnly"),
          a.sameSite)
        ) {
          const y = String(a.sameSite).toLowerCase();
          ["strict", "lax", "none"].includes(y) &&
            i.push(`SameSite=${y.charAt(0).toUpperCase() + y.slice(1)}`);
        }
        return i.join("; ");
      }, "buildCookieString"),
      v = [
        { url: `http://${w}${p}`, cookieStr: N() },
        { url: `https://${w}${p}`, cookieStr: N() },
        { url: `http://www.${w}${p}`, cookieStr: N() },
        { url: `https://www.${w}${p}`, cookieStr: N() },
      ];
    for (const D of v)
      c.push(
        n.setCookie(D.cookieStr, D.url).catch((t) => {
          t instanceof Error &&
            t.message.includes("Cookie not in this host's domain");
        }),
      );
  }
  await Promise.all(c);
}
r(Je, "setJarCookies");
async function Y(n, s, c = null) {
  return se(n, s, c);
}
r(Y, "tokens");
async function le(n) {
  try {
    let s = null,
      c = null;
    if (
      (n
        ? ((s = await te(n, "cookie")), (c = await te(n, "appstate")))
        : ((s = await fe("cookie")), (c = await fe("appstate"))),
      s)
    ) {
      const a = Q(s);
      if (a.length) return (V(u, a, ".facebook.com"), !0);
    }
    if (c) {
      let a = null;
      try {
        a = JSON.parse(c);
      } catch {}
      if (Array.isArray(a)) {
        const d = a.map((g) => [g.name || g.key, g.value].join("="));
        return (V(u, d, ".facebook.com"), !0);
      }
    }
    return !1;
  } catch {
    return !1;
  }
}
r(le, "hydrateJarFromDB");
async function ue(n, s, c, a, d = !1) {
  const g = r(
      (e) =>
        !!(
          e &&
          e !== "0" &&
          /^\d+$/.test(String(e)) &&
          parseInt(String(e), 10) > 0
        ),
      "isValidUID",
    ),
    E = r(
      (e) =>
        e.find((I) => I.key === "i_user")?.value ||
        e.find((I) => I.key === "c_user")?.value ||
        e.find((I) => I.name === "i_user")?.value ||
        e.find((I) => I.name === "c_user")?.value,
      "getUID",
    ),
    p = r((e) => {
      const I = typeof e == "string" ? e : String(e ?? "");
      return (
        I.match(/"USER_ID"\s*:\s*"(\d+)"/)?.[1] ||
        I.match(
          /\["CurrentUserInitialData",\[\],\{.*?"USER_ID":"(\d+)".*?\},\d+\]/,
        )?.[1]
      );
    }, "htmlUID");
  let w = E(s);
  if ((g(w) || (w = p(n)), g(w))) return { html: n, cookies: s, userID: w };
  if (
    ((0, o.default)(
      "tryAutoLoginIfNeeded: No valid userID found, attempting recovery...",
      "warn",
    ),
    d && !n.includes("/checkpoint/block/?next"))
  )
    try {
      const I = await Promise.resolve(u.getCookies("https://www.facebook.com"));
      if (((w = E(I)), g(w))) return { html: n, cookies: I, userID: w };
    } catch {}
  if (await le(null)) {
    (0, o.default)("tryAutoLoginIfNeeded: Trying backup from DB...", "info");
    try {
      const e = await C("https://www.facebook.com/", u, null, c).then(
          (0, $.saveCookies)(u),
        ),
        I = (await a.bypassAutomation(e, u)) || e,
        F = I && I.data ? I.data : "";
      if (!F.includes("/checkpoint/block/?next")) {
        const L = p(F);
        if (g(L)) {
          const x = await Promise.resolve(
            u.getCookies("https://www.facebook.com"),
          );
          return (
            (0, o.default)(
              `tryAutoLoginIfNeeded: DB backup session valid, USER_ID=${L}`,
              "info",
            ),
            { html: F, cookies: x, userID: L }
          );
        } else
          (0, o.default)(
            `tryAutoLoginIfNeeded: DB backup session dead (HTML USER_ID=${L || "empty"}), will try API login...`,
            "warn",
          );
      }
    } catch (e) {
      (0, o.default)(
        `tryAutoLoginIfNeeded: DB backup failed - ${G(e)}`,
        "warn",
      );
    }
  }
  if (b.autoLogin !== !0 && String(b.autoLogin) !== "true")
    throw new Error(
      "AppState expired \u2014 Auto-login is disabled by default. Re-export a fresh appState, or explicitly set autoLogin=true AND apiServer to a host you trust in fca-config.json if you understand and accept that risk.",
    );
  if (!b.apiServer)
    throw new Error(
      "AppState expired \u2014 autoLogin is enabled but no apiServer is configured. Refusing to guess a third-party host; set apiServer explicitly.",
    );
  const N = b.credentials?.email || b.email,
    v = b.credentials?.password || b.password,
    D = b.credentials?.twofactor || b.twofactor || null;
  if (!N || !v)
    throw (
      (0, o.default)(
        "tryAutoLoginIfNeeded: No credentials configured for auto-login!",
        "error",
      ),
      new Error(
        "Missing credentials for auto-login (email/password not configured in fca-config.json)",
      )
    );
  (0, o.default)(
    `tryAutoLoginIfNeeded: Attempting API login for ${N.slice(0, 3)}***...`,
    "info",
  );
  const t = await Y(N, v, D);
  if (!t || !t.status)
    throw new Error(t && t.message ? t.message : "API Login failed");
  (0, o.default)(
    `tryAutoLoginIfNeeded: API login successful! UID: ${t.uid}`,
    "info",
  );
  let i = [];
  if (
    (typeof t.cookies == "string"
      ? (i = Q(t.cookies))
      : Array.isArray(t.cookies) &&
        (i = t.cookies
          .map((e) =>
            typeof e == "string"
              ? e
              : e && typeof e == "object"
                ? `${e.key || e.name}=${e.value}`
                : null,
          )
          .filter((e) => e != null)),
    i.length === 0 &&
      t.cookie &&
      (typeof t.cookie == "string"
        ? (i = Q(t.cookie))
        : Array.isArray(t.cookie) &&
          (i = t.cookie
            .map((e) =>
              typeof e == "string"
                ? e
                : e && typeof e == "object"
                  ? `${e.key || e.name}=${e.value}`
                  : null,
            )
            .filter((e) => e != null))),
    i.length === 0)
  )
    throw (
      (0, o.default)(
        "tryAutoLoginIfNeeded: No cookies found in API response",
        "warn",
      ),
      new Error("API login returned no cookies")
    );
  ((0, o.default)(
    `tryAutoLoginIfNeeded: Parsed ${i.length} cookies from API response`,
    "info",
  ),
    V(u, i, ".facebook.com"),
    await new Promise((e) => setTimeout(e, 500)));
  let y = "",
    T = null,
    k = 0;
  const _ = 3,
    m = ["https://m.facebook.com/", "https://www.facebook.com/"];
  for (; k < _;)
    try {
      const e = k === 0 ? m[0] : m[k % m.length];
      (0, o.default)(
        `tryAutoLoginIfNeeded: Refreshing ${e} (attempt ${k + 1}/${_})...`,
        "info",
      );
      const I = await C(e, u, null, c).then((0, $.saveCookies)(u));
      if (
        ((T = (await a.bypassAutomation(I, u)) || I),
        (y = T && T.data ? T.data : ""),
        y.includes("/checkpoint/block/?next"))
      )
        throw new Error("Checkpoint after API login");
      const F = p(y);
      if (g(F)) {
        (0, o.default)(
          `tryAutoLoginIfNeeded: Found valid USER_ID in HTML from ${e}: ${F}`,
          "info",
        );
        break;
      }
      if (k < _ - 1)
        ((0, o.default)(
          `tryAutoLoginIfNeeded: No valid USER_ID in HTML from ${e} (attempt ${k + 1}/${_}), retrying...`,
          "warn",
        ),
          await new Promise((L) => setTimeout(L, 1e3 * (k + 1))),
          k++);
      else {
        (0, o.default)(
          "tryAutoLoginIfNeeded: No valid USER_ID found in HTML after retries",
          "warn",
        );
        break;
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes("Checkpoint")) throw e;
      if (k < _ - 1)
        ((0, o.default)(
          `tryAutoLoginIfNeeded: Error refreshing page (attempt ${k + 1}/${_}): ${G(e)}`,
          "warn",
        ),
          await new Promise((I) => setTimeout(I, 1e3 * (k + 1))),
          k++);
      else throw e;
    }
  const M = await Promise.resolve(u.getCookies("https://www.facebook.com")),
    q = E(M),
    R = p(y);
  let l = null;
  if (
    (g(R)
      ? ((l = R),
        (0, o.default)(
          `tryAutoLoginIfNeeded: Using USER_ID from HTML: ${l}`,
          "info",
        ))
      : g(q)
        ? ((l = q),
          (0, o.default)(
            `tryAutoLoginIfNeeded: Using USER_ID from cookies: ${l}`,
            "info",
          ))
        : g(t.uid) &&
          ((l = t.uid),
          (0, o.default)(
            `tryAutoLoginIfNeeded: Using USER_ID from API response: ${l}`,
            "info",
          )),
    !g(l))
  )
    throw (
      (0, o.default)(
        `tryAutoLoginIfNeeded: HTML check - USER_ID from HTML: ${R || "none"}, from cookies: ${q || "none"}, from API: ${t.uid || "none"}`,
        "error",
      ),
      new Error(
        "Login failed - could not get valid userID after API login. HTML may indicate session is not established.",
      )
    );
  return (
    g(R) ||
      (0, o.default)(
        "tryAutoLoginIfNeeded: WARNING - HTML does not show valid USER_ID, but proceeding with cookie-based UID",
        "warn",
      ),
    { html: y, cookies: M, userID: l }
  );
}
r(ue, "tryAutoLoginIfNeeded");
function ze(n, s, c, a) {
  return async function () {
    const d = s || b.credentials?.email,
      g = c || b.credentials?.password,
      E = b.credentials?.twofactor || null;
    if (!d || !g) return;
    const p = await Y(d, g, E);
    if (p && p.status && Array.isArray(p.cookies)) {
      const w = p.cookies.map((B) => `${B.key || B.name}=${B.value}`);
      (V(n, w, ".facebook.com"),
        await C("https://www.facebook.com/", n, null, a).then(
          (0, $.saveCookies)(n),
        ));
    } else throw new Error(p && p.message ? p.message : "Login failed");
  };
}
r(ze, "makeLogin");
function de(n, s, c, a, d, g) {
  Pe = (0, Ne.createRequestCore)();
  C = Pe.get;
  ae = Pe.post;
  u = Pe.jar;
  Fe = Pe.makeDefaults;
  try {
    const E = ".facebook.com",
      p = o.default,
      w = { spinner: null };
    let N = r((v) => {
      if (!v) return null;
      let D = v;
      if (typeof v == "string")
        try {
          D = JSON.parse(v);
        } catch {
          return null;
        }
      if (Array.isArray(D)) {
        const t = D.find((y) => y.key === "c_user" || y.name === "c_user");
        if (t) return t.value;
        const i = D.find((y) => y.key === "i_user" || y.name === "i_user");
        if (i) return i.value;
      }
      return null;
    }, "extractUIDFromAppState")(n);
    (async () => {
      typeof p.showBanner == "function" && (await p.showBanner());
      try {
        if (n) {
          if (Array.isArray(n) && n.some((t) => t.name))
            n = n.map(
              (t) => (t.name && !t.key && ((t.key = t.name), delete t.name), t),
            );
          else if (typeof n == "string") {
            let t = n;
            try {
              t = JSON.parse(n);
            } catch {}
            if (Array.isArray(t)) n = t;
            else {
              const i = [];
              (n.split(";").forEach((y) => {
                const [T, k] = y.split("=");
                T &&
                  k &&
                  i.push({
                    key: T.trim(),
                    value: k.trim(),
                    domain: ".facebook.com",
                    path: "/",
                    expires: new Date().getTime() + 1e3 * 60 * 60 * 24 * 365,
                  });
              }),
                (n = i));
            }
          }
          if (Array.isArray(n)) await Je(u, n);
          else throw new Error("Invalid appState format");
        }
        if (s) {
          let t = [];
          (typeof s == "string"
            ? (t = Q(s))
            : Array.isArray(s)
              ? (t = s.map(String).filter(Boolean))
              : s &&
                typeof s == "object" &&
                (t = Object.entries(s).map(([i, y]) => `${i}=${y}`)),
            t.length && V(u, t, E));
        }
      } catch (t) {
        return g(t);
      }
      const v = { globalOptions: d, options: d, reconnectAttempts: 0 };
      if (
        ((v.bypassAutomation = async function (t, i) {
          ((W.fca = W.fca || {}),
            (W.fca.BypassAutomationNotification =
              this.bypassAutomation.bind(this)));
          const y = r((l) => (typeof l == "string" ? l : String(l ?? "")), "s"),
            T = r(
              (l) =>
                l?.request?.res?.responseUrl ||
                (l?.config?.baseURL
                  ? new URL(
                      String(l.config.url || "/"),
                      String(l.config.baseURL),
                    ).toString()
                  : l?.config?.url || ""),
              "u",
            ),
            k = r(
              (l) =>
                typeof T(l) == "string" &&
                T(l).includes("checkpoint/601051028565049"),
              "isCp",
            ),
            _ = r(async () => {
              try {
                const l =
                  typeof i?.getCookies == "function"
                    ? await i.getCookies("https://www.facebook.com")
                    : [];
                return (
                  l.find((e) => e.key === "i_user")?.value ||
                  l.find((e) => e.key === "c_user")?.value
                );
              } catch {
                return;
              }
            }, "cookieUID"),
            m = r(
              (l) =>
                y(l).match(/"USER_ID"\s*:\s*"(\d+)"/)?.[1] ||
                y(l).match(
                  /\["CurrentUserInitialData",\[\],\{.*?"USER_ID":"(\d+)".*?\},\d+\]/,
                )?.[1],
              "htmlUID",
            ),
            M = r(async (l) => (await _()) || m(l), "getUID"),
            q = r(
              async () =>
                C("https://www.facebook.com/", i, null, this.options).then(
                  (0, $.saveCookies)(i),
                ),
              "refreshJar",
            ),
            R = r(async (l) => {
              const e = y(l),
                I = await M(e),
                F =
                  (0, z.getFrom)(e, '"DTSGInitData",[],{"token":"', '",') ||
                  e.match(/name="fb_dtsg"\s+value="([^"]+)"/)?.[1],
                L =
                  (0, z.getFrom)(e, 'name="jazoest" value="', '"') ||
                  (0, z.getFrom)(e, "jazoest=", '",') ||
                  e.match(/name="jazoest"\s+value="([^"]+)"/)?.[1],
                x =
                  (0, z.getFrom)(e, '["LSD",[],{"token":"', '"}') ||
                  e.match(/name="lsd"\s+value="([^"]+)"/)?.[1];
              (await ae(
                "https://www.facebook.com/api/graphql/",
                i,
                {
                  av: I,
                  fb_dtsg: F,
                  jazoest: L,
                  lsd: x,
                  fb_api_caller_class: "RelayModern",
                  fb_api_req_friendly_name: "FBScrapingWarningMutation",
                  variables: "{}",
                  server_timestamps: !0,
                  doc_id: 6339492849481770,
                },
                null,
                this.options,
              ).then((0, $.saveCookies)(i)),
                (0, o.default)(
                  "Facebook automation warning detected, handling...",
                  "warn",
                ),
                (this.reconnectAttempts = 0));
            }, "bypass");
          try {
            if (t) {
              if (k(t)) {
                await R(y(t.data));
                const e = await q();
                return (
                  k(e)
                    ? (0, o.default)(
                        "Checkpoint still present after refresh",
                        "warn",
                      )
                    : (0, o.default)(
                        "Bypass complete, cookies refreshed",
                        "info",
                      ),
                  e
                );
              }
              return t;
            }
            const l = await C(
              "https://www.facebook.com/",
              i,
              null,
              this.options,
            ).then((0, $.saveCookies)(i));
            if (k(l)) {
              await R(y(l.data));
              const e = await q();
              return (
                k(e)
                  ? (0, o.default)(
                      "Checkpoint still present after refresh",
                      "warn",
                    )
                  : (0, o.default)(
                      "Bypass complete, cookies refreshed",
                      "info",
                    ),
                e
              );
            }
            return l;
          } catch (l) {
            return (
              (0, o.default)(`Bypass automation error: ${G(l)}`, "error"),
              t
            );
          }
        }),
        n || s)
      ) {
        const t = await C("https://www.facebook.com/", u, null, d).then(
          (0, $.saveCookies)(u),
        );
        return (await v.bypassAutomation(t, u)) || t;
      }
      if (await le(null)) {
        (0, o.default)(
          "AppState backup live \u2014 proceeding to login",
          "info",
        );
        const t = await C("https://www.facebook.com/", u, null, d).then(
          (0, $.saveCookies)(u),
        );
        return (await v.bypassAutomation(t, u)) || t;
      }
      return (
        (0, o.default)(
          "AppState expired \u2014 proceeding to email/password login",
          "warn",
        ),
        C("https://www.facebook.com/", null, null, d)
          .then((0, $.saveCookies)(u))
          .then(ze(u, c, a, d))
          .then(function () {
            return C("https://www.facebook.com/", u, null, d).then(
              (0, $.saveCookies)(u),
            );
          })
      );
    })()
      .then(async function (v) {
        const D = {};
        ((D.options = d),
          (D.bypassAutomation = async function (f, h) {
            ((W.fca = W.fca || {}),
              (W.fca.BypassAutomationNotification =
                this.bypassAutomation.bind(this)));
            const S = r(
                (A) => (typeof A == "string" ? A : String(A ?? "")),
                "s",
              ),
              U = r(
                (A) =>
                  A?.request?.res?.responseUrl ||
                  (A?.config?.baseURL
                    ? new URL(
                        String(A.config.url || "/"),
                        String(A.config.baseURL),
                      ).toString()
                    : A?.config?.url || ""),
                "u",
              ),
              H = r(
                (A) =>
                  typeof U(A) == "string" &&
                  U(A).includes("checkpoint/601051028565049"),
                "isCp",
              ),
              J = r(async () => {
                try {
                  const A =
                    typeof h?.getCookies == "function"
                      ? await h.getCookies("https://www.facebook.com")
                      : [];
                  return (
                    A.find((P) => P.key === "i_user")?.value ||
                    A.find((P) => P.key === "c_user")?.value
                  );
                } catch {
                  return;
                }
              }, "cookieUID"),
              X = r(
                (A) =>
                  S(A).match(/"USER_ID"\s*:\s*"(\d+)"/)?.[1] ||
                  S(A).match(
                    /\["CurrentUserInitialData",\[\],\{.*?"USER_ID":"(\d+)".*?\},\d+\]/,
                  )?.[1],
                "htmlUID",
              ),
              he = r(async (A) => (await J()) || X(A), "getUID"),
              we = r(
                async () =>
                  C("https://www.facebook.com/", h, null, this.options).then(
                    (0, $.saveCookies)(h),
                  ),
                "refreshJar",
              ),
              ge = r(async (A) => {
                const P = S(A),
                  ye = await he(P),
                  ke =
                    (0, z.getFrom)(P, '"DTSGInitData",[],{"token":"', '",') ||
                    P.match(/name="fb_dtsg"\s+value="([^"]+)"/)?.[1],
                  Ie =
                    (0, z.getFrom)(P, 'name="jazoest" value="', '"') ||
                    (0, z.getFrom)(P, "jazoest=", '",') ||
                    P.match(/name="jazoest"\s+value="([^"]+)"/)?.[1],
                  De =
                    (0, z.getFrom)(P, '["LSD",[],{"token":"', '"}') ||
                    P.match(/name="lsd"\s+value="([^"]+)"/)?.[1];
                (await ae(
                  "https://www.facebook.com/api/graphql/",
                  h,
                  {
                    av: ye,
                    fb_dtsg: ke,
                    jazoest: Ie,
                    lsd: De,
                    fb_api_caller_class: "RelayModern",
                    fb_api_req_friendly_name: "FBScrapingWarningMutation",
                    variables: "{}",
                    server_timestamps: !0,
                    doc_id: 6339492849481770,
                  },
                  null,
                  this.options,
                ).then((0, $.saveCookies)(h)),
                  (0, o.default)(
                    "Facebook automation warning detected, handling...",
                    "warn",
                  ));
              }, "bypass");
            try {
              if (v && H(v)) {
                await ge(S(v.data));
                const A = await we();
                return (
                  H(A) ||
                    (0, o.default)(
                      "Bypass complete, cookies refreshed",
                      "info",
                    ),
                  A
                );
              }
              return v;
            } catch {
              return v;
            }
          }),
          typeof p.startSpinner == "function" &&
            (w.spinner = await p.startSpinner(
              "fca: Checking session status...",
            )));
        const t = (await D.bypassAutomation(v, u)) || v;
        (typeof p.persistCheckpointOk == "function"
          ? p.persistCheckpointOk(w.spinner)
          : w.spinner && typeof w.spinner.stopAndPersist == "function"
            ? w.spinner.stopAndPersist({
                symbol: "\u2139",
                text: "fca: No checkpoint detected",
              })
            : (0, o.default)("SESSION: No checkpoint detected", "info"),
          (w.spinner = null),
          typeof p.startSpinner == "function" &&
            (w.spinner = await p.startSpinner("fca: Finalizing login...")));
        let i = t && t.data ? t.data : "",
          y = await Promise.resolve(u.getCookies("https://www.facebook.com"));
        const T = r(
            (f) =>
              f.find((h) => h.key === "i_user")?.value ||
              f.find((h) => h.key === "c_user")?.value ||
              f.find((h) => h.name === "i_user")?.value ||
              f.find((h) => h.name === "c_user")?.value,
            "getUIDFromCookies",
          ),
          k = r((f) => {
            const h = typeof f == "string" ? f : String(f ?? "");
            return (
              h.match(/"USER_ID"\s*:\s*"(\d+)"/)?.[1] ||
              h.match(
                /\["CurrentUserInitialData",\[\],\{.*?"USER_ID":"(\d+)".*?\},\d+\]/,
              )?.[1]
            );
          }, "getUIDFromHTML"),
          _ = r(
            (f) =>
              !!(
                f &&
                f !== "0" &&
                /^\d+$/.test(String(f)) &&
                parseInt(String(f), 10) > 0
              ),
            "isValidUID",
          );
        let m = T(y);
        if ((_(m) || (m = k(i)), !_(m) && N && _(N) && (m = N), !_(m))) {
          (0, o.default)(
            "Invalid userID detected (missing or 0), attempting auto-login...",
            "warn",
          );
          const f = await ue(i, y, d, D, !!(n || s));
          ((i = f.html), (y = f.cookies), (m = f.userID));
          const h = k(i);
          if (_(h))
            ((m = h),
              (0, o.default)(
                `After auto-login, using USER_ID from HTML: ${m}`,
                "info",
              ));
          else {
            (0, o.default)(
              "After auto-login, HTML still does not contain valid USER_ID. Session may not be established.",
              "error",
            );
            try {
              const S = await C("https://www.facebook.com/", u, null, d).then(
                  (0, $.saveCookies)(u),
                ),
                U = S && S.data ? S.data : "",
                H = k(U);
              if (_(H))
                ((i = U),
                  (m = H),
                  (0, o.default)(
                    `After refresh, found valid USER_ID in HTML: ${m}`,
                    "info",
                  ));
              else
                throw new Error(
                  "Login failed - HTML does not show valid USER_ID after auto-login and refresh",
                );
            } catch (S) {
              throw new Error(
                `Login failed - Could not establish valid session. HTML USER_ID check failed: ${G(S)}`,
              );
            }
          }
        }
        if (i.includes("/checkpoint/block/?next"))
          throw (
            (0, o.default)(
              "FCA_ERROR_APPSTATE_EXPIRED: AppState is invalid or expired. Please export a fresh appState.",
              "error",
            ),
            new Error("Checkpoint")
          );
        let M = k(i);
        if (!_(M))
          if (_(m)) {
            (0, o.default)(
              `HTML shows USER_ID=${M || "none"} but cookies have valid UID=${m}. Attempting to activate session...`,
              "warn",
            );
            try {
              (await new Promise((U) => setTimeout(U, 1e3)),
                (0, o.default)(
                  "Trying to activate session via m.facebook.com/home.php...",
                  "info",
                ));
              const f = await C(
                  "https://m.facebook.com/home.php",
                  u,
                  null,
                  d,
                ).then((0, $.saveCookies)(u)),
                h = f && f.data ? f.data : "",
                S = k(h);
              if (_(S))
                ((i = h),
                  (M = S),
                  (m = S),
                  (0, o.default)(
                    `Session activated! Found valid USER_ID in HTML: ${m}`,
                    "info",
                  ));
              else {
                (await new Promise((X) => setTimeout(X, 1500)),
                  (0, o.default)(
                    "Trying to activate session via www.facebook.com/home.php...",
                    "info",
                  ));
                const U = await C(
                    "https://www.facebook.com/home.php",
                    u,
                    null,
                    d,
                  ).then((0, $.saveCookies)(u)),
                  H = U && U.data ? U.data : "",
                  J = k(H);
                _(J)
                  ? ((i = H),
                    (M = J),
                    (m = J),
                    (0, o.default)(
                      `Session activated on second try! Found valid USER_ID in HTML: ${m}`,
                      "info",
                    ))
                  : (0, o.default)(
                      `WARNING: HTML still shows USER_ID=${M || "none"} but cookies have valid UID=${m}. Proceeding with cookie-based UID.`,
                      "warn",
                    );
              }
            } catch (f) {
              (0, o.default)(
                `Failed to activate session: ${G(f)}. Proceeding with cookie-based UID.`,
                "warn",
              );
            }
          } else
            throw (
              (0, o.default)(
                `Final HTML validation failed - USER_ID from HTML: ${M || "none"}, from cookies: ${m || "none"}`,
                "error",
              ),
              new Error(
                "Login validation failed - HTML does not contain valid USER_ID. Session may not be properly established.",
              )
            );
        if (!_(m))
          throw (
            (0, o.default)(
              `No valid USER_ID found - HTML: ${M || "none"}, Cookies: ${m || "none"}`,
              "error",
            ),
            new Error(
              "Login validation failed - No valid USER_ID found in HTML or cookies.",
            )
          );
        let q,
          R = "PRN",
          l,
          e;
        try {
          const f = i.match(/"endpoint":"([^"]+)"/),
            h = f ? null : i.match(/endpoint\\":\\"([^\\"]+)\\"/),
            S = (f && f[1]) || (h && h[1]);
          (S && (q = S.replace(/\\\//g, "/")), (R = He(i)));
          const U = xe.get(R);
          U
            ? (0, o.default)(`REGION: ${R} (${U.name})`, "info")
            : (0, o.default)(`REGION: ${R} (Server)`, "info");
        } catch {
          (0, o.default)("Not MQTT endpoint", "warn");
        }
        try {
          const f = String(i).match(
            /\["CurrentUserInitialData",\[\],({.*?}),\d+\]/,
          );
          if (f) {
            const h = JSON.parse(f[1]);
            if (
              ((0, o.default)(`ACCOUNT: ${h.NAME} (${h.USER_ID})`, "info"),
              !_(h.USER_ID))
            ) {
              (0, o.default)(
                "Facebook response shows invalid USER_ID (0 or empty), session is dead!",
                "warn",
              );
              const S = await ue(i, y, d, D, !!(n || s));
              if (((i = S.html), (y = S.cookies), (m = S.userID), !_(m)))
                throw new Error(
                  "Auto-login failed - could not get valid userID",
                );
            }
          } else m && (0, o.default)(`ACCOUNT: ${m}`, "info");
        } catch (f) {
          if (f instanceof Error && f.message.includes("Auto-login failed"))
            throw f;
        }
        const I = i.match(/DTSGInitialData.*?token":"(.*?)"/);
        I && (l = I[1]);
        try {
          m && (await qe(u, m));
        } catch {}
        Promise.resolve()
          .then(function () {
            if (O.default && typeof O.default.syncAll == "function")
              return O.default.syncAll();
          })
          .catch(function (f) {
            const h = G(f);
            (0, o.default)(`Database connection failed: ${h}`, "warn");
          });
        const F = new Me.default(),
          L = (0, Z.createFcaState)({
            userID: m,
            jar: u,
            globalOptions: d,
            lastSeqId: e,
            mqttEndpoint: q,
            region: R,
            fb_dtsg: l,
            clientID: ((Math.random() * 2147483648) | 0).toString(16),
            clientId:
              (0, z.getFrom)(i, '["MqttWebDeviceID",[],{"clientID":"', '"}') ||
              "",
            emitter: F,
            bypassAutomation: D.bypassAutomation,
          });
        L.performAutoLogin = async () => {
          try {
            const f = b.credentials?.email || c,
              h = b.credentials?.password || a,
              S = b.credentials?.twofactor || null;
            if (!f || !h) return !1;
            const U = await Y(f, h, S);
            if (!(U && U.status && Array.isArray(U.cookies))) return !1;
            const H = U.cookies.map((J) => `${J.key || J.name}=${J.value}`);
            return (
              V(u, H, ".facebook.com"),
              await C("https://www.facebook.com/", u, null, d).then(
                (0, $.saveCookies)(u),
              ),
              !0
            );
          } catch {
            return !1;
          }
        };
        const x = (0, Z.createApiFacade)({
            globalOptions: d,
            jar: u,
            userID: m,
            emitter: F,
            setOptions: Re.setOptions,
            getAppState: $.getAppState,
            cookieHeaderFromJar: re,
            getLatestBackup: te,
          }),
          oe = Fe(i, m, L);
        (0, Z.attachThreadUpdater)(L, O.default, o.default);
        let K = null;
        try {
          b &&
            b.remoteControl &&
            b.remoteControl.enabled &&
            (K = (0, $e.createRemoteClient)(x, L, b.remoteControl));
        } catch (f) {
          (0, o.default)(
            `Remote control initialization failed: ${G(f)}`,
            "warn",
          );
        }
        K && (x.remote = K);
        const {
          loaded: ne,
          skipped: ie,
          namespaces: pe,
        } = (0, Se.attachLegacyApiSurface)(x, oe, L, o.default);
        ((0, Te.attachThreadInfoRealtimeSync)(L, O.default, o.default, x),
          typeof p.runMethodLoadProgress == "function" &&
            (await p.runMethodLoadProgress(ne)));
        const me = (0, _e.attachClientFacade)(x, pe);
        ((L.client = me),
          (0, o.default)(
            `READY: Loaded ${ne} API methods${ie ? `, skipped ${ie} duplicates` : ""}`,
            "success",
          ),
          (L._fbDtsgRefreshInterval = (0, Ce.attachMqttCompatibility)(x, {
            logger: o.default,
            refreshIntervalMs: 864e5,
          })),
          typeof p.persistLoginSuccess == "function"
            ? p.persistLoginSuccess(w.spinner)
            : w.spinner &&
              typeof w.spinner.succeed == "function" &&
              w.spinner.succeed("fca: Login successful!"),
          (0, o.default)("AUTH: Login successful!", "success"),
          g(null, x));
      })
      .catch(function (v) {
        (typeof p.persistLoginFail == "function"
          ? p.persistLoginFail(w.spinner)
          : w.spinner &&
            typeof w.spinner.fail == "function" &&
            w.spinner.fail(`fca: Login failed - ${G(v)}`),
          g(v));
      });
  } catch (E) {
    g(E);
  }
}
r(de, "loginHelper");
const Ge = Object.assign(de, {
  loginHelper: de,
  tokensViaAPI: se,
  loginViaAPI: Be,
  tokens: Y,
  normalizeCookieHeaderString: Q,
  setJarFromPairs: V,
});
var Ye = Ge;
export { Ye as default };
