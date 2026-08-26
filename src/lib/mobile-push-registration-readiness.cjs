"use strict";

function expoIosPushReady(env = process.env) {
  return env.EXPO_IOS_PUSH_READY === "true";
}

function effectiveZiweiPayloadSchema(platform, requestedSchema, env = process.env) {
  return platform === "ios" && !expoIosPushReady(env) ? 0 : requestedSchema;
}

module.exports = Object.freeze({ effectiveZiweiPayloadSchema, expoIosPushReady });
