/**
 * Browser Notification & Web Push (VAPID) Integration
 * ---------------------------------------------------
 * Manages Notification API permissions, service-worker PushManager
 * subscriptions against `/api/push/*`, and foreground scheduled medication
 * reminder alerts while the app is open.
 */
import {
  getPushPublicKey,
  subscribePush as apiSubscribePush,
  unsubscribePush as apiUnsubscribePush,
  sendTestPush as apiSendTestPush,
  isConnected,
} from "../apiStorage.js";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function getNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

export async function enableNotificationsAndPush() {
  if (typeof window === "undefined" || !("Notification" in window)) {
    throw new Error("Browser notifications are not supported in this browser.");
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission was denied.");
  }

  let pushSubscribed = false;
  if (isConnected() && "serviceWorker" in navigator && "PushManager" in window) {
    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const { publicKey } = await getPushPublicKey();
      let sub = await registration.pushManager.getSubscription();
      if (!sub) {
        sub = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }
      await apiSubscribePush(sub.toJSON());
      pushSubscribed = true;
    } catch {
      // Foreground Notification API still works even if browser/VAPID unavailable
    }
  }
  return { permission, pushSubscribed };
}

export async function disablePushNotifications() {
  if ("serviceWorker" in navigator) {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager?.getSubscription();
      if (sub) {
        if (isConnected()) await apiUnsubscribePush(sub.endpoint).catch(() => {});
        await sub.unsubscribe();
      }
    } catch {}
  }
}

export async function triggerTestNotification(message = "Time to check your scheduled medications in MediSense.") {
  if (isConnected()) {
    try {
      const res = await apiSendTestPush(message);
      if (res.delivered > 0) return { mode: "push" };
    } catch {
      // Fall back to direct local Notification if push sub not registered on SW (e.g. dev mode)
    }
  }
  if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
    new Notification("MediSense Medication Reminder", {
      body: message,
      icon: "/icon.svg",
      tag: "medisense-test-reminder",
    });
    return { mode: "local" };
  }
  throw new Error("Enable notifications first to receive a test reminder.");
}

/**
 * Starts a lightweight foreground scheduler checking once per minute whether an
 * active medication has an Upcoming dose right at the current HH:MM time.
 */
export function startForegroundReminderLoop(getPatient, onFired) {
  if (typeof window === "undefined") return () => {};
  const firedToday = new Set();

  const check = () => {
    const patient = getPatient?.();
    if (!patient) return;
    if (patient.notificationPrefs?.medication === false) return;

    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    for (const med of patient.medications || []) {
      if (med.active === false) continue;
      for (const time of med.times || []) {
        if (time !== hhmm) continue;
        const log = (patient.logs || []).find(
          (l) => l.medId === med.id && l.date === today && l.scheduledTime === time
        );
        if (log && log.status !== "Upcoming") continue;

        const key = `${today}|${med.id}|${time}`;
        if (firedToday.has(key)) continue;
        firedToday.add(key);

        const body = `Scheduled dose: ${med.name} ${med.dosage}${med.unit}${med.instructions ? ` — ${med.instructions}` : ""}`;
        onFired?.({ med, time, body });

        if ("Notification" in window && Notification.permission === "granted") {
          try {
            new Notification("MediSense Dose Reminder", {
              body,
              icon: "/icon.svg",
              tag: key,
            });
          } catch {}
        }
      }
    }
  };

  const timer = setInterval(check, 30 * 1000);
  return () => clearInterval(timer);
}
