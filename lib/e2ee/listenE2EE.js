"use strict";

var logger = require("../utils/nexca-logger");
var EventEmitter = require("events");

/**
 * listenE2EE — يدمج رسائل E2EE مع تيار MQTT العادي
 *
 * يستبدل api.listenMqtt تلقائياً بعد connectE2EE حتى يعمل البوت
 * بدون تغيير — سواء كانت الرسائل عادية أو مشفرة.
 *
 * FIX #1 — guard ضد infinite recursion: يرفض الاستدعاء إذا لم تُحفَظ
 *           _listenMqttRaw (أي تم استدعاؤه قبل connectE2EE).
 * FIX #2 — globalOptions?.selfListen: يتجنب crash إذا ctx.globalOptions undefined.
 * FIX #3 — E2EE disconnect صريح عند stopListening حتى لو !ctx.e2ee.connected.
 */
module.exports = function createListenE2EE(api, ctx) {
    // ── FIX #1: guard ضد infinite recursion ─────────────────────────────────
    if (!api._listenMqttRaw) {
        throw new Error(
            "[listenE2EE] api._listenMqttRaw not found.\n" +
            "  listenE2EE must be called after connectE2EE(), which saves the original listenMqtt.\n" +
            "  If you called connectE2EE() and still see this, make sure you did not call\n" +
            "  attachThreadFilter() or any other wrapper AFTER connectE2EE()."
        );
    }

    return function listenE2EE(callback) {
        class CombinedEmitter extends EventEmitter {
            stopListening(cb) {
                // إيقاف MQTT
                if (api._mqttEmitter && typeof api._mqttEmitter.stopListening === "function") {
                    api._mqttEmitter.stopListening(cb);
                } else if (typeof cb === "function") {
                    cb([]);
                }
                // ── FIX #3: disconnect E2EE دائماً عند الإيقاف ─────────────
                const e2ee = api.e2ee || ctx.e2ee;
                if (e2ee && typeof e2ee.disconnect === "function") {
                    e2ee.disconnect().catch(() => {});
                }
            }
            stopListeningAsync() {
                return new Promise((res) => this.stopListening(res));
            }
        }

        const emitter = new CombinedEmitter();

        const isCallbackMode = typeof callback === "function";
        const globalCallback = isCallbackMode ? callback : function (err, event) {
            if (err) return emitter.emit("error", err);
            emitter.emit("message", event);
        };

        // ── بدء MQTT الأصلي (دائماً من _listenMqttRaw) ───────────────────────
        const mqttEmitter = api._listenMqttRaw.call(api, globalCallback);
        api._mqttEmitter = mqttEmitter;

        // ── ربط E2EE إذا كان متصلاً ───────────────────────────────────────
        const e2ee = api.e2ee || ctx.e2ee;
        if (!e2ee || !e2ee.isConnected()) {
            logger.warn(
                "listenE2EE",
                "E2EE not connected. DM (Secret Conversation) messages will not be received. " +
                "Call api.connectE2EE() before listenE2EE() to enable encrypted messages."
            );
        } else {
            e2ee.onMessage(function (err, event) {
                if (err) return globalCallback(err, null);
                if (!event) return;

                // ── FIX #2: globalOptions?.selfListen — آمن ضد undefined ────
                if (!ctx.globalOptions?.selfListen && event.senderID === ctx.userID) return;

                event.isE2EE = true;
                globalCallback(null, event);
            });

            logger.success("listenE2EE", "Combined MQTT + E2EE (Signal/Noise) listener active.");
        }

        return emitter;
    };
};
