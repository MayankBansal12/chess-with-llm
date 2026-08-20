import { createClient, type RedisClientType } from "redis";
import type { TournamentRedisConnection } from "./tournament-store";

export interface ConnectedRedis {
  close: () => Promise<void>;
  connection: TournamentRedisConnection;
}

class RedisConnection implements TournamentRedisConnection {
  private readonly client: RedisClientType;

  constructor(client: RedisClientType) {
    this.client = client;
  }

  async compareAndSetMany(
    key: string,
    expectedValue: string,
    nextValue: string,
    entries: readonly (readonly [string, string])[]
  ): Promise<boolean> {
    const result = await this.client.eval(
      `
        if redis.call("GET", KEYS[1]) ~= ARGV[1] then
          return 0
        end
        redis.call("SET", KEYS[1], ARGV[2])
        for index = 2, #KEYS do
          redis.call("SET", KEYS[index], ARGV[index + 1])
        end
        return 1
      `,
      {
        arguments: [
          expectedValue,
          nextValue,
          ...entries.map(([, value]) => value),
        ],
        keys: [key, ...entries.map(([entryKey]) => entryKey)],
      }
    );
    return result === 1;
  }

  async compareAndSet(
    key: string,
    expectedValue: string,
    nextValue: string
  ): Promise<boolean> {
    const result = await this.client.eval(
      `
        if redis.call("GET", KEYS[1]) == ARGV[1] then
          redis.call("SET", KEYS[1], ARGV[2])
          return 1
        end
        return 0
      `,
      {
        arguments: [expectedValue, nextValue],
        keys: [key],
      }
    );
    return result === 1;
  }

  get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  mGet(keys: string[]): Promise<(string | null)[]> {
    return this.client.mGet(keys);
  }

  async set(key: string, value: string): Promise<void> {
    await this.client.set(key, value);
  }

  async setMany(
    entries: readonly (readonly [string, string])[]
  ): Promise<void> {
    const transaction = this.client.multi();
    for (const [key, value] of entries) {
      transaction.set(key, value);
    }
    await transaction.exec();
  }
}

export const connectRedis = async (
  url: string,
  onError: (error: Error) => void
): Promise<ConnectedRedis> => {
  const client = createClient({ url });
  client.on("error", onError);
  await client.connect();
  return {
    close: async () => {
      if (client.isOpen) {
        await client.close();
      }
    },
    connection: new RedisConnection(client),
  };
};
