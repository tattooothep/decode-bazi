import { Queue, type JobsOptions } from "bullmq";

export const QUEUE_NAMES = {
  interactive: "hourkey-ai-interactive",
  fusion: "hourkey-ai-fusion",
  palm: "hourkey-vision-palm",
  maintenance: "hourkey-maintenance",
} as const;

type QueueName = typeof QUEUE_NAMES[keyof typeof QUEUE_NAMES];
type QueueGlobal = typeof globalThis & { __hourkeyQueues?: Map<QueueName, Queue> };
const queueGlobal = globalThis as QueueGlobal;

function queueFor(name: QueueName): Queue {
  queueGlobal.__hourkeyQueues ||= new Map();
  const existing = queueGlobal.__hourkeyQueues.get(name);
  if (existing) return existing;
  const queue = new Queue(name, {
    connection: queueConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5_000 },
      removeOnComplete: { age: 86_400, count: 10_000 },
      removeOnFail: { age: 604_800, count: 20_000 },
    },
  });
  queueGlobal.__hourkeyQueues.set(name, queue);
  return queue;
}

function queueConnection() {
  const url = new URL(process.env.REDIS_URL || "redis://127.0.0.1:6380");
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0,
    maxRetriesPerRequest: null,
  };
}

export async function enqueuePalmJob(jobId: string, options: JobsOptions = {}): Promise<void> {
  await queueFor(QUEUE_NAMES.palm).add("palm-read", { jobId }, { jobId, priority: 20, ...options });
}

export async function enqueueFusionJob(jobId: string, options: JobsOptions = {}): Promise<void> {
  await queueFor(QUEUE_NAMES.fusion).add("fusion5-read", { jobId }, { jobId, priority: 40, ...options });
}
