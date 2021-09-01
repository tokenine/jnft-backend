import { Request, Response } from 'express';
import { $Redis } from '..';
import { $FeatureControl } from '../feature-control';
import { publishMessageEncoder, createResponseResult } from "../../functions"
import { emit } from 'process';

interface IEventPayload {
  [key: string]: any
}

interface I_EventFunctionStatus {
  code: number | string
  is_error?: boolean
  is_success?: boolean
  message?: string
  payload?: any
}

interface I_EventFunctionResult {
  status: I_EventFunctionStatus
  data?: any
  error?: any
}

enum KeyPatternType {
  PUBSUBCHANNEL = "KEYGEN:PUBSUB-CHANNEL",
  CLIENT_SUBSCRIPTION = "KEYGEN:CLIENT-SUBSCRIPTION"
}

export const Event = {
  handler
}

export async function handler (req: Request, res: Response, opt: any = {}) {
  const now = new Date().getTime();
  const payload = formatPayload({ ...req.body, now });
  const { debug } = opt
  debug && console.log(`Debug Event:: ${payload.action} @ ${now} => Payload` ,payload)

  try {
    // const { action, client_id, client_role, channel_type, channel_id, event, timestamp } = req.body;

    if (!req.body?.client_id || !req.body?.client_role) { throw { message: "Must included client id and client role" } }
    if (!req.body?.channel_type || !req.body?.channel_id) { throw { message: "Must included channel type and channel id" } }
    if (!req.body?.action) { throw { message: "specified action" } }

    interface IEventHandlerAction {
      [index: string]: Function
      // "EVENT:CREATE": (payload: any) => any;
      // "EVENT:REMOVE": (payload: any) => any;
      // "EVENT:SUBSCRIBE": (payload: any) => any;
      // "EVENT:UNSUBSCRIBE": (payload: any) => any;
      // "EVENT:PUBLISH": (payload: any) => any;
      // "ERROR:NOTFOUND": () => any;
    }

    const ACTION: IEventHandlerAction = {
      "EVENT:CREATE": $FeatureControl.load("PUBSUB:EVENT:CREATE", pubsubEvent.create),
      "EVENT:REMOVE": $FeatureControl.load("PUBSUB:EVENT:REMOVE", pubsubEvent.remove),
      "EVENT:SUBSCRIBE": $FeatureControl.load("PUBSUB:EVENT:SUBSCRIBE", pubsubEvent.subscribe),
      "EVENT:UNSUBSCRIBE": $FeatureControl.load("PUBSUB:EVENT:UNSUBSCRIBE", pubsubEvent.unsubscribe),
      "EVENT:PUBLISH": $FeatureControl.load("PUBSUB:EVENT:PUBLISH", pubsubEvent.publish),
      "ERROR:NOTFOUND": eventError("NOTFOUND")
    }

    const action = ACTION[req.body?.action] || ACTION['ERROR:NOTFOUND'];
    const [ result, internalResult ] = createResponseResult(await action({ ...payload, now, debug }));
    
    
    // TODO: Logging
    logger({ payload, result, internalResult })

    return res.status(result.status.code).json(result)
 
  } catch (error) {
    const { message } = error;
    logger({ error })
    return res.status(400).json({ status: { error: true, message }})
  }
}

function logger(args: any) {
  const { debug = true, payload, result, internalResult, error } = args
  debug && console.log(`Debug Event::${payload.event_id} => Result`, result,
    `\n=====================`,
    internalResult,
    `\n==================================================`,
  );
  error && console.error(`Debug Event::${payload} => Error`, error);
}


export async function publishHandler (req: Request, res: Response) {
  // TODOs: 
  // As this service should never down, it should be deployable and scalable to load balancing.
  // 1. Decouple it to be a standalone service, which can work while any other services down, the queue is still working.
  // 2. Add dynamic Redis config from environment config, for support deploying this service to some like CloudFlare Worker or a container.
  // 3. Get load and traffic status from Redis instance of Event Message Queue, for prioritizing message and delay enqueuing as the load is heavy.
  
  const now = new Date().getTime();
  
  try {
    const { client_id, client_role, channel_type, channel_id, event, message, timestamp, sha256 } = req.body
    console.log(req.body);
    return res.json(req.body);
  } catch (error) {
    console.error(error)
  }
}


