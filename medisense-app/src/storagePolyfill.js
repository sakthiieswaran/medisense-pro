/**
 * Polyfill for window.storage — the persistence API MediSenseApp.jsx is
 * written against (Claude's artifact runtime). This makes the exact same
 * app code work in a normal browser.
 *
 * Two-tier storage:
 *  1. If the person has connected a MediSense account (see Profile &
 *     Settings → Account Sync), reads/writes are mirrored to the real
 *     backend in /server — a Node/Express API with bcrypt-hashed
 *     credentials and a persistent per-user data store.
 *  2. localStorage is always the source of truth for "does this work right
 *     now, offline, with zero setup" — every write lands there first and
 *     every read falls back to it if the backend is unreachable or the
 *     person hasn't connected an account. Personal vs shared data both map
 *     to localStorage here since backend "sharing" isn't part of this demo.
 */
import { getToken, remoteGet, remoteSet, remoteDelete, remoteList } from "./apiStorage.js";

const PREFIX = "medisense_storage:";

function readAll() {
  const out = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith(PREFIX)) out[key.slice(PREFIX.length)] = localStorage.getItem(key);
  }
  return out;
}

window.storage = {
  lastSyncError: null,

  async get(key) {
    if (getToken()) {
      try {
        const remote = await remoteGet(key);
        window.storage.lastSyncError = null;
        // Keep localStorage warm with whatever the backend has, so the
        // very next offline load (backend down, airplane mode, etc.) is
        // still correct.
        localStorage.setItem(PREFIX + key, remote.value);
        return remote;
      } catch (err) {
        window.storage.lastSyncError = err;
        // Not on the backend yet, or backend unreachable — fall through.
      }
    }
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) throw new Error(`Key not found: ${key}`);
    return { key, value: raw, shared: false };
  },

  async set(key, value) {
    localStorage.setItem(PREFIX + key, value);
    if (getToken()) {
      remoteSet(key, value)
        .then(() => {
          window.storage.lastSyncError = null;
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("medisense:sync-status", { detail: { ok: true, key } }));
          }
        })
        .catch((err) => {
          window.storage.lastSyncError = err;
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("medisense:sync-status", {
                detail: { ok: false, key, error: err.message },
              })
            );
          }
        });
    }
    return { key, value, shared: false };
  },

  async delete(key) {
    const existed = localStorage.getItem(PREFIX + key) !== null;
    localStorage.removeItem(PREFIX + key);
    if (getToken()) {
      remoteDelete(key).catch(() => {});
    }
    return { key, deleted: existed, shared: false };
  },

  async list(prefix) {
    if (getToken()) {
      try {
        return await remoteList(prefix);
      } catch {
        // fall through to local
      }
    }
    const keys = Object.keys(readAll()).filter((k) => !prefix || k.startsWith(prefix));
    return { keys, prefix, shared: false };
  },
};
