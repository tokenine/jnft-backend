export function publishMessageEncoder(payload: any) {
  const { EVENTMESSAGE } = payload
  let message_ = ""
  if (typeof payload === "string") {
    if (!payload.includes("TEXT::")) {
      message_ = "TEXT::" + payload
    }
  } else {
    if (EVENTMESSAGE) {
      if (EVENTMESSAGE.includes('"dataType":"Map"')) {
        message_ = "JSON::" + EVENTMESSAGE
      }
    } else {
      message_ = "JSON::" + JSON.stringify(payload)
    }
  }

  return message_
}