export function formatPayload(payload: IEventPayload) {
  const action = (payload.action as string || "").toUpperCase();
  const client_id = (payload.client_id as string || "").toLowerCase();
  const client_role = (payload.client_role as string || "").toUpperCase();
  const channel_type = (payload.channel_type as string || "").toUpperCase();
  const channel_id = (payload.channel_id as string || "").toLowerCase();
  const event_type = (payload.event_type as string || "").toUpperCase();
  const event_name = (payload.event_name as string || "").toLowerCase();
  const now = payload.now || new Date().getTime()
  const event_id = (payload.event_id as string || payload.hash.value || payload.client_id + now).toLowerCase()

  return { ...payload, action, client_id , client_role, channel_type, channel_id, event_type, event_name, event_id, now }
}


export function createKeyPattern(type: KeyPatternType, payload: IEventPayload) {
  if (type) {
    interface I_KeyPatternTypeMatcher {
      [index: string]: Function
    }

    const FN: I_KeyPatternTypeMatcher = {
      "KEYGEN:PUBSUB-CHANNEL": $FeatureControl.load("KEYGEN:PUBSUB-CHANNEL", generateKeyPatternForPubSubChannel),
      "KEYGEN:CLIENT-SUBSCRIPTION": $FeatureControl.load("KEYGEN:CLIENT-SUBSCRIPTION", generateKeyPatternForClientSubscription),
      "ERROR:NOTFOUND": eventError("NOTFOUND")
    }

    const fn = FN[type] || FN['ERROR:NOTFOUND'];
    const result = fn(payload)

    console.log("createKeyPattern", result)
    return result
  }
}

function generateKeyPatternForPubSubChannel(payload: IEventPayload) {
  const { client_id, client_role, channel_type, channel_id, event_type, event_name } = payload;
  const CLIENT = client_role + "::" + client_id;
  const EVENT = `${event_type ? (("/" + event_type) + (event_name ? ("::" + event_name) : "")) : ""}`;
  const KEY = $Redis.KEY_PREFIX.PUBSUB.CHANNEL + `${channel_type}::${channel_id}${EVENT}`;

  return { CLIENT, EVENT, KEY }
}

function generateKeyPatternForClientSubscription(payload: IEventPayload) {
  const { client_id, client_role, channel_type, channel_id, event_type, event_name } = payload;
  const CLIENT = client_role + "::" + client_id;
  const CHANNEL = `${channel_type}::${channel_id}`
  const KEY = $Redis.KEY_PREFIX.PUBSUB.CLIENT_SUBSCRIPTION + `${CLIENT}`;

  return { CLIENT, CHANNEL, KEY }
}


export const pubsubEvent = {
  create, remove, subscribe, unsubscribe, publish
}

async function create (payload: IEventPayload) {
// Create a channel for an event, so user can to be able to subscribe, subscriber will listen to, and publish message will reach to clients

  let result_ = { status: { code: 200, message: "Event created successfully", payload }, data: { }, };
  const { action, now, debug } = payload;

  if ($Redis.clients.db) {
    const { CLIENT, KEY } = createKeyPattern(KeyPatternType.PUBSUBCHANNEL, payload)
    
    // Create a sorted set for add user to subscribe to the event, and add event creator to the list
    const commandOptions = "NX";
    const exists = (await $Redis.clients.db.main.exists(KEY)) == 1 ? true : false;
    const _result_redis = await $Redis.clients.db.main.zadd(KEY, "NX", now, CLIENT);
    debug && console.log(`CHECK REDIS:\n ACTION => ${action}\n KEY => ${KEY}\n KEY EXISTS => ${exists}\n COMMAND-OPTION => ${commandOptions}\n SCORE => ${now}\n CLIENT => ${CLIENT}\n REDIS_RESULT => ${_result_redis}`);

    // Set subscriber client to listen to the event
    // await $Redis.clients.subscriber.main.to(KEY);
      
    // Publish welcome message to subscribed channel for active subscribers (Opt-in)

    // Update event key to Firebase and/or Redis (Create endpoint to access it)
  }

  return [ result_ ]
}

async function remove(payload: IEventPayload) {
// Remove a channel of an event, all user subscribed to this will be removed, subscriber will unlisten to it.

  let result_ = { status: { code: 200, message: "Event removed successfully", payload }, data: { }, };
  const { action, now, debug } = payload;

  if ($Redis.clients.db) {
    const { CLIENT, KEY } = createKeyPattern(KeyPatternType.PUBSUBCHANNEL, payload)

    // Create a sorted set for add user to subscribe to the event, and add event creator to the list
    debug && console.log("CHECK: \nKEY =>", KEY, "\nOPTION =>" , "NX", "\nSCORE =>", now, "\nCLIENT =>", CLIENT);
    
    const exists = (await $Redis.clients.db.main.exists(KEY)) == 1 ? true : false;
    if (exists) {
      const _result_redis = await $Redis.clients.db.main.del(KEY);
      debug && console.log(`CHECK: ${action}:\n KEY => ${KEY}\n KEY EXISTS => ${exists}\n SCORE => ${now}\n CLIENT => CLIENT\n REDIS_RESULT => ${_result_redis}`);
    }

    // Set subscriber client to listen to the event
    // await $Redis.clients.subscriber.main.to(KEY);
      
    // Publish welcome message to subscribed channel for active subscribers (Opt-in)
  }

  return [ result_ ]
}

