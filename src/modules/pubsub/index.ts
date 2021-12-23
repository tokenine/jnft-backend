import { Request, Response } from 'express'
import keccak from 'keccak';
import { $SSE, $Redis } from '..';
import { publishMessageEncoder, reviver } from "../../functions";
import { setNotificationsToFirestore, testSendNotificationToFirestore } from "../firebase"


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
  
      const eventMssageHistory = await $Redis.clients.db.EMQ.hget(`EVENT_MESSAGE_HISTORY:MAIN`, EVENTID)

      if (eventMssageHistory) {
        const [ type, rawEventMessage ] = eventMssageHistory.split("::")
        // const { eventPayload, receiverList } = JSON.parse(rawEventMessage, reviver)
  
        const eventMessage = type === "JSON" && Object.fromEntries(JSON.parse(rawEventMessage, reviver))
        await messageBroadcastByEvent({ eventMessage, EVENTID, SCORE })

        // TODOs: 
        // Add On success handling
        // Add On fail handling
        // Add time ???
        // Store it to event history db (Asynchronously)
        //
        await $Redis.clients.db.EMQ.zadd(`EVENT_MESSAGE_SENT:MAIN`, SCORE, EVENTID)
        await $Redis.clients.db.EMQ.zrem(`EVENT_MESSAGE_QUEUE:MAIN`, EVENTID)
    
        // As of an operation completed, set processing flag to ready for another queue
        // On completed, set processing to false
      }
      

    } catch (error) {
      console.error(error)
    } finally {
      observer.resume()
    }
  },
  {},
  100
)

const messageBroadcastEventRegistry: { [eventCode: string]: any} = {
  "NFT:SELLINVOLVE:OFFERPRICE:SET": eventNFT_SELLINVOLVE_OFFERPRICE,
  "NFT:SELLINVOLVE:OFFERPRICE:UPDATE": eventNFT_SELLINVOLVE_OFFERPRICE,
  "NFT:SELLINVOLVE:OFFERPRICE:CANCEL": eventNFT_SELLINVOLVE_OFFERPRICE,
  "NFT:SELLINVOLVE:AUCTION:BID": eventNFT_SELLINVOLVE_AUCTION,
  // "NFT:SELLINVOLVE:OFFERPRICE:SENDNFT"
  "NFT:SELLINVOLVE:AUCTION:SENDNFT": eventNFT_SELLINVOLVE_AUCTION,
  "NFT:SELLINVOLVE:AUCTION:CLAIMNFT": eventNFT_SELLINVOLVE_AUCTION,
  "CREATOR:APPROVAL:APPROVED": eventCREATOR_APPROVAL,
  "CREATOR:APPROVAL:REJECTED": eventCREATOR_APPROVAL,
  "NFT:APPROVAL:APPROVED": eventNFT_APPROVAL,
  "NFT:APPROVAL:REJECTED": eventNFT_APPROVAL,
  "TEST": eventTEST
  // "USER:FOLLOW": subscribeUserFollow(payload),
}

async function messageBroadcastByEvent(payload: any) {
  const event_code = payload.eventMessage.event_code
  console.log("======================= messageBroadcastByEvent =======================")
  console.log("EVENTCODE => ", event_code)
  console.log("=======================================================================")
  if (event_code) {
    const fn = messageBroadcastEventRegistry[event_code] || genericMessageBroadcast
    await fn(payload)
  } else {
    await genericMessageBroadcast(payload)
  }
}

async function genericMessageBroadcast({ eventMessage, SCORE, EVENTID }: any) {
    // const message = publishMessage(eventMessage)
  // console.log(message)
  // const sender = await manageSenderData(eventMessage);
  
  // eventPayload: { event, id, data: { event, id, message } }
  const receiverList = await getReceiverList(eventMessage);
  
  // Transform Message Here
  const broadcastMessage = await transformBroadcastMessage(eventMessage);

  // console.log("Broadcast Event Message", EVENTID, SCORE, eventMessage, broadcastMessage);
  
  // Broadcast the message out
  $SSE.broadcastMessage(receiverList, ({ receiverId, payload }: any) => ({ receiverId, event: "message", id: EVENTID, data: payload }), broadcastMessage);
  // Added Notification to each receiver.
  receiverList.map(async (receiver_id: string) => await $Redis.clients.db.main.zadd(`EVENT:RELATED//${receiver_id}`, SCORE, EVENTID))
}

