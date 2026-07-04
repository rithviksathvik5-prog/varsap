import { MongoClient, Db } from "mongodb";

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
    globalForMongo._mongoClientPromise = client.connect();
  }
  return globalForMongo._mongoClientPromise;
}

export async function getDb(): Promise<Db> {
  const client = await getClientPromise();
  return client.db(process.env.MONGODB_DB || "varsap");
}