async function subscribe(payload: IEventPayload) {
  let result_ = { status: { code: 200, message: "Event subscribe successfully", payload }, data: { }, };
  const { action, now, debug/* , client_id, client_role, channel_type, channel_id */ } = payload;

  if ($Redis.clients.db) {
    // const RedisDB = $Redis.clients.db;
    // const RedisSubscriber = $Redis.clients.subscriber.main

    // Create a key to indicate event is active
    // RedisDB.set(``)    
    // const CLIENT = `${client_role}::${client_id}`

    // const KEY = `${$Redis.KEY_PREFIX.PUBSUB.CHANNEL}/${channel_type}::${channel_id}/`
    // Create a sorted set for add user to subscribe to the event, and add event creator to the list
    // $Redis.clients.db.zadd(KEY, 0, `${CLIENT}`)

    // Set subscriber client to listen to the event
    // $Redis.clients.subscriber.main.to(KEY);
    // Publish to subscribed channel for active subscribers (Opt-in)

    const { CLIENT, KEY } = createKeyPattern(KeyPatternType.PUBSUBCHANNEL, payload)
    const { KEY: KEY_CLIENTSUBSCRIPTION, CHANNEL } = createKeyPattern(KeyPatternType.CLIENT_SUBSCRIPTION, payload)
    
    // Create a sorted set for add user to subscribe to the event, and add event creator to the list
    const commandOptions = "NX";
    const exists = (await $Redis.clients.db.main.exists(KEY)) == 1 ? true : false;
    const _result_redis = await $Redis.clients.db.main.zadd(KEY, "NX", now, CLIENT);
    
    // TODO: Store subscription id to each client for map and use with UI
    const _result_redis_1 = await $Redis.clients.db.main.zadd(KEY_CLIENTSUBSCRIPTION, "NX", now, CHANNEL);
    const _result_subscription = await $Redis.clients.subscriber.main.to(KEY);

    const [ EVENTID, SCORE, ENCODEDMESSAGE ] = encodeEventMessage(payload)
    const RedisResults = []
    
    RedisResults.push({ action: "ADD_EVENT_QUEUE" , result: await $Redis.clients.db.EMQ.zadd(`EVENT_MESSAGE_QUEUE:MAIN`, SCORE, EVENTID) })
    // Add Event Payload to Event History
    RedisResults.push({ action: "ADD_EVENT_HISTORY" , result: await $Redis.clients.db.EMQ.hset(`EVENT_MESSAGE_HISTORY:MAIN`, EVENTID, ENCODEDMESSAGE) })


    debug && console.log(`CHECK REDIS:\n ACTION => ${action}\n KEY => ${KEY}\n KEY EXISTS => ${exists}\n COMMAND-OPTION => ${commandOptions}\n SCORE => ${now}\n CLIENT => ${CLIENT}\n CHANNEL => ${CHANNEL}\n`,
      `REDIS_RESULT: ${KEY} => ${_result_redis}\n`,
      `REDIS_RESULT: ${KEY_CLIENTSUBSCRIPTION} => ${_result_redis_1}\n`,
      `REDIS_PUBSUB_RESULT: ${KEY} => ${_result_subscription}\n`,
    );

    // Set subscriber client to listen to the event
    // await $Redis.clients.subscriber.main.to(KEY);
      
    // Publish welcome message to subscribed channel for active subscribers (Opt-in)

    // Update event key to Firebase and/or Redis (Create endpoint to access it)
  }

  return [ result_ ]
}

