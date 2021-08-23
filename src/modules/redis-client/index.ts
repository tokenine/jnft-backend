import { Tedis } from 'tedis';
import IORedis from 'ioredis';
import { defaultMessageListener, defaultPatternListener } from '../pubsub';

export const KEY_PREFIX = {
  PUBSUB: {
    CHANNEL: "PUBSUB::SUBSCRIPTION-CHANNEL//",
    CLIENT_SUBSCRIPTION: "PUBSUB::CLIENT_SUBSCRIPTION//"
  }
}

export const $Redis: any = {
  KEY_PREFIX,
  clients: {
    db: {
      main: connectIORedis()
    },
    subscriber: {},
    publisher: connectIORedis()
  }
}

createSubscriber("main", defaultMessageListener);

export default $Redis

function connectTedis(opts?: any) {
  return new Tedis({
    host: "127.0.0.1",
    port: 6379,
    ...opts
  })
}

function connectIORedis(opts?: any) {
  return new IORedis()
}

function createSubscriber(name: string, messageListener = defaultMessageListener, patternListener = defaultPatternListener) {
  const _subscriber = connectIORedis();
  const _db = connectIORedis();

  // Load all default and store subscription channel
  _db.zrange(`${KEY_PREFIX.PUBSUB.CHANNEL}DEFAULT`, 0, -1).then((_channels: string[]) => { if (_channels.length) { _subscriber.subscribe(_channels).then() }});
  _db.zrange(`${KEY_PREFIX.PUBSUB.CHANNEL}DEFAULT-PATTERN`, 0, -1).then((_channels: string[]) => { if (_channels.length) { _subscriber.psubscribe(_channels).then() }});
  _db.zrange(`${KEY_PREFIX.PUBSUB.CHANNEL}ALLCLIENT`, 0, -1).then((_clients: string[]) => { if (_clients.length) { _subscriber.subscribe(_clients).then() }});
  // _db.zrange(`${KEY_PREFIX.PUBSUB.CHANNEL}/RESUME`, 0, -1).then((_channels: string[]) => { if (_channels.length) { _subscriber.subscribe(_channels).then() }});

  // _subscriber.pubsub("CHANNELS", "*").then((_channels: string[]) => console.log(_channels));

  $Redis.clients.subscriber[name] = {
    _subscriber,
    subscription: _subscriber.condition.subscriber,
    to(channel: string) {
      return _subscriber.subscribe(channel);
    },
    onMessage: _subscriber.on("message", messageListener),
    onPattern: _subscriber.on("pmessage", patternListener),
    // onMessage: (listener: (channel: string, message: string) => void) => _subscriber.on("message", listener)
  }
}
