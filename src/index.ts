import * as modulesType from "./module.d.ts";
import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import Package, { version, latestUpdate } from './package.json';
import corsConfig from './configs/cors';
import { $SSE, $Redis } from './modules';
import { subscribeHandler } from "./modules/pubsub";

dotenv.config();

const PORT = process.env.PORT || 3000;
const app: Express = express();

app.use(cors());
// app.use(cors(corsConfig([`http://localhost:${PORT}`])));
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.all('/', cors(), (req: Request, res: Response) => {
  const client = { "user-agent": req.headers?.['user-agent'], "origin": req.headers?.origin }
  if (req.method === "POST" && req.body.full) {
    return res.json({ ...Package, client });
  }
  return res.json({ version, latestUpdate, client });
});

app.all('/debug/redis', (req: Request, res: Response) => {
  console.log($Redis)
  return res.json(Object.keys($Redis.clients))
})

app.get('/sse', $SSE.sseHandler)
app.get('/sse/:clientid', $SSE.sseHandler)

app.get('/debug/list/sse-client', (req: Request, res: Response) => {
  const list = Object.keys($SSE.clients).map((role: string) => Object.keys($SSE.clients[role])).reduce((_list, __list) => [..._list, ...__list]);
  return res.json({ total: list.length, list, responder: Object.keys($SSE.activeResponder) })
});

app.get('/debug/pubsub/list', (req: Request, res: Response) => {
  return res.json(Object.keys($Redis.clients));
});

app.get('/debug/pubsub/:subscriber_id', (req: Request, res: Response) => {
  const { subscriber_id } = req.params;
  if (!subscriber_id) {
    return res.json({ error: true, message: "Invalid subscriber id" });
  }
  const subscriber_ = $Redis.clients.subscriber.main._subscriber.condition.subscriber;

  console.log(subscriber_)

  return res.json(
    ...subscriber_
  );
});

app.post('/publish', async (req: Request, res: Response) => {
  const now = new Date().getTime();
  
  try {
    const { client_id, client_role, channel_type, channel_id, event, message, timestamp, sha256 } = req.body
    console.log(req.body);
    return res.json(req.body);
  } catch (error) {
    console.error(error)
  }
})

app.get('/debug/publish/:target', (req: Request, res: Response) => {
  // const receiverList = Object.keys($SSE.clients["USER"]);

  // const params = (req.params.target || "").toLowerCase().split("::");
 
  // const channel = group.toUpperCase() + (id && "::" + id);
  const channel = req.params.target;
  const { message } = req.query;

  console.log("Publish to", channel, message);

  $Redis.clients.publisher.publish(channel, message);

  // $SSE.broadcastMessage(receiverList, ({ receiverId }: any) => ({ data: { event: "test-broadcast", id: channel, message: `${message} :: Test for ${receiverId}`} }));

  return res.json({ message: `Published message successfully` })
  // return res.json({ message: `Published to ${receiverList.length} client(s)`, list: Object.keys($SSE.clients["USER"]) })
})

app.post('/debug/subscribe', async (req: Request, res: Response) => {
  console.log("subscribe")
  const now = new Date().getTime();

  try {
    const { client_id, client_role, channel_type, channel_id, event, timestamp } = req.body;
  
    if (!client_id || !client_role) { throw { message: "Must included client id and client role" } }
    if (!channel_type || !channel_id) { throw { message: "Must included channel type and channel id" } }

    // Set Subscriber (select by it's group) to subscribe the channel 
    // $Redis.clients.subscriber.main.to(channel);

    // const CLIENT_TYPE = client_role.toUpperCase();
    const CLIENT = client_role.toUpperCase() + "::" + client_id.toLowerCase();
    const CHANNEL_TYPE = channel_type.toUpperCase();
    const EVENT = event.type && event.name ? "/" + event.type.toUpperCase() + "::" + event.name.toLowerCase() : "";
    // const KEY = `${$Redis.KEY_PREFIX.PUBSUB.CHANNEL}/${CLIENT_TYPE}/${CHANNEL_TYPE}::${channel_id.toLowerCase()}${EVENT}`;
    const KEY = $Redis.KEY_PREFIX.PUBSUB.CHANNEL + `${CHANNEL_TYPE}::${channel_id.toLowerCase()}${EVENT}`;
    // Add user to subscribe channel
    // Add channel to be restorable by subscriber (May not need)
    
    $Redis.clients.db.main.zadd(KEY, now, CLIENT);
    
    const message = `Subscribe ${CLIENT} to ${CHANNEL_TYPE}::${channel_id.toLowerCase()}${EVENT}`;
    console.log(message);
    return res.json({ message })
  } catch (error) {
    const { message } = error;
    return res.status(400).json({ status: { error: true, message }})
  }
});

