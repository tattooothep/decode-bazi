"use strict";

function expoIosPushReady(env = process.env) {
  return env.EXPO_IOS_PUSH_READY === "true";
}

function effectiveZiweiPayloadSchema(platform, requestedSchema, env = process.env) {
  return platform === "ios" && !expoIosPushReady(env) ? 0 : requestedSchema;
}

function effectiveAstronomyFactPayloadSchema(requestedSchema) {
  return requestedSchema === 1 ? 1 : 0;
}

function r8ScienceProviderDeliveryReady(scienceId) {
  if (scienceId !== "astronomy_fact" && scienceId !== "qizheng") return false;
  return false;
}

module.exports = Object.freeze({
  effectiveAstronomyFactPayloadSchema,
  effectiveZiweiPayloadSchema,
  expoIosPushReady,
  r8ScienceProviderDeliveryReady,
});
