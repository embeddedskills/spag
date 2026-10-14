// @ts-nocheck
// public/sw.js

self.addEventListener("push", (event) => {
  let data = { title: "Agenda Alert", body: "You have an upcoming event." };

  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }

  // 2. Instruct the mobile OS to display the native system notification banner
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon.png", // Path to your public icon
      badge: "/icons/badge.png", // Small icon shown in Android status bar
      vibrate: [200, 100, 200], // Vibration pattern for Android devices
      actions: data.occurrenceId
        ? [{ action: "complete-occurrence", title: "Mark taken" }]
        : [],
      tag: data.tag || data.occurrenceId || undefined,
      data: {
        url: data.url || "/", // Pass a deep-link redirect URL if needed
        occurrenceId: data.occurrenceId || null,
      },
    })
  );
});

// 3. Open the agenda app instantly when a user taps the notification banner
self.addEventListener("notificationclick", (event) => {
  event.notification.close(); // Dismiss the banner immediately

  if (event.action === "complete-occurrence" && event.notification.data.occurrenceId) {
    event.waitUntil(
      fetch("/api/upcoming/mark-occurrence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ occurrenceId: event.notification.data.occurrenceId }),
      }).catch(() => undefined)
    );
    return;
  }

  event.waitUntil(
    // Check if the app is already open in the background
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === event.notification.data.url && "focus" in client) {
          return client.focus();
        }
      }
      // If the app is completely closed, launch a fresh browser window to your app
      if (clients.openWindow) {
        return clients.openWindow(event.notification.data.url);
      }
    })
  );
});
