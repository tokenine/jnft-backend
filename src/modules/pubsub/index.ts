import { Request, Response } from 'express'
import { $SSE, $Redis } from '..';
import { publishMessageEncoder, reviver } from "../../functions";

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

const queueObserverRegistry = new Map()

// createObserver("test",
//   async function obs({ id, observer }: any) {
//     console.log("Queue Observer: " + id + " => running")
//     console.log("isProcessing", observer.isProcessing)
//     return await setTimeout(() => {
//       setTimeout(() => {
//         observer.resume()
//       }, 1000)
//     }, 5000)
//   }
// )

async function publishMessage (payload: any) {
  let result_ = { status: { code: 200, message: "Event published successfully", payload }, data: { }, };
    const { action, client_id, client_role, channel_type, channel_id, now = new Date().getTime(), message } = payload;

    if ($Redis.clients.db && $Redis.clients.publisher) {
    //   // const RedisDB = $Redis.clients.db;
    //   // const RedisSubscriber = $Redis.clients.subscriber.main

    //   // Create a key to indicate event is active
    //   // RedisDB.set(``)    
    //   const CLIENT = `${client_role}::${client_id}`

    //   const KEY = `${$Redis.KEY_PREFIX.PUBSUB.CHANNEL}/${channel_type}::${channel_id}/`
    //   // Create a sorted set for add user to subscribe to the event, and add event creator to the list
    //   $Redis.clients.db.zadd(KEY, 0, `${CLIENT}`)
      // const { CLIENT, KEY } = createKeyPattern(KeyPatternType.PUBSUBCHANNEL, payload)

      const ENCODEDMESSAGE = publishMessageEncoder(payload)
      const EVENTID = ENCODEDMESSAGE // TODO: Changed to actual event id generated from payload.
      const SCORE = `${parseInt(now)}.1001`

      const KEY = `EVENT_MESSAGE_QUEUE/MAIN_QUEUE`
      // const result = await $Redis.clients.db.EMQ.zadd(KEY, SCORE, EVENTID);
      // const result = await $Redis.clients.publisher.publish(KEY, encodedMessage);

      // const result = await $Redis.clients.subscriber.main._subscriber.publish(KEY, JSON.stringify(message));
      console.log("Publish to message queue result => ", KEY, SCORE, EVENTID, ENCODEDMESSAGE)
    //   // Set subscriber client to listen to the event
    //   $Redis.clients.subscriber.main.to(KEY);
      
    //   // Publish to subscribed channel for active subscribers (Opt-in)
  }
  return result_
}

createObserver("event-message-remove",
  async function obs({ id, observer }: any) {
    const KEY = `EVENT_MESSAGE_QUEUE/DELETE_QUEUE`

        // Remove it from queue
    await $Redis.clients.db.EMQ.zremrangebyrank(KEY, 0, -1)
  },
  {},
  60000
)

