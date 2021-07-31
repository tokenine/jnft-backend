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

export async function defaultMessageListener (channel: string, _message: string) {
  try {
    console.log("On Message Published", channel, _message)
    const [GROUP, client] = channel.split("::");

    console.log(Object.keys($SSE.activeResponder))

    let receiverList: string[] = [];
    
    // Send to all
    if (client.toLowerCase() === "all") {
      // receiverList = [ ...receiverList, ...Object.keys($SSE.clients[GROUP]) ];
      receiverList = await $Redis.clients.db.main.zrange(`${$Redis.KEY_PREFIX.PUBSUB.CHANNEL}/ALLCLIENT`, 0, -1);
    } else {
      
      // Send to single user
      if (GROUP === "USER") {
        receiverList.push(channel);
      } else {
        receiverList = await $Redis.clients.db.main.zrange(`${$Redis.KEY_PREFIX.PUBSUB.CHANNEL}/${channel}`, 0, -1)
      }
    }

    console.log("Receiver List", receiverList)

    const format = _message.substring(0, 6)
  
    if (format === "JSON::") {
      const { message, id, event } = JSON.parse(_message.substring(6))
      // console.log(_message, message, event);

      $SSE.broadcastMessage(receiverList, ({ receiverId }: any) => ({ data: { event, id: id || channel, message } }));
    } else {
      const message = extractMessageByKey(_message, "/::MESSAGE::")
      const event = extractMessageByKey( _message, "/::EVENT::")
      const id = extractMessageByKey(_message, "/::ID::")
      // console.log(_message, message, event);
  
      $SSE.broadcastMessage(receiverList, ({ receiverId }: any) => ({ data: { event, id: id || channel, message } }));
    }

  } catch (error) {
    console.error(error);
  }
}

export async function defaultPatternListener (pattern: string, channel: string, _message: string) {
  try {
    console.log("On Pattern Published", pattern, channel, _message)

    const [ CHANNEL, TARGET_GROUP ] = channel.split("=>");
    // const [ CHANNEL_TYPE, CHANNEL_NAME, TARGET_GROUP ] = channel.split("::");
    console.log(TARGET_GROUP, CHANNEL);

    let receiverList: string[] = await $Redis.clients.db.main.zrange(`${$Redis.KEY_PREFIX.PUBSUB.CHANNEL}/${CHANNEL}`, 0, -1);

    console.log(`Active Responder: ${Object.keys($SSE.activeResponder)}`)

    // let receiverList: string[] = [];
    
    // const [GROUP, client] = channel.split("::");
    // Send to all
    // if (client.toLowerCase() === "all") {
    //   // receiverList = [ ...receiverList, ...Object.keys($SSE.clients[GROUP]) ];
    //   receiverList = await $Redis.clients.db.main.zrange(`${$Redis.KEY_PREFIX.PUBSUB.CHANNEL}/ALLCLIENT`, 0, -1);
    // } else {

    //   const receiverList = await $Redis.clients.db.main.zrange(`${$Redis.KEY_PREFIX.PUBSUB.CHANNEL}/${channel}`)

    //   // Send to single user
    //   if (GROUP === "USER") {
    //     receiverList.push(channel);
    //   } else {
    //     receiverList = await $Redis.clients.db.main.zrange(`${$Redis.KEY_PREFIX.PUBSUB.CHANNEL}/${channel}`, 0, -1)
    //   }
    // }

    console.log("Receiver List", receiverList)

    const format = _message.substring(0, 6)
  
    if (format === "JSON::") {
      const { message, id, event } = JSON.parse(_message.substring(6))
      // console.log(_message, message, event);

      $SSE.broadcastMessage(receiverList, ({ receiverId }: any) => ({ data: { event, id: id || channel, message } }));
    } else {
      const message = extractMessageByKey(_message, "/::MESSAGE::")
      const event = extractMessageByKey( _message, "/::EVENT::")
      const id = extractMessageByKey(_message, "/::ID::")
      // console.log(_message, message, event);
  
      $SSE.broadcastMessage(receiverList, ({ receiverId }: any) => ({ data: { event, id: id || channel, message } }));
    }

  } catch (error) {
    console.error(error);
  }
}