async function unsubscribe (payload: IEventPayload) {
  let result_ = { status: { code: 200, message: "Event unsubscribe successfully", payload }, data: { }, };
  const { action, now, debug, event_code, client_id, client_role, channel_type, channel_id } = payload;

  if ($Redis.clients.db) {
    let CLIENT, KEY, KEY_CLIENTSUBSCRIPTION, CHANNEL
    if (event_code === "USER:UNFOLLOW") {
      // const keyPatternPubSubChannel = createKeyPattern(KeyPatternType.PUBSUBCHANNEL, payload)
      // CLIENT = keyPatternPubSubChannel.CLIENT;
      // KEY = keyPatternPubSubChannel.KEY;
      CLIENT = "USER::" + client_id
      KEY = "PUBSUB::SUBSCRIPTION-CHANNEL//USERFOLLOW::" + channel_id

      const keyPatternClientSubscription  = createKeyPattern(KeyPatternType.CLIENT_SUBSCRIPTION, payload)
      KEY_CLIENTSUBSCRIPTION = keyPatternClientSubscription.KEY;
      CHANNEL = keyPatternClientSubscription.CHANNEL
    }
    
    const commandOptions = "";
    const exists = (await $Redis.clients.db.main.exists(KEY)) == 1 ? true : false;
    const _result_redis = await $Redis.clients.db.main.zrem(KEY, CLIENT);
    const _result_redis_1 = await $Redis.clients.db.main.zrem(KEY_CLIENTSUBSCRIPTION, CHANNEL);

    const _result_unsubscription = await $Redis.clients.subscriber.main._subscriber.unsubscribe(KEY);

    // TODO: Auto unsubscribe when key was removed or no member remains.
    // $Redis.clients.subscriber.main.to(KEY);
    
    // debug && console.log(`CHECK REDIS:\n ACTION => ${action}\n KEY => ${KEY}\n KEY EXISTS => ${exists}\n COMMAND-OPTION => ${commandOptions}\n SCORE => ${now}\n CLIENT => ${CLIENT}\n CHANNEL => ${CHANNEL}\n`,
    //   `REDIS_RESULT: ${KEY} => ${_result_redis}\n`,
    //   `REDIS_RESULT: ${KEY_CLIENTSUBSCRIPTION} => ${_result_redis_1}\n`,
    // );

    // Set subscriber client to listen to the event
    // await $Redis.clients.subscriber.main.to(KEY);
      
    // Publish welcome message to subscribed channel for active subscribers (Opt-in)

    // Update event key to Firebase and/or Redis (Create endpoint to access it)
  }

  return [ result_ ]
}


async function publish (payload: IEventPayload) {
  let result_: I_EventFunctionResult = {
    status: {
      code: 400,
      is_error: true,
      message: "Event published failed",
      payload
    }, 
    data: null,
    error: null
  };
  
  try {
    if (!$Redis.clients.db.EMQ) {
      throw { message: "Redis client instance is not found" }
    }

    // validateEventMessage(payload)

    console.log("Publish Payload", payload)

    const KEY = `EVENT_MESSAGE_QUEUE:MAIN`;
    const [ EVENTID, SCORE, ENCODEDMESSAGE ] = encodeEventMessage(payload)
    const RedisResults = []
    
    RedisResults.push({ action: "ADD_EVENT_QUEUE" , result: await $Redis.clients.db.EMQ.zadd(KEY, SCORE, EVENTID) })
    // Add Event Payload to Event History
    RedisResults.push({ action: "ADD_EVENT_HISTORY" , result: await $Redis.clients.db.EMQ.hset(`EVENT_MESSAGE_HISTORY:MAIN`, EVENTID, ENCODEDMESSAGE) })

    result_ = { status: { code: 200, is_error: false, message: "Event published successfully", payload }, data: null, error: null };
    return [ result_, { KEY, SCORE, EVENTID, ENCODEDMESSAGE, RedisResults } ]

  } catch (error) {
    return [ result_, { error } ]
  }
}

function validateEventMessage(payload: any) {
  const result: I_EventFunctionResult = {
    status: { 
      code: 400,
      message: "Message was not validate", 
      is_error: true,
    }
  }
  throw result
}

interface IEventErrorType {
  [index: string]: any
  "NOTFOUND": () => any;
  "DEFAULT": () => any;
}

function eventError (type: string) {
  return function () {
    const TYPE: IEventErrorType = {
      "NOTFOUND": () => { return { message: "Specified action was not found" }},
      "DEFAULT": () => { return { message: "Unknown Error" }}
    }
  
    const error_ = (TYPE[type] || TYPE['DEFAULT'])
    return error_
  }
}

function encodeEventMessage(payload: any) {
  const { sent_timestamp: now = new Date().getTime(), hash } = payload;
  const ENCODEDMESSAGE = publishMessageEncoder(payload)
  const EVENTID = hash.value // TODO: Added hash value generator
  const SCORE = `${parseInt(now)}.1001`
  return [ EVENTID, SCORE, ENCODEDMESSAGE ]
}
