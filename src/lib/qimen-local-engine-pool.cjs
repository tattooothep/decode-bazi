"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Worker } = require("node:worker_threads");

const DEFAULT_ENGINE_PATH = "/root/qimen-api/src/qimenNotificationEngine.js";
const WORKER_PATH = path.resolve(__dirname, "qimen-local-engine-worker.cjs");

function createQimenLocalEnginePool(options = {}) {
  const size = Math.max(1, Math.min(16, Number(options.size) || Math.min(8, os.availableParallelism())));
  const enginePath = path.resolve(String(options.enginePath || process.env.QIMEN_NOTIFICATION_ENGINE_PATH || DEFAULT_ENGINE_PATH));
  if (!fs.statSync(enginePath).isFile()) throw new Error("qimen_local_engine_path_invalid");
  let sequence = 0;
  let closed = false;
  const queue = [];
  const slots = new Set();

  function settle(task, method, value) {
    if (!task || task.settled) return;
    task.settled = true;
    if (task.signal && task.abortListener) task.signal.removeEventListener("abort", task.abortListener);
    task[method](value);
  }

  function dispatch() {
    if (closed) return;
    for (const slot of slots) {
      if (slot.task) continue;
      let task = queue.shift();
      while (task?.settled) task = queue.shift();
      if (!task) return;
      slot.task = task;
      slot.worker.postMessage({ id: task.id, params: task.params });
    }
  }

  function spawn() {
    const worker = new Worker(WORKER_PATH, { workerData: { enginePath } });
    const slot = { worker, task: null, stopping: false };
    slots.add(slot);
    worker.on("message", (message) => {
      const task = slot.task;
      if (!task || message?.id !== task.id) return;
      slot.task = null;
      if (message.ok === true) settle(task, "resolve", message.result);
      else {
        const failure = new Error(message?.error?.message || "qimen_engine_worker_failed");
        failure.name = message?.error?.name || "Error";
        if (message?.error?.code) failure.code = message.error.code;
        settle(task, "reject", failure);
      }
      dispatch();
    });
    worker.on("error", (error) => {
      settle(slot.task, "reject", error);
      slot.task = null;
      if (!closed) void worker.terminate();
    });
    worker.on("exit", (code) => {
      slots.delete(slot);
      if (slot.task) settle(slot.task, "reject", new Error(`qimen_engine_worker_exit_${code}`));
      if (!closed && !slot.stopping) spawn();
      dispatch();
    });
  }

  for (let index = 0; index < size; index += 1) spawn();

  const calculate = (params, taskOptions = {}) => new Promise((resolve, reject) => {
    if (closed) return reject(new Error("qimen_engine_pool_closed"));
    const signal = taskOptions.signal;
    if (signal?.aborted) return reject(signal.reason || new DOMException("Aborted", "AbortError"));
    const task = { id: ++sequence, params, resolve, reject, signal, abortListener: null, settled: false };
    if (signal) {
      task.abortListener = () => settle(task, "reject", signal.reason || new DOMException("Aborted", "AbortError"));
      signal.addEventListener("abort", task.abortListener, { once: true });
    }
    queue.push(task);
    dispatch();
  });

  const close = async () => {
    if (closed) return;
    closed = true;
    for (const task of queue.splice(0)) settle(task, "reject", new Error("qimen_engine_pool_closed"));
    await Promise.all([...slots].map((slot) => {
      slot.stopping = true;
      settle(slot.task, "reject", new Error("qimen_engine_pool_closed"));
      slot.task = null;
      return slot.worker.terminate();
    }));
    slots.clear();
  };

  return Object.freeze({ calculate, close, size, enginePath });
}

module.exports = Object.freeze({ createQimenLocalEnginePool });
