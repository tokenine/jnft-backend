import { Request, Response } from 'express'
import { $SSE, $Redis } from '..';

export const $PubSub = {
  // defaultChannels: ['main', 'test'] // Auto Subscribe on load
}

export default $PubSub;

// $PubSub.defaultChannels.forEach((channel: string) => $Redis.clients.subscriber.to(channel));

// $Redis.clients.subscriber.main.onMessage(defaultMssageDigest)

function extractMessageByKey(message: string, key: string) {
  if (message && key) {
    const message_ = message.split(key)[1];
    if (message_) {
      return message_.split("/::")[0];
    }
  }
  return ""
}

export function subscribeHandler (req: Request, res: Response) {

}

export async function defaultMessageListener (channel: string, payload: string) {
  try {
    console.log("On Message Published", channel, payload)
    const [GROUP, client] = channel.split("::");

    console.log(Object.keys($SSE.activeResponder))

    let receiverList: string[] = [];
    
    // Send to all
    if (client.toLowerCase() === "all") {
      // receiverList = [ ...receiverList, ...Object.keys($SSE.clients[GROUP]) ];
      receiverList = await $Redis.clients.db.main.zrange(`${$Redis.KEY_PREFIX.PUBSUB.CHANNEL}/ALLCLIENT`, 0, -1);
      console.log("Sending to all user", receiverList)
    } else {
      
      // Send to single user
      if (GROUP === "USER") {
        receiverList.push(channel);
      } else {
        receiverList = await $Redis.clients.db.main.zrange(`${channel}`, 0, -1)
      }
      console.log("Sending to Receiver List", receiverList)
    }


    const { message, id, event } = publishMessageDecoder(payload)
    $SSE.broadcastMessage(receiverList, ({ receiverId }: any) => ({ data: { event, id: id || channel, message } }));

  } catch (error) {
    console.error(error);
  }
}

export async function defaultPatternListener (pattern: string, channel: string, payload: string) {
  try {
    console.log("On Pattern Matched Publishing", pattern, channel, payload)

    const [ CHANNEL, TARGET_GROUP ] = channel.split("=>");
    // const [ CHANNEL_TYPE, CHANNEL_NAME, TARGET_GROUP ] = channel.split("::");
    // console.log(TARGET_GROUP, CHANNEL);
  
    let receiverList: string[] = await $Redis.clients.db.main.zrange(`${CHANNEL}`, 0, -1);
    // console.log(`Active Responder: ${Object.keys($SSE.activeResponder)}`)
    console.log("Sending to Receiver List", receiverList)

    const { message, id, event } = publishMessageDecoder(payload)
    $SSE.broadcastMessage(receiverList, ({ receiverId }: any) => ({ data: { event, id: id || channel, message } }));

  } catch (error) {
    console.error(error);
  }
}

function publishMessageDecoder(payload: string) {
  const format = payload.substring(0, 6)
  console.log("PublishMessageDecoder", format, payload)

  if (format === "JSON::") {
    const { message, id, event } = JSON.parse(payload.substring(6))
    // console.log(payload, message, event);
    console.log("Message Broadcasting with SSE", "in JSON")
    return { message, id, event }
  } else {
    const message = extractMessageByKey(payload, "/::MESSAGE::")
    const event = extractMessageByKey( payload, "/::EVENT::")
    const id = extractMessageByKey(payload, "/::ID::")
    // console.log(_message, message, event);
    console.log("Message Broadcasting with SSE", "in TEXT")
    return { message, id, event }
  }

}