import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { registerDriverPushToken, clearCachedDriverPushToken } from '../lib/push-notifications';
import {
  bringNativeCallAppToForeground,
  initializeNativeCalling,
  registerNativeCallingHandlers,
  type NativeManagedCall,
} from '../lib/native-calling';
import { supabase } from '../lib/supabase';

export function PushNotificationBootstrap() {
  useEffect(() => {
    const emitDriverCallSignal = async (event: 'call_declined', call: NativeManagedCall) => {
      const channel = supabase
        .channel(`ride_call:${call.bookingId}:response`)
        .on('broadcast', { event }, () => undefined);

      try {
        const isChannelReady = await new Promise<boolean>((resolve) => {
          let settled = false;
          const timeoutId = setTimeout(() => {
            if (settled) {
              return;
            }

            settled = true;
            resolve(false);
          }, 4000);

          channel.subscribe((status) => {
            if (settled) {
              return;
            }

            if (status === 'SUBSCRIBED') {
              settled = true;
              clearTimeout(timeoutId);
              resolve(true);
              return;
            }

            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
              settled = true;
              clearTimeout(timeoutId);
              resolve(false);
            }
          });
        });

        if (!isChannelReady) {
          throw new Error('Driver native call response channel did not become ready.');
        }

        await channel.send({
          type: 'broadcast',
          event,
          payload: {
            bookingId: call.bookingId,
            participantName: call.participantName,
            respondedAt: new Date().toISOString(),
          },
        });
      } catch (error) {
        console.log('[PushNotifications] failed to send native call signal', { event, error });
      } finally {
        supabase.removeChannel(channel);
      }
    };

    void initializeNativeCalling();

    registerDriverPushToken().catch((error) => {
      console.log('[PushNotifications] registration failed', error);
    });

    const { data: authSubscription } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        clearCachedDriverPushToken().catch(() => undefined);
        return;
      }

      registerDriverPushToken().catch((error) => {
        console.log('[PushNotifications] auth refresh registration failed', error);
      });
    });

    // Tapping a push notification navigates to the screen the backend indicated.
    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const notificationData = response.notification.request.content.data;
      const targetScreen = notificationData?.screen;

      if (targetScreen === '/request/chat' && typeof notificationData?.bookingId === 'string') {
        router.push({
          pathname: '/request/chat',
          params: {
            bookingId: notificationData.bookingId,
            riderName: typeof notificationData?.riderName === 'string' ? notificationData.riderName : 'Rider',
          },
        });
        return;
      }

      if (typeof targetScreen === 'string') {
        router.push(targetScreen as never);
      }
    });

    const removeNativeCallingHandlers = registerNativeCallingHandlers({
      onAnswer: (call) => {
        if (!call?.bookingId) {
          return;
        }

        void bringNativeCallAppToForeground();

        router.push({
          pathname: '/request/call',
          params: {
            bookingId: call.bookingId,
            participantName: call.participantName,
            callUUID: call.callUUID,
            incoming: '1',
          },
        });
      },
      onEnd: (call) => {
        if (!call || call.direction !== 'incoming' || call.state !== 'ringing') {
          return;
        }

        void emitDriverCallSignal('call_declined', call);
      },
    });

    return () => {
      authSubscription.subscription.unsubscribe();
      responseSubscription.remove();
      removeNativeCallingHandlers();
    };
  }, []);

  return null;
}