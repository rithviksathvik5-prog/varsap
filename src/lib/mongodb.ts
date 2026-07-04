import { MongoClient, Db } from "mongodb";
import dns from "dns";

// Node's bundled DNS resolver (c-ares) fails to pick up some Windows
// machines' configured nameserver, breaking the SRV lookup that
// mongodb+srv:// needs even though the OS's own DNS resolves fine.
// Forcing a public resolver in dev sidesteps that without touching the
// user's network config.
if (process.env.NODE_ENV !== "production") {
  dns.setServers(["8.8.8.8", "8.8.4.4"]);
}

// Cache the client across hot reloads in dev and across invocations on
// Vercel's serverless runtime so the Atlas free tier's 500-connection
// limit is never exhausted (strict connection pooling).
const globalForMongo = globalThis as unknown as {
  _mongoClientPromise?: Promise<MongoClient>;
};

function getClientPromise(): Promise<MongoClient> {
  if (!globalForMongo._mongoClientPromise) {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error("MONGODB_URI is not set. See .env.example.");
    }
    const client = new MongoClient(uri, { maxPoolSize: 5 });
    globalForMongo._mongoClientPromise = client.connect().catch((err) => {
      // Never cache a failed connection — a transient DNS/network blip on
      // the first request would otherwise poison every later request
      // until the process restarts.
      globalForMongo._mongoClientPromise = undefined;
      throw err;
    });
  }
  return globalForMongo._mongoClientPromise;
}

export async function getDb(): Promise<Db> {
  const client = await getClientPromise();
  return client.db(process.env.MONGODB_DB || "varsap");
}
