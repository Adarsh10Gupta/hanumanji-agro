import mongoose from 'mongoose';

type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

declare global {
  // Preserve one pool across Next.js development hot reloads.
  var mongooseCache: MongooseCache | undefined;
}

const cache = global.mongooseCache ?? { conn: null, promise: null };
global.mongooseCache = cache;

export async function db() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required');

  if (cache.conn?.connection.readyState === 1) return cache.conn;

  if (!cache.promise) {
    cache.promise = mongoose.connect(uri, {
      dbName: 'hanumanji_agro',
      bufferCommands: false,
      maxPoolSize: 10,
      minPoolSize: 0,
      serverSelectionTimeoutMS: 10000,
    });
  }

  const pending = cache.promise;
  try {
    const connection = await pending;
    cache.conn = connection;
    if (cache.promise === pending) cache.promise = null;
    return connection;
  } catch (error) {
    if (cache.promise === pending) cache.promise = null;
    cache.conn = null;
    throw error;
  }
}
