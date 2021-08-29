export const registry = new Map()

const allowFeatures = [
  "PUBSUB:EVENT:CREATE",
  "PUBSUB:EVENT:REMOVE",
  "PUBSUB:EVENT:SUBSCRIBE",
  "PUBSUB:EVENT:UNSUBSCRIBE",
  "PUBSUB:EVENT:PUBLISH",
  "KEYGEN:PUBSUB-CHANNEL",
  "KEYGEN:CLIENT-SUBSCRIPTION",
]

allowFeatures.map((feature: any) => registry.set(feature, true))

export const $FeatureControl: any = {
  registry,
  load,
  check,
  toggle,
}

function load (key: string, fn: () => any) {
  if (check(key)) {
    return fn
  }
  return featureUnavailable(key)
}

function check (key: string) {
  return registry.has(key);
}

function toggle (key: string) {

}

function featureUnavailable (key: string) {
  return function () {
    return {
      message: "Feature is not available"
    }
  }
}
