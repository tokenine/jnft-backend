import dotenv from 'dotenv';
dotenv.config();

import * as modulesType from "./module.d.ts";
import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import Package, { version, latestUpdate } from './package.json';
import corsConfig from './configs/cors';
import { $SSE, $Redis, User, Event } from './modules';

const PORT = process.env.PORT || 3000;
const app: Express = express();

app.use(compression());
// app.use(cors());
app.use(cors(corsConfig([`http://localhost:${PORT}`])));
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


/* 
  Core Routes
*/

app.all('/', cors(), healthcheckHandler);
app.get('/sse', $SSE.handler);
app.get('/sse/:clientid', $SSE.handler);
app.post('/events', Event.handler);
app.post('/user', User.handler);


/* 
  TODO: Refactor and Relocate
*/

app.all('/debug/redis', (req: Request, res: Response) => {
  console.log($Redis)
  return res.json(Object.keys($Redis.clients))
})
app.post('/debug/events', async (req: Request, res: Response) => {
  const debug = true;
  await Event.handler(req, res, { debug });
  /* 
  // For full debugging and analysis. Logs, result and everything will be keeped.
    const result = await eventsHandler(req, res, { debug });
    console.log("Debug Event:: => Output", result)
  */
})
app.post('/publish', Event.publishHandler);
app.get('/debug/publish/:target', oldPublishHandler);
app.post('/debug/subscribe', debugSubscribeHandler);
app.post('/subscribe', oldSubscribeHandler);
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

function healthcheckHandler(req: Request, res: Response) {
  const client = { "user-agent": req.headers?.['user-agent'], "origin": req.headers?.origin }
  if (req.method === "POST" && req.body.full) {
    return res.json({ ...Package, client });
  }
  return res.json({ version, latestUpdate, client });
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


async function oldPublishHandler(req: Request, res: Response) {
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
}

async function oldSubscribeHandler(req: Request, res: Response) {
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
  } catch (error: any) {
    const { message } = error;
    return res.status(400).json({ status: { error: true, message }})
  }
}

async function debugSubscribeHandler(req: Request, res: Response) {
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
  } catch (error: any) {
    const { message } = error;
    return res.status(400).json({ status: { error: true, message }})
  }
}