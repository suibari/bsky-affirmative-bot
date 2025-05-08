import { Notification } from '@atproto/api/dist/client/types/app/bsky/notification/listNotifications';
import { QueryParams } from '@atproto/api/dist/client/types/app/bsky/notification/listNotifications';
import { agent } from './agent.js';

/**
 * 未読通知をリストアップする
 * @returns 未読通知の配列
 */
export async function listUnreadNotifications(params: QueryParams): Promise<Notification[]> {
  const notifications: Notification[] = [];

  try {
    let response = await agent.listNotifications(params);

    response.data.notifications
    notifications.push(
      ...response.data.notifications.filter((n) => !n.isRead)
    );

    while ('cursor' in response.data) {
      const paramsWithCursor = { ...params, cursor: response.data.cursor };
      response = await agent.listNotifications(paramsWithCursor);
      notifications.push(
        ...response.data.notifications.filter((n) => !n.isRead)
      );
    }

    return notifications;
  } catch (e) {
    throw e;
  }
}