app.post('/subscribe', async (req: Request, res: Response) => {
  const now = new Date().getTime();

  try {
    const { client_id, client_role, channel_type, channel_id, event, timestamp } = req.body;
  
    if (!client_id || !client_role) { throw { message: "Must included client id and client role" } }
    if (!channel_type || !channel_id) { throw { message: "Must included channel type and channel id" } }

    // Set Subscriber (select by it's group) to subscribe the channel 
    // $Redis.clients.subscriber.main.to(channel);

    // const CLIENT_TYPE = client_role.toUpperCase();
    const CLIENT = client_role.toUpperCase() + "::" + client_id.toLowerCase();
    const CHANNEL_TYPE = channel_type.toUpperCase();
    const EVENT = event.type && event.name ? "/" + event.type.toUpperCase() + "::" + event.name.toLowerCase() : "";
    // const KEY = `${$Redis.KEY_PREFIX.PUBSUB.CHANNEL}/${CLIENT_TYPE}/${CHANNEL_TYPE}::${channel_id.toLowerCase()}${EVENT}`;
    const KEY = `${$Redis.KEY_PREFIX.PUBSUB.CHANNEL}/${CHANNEL_TYPE}::${channel_id.toLowerCase()}${EVENT}`;
    // Add user to subscribe channel
    // Add channel to be restorable by subscriber (May not need)
    
    $Redis.clients.db.main.zadd(KEY, now, CLIENT);
    
    const message = `Subscribe ${CLIENT} to ${CHANNEL_TYPE}::${channel_id.toLowerCase()}${EVENT}`;
    console.log(message);
    return res.json({ message })
  } catch (error) {
    const { message } = error;
    return res.status(400).json({ status: { error: true, message }})
  }
});

app.post('/events', eventsHandler)
app.post('/debug/events', async (req: Request, res: Response) => {
  const debug = true;
  await eventsHandler(req, res, { debug });
  /* 
  // For full debugging and analysis. Logs, result and everything will be keeped.
    const result = await eventsHandler(req, res, { debug });
    console.log("Debug Event:: => Output", result)
  */
})

async function eventsHandler (req: Request, res: Response, opt: any = {}) {
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
      "EVENT:CREATE": featureControl.load("PUBSUB:EVENT:CREATE", pubsubEvent.create),
      "EVENT:REMOVE": featureControl.load("PUBSUB:EVENT:REMOVE", pubsubEvent.remove),
      "EVENT:SUBSCRIBE": featureControl.load("PUBSUB:EVENT:SUBSCRIBE", pubsubEvent.subscribe),
      "EVENT:UNSUBSCRIBE": featureControl.load("PUBSUB:EVENT:UNSUBSCRIBE", pubsubEvent.unsubscribe),
      "EVENT:PUBLISH": featureControl.load("PUBSUB:EVENT:PUBLISH", pubsubEvent.publish),
      "ERROR:NOTFOUND": eventError("NOTFOUND")
    }

    const action = ACTION[req.body?.action] || ACTION['ERROR:NOTFOUND'];
    const result = createResponseResult(await action({ ...payload, now, debug }));
    debug && console.log(`Debug Event::${now} => Result`, result, `\n==================================================`);

    // TODO: Logging

    return res.status(result.status.code).json(result)
 
  } catch (error) {

    const { message } = error;
    console.log(error)
    return res.status(400).json({ status: { error: true, message }})
  }
}

app.listen(PORT, () => {
  const now = new Date();
  console.log(`
  =============================
    App version ${version}
    ⚡Starting at 🕰️  ${now.toUTCString()} (${now.toISOString()})
    ⚡Using port ${PORT}
    ${Intl.DateTimeFormat().resolvedOptions().timeZone}
  =============================`
  )
});


const registry = new Map()

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

export const featureControl: any = {
  registry,
  load,
  check,
  toggle,
}

