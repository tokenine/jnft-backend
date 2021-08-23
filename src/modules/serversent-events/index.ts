import { Request, Response } from 'express';
import { I_SSEmessageObject } from './index.d';
import { $Redis } from '..';

export const $SSE: any = {
  activeResponder: {},
  clients: {
    "USER": {},
    "DEVICE": {},
    "SYSTEM": {},
    "ADMIN": {},
  },
  sseHandler,
  broadcastMessage,
  commitSSEClient,
  uncommitSSEClient,
}

export default $SSE as any

async function sseHandler (req: Request, res: Response, next: Function) {
  const clientId = (req.query.clientid as string || req.params.clientid as string || "").toLowerCase();
  const clientRole = (req.query.clientrole as string || req.params.clientrole as string || "user").toUpperCase();
  const headers = {
    'Content-Type': 'text/event-stream',
    'Connection': 'close',
    'Cache-Control': 'no-cache'
  };

  const success = await commitSSEClient(clientId, clientRole, res);

  if (!success) {
    res.writeHead(200, headers);
    return res.write(`event: subscribe\n\ndata: ${JSON.stringify({ status: { error: true, message: "Must include client id" }})}\n\n`);
  } else {
    console.log(`Subscribe to ${clientRole}::${clientId}`)
    $Redis.clients.subscriber.main.to(`${clientRole}::${clientId}`);

    headers['Connection'] = 'keep-alive';
    res.writeHead(200, headers);
    res.write(`event: subscribe\n\ndata: ${JSON.stringify({ status: { success: true, message: `${clientId} subscribed to SSE as ${clientRole} successfully` } })}\n\n`);
  
    req.on('close', () => {
      // console.log(`Connection closed for ${clientId}`);
      uncommitSSEClient(clientId, clientRole);
      // $Redis.clients.subscriber.unsubscribe("user::" + clientId);
    });
  }
}

async function commitSSEClient(clientId: string, clientRole: string, res: Response) {
  console.log(`Commit SSE Client ${clientId} as ${clientRole}`);
  if (!clientId || !$SSE.clients[clientRole]) {
    return false
  }

  const now = new Date().getTime();

  const key_ = clientRole + "::" + clientId;
  $SSE.activeResponder[key_] = res;
  // $SSE.clients[clientRole][clientId] = $SSE.activeResponder[clientId];
  //$Redis.clients.db.main.set(`${$Redis.KEY_PREFIX.PUBSUB.CHANNEL}${clientRole}/${clientId}`, now);
  await $Redis.clients.db.main.zadd(`${$Redis.KEY_PREFIX.PUBSUB.CHANNEL}ALLCLIENT`, "NX", now, key_);
  
  console.log(`Commit SSE Client ${clientId} as ${clientRole}`);

  return true
}

function uncommitSSEClient(clientId: string, clientRole: string) {
  setTimeout(() => {
    delete $SSE.activeResponder[clientRole + "::" + clientId];
    // delete $SSE.clients[clientRole][clientId];
  }, 15 * 60 * 1000)
}


function broadcastMessage(receivers: string[], payloadFn: (payloads: any) => I_SSEmessageObject, payloads: any) {
  receivers.forEach((receiverId: string) => {
    console.log("broadcaseMessage to", receiverId, $SSE.activeResponder[receiverId] ? "and is active" : "but is not active")
    const message_ = SSEmessageGenerator(payloadFn({ receiverId, payloads }));
    if ($SSE.activeResponder[receiverId]) {
      $SSE.activeResponder[receiverId].write(message_);
      // $SSE.activeResponder[receiverId].flush();
      $SSE.activeResponder[receiverId].flushHeaders();
    }
  });
}

function SSEmessageGenerator({ data, id, event }: I_SSEmessageObject) {
  let message_ = ``
  if (event) { message_ += `event: ${event}\n\n` }
  if (id) { message_ += `id: ${id}\n\n` }
  if (typeof data === 'string' || typeof data === 'number') { message_ += `data: ${data}\n\n` }
  else { message_ += `data: ${JSON.stringify(data)}\n\n`}
  return message_ 
}