// function manageSenderDataByEvent(eventCode: string, payload = {}) {
//   const events: { [eventCode: string]: any} = {
//     "NFT:SELLINVOLVE:OFFERPRICE:SET": eventNFT_SELLINVOLVE_OFFERPRICE(payload),
//     "NFT:SELLINVOLVE:OFFERPRICE:UPDATE": eventNFT_SELLINVOLVE_OFFERPRICE(payload),
//     "NFT:SELLINVOLVE:OFFERPRICE:CANCEL": eventNFT_SELLINVOLVE_OFFERPRICE(payload),
//     "NFT:SELLINVOLVE:AUCTION:BID": eventNFT_SELLINVOLVE_AUCTION(payload),

//     // "NFT:SELLINVOLVE:OFFERPRICE:SENDNFT"
//     // "NFT:SELLINVOLVE:AUCTION:SENDNFT"
//     // "NFT:SELLINVOLVE:AUCTION:CLAIMNFT"


//     // "USER:FOLLOW": subscribeUserFollow(payload),
//   }
//   return events[eventCode]
// }

// async function manageSenderData(eventMessage: any) {
//   const { event_code, client_id } = eventMessage;
//   if (event_code) {
//     const result_ = manageSenderDataByEvent(event_code, eventMessage)
//   }
// }

async function eventNFT_SELLINVOLVE_OFFERPRICE({ eventMessage, SCORE, EVENTID }: any) {
  // Subscribe user to NFT activity channel
  await subscribeUserToNFTChannel(eventMessage)

  // Populate message receiver list
  // const receiverList = await getReceiverList(eventMessage);
  const receiverList = await getReceiverList(eventMessage);


  // Transform Message
  const broadcastMessage = await transformBroadcastMessage(eventMessage);

  await setNotificationsToFirestore(receiverList, { content: { message: broadcastMessage?.eventMessage }, broadcastMessage })
  
  // Broadcast the message out
  $SSE.broadcastMessage(receiverList, ({ receiverId, payload }: any) => ({ receiverId, event: "message", id: EVENTID, data: payload }), broadcastMessage);
  // Added Notification to each receiver.
  receiverList.map(async (receiver_id: string) => await $Redis.clients.db.main.zadd(`EVENT:RELATED//${receiver_id}`, SCORE, EVENTID))

  
}

async function eventNFT_SELLINVOLVE_AUCTION({ eventMessage, SCORE, EVENTID }: any) {
  const { event_code, channel_id } = eventMessage
  // let receiverList = []
  console.log("eventNFT_SELLINVOLVE_AUCTION", eventMessage)
  const owner = await $Redis.clients.db.main.hget(`NFT_INFO//${channel_id}`, `owner`)

  if (event_code === "NFT:SELLINVOLVE:AUCTION:BID") {
    // Subscribe user to NFT activity channel

    // Owner will get notification for the new update bid

    // The last bidder (previous one) will get notification that one lose the auction
    
    await subscribeUserToNFTChannel(eventMessage)

    $SSE.broadcastMessage([`USER::${owner}`], ({ receiverId, payload }: any) => ({ receiverId, event: "message", id: EVENTID, data: payload }), { ...eventMessage });  
  
    // The last bidder (previous one) will get notification that one lose the auction
    if (eventMessage.data.topBid) {
      const { bidder } = eventMessage.data.topBid
      $SSE.broadcastMessage([`USER::${bidder}`], ({ receiverId, payload }: any) => ({ receiverId, event: "message", id: EVENTID, data: payload }), { ...eventMessage, event_code: "NFT:SELLINVOLVE:AUCTION:BID:LOSE" });  
    }
  } else if (event_code === "NFT:SELLINVOLVE:AUCTION:SENDNFT") {
    // When a NFT auction session was end, and seller send the NFT to a bid winner

    // The bid winner will get notification that one has own the NFT
    const { bidWinner } = eventMessage.data
    $SSE.broadcastMessage([`USER::${bidWinner}`], ({ receiverId, payload }: any) => ({ receiverId, event: "message", id: EVENTID, data: payload }), { ...eventMessage });  

    // And creator (if not the same as owner) will get receive for a message (with commission)

  } else if (event_code === "NFT:SELLINVOLVE:AUCTION:CLAIMNFT") {
    // When a NFT auction session was end, and the bid winner claim the NFT
    // The owner will get notification that the bid winner has claim their NFT
    const owner_ = eventMessage.data.owner
    $SSE.broadcastMessage([`USER::${owner_}`], ({ receiverId, payload }: any) => ({ receiverId, event: "message", id: EVENTID, data: payload }), { ...eventMessage });  

    // And creator (if not the same as owner) will get receive for a message (with commission)

  }
  // Populate message receiver list
  // Send event message to owner
  // receiverList = await getReceiverList(eventMessage);
  // // Owner will get notification for the new update bid



  // // Transform Message
  // const broadcastMessage = await transformBroadcastMessage(eventMessage);
  
  // // Broadcast the message out
  // $SSE.broadcastMessage(receiverList, ({ receiverId, payload }: any) => ({ receiverId, event: "message", id: EVENTID, data: payload }), broadcastMessage);
  // // Added Notification to each receiver.
  // receiverList.map(async (receiver_id: string) => await $Redis.clients.db.main.zadd(`EVENT:RELATED//${receiver_id}`, SCORE, EVENTID))

}