createObserver("event-message-broadcast",
  async function obs({ id, observer }: any) {
    try {

      // Get latest message and receiver list to be proceeded
      const [ EVENTID, SCORE ] = await $Redis.clients.db.EMQ.zrange(`EVENT_MESSAGE_QUEUE:MAIN`, 0, 0, "WITHSCORES")
  
      if (EVENTID) {
        const [ type, rawEventMessage ] = (await $Redis.clients.db.EMQ.hget(`EVENT_MESSAGE_HISTORY:MAIN`, EVENTID)).split("::")

        // const { eventPayload, receiverList } = JSON.parse(rawEventMessage, reviver)
  
        const eventMessage = type === "JSON" && Object.fromEntries(JSON.parse(rawEventMessage, reviver))

        // const message = publishMessage(eventMessage)
        // console.log(message)
        
        // eventPayload: { event, id, data: { event, id, message } }
        const receiverList = await getReceiverList(eventMessage)
        
        // Transform Message Here
        const broadcastMessage = await transformBroadcastMessage(eventMessage);

        // console.log("Broadcast Event Message", EVENTID, SCORE, eventMessage, broadcastMessage);
        
        // Broadcast the message out
        $SSE.broadcastMessage(receiverList, ({ receiverId, payload }: any) => ({ receiverId, event: "message", id: EVENTID, data: payload }), broadcastMessage);
        
        // TODOs: 
        // Add On success handling
        // Add On fail handling
        // Add time ???
        // Store it to event history db (Asynchronously)
        //
        await $Redis.clients.db.EMQ.zadd(`EVENT_MESSAGE_SENT:MAIN`, SCORE, EVENTID)
        await $Redis.clients.db.EMQ.zrem(`EVENT_MESSAGE_QUEUE:MAIN`, EVENTID)

        // Added Notification to each receiver.
        receiverList.map(async (receiver_id: string) => await $Redis.clients.db.main.zadd(`EVENT:RELATED//${receiver_id}`, SCORE, EVENTID))
      }
  
      // As of an operation completed, set processing flag to ready for another queue
      // On completed, set processing to false
    } catch (error) {
      console.error(error)
    } finally {
      observer.resume()
    }
  },
  {},
  100
)

async function transformBroadcastMessage(eventMessage: any) {
  const { channel_type, channel_id, action } = eventMessage;
  if (action === "EVENT:SUBSCRIBE" && channel_type === "NFT") {
    return { ...eventMessage, event_code: "NFT:FOLLOW"}
  } else if (action === "EVENT:SUBSCRIBE" && channel_type === "USERFOLLOW") {
    return { ...eventMessage, event_code: "USERFOLLOW"}
  } else {
    return eventMessage
  }
}

async function getReceiverList(eventMessagePayload: any) {
  const { channel_type, channel_id, action, event_code } = eventMessagePayload;
  let receiverList: string[] = [];

  console.log("Get Receiver List", action, channel_type, channel_id)
  
  if (action === "EVENT:SUBSCRIBE" && channel_type === "NFT") {
    const owner = await $Redis.clients.db.main.hget(`NFT_INFO//${channel_id}`, `owner`)
    receiverList = [`USER::${owner}`] // TODO: Change to owner ID

  } else if (action === "EVENT:SUBSCRIBE" && channel_type === "USER:FOLLOW") {
    receiverList = [`USER::${channel_id}`]

  } else {
    const CHANNEL = `${channel_type}::${channel_id}`;
    const KEY = `${$Redis.KEY_PREFIX.PUBSUB.CHANNEL}${CHANNEL}`;
    // console.log(KEY);
    // Send to all
    // if (client.toLowerCase() === "all") {
    //   receiverList = await $Redis.clients.db.main.zrange(`${$Redis.KEY_PREFIX.PUBSUB.CHANNEL}/${CHANNEL}`, 0, -1);
    //   console.log("Sending to all user", receiverList)
    // } else {
    // }
    receiverList = await $Redis.clients.db.main.zrange(KEY, 0, -1)
  }

  return receiverList
}
      

function createObserver(id: string, fn: any, args?: any, _intervalTime = 100) {
  const observer: {
    isProcessing: boolean
    isPause: boolean
    intervalTime: number
    interval: NodeJS.Timeout | null
    pause: Function
    resume: Function
    remove: Function
  } = {
    isProcessing: false, // Internal lock
    isPause: false, // For external lock
    intervalTime: _intervalTime,
    interval: null,
    pause: () => {},
    resume: () => {},
    remove: () => {},
  }

  observer.pause = () => observer.isPause = true;
  observer.resume = () => (observer.isPause = false, observer.isProcessing = false);
  observer.remove = () => observer.interval ? clearInterval(observer.interval) : (() => {})()

  observer.interval = global.setInterval(async () => {
    // console.log("isProcessing", observer.isProcessing)
    // console.log("isPause", observer.isPause)
    // console.log(new Date().getSeconds())
    if (observer.isProcessing === false) {
      // Prevent another process by set processing flag
      observer.isProcessing = true;
      fn({ id, args, observer })
      // observer.isProcessing = false
    }
  }, observer.intervalTime)

  queueObserverRegistry.set(id, observer)

  return observer
}