function load (key: string, fn: () => any) {
  if (featureControl.check(key)) {
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




export const pubsubEvent = {
  create, remove, subscribe, unsubscribe, publish
}

interface IEventPayload {
  [key: string]: any
}

export function formatPayload(payload: IEventPayload) {
  const action = (payload.action as string || "").toUpperCase();
  const client_id = (payload.client_id as string || "").toLowerCase();
  const client_role = (payload.client_role as string || "").toUpperCase();
  const channel_type = (payload.channel_type as string || "").toUpperCase();
  const channel_id = (payload.channel_id as string || "").toLowerCase();
  const event_type = (payload.event_type as string || "").toUpperCase();
  const event_name = (payload.event_name as string || "").toLowerCase();
  const event_id = (payload.event_id as string || "").toLowerCase();
  const now = payload.now || new Date().getTime()

  return { ...payload, action, client_id , client_role, channel_type, channel_id, event_type, event_name, event_id, now }
}

enum KeyPatternType {
  PUBSUBCHANNEL = "KEYGEN:PUBSUB-CHANNEL",
  CLIENT_SUBSCRIPTION = "KEYGEN:CLIENT-SUBSCRIPTION"
}

export function createKeyPattern(type: KeyPatternType, payload: IEventPayload) {
  if (type) {
    interface I_KeyPatternTypeMatcher {
      [index: string]: Function
    }

    const FN: I_KeyPatternTypeMatcher = {
      "KEYGEN:PUBSUB-CHANNEL": featureControl.load("KEYGEN:PUBSUB-CHANNEL", generateKeyPatternForPubSubChannel),
      "KEYGEN:CLIENT-SUBSCRIPTION": featureControl.load("KEYGEN:CLIENT-SUBSCRIPTION", generateKeyPatternForClientSubscription),
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

  return result_
}

async function remove (payload: IEventPayload) {
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

  return result_
}

async function subscribe (payload: IEventPayload) {
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

  return result_
}

async function unsubscribe (payload: IEventPayload) {
  let result_ = { status: { code: 200, message: "Event unsubscribe successfully", payload }, data: { }, };
  const { action, now, debug/* , client_id, client_role, channel_type, channel_id */ } = payload;

  if ($Redis.clients.db) {
    const { CLIENT, KEY } = createKeyPattern(KeyPatternType.PUBSUBCHANNEL, payload)
    const { KEY: KEY_CLIENTSUBSCRIPTION, CHANNEL } = createKeyPattern(KeyPatternType.CLIENT_SUBSCRIPTION, payload)
    
    const commandOptions = "";
    const exists = (await $Redis.clients.db.main.exists(KEY)) == 1 ? true : false;
    const _result_redis = await $Redis.clients.db.main.zrem(KEY, CLIENT);
    const _result_redis_1 = await $Redis.clients.db.main.zrem(KEY_CLIENTSUBSCRIPTION, CHANNEL);

    const _result_unsubscription = await $Redis.clients.subscriber.main._subscriber.unsubscribe(KEY);

    // TODO: Auto unsubscribe when key was removed or no member remains.
    // $Redis.clients.subscriber.main.to(KEY);
    
    debug && console.log(`CHECK REDIS:\n ACTION => ${action}\n KEY => ${KEY}\n KEY EXISTS => ${exists}\n COMMAND-OPTION => ${commandOptions}\n SCORE => ${now}\n CLIENT => ${CLIENT}\n CHANNEL => ${CHANNEL}\n`,
      `REDIS_RESULT: ${KEY} => ${_result_redis}\n`,
      `REDIS_RESULT: ${KEY_CLIENTSUBSCRIPTION} => ${_result_redis_1}\n`,
    );

    // Set subscriber client to listen to the event
    // await $Redis.clients.subscriber.main.to(KEY);
      
    // Publish welcome message to subscribed channel for active subscribers (Opt-in)

    // Update event key to Firebase and/or Redis (Create endpoint to access it)
  }

  return result_
}

async function publish (payload: IEventPayload) {
  let result_ = { status: { code: 200, message: "Event published successfully", payload }, data: { }, };
  const { action, client_id, client_role, channel_type, channel_id, now, message } = payload;

  if ($Redis.clients.db && $Redis.clients.publisher) {
  //   // const RedisDB = $Redis.clients.db;
  //   // const RedisSubscriber = $Redis.clients.subscriber.main

  //   // Create a key to indicate event is active
  //   // RedisDB.set(``)    
  //   const CLIENT = `${client_role}::${client_id}`

  //   const KEY = `${$Redis.KEY_PREFIX.PUBSUB.CHANNEL}/${channel_type}::${channel_id}/`
  //   // Create a sorted set for add user to subscribe to the event, and add event creator to the list
  //   $Redis.clients.db.zadd(KEY, 0, `${CLIENT}`)
    const { CLIENT, KEY } = createKeyPattern(KeyPatternType.PUBSUBCHANNEL, payload)

    const encodedMessage = publishMessageEncoder(payload)

    const result = await $Redis.clients.publisher.publish(KEY, encodedMessage);
    // const result = await $Redis.clients.subscriber.main._subscriber.publish(KEY, JSON.stringify(message));
    console.log(result, KEY, message, $Redis.clients.subscriber.main.subscription)
  //   // Set subscriber client to listen to the event
  //   $Redis.clients.subscriber.main.to(KEY);
    
  //   // Publish to subscribed channel for active subscribers (Opt-in)
  }

  return result_
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

function createResponseResult (actionResult: any) {
  let result_: any = { status: { code: 400 }, data: null }

  if (actionResult) {
    result_ = { ...result_, ...actionResult }
  }

  return result_
}

function publishMessageEncoder(payload: any) {
  let message = ""
  if (typeof payload === "string") {
    if (!payload.includes("TEXT::")) {
      message = "TEXT::" + payload
    }
  } else {
    message = "JSON::" + JSON.stringify(payload)
  }

  return message
}