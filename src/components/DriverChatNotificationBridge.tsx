import { useEffect, useMemo, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { usePathname } from 'expo-router';
import { useJobRequests } from '../context/JobRequestsContext';
import { subscribeToChatMessages } from '../lib/chat';

const ACTIVE_RIDER_CHAT_STATUSES = new Set(['accepted', 'arrived', 'in_progress']);
const CHAT_SCREEN_PATH = '/request/chat';

export function DriverChatNotificationBridge() {
  const pathname = usePathname();
  const { notificationRequests } = useJobRequests();
  const notifiedMessageIdsRef = useRef(new Set<string>());

  const activeRiderBooking = useMemo(
    () =>
      notificationRequests.find(
        (request) => request.source === 'rider_booking' && ACTIVE_RIDER_CHAT_STATUSES.has(request.status)
      ) ?? null,
    [notificationRequests]
  );

  useEffect(() => {
    if (!activeRiderBooking?.id) {
      return;
    }

    const unsubscribe = subscribeToChatMessages(activeRiderBooking.id, (message) => {
      if (message.sender_role !== 'rider') {
        return;
      }

      if (notifiedMessageIdsRef.current.has(message.id)) {
        return;
      }

      notifiedMessageIdsRef.current.add(message.id);

      if (pathname === CHAT_SCREEN_PATH) {
        return;
      }

      void Notifications.scheduleNotificationAsync({
        content: {
          title: `${activeRiderBooking.riderName || 'Rider'} sent a message`,
          body: message.message,
          sound: 'default',
          data: {
            type: 'ride_chat_message',
            screen: CHAT_SCREEN_PATH,
            bookingId: activeRiderBooking.id,
            riderName: activeRiderBooking.riderName,
            messageId: message.id,
          },
        },
        trigger: null,
      }).catch((error) => {
        console.log('[ChatNotifications] failed to schedule local chat notification', {
          bookingId: activeRiderBooking.id,
          messageId: message.id,
          error,
        });
      });
    });

    return () => {
      unsubscribe();
    };
  }, [activeRiderBooking?.id, activeRiderBooking?.riderName, pathname]);

  return null;
}