export async function messageQueueAppend(payload: any, channel: string, receiverList: string[]) {
  const now = new Date().getTime()
  const KEY = `EVENT_MESSAGE_QUEUE`
  const eventPayload = eventInterceptor(redisPublishMessageDecoder(payload))

  console.log("messageQueueAppend", eventPayload, receiverList)
  // Store Event to queue and check for existense
  // If it's already there, skip it.

  await $Redis.clients.db.main.zadd(KEY, now, JSON.stringify({ eventPayload, receiverList }))

  // Create resumable queue by utilize Redis
  
  // Store event for each user.
  
}

export async function defaultMessageListener(channel: string, payload: string) {
  try {
    console.log("On Message Published", channel, payload)
    const [GROUP, client] = channel.split("::");

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

    await messageQueueAppend(payload, channel, receiverList)

  } catch (error) {
    console.error(error);
  }
}

export async function defaultPatternListener(pattern: string, channel: string, payload: string) {
  try {
    console.log("On Pattern Matched Publishing", pattern, channel, payload)

    const [ CHANNEL, TARGET_GROUP ] = channel.split("=>");
    // const [ CHANNEL_TYPE, CHANNEL_NAME, TARGET_GROUP ] = channel.split("::");
    // console.log(TARGET_GROUP, CHANNEL);
  
    let receiverList: string[] = await $Redis.clients.db.main.zrange(`${CHANNEL}`, 0, -1);
    // console.log(`Active Responder: ${Object.keys($SSE.activeResponder)}`)
    console.log("Sending to Receiver List", receiverList)
    await messageQueueAppend(payload, channel, receiverList)

  } catch (error) {
    console.error(error);
  }
}

function redisPublishMessageDecoder(payload: string) {
  const format = payload.substring(0, 6)
  console.log("PublishMessageDecoder", format, payload)

  if (format === "JSON::") {
    const data = JSON.parse(payload.substring(6))
    console.log("Message Broadcasting with SSE", "in JSON", data)
    return { message: "", id: "", event: "", ...data }
  } else {
    const message = extractMessageByKey(payload, "/::MESSAGE::")
    const event = extractMessageByKey( payload, "/::EVENT::")
    const id = extractMessageByKey(payload, "/::ID::")
    // console.log(_message, message, event);
    console.log("Message Broadcasting with SSE", "in TEXT")
    return { message, id, event }
  }

}


const eventRegistry: { [event_code: string]: Function } = {
  "NFT:SELLSETUP:SETUP": (payload: any) => {
    const { activity_name } = payload
    if (payload.data.sellingType === "OFFERING") {
      
    }
    if (payload.data.sellingType === "AUCTION") {

    }
    return { messageCode: "", event: "NFT:SELLSETUP:SETUP", id: "" }
  },
  "NFT:SELLSETUP:CANCEL": (payload: any) => {
    const { activity_name } = payload
    if (payload.data.sellingType === "OFFERING") {
      
    }
    if (payload.data.sellingType === "AUCTION") {

    }
    return { messageCode: "", event: "NFT:SELLSETUP:CANCEL", id: "" }
  }
}

function eventInterceptor (payload: any) {
  console.log("eventInterceptor", payload)

  const {
    event_type, event_name, event_id,
    event_code, activity_name
  } = payload

  console.log("eventInterceptor", {
    event_type, event_name, event_id,
    event_code, activity_name
  }, "\n\n")

  const { messageCode, id, event } = eventRegistry[event_code]
    ? eventRegistry[event_code](payload)
    : { messageCode: "UNKNOWN", id: "UNKNOWN", event: "UKNOWN" }
  
  // Event Type Matcher at the primary level
  // Match by subevent and activity
  const message = messageBroker(messageCode)

  return { message, id, event }
}

function messageBroker(payload: any) {
  return payload
}