async function eventTEST({ eventMessage, SCORE, EVENTID }: any) {
  console.log("=================================================================\n")
  console.log("EVENT:TEST", EVENTID, SCORE, eventMessage)
  console.log("=================================================================\n")
  testSendNotificationToFirestore()
  // // // Subscribe user to NFT activity channel
  // // await subscribeUserToNFTChannel(eventMessage)

  // // // Populate message receiver list
  // // // const receiverList = await getReceiverList(eventMessage);
  // // const receiverList = await getReceiverList(eventMessage);
  // const receiverList = [`USER::${eventMessage.data.id}`] // TODO: TEMP/Refactor to function 

  // // // Transform Message
  // const broadcastMessage = await transformBroadcastMessage(eventMessage);
  
  // // // Broadcast the message out
  // $SSE.broadcastMessage(receiverList, ({ receiverId, payload }: any) => ({ receiverId, event: "message", id: EVENTID, data: payload }), broadcastMessage);
  // // // Added Notification to each receiver.
  // receiverList.map(async (receiver_id: string) => await $Redis.clients.db.main.zadd(`EVENT:RELATED//${receiver_id}`, SCORE, EVENTID))
}


async function eventCREATOR_APPROVAL({ eventMessage, SCORE, EVENTID }: any) {
  console.log("=================================================================\n")
  console.log("EVENT:CREATOR:APPROVAL", EVENTID, SCORE, eventMessage)
  console.log("=================================================================\n")
  // // Subscribe user to NFT activity channel
  // await subscribeUserToNFTChannel(eventMessage)

  // // Populate message receiver list
  // // const receiverList = await getReceiverList(eventMessage);
  // const receiverList = await getReceiverList(eventMessage);
  const receiverList = [`USER::${eventMessage.data.id}`] // TODO: TEMP/Refactor to function 

  // // Transform Message
  const broadcastMessage = await transformBroadcastMessage(eventMessage);
  
  // // Broadcast the message out
  $SSE.broadcastMessage(receiverList, ({ receiverId, payload }: any) => ({ receiverId, event: "message", id: EVENTID, data: payload }), broadcastMessage);
  // // Added Notification to each receiver.
  receiverList.map(async (receiver_id: string) => await $Redis.clients.db.main.zadd(`EVENT:RELATED//${receiver_id}`, SCORE, EVENTID))
}

async function eventNFT_APPROVAL({ eventMessage, SCORE, EVENTID }: any) {
  console.log("=================================================================\n")
  console.log("EVENT:NFT:APPROVAL", EVENTID, SCORE, eventMessage)
  console.log("=================================================================\n")
  // // Subscribe user to NFT activity channel
  // await subscribeUserToNFTChannel(eventMessage)

  // // Populate message receiver list
  // // const receiverList = await getReceiverList(eventMessage);
  // const receiverList = await getReceiverList(eventMessage);
  const receiverList = [`USER::${eventMessage.data.creator}`] // TODO: TEMP/Refactor to function 

  // // Transform Message
  const broadcastMessage = await transformBroadcastMessage(eventMessage);
  
  // // Broadcast the message out
  $SSE.broadcastMessage(receiverList, ({ receiverId, payload }: any) => ({ receiverId, event: "message", id: EVENTID, data: payload }), broadcastMessage);
  // // Added Notification to each receiver.
  receiverList.map(async (receiver_id: string) => await $Redis.clients.db.main.zadd(`EVENT:RELATED//${receiver_id}`, SCORE, EVENTID))

}


