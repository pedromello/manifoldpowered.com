import { isPrivateNotificationUrl } from "lib/notification-privacy";

test.each([
  "/notifications/unsubscribe/capability-token",
  "/notifications/unsubscribe#token=capability-token",
  "/pt-BR/notifications/unsubscribe/capability-token",
  "https://www.manifoldpowered.com/en/notifications/unsubscribe/capability-token?source=email",
])("keeps unsubscribe capabilities out of analytics: %s", (url) => {
  expect(isPrivateNotificationUrl(url)).toBe(true);
});

test.each([
  "/settings/notifications",
  "/pt-BR/store/club",
  "/store/club/selections/new-games",
])("preserves analytics for ordinary routes: %s", (url) => {
  expect(isPrivateNotificationUrl(url)).toBe(false);
});
