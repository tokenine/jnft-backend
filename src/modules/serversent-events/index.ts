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
  handler,
  broadcastMessage,
  commitSSEClient,
  uncommitSSEClient,
}
export default $SSE as any

export async function handler (req: Request, res: Response, next: Function) {
  const clientId = (req.query.clientid as string || req.params.clientid as string || "").toLowerCase();
  const clientRole = (req.query.clientrole as string || req.params.clientrole as string || "user").toUpperCase();
  const headers = {
    'Content-Type': 'text/event-stream',
    'Connection': 'close',
    'Cache-Control': 'no-store',
    'X-Accel-Buffering': 'no',
  };

  const success = await commitSSEClient(clientId, clientRole, res);

  if (!success) {
    res.writeHead(200, headers);
    return res.write(`event: connection\n\ndata: ${JSON.stringify({ event: 'connection', status: { error: true, message: "Must include client id" }})}\n\n`);
  } else {
    console.log(`Subscribe to ${clientRole}::${clientId}`)
    $Redis.clients.subscriber.main.to(`${clientRole}::${clientId}`);

    headers['Connection'] = 'keep-alive';
    res.writeHead(200, headers);
    res.write(`event: subscribe\n\ndata: ${JSON.stringify({ event: 'connection', status: { success: true, message: `${clientId} subscribed to SSE as ${clientRole} successfully` } })}\n\n`);
    (res as any).flush();

    const ping = setInterval(async () => {
      //console.log(`ping ${clientId}`, res.write(`event: ping\n\ndata: ping\n\n`), (res as any).flush());
      // await commitSSEClient(clientId, clientRole, res)
      res.write(`event: ping\n\nid: ping-${clientId}\n\ndata: {"event":"ping"}\n\n`);
      (res as any).flush()
    }, 10000)

    res.on('error', (err: Error) => {
      console.error(`Connection error for ${clientId}`, err)
    })

    req.on('close', () => {
      console.log(`Connection closed for ${clientId}`);
      res.end(); // very important or message will not be received
      uncommitSSEClient(clientId, clientRole);
      clearInterval(ping)
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
  if (!$SSE.activeResponder[key_]) {
    $SSE.activeResponder[key_] = res;
    console.log(`Commit SSE Client ${clientId} as ${clientRole}`);
  }
  // $SSE.clients[clientRole][clientId] = $SSE.activeResponder[clientId];
  //$Redis.clients.db.main.set(`${$Redis.KEY_PREFIX.PUBSUB.CHANNEL}${clientRole}/${clientId}`, now);
  await $Redis.clients.db.main.zadd(`${$Redis.KEY_PREFIX.PUBSUB.CHANNEL}ALLCLIENT`, "NX", now, key_);
  

  return true
}

function uncommitSSEClient(clientId: string, clientRole: string) {
  delete $SSE.activeResponder[clientRole + "::" + clientId];
    // delete $SSE.clients[clientRole][clientId];
}


function broadcastMessage(receivers: string[], payloadFn: (payloads: any) => I_SSEmessageObject, payload: any) {
  console.log("broadcastMessage", receivers, payload);

  receivers.forEach((receiverId: string) => {
    console.log("broadcastMessage to", receiverId, $SSE.activeResponder[receiverId] ? "and is active" : "but is not active")
    const message_ = SSEmessageGenerator(payloadFn({ receiverId, payload }));
    console.log("Prepare to send message", message_, "to", receiverId)
    if ($SSE.activeResponder[receiverId]) {
      console.log("Sending Message")
      $SSE.activeResponder[receiverId].write(message_);
      // $SSE.activeResponder[receiverId].flush();
      $SSE.activeResponder[receiverId].flushHeaders();
    }
  });
  return true
}

function SSEmessageGenerator({ data, id, event }: I_SSEmessageObject) {
  let message_ = ``
  if (event) { message_ += `event: ${event}\n\n` }
  if (id) { message_ += `id: ${id}\n\n` }
  if (typeof data === 'string' || typeof data === 'number') { message_ += `data: ${data}\n\n` }
  else { message_ += `data: ${JSON.stringify(data)}\n\n`}
  return message_ 
}
