import { Request, Response } from 'express';
import { $Redis } from '..';

export async function handler(req: Request, res: Response) {
  // TODO: Send hash to get only updates for both notification and subscription
  const { client_id, start = 0, end = 10 } = req.body

  // Get Notifications
  const notification = await getNotification(client_id)

  // Get Subscriptions
  const subscription = await getSubscription(client_id)

  // More fore user data
  res.json({ notification, subscription })
}

async function getNotification(client_id: string, hash?: string, opts?: any) {
  const start = 0; // Start at the latest
  const end = 9; // Stop at row #10

  return {
    list: await $Redis.clients.db.main.zrange(`EVENT:RELATED//USER::${client_id}`, start, end) || [],
    hash: "",
  }
}

async function getSubscription(client_id: string, hash?: string, opts?: any) {
  const CLIENT = "USER" + "::" + client_id;

  return {
    list: await $Redis.clients.db.main.zrange(`${$Redis.KEY_PREFIX.PUBSUB.CLIENT_SUBSCRIPTION}${CLIENT}`, 0, -1) || [],
    hash: "",
  }
}
