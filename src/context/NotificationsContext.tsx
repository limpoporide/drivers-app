import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  clearNotifications,
  deleteNotification,
  fetchNotifications,
  fetchUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from '../lib/notifications';

type NotificationsContextValue = {
  notifications: NotificationItem[];
  unreadCount: number;
  isLoadingNotifications: boolean;
  refreshNotifications: () => Promise<void>;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteById: (notificationId: string) => Promise<void>;
  clearAll: () => Promise<void>;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function NotificationsProvider({ children }: React.PropsWithChildren) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(true);

  const refreshNotifications = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      setIsLoadingNotifications(false);
      return;
    }

    const [nextNotifications, nextUnreadCount] = await Promise.all([
      fetchNotifications(),
      fetchUnreadNotificationCount(),
    ]);

    setNotifications(nextNotifications);
    setUnreadCount(nextUnreadCount);
    setIsLoadingNotifications(false);
  }, []);

  const markAsRead = useCallback(async (notificationId: string) => {
    setNotifications((current) =>
      current.map((notification) =>
        notification.id === notificationId ? { ...notification, isRead: true } : notification
      )
    );
    setUnreadCount((current) => Math.max(0, current - 1));
    await markNotificationRead(notificationId);
  }, []);

  const markAllAsRead = useCallback(async () => {
    setNotifications((current) => current.map((notification) => ({ ...notification, isRead: true })));
    setUnreadCount(0);
    await markAllNotificationsRead();
  }, []);

  const deleteById = async (notificationId: string) => {
    const removedNotification = notifications.find((notification) => notification.id === notificationId) ?? null;

    setNotifications((current) => current.filter((notification) => notification.id !== notificationId));

    if (removedNotification && !removedNotification.isRead) {
      setUnreadCount((current) => Math.max(0, current - 1));
    }

    try {
      await deleteNotification(notificationId);
    } catch (error) {
      if (removedNotification) {
        setNotifications((current) => [removedNotification, ...current]);

        if (!removedNotification.isRead) {
          setUnreadCount((current) => current + 1);
        }
      }

      throw error;
    }
  };

  const clearAll = async () => {
    const previousNotifications = notifications;
    const previousUnreadCount = unreadCount;

    console.log('[NotificationsContext] clearAll started', {
      notificationCount: previousNotifications.length,
      unreadCount: previousUnreadCount,
    });

    setNotifications([]);
    setUnreadCount(0);

    try {
      await clearNotifications();
      console.log('[NotificationsContext] clearAll completed');
    } catch (error) {
      console.log('[NotificationsContext] clearAll failed, restoring notifications', error);
      setNotifications(previousNotifications);
      setUnreadCount(previousUnreadCount);
      throw error;
    }
  };

  useEffect(() => {
    let isActive = true;
    const channelName = `driver-notifications-${Date.now()}`;

    refreshNotifications();

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
        },
        () => {
          if (isActive) {
            refreshNotifications();
          }
        }
      )
      .subscribe();

    return () => {
      isActive = false;
      supabase.removeChannel(channel);
    };
  }, [refreshNotifications]);

  const value = useMemo<NotificationsContextValue>(
    () => ({
      notifications,
      unreadCount,
      isLoadingNotifications,
      refreshNotifications,
      markAsRead,
      markAllAsRead,
      deleteById,
      clearAll,
    }),
    [notifications, unreadCount, isLoadingNotifications, refreshNotifications, markAsRead, markAllAsRead, deleteById, clearAll]
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const context = useContext(NotificationsContext);

  if (!context) {
    throw new Error('useNotifications must be used within a NotificationsProvider');
  }

  return context;
}
