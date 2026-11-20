import { createHash } from 'node:crypto';
import { db } from './db';
import { EmailDailyBudget, EmailQueueState } from './models';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export type QueueReservation = { key: string; reservedAt: Date };
export type QueueReservationStore = {
  refresh: (key: string, reservedAt: Date) => Promise<boolean>;
  reserveIfRoom: (key: string, reservedAt: Date, limit: number) => Promise<boolean>;
  list: () => Promise<QueueReservation[]>;
  removeStale: (keys: string[], cutoff: Date) => Promise<void>;
  ensureActive: (key: string, reservedAt: Date) => Promise<void>;
};
export type BudgetReservationStore = {
  reserve: (key: string, limit: number) => Promise<boolean>;
};

export async function reserveQueueReservation(store: QueueReservationStore, key: string, limit: number, reservedAt = new Date()) {
  if (await store.refresh(key, reservedAt)) return true;
  return store.reserveIfRoom(key, reservedAt, limit);
}

export async function reconcileQueueReservations(
  store: QueueReservationStore,
  activeKeys: string[],
  now = new Date(),
  recoveryAgeMs = RESERVATION_RECOVERY_AGE_MS,
) {
  const active = new Set(activeKeys);
  const cutoff = new Date(now.getTime() - recoveryAgeMs);
  const staleOrphans = (await store.list())
    .filter((reservation) => reservation.reservedAt < cutoff && !active.has(reservation.key))
    .map((reservation) => reservation.key);
  if (staleOrphans.length) await store.removeStale(staleOrphans, cutoff);
  for (const key of activeKeys) await store.ensureActive(key, now);
}

export function dailyBudgetBucket(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export async function reserveBudgetReservation(store: BudgetReservationStore, key: string, limit: number) {
  return store.reserve(key, limit);
}

function configuredLimit(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > 10_000) {
    throw new Error(`${name} must be an integer between 1 and 10000.`);
  }
  return value;
}

export const emailDailyBudget = () => configuredLimit('EMAIL_DAILY_BUDGET', 100);
export const emailQueueCapacity = () => configuredLimit('EMAIL_MAX_PENDING', 250);
const RESERVATION_RECOVERY_AGE_MS = 5 * 60_000;

export function nextUtcDay(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}

async function addKeyWithinCapacity(model: typeof EmailQueueState | typeof EmailDailyBudget, id: string, key: string, limit: number, expiresAt?: Date) {
  const update = {
    $addToSet: { keys: key },
    ...(expiresAt ? { $setOnInsert: { expiresAt } } : {}),
  };
  try {
    const row = await model.findOneAndUpdate(
      { _id: id, $expr: { $lt: [{ $size: { $ifNull: ['$keys', []] } }, limit] } },
      update,
      { upsert: true, new: true },
    );
    return Boolean(row?.keys?.includes(key));
  } catch (error) {
    if ((error as { code?: number })?.code !== 11000) throw error;
    const row = await model.findById(id).select('keys').lean();
    return Boolean(row?.keys?.includes(key));
  }
}

export async function reservePendingEmail(key: string) {
  await db();
  const hashedKey = hash(key);
  return reserveQueueReservation(queueReservationStore, hashedKey, emailQueueCapacity());
}

const queueReservationStore: QueueReservationStore = {
  async refresh(key, reservedAt) {
    const row = await EmailQueueState.findOneAndUpdate(
      { _id: 'pending', reservations: { $elemMatch: { key } } },
      { $set: { 'reservations.$.reservedAt': reservedAt } },
      { new: true },
    );
    if (row) return true;
    const legacy = await EmailQueueState.findOneAndUpdate(
      { _id: 'pending', keys: key, reservations: { $not: { $elemMatch: { key } } } },
      { $pull: { keys: key }, $push: { reservations: { key, reservedAt } } },
      { new: true },
    );
    return Boolean(legacy);
  },
  async reserveIfRoom(key, reservedAt, limit) {
    try {
      const row = await EmailQueueState.findOneAndUpdate(
        {
          _id: 'pending',
          reservations: { $not: { $elemMatch: { key } } },
          $expr: {
            $lt: [
              {
                $add: [
                  { $size: { $ifNull: ['$keys', []] } },
                  { $size: { $ifNull: ['$reservations', []] } },
                ],
              },
              limit,
            ],
          },
        },
        { $push: { reservations: { key, reservedAt } } },
        { upsert: true, new: true },
      );
      return Boolean(row?.reservations?.some((reservation: QueueReservation) => reservation.key === key));
    } catch (error) {
      if ((error as { code?: number })?.code !== 11000) throw error;
      return this.refresh(key, reservedAt);
    }
  },
  async list() {
    const state = await EmailQueueState.findById('pending').select('keys reservations').lean<{ keys?: string[]; reservations?: QueueReservation[] } | null>();
    return [
      ...(state?.reservations || []),
      ...(state?.keys || []).map((key) => ({ key, reservedAt: new Date(0) })),
    ];
  },
  async removeStale(keys, cutoff) {
    await EmailQueueState.updateOne(
      { _id: 'pending' },
      {
        $pull: {
          keys: { $in: keys },
          reservations: { key: { $in: keys }, reservedAt: { $lt: cutoff } },
        },
      },
    );
  },
  async ensureActive(key, reservedAt) {
    if (await this.refresh(key, reservedAt)) return;
    try {
      await EmailQueueState.findOneAndUpdate(
        { _id: 'pending', reservations: { $not: { $elemMatch: { key } } } },
        { $push: { reservations: { key, reservedAt } } },
        { upsert: true, new: true },
      );
    } catch (error) {
      if ((error as { code?: number })?.code !== 11000) throw error;
      await this.refresh(key, reservedAt);
    }
  },
};

export async function releasePendingEmail(key: string) {
  await db();
  const hashedKey = hash(key);
  await EmailQueueState.updateOne(
    { _id: 'pending' },
    { $pull: { keys: hashedKey, reservations: { key: hashedKey } } },
  );
}

export async function reserveDailyEmail(key: string, now = new Date()) {
  await db();
  const day = dailyBudgetBucket(now);
  const expiresAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 2));
  return reserveBudgetReservation({
    reserve: (hashedKey, limit) => addKeyWithinCapacity(EmailDailyBudget, day, hashedKey, limit, expiresAt),
  }, hash(key), emailDailyBudget());
}

export async function reconcilePendingEmails(activeKeys: string[]) {
  await db();
  await reconcileQueueReservations(queueReservationStore, activeKeys.map(hash));
}