async function subscribeUserToNFTChannel(payload: any) {
  const { channel_id, client_role, client_id,sent_timestamp } = payload
  console.log("subscribeUserToNFTChannel", payload)

  const CLIENT = client_role.toUpperCase() + "::" + client_id.toLowerCase()
  return await $Redis.clients.db.main.zadd(`PUBSUB::SUBSCRIPTION-CHANNEL//NFT-ACTIVITY::${channel_id}/SELL`, sent_timestamp, CLIENT)
}

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

async function getReceiverList(eventMessagePayload: any, options?: any) {
  const { channel_type, channel_id, action } = eventMessagePayload;
  let receiverList: string[] = [];

  console.log("Get Receiver List", action, channel_type, channel_id)
  
  if (options?.toAll) {
    receiverList = Object.keys($SSE.activeResponder)
  } else if (action === "EVENT:SUBSCRIBE") {
    console.log("Get Reveicer List for Event Subscribe")
    receiverList = await receiverListOfEventSubscribe(eventMessagePayload)
  } else if (action === "EVENT:PUBLISH") {
    console.log("Get Reveicer List for Event Publish")
    receiverList = await receiverListOfEventPublish(eventMessagePayload)
  } else {
    console.log("Action is not match")
  }

  return receiverList
}

async function receiverListOfEventSubscribe(eventMessagePayload: any) {
  const { channel_type, channel_id, action, event_code } = eventMessagePayload;
  if (channel_type === "NFT") {
    const owner = await $Redis.clients.db.main.hget(`NFT_INFO//${channel_id}`, `owner`)
    return [`USER::${owner}`]

  } else if (channel_type === "USER:FOLLOW") {
    return [`USER::${channel_id}`]

  } else {
    const CHANNEL = `${channel_type}::${channel_id}`;
    const KEY = `${$Redis.KEY_PREFIX.PUBSUB.CHANNEL}${CHANNEL}`;
    return await $Redis.clients.db.main.zrange(KEY, 0, -1)
  }
}

async function receiverListOfEventPublish(eventMessagePayload: any) {
  const { channel_type, channel_id, action, event_code } = eventMessagePayload;

  console.log("====================== receiverListOfEventPublish =======================\n")
  console.log(eventMessagePayload)
  console.log("=============================================\n")
  if (
    event_code === "NFT:SELLINVOLVE:OFFERPRICE:SET"
    || event_code === "NFT:SELLINVOLVE:OFFERPRICE:UPDATE"
    || event_code === "NFT:SELLINVOLVE:OFFERPRICE:CANCEL"
  ) {
    // When new price was set
    // Only owner will get receive message
    
    const owner = await $Redis.clients.db.main.hget(`NFT_INFO//${channel_id}`, `owner`)
    return [`USER::${owner}`]
    
    
    
  } else if (event_code === "NFT:SELLINVOLVE:OFFERPRICE:SENDNFT") {
    // When a NFT Price Offering session was end, and seller send the NFT to a buyer
    // The buyer will get notification that one has own the NFT
    
    // And other buyers will get notification to withdraw their offers or stay remain for the next session
    
    // And creator (if not the same as owner) will get receive for a message (with commission)
  } else if (event_code === "NFT:SELLINVOLVE:AUCTION:BID") {
    
  } else if (event_code === "NFT:SELLINVOLVE:AUCTION:SENDNFT") {
  } else if (event_code === "NFT:SELLINVOLVE:AUCTION:CLAIMNFT") {

  } else {
    const CHANNEL = `${channel_type}::${channel_id}`;
    const KEY = `${$Redis.KEY_PREFIX.PUBSUB.CHANNEL}${CHANNEL}`;
    return await $Redis.clients.db.main.zrange(KEY, 0, -1)
  }
  return []
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
    if (typeof channel === 'string' && payload) {
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
    }


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