import assert from "node:assert/strict";
import * as fca from "./lib/index.js";
import { createDefaultContext, createFcaState, createStateStore } from "./lib/core/state.js";

function assertNoNetworkSurface() {
  assert.equal(typeof fca.loginAsync, "function");
  assert.equal(typeof fca.login, "function");
  assert.equal(typeof fca.normalizeCookieHeaderString, "function");
  assert.equal(typeof createDefaultContext, "function");
  assert.equal(typeof createStateStore, "function");
  assert.equal(typeof createFcaState, "function");
}

function testCookieNormalization() {
  const normalized = fca.normalizeCookieHeaderString(" c_user=offline-user ; xs=offline-token ");
  assert.deepEqual(normalized, ["c_user=offline-user", "xs=offline-token"]);
}

function testStateStore() {
  const store = createStateStore({ initial: "value" });
  assert.equal(store.initial, "value");
  assert.equal(store.__set("status", "offline"), "offline");
  assert.equal(store.status, "offline");
  assert.equal(store.__merge({ ready: false }), store);
  assert.deepEqual(store.__snapshot(), { initial: "value", status: "offline", ready: false });
}

function testOfflineContext() {
  const context = createDefaultContext();
  assert.equal(typeof context, "object");
  assert.equal(typeof context.clientId, "string");
  assert.equal(context.mqttClient, null);

  const state = createFcaState({
    userID: "offline-user",
    globalOptions: { listenEvents: false, autoReconnect: false },
    access_token: "offline-placeholder",
    region: "offline",
    clientId: "offline-client",
  });
  assert.equal(state.userID, "offline-user");
  assert.equal(state.loggedIn, true);
  assert.equal(state.mqttClient, null);
  assert.equal(state.options.autoReconnect, false);
}

assertNoNetworkSurface();
testCookieNormalization();
testStateStore();
testOfflineContext();
console.log("offline tests passed: exports, cookie normalization, state store, and context initialization");
console.log("network actions skipped: login, MQTT, Graph/API requests, and message sending");
