// rui-core/notifications: notifications on the portable
// primitives. A store per application root (never a global singleton):
// `$notifications()` is the nearest one, with `show`, `hide`,
// `update`, `clear` and `clearWaiting`; `<Notifications>` renders it.

export { NOTIFICATION_PLACES, NotificationsContext, notificationsStore, $notifications } from './store.js';
export { Notifications } from './notifications.jsx';
