import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/context/ThemeContext';
import { useNotifications } from '../../src/context/NotificationsContext';
import type { NotificationItem } from '../../src/lib/notifications';

const getIcon = (type: string) => {
  switch (type) {
    case 'booking_request':
      return 'car';
    case 'earnings':
      return 'cash';
    case 'system':
      return 'information-circle';
    default:
      return 'notifications';
  }
};

const formatRelativeTime = (dateString: string) => {
  const date = new Date(dateString);
  const diffMinutes = Math.floor((Date.now() - date.getTime()) / (60 * 1000));

  if (diffMinutes < 1) {
    return 'Just now';
  }

  if (diffMinutes < 60) {
    return `${diffMinutes} min${diffMinutes === 1 ? '' : 's'} ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  }

  const diffDays = Math.floor(diffHours / 24);

  if (diffDays === 1) {
    return 'Yesterday';
  }

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export default function Notifications() {
  const { theme } = useTheme();
  const { notifications, isLoadingNotifications, unreadCount, refreshNotifications, markAsRead, markAllAsRead, deleteById, clearAll } =
    useNotifications();

  const handleOpenNotification = (notification: NotificationItem) => {
    if (!notification.isRead) {
      markAsRead(notification.id);
    }
  };

  const handleDeleteNotification = (notification: NotificationItem) => {
    Alert.alert('Delete notification', 'This will remove the notification from your list.', [
      {
        text: 'Cancel',
        style: 'cancel',
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteById(notification.id);
          } catch {
            Alert.alert('Delete failed', 'We could not delete this notification. Please try again.');
          }
        },
      },
    ]);
  };

  const handleClearAllNotifications = () => {
    Alert.alert('Clear all notifications', 'This will delete all driver notifications permanently.', [
      {
        text: 'Cancel',
        style: 'cancel',
      },
      {
        text: 'Clear all',
        style: 'destructive',
        onPress: async () => {
          try {
            console.log('[NotificationsScreen] Clear all confirmed', {
              notificationCount: notifications.length,
              unreadCount,
            });
            await clearAll();
          } catch (error) {
            console.log('[NotificationsScreen] Clear all failed', error);
            Alert.alert('Clear failed', 'We could not clear your notifications. Please try again.');
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>Notifications</Text>
        <View style={styles.headerActions}>
          {notifications.length > 0 ? (
            <TouchableOpacity onPress={handleClearAllNotifications}>
              <Text style={[styles.clearAllText, { color: theme.colors.error }]}>Clear all</Text>
            </TouchableOpacity>
          ) : null}
          {unreadCount > 0 ? (
            <TouchableOpacity onPress={markAllAsRead}>
              <Text style={[styles.markAllRead, { color: theme.colors.primary }]}>Mark all read</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={isLoadingNotifications} onRefresh={refreshNotifications} tintColor={theme.colors.primary} />
        }
      >
        {isLoadingNotifications && notifications.length === 0 ? (
          <ActivityIndicator color={theme.colors.primary} style={styles.loadingIndicator} />
        ) : null}

        {notifications.map((notification) => (
          <TouchableOpacity
            key={notification.id}
            style={[
              styles.notificationCard,
              {
                backgroundColor: notification.isRead ? theme.colors.card : theme.colors.primary + '10',
                borderColor: theme.colors.border
              }
            ]}
            onPress={() => handleOpenNotification(notification)}
          >
            <View style={[styles.iconContainer, { backgroundColor: theme.colors.primary + '20' }]}>
              <Ionicons name={getIcon(notification.type) as any} size={24} color={theme.colors.primary} />
            </View>
            <View style={styles.notificationContent}>
              <View style={styles.notificationHeader}>
                <Text style={[styles.notificationTitle, { color: theme.colors.text }]} numberOfLines={1}>
                  {notification.title}
                </Text>
                <View style={styles.notificationActions}>
                  {!notification.isRead && (
                    <View style={[styles.unreadDot, { backgroundColor: theme.colors.primary }]} />
                  )}
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Delete notification"
                    hitSlop={10}
                    onPress={() => handleDeleteNotification(notification)}
                    style={[styles.deleteButton, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
                  >
                    <Ionicons name="trash-outline" size={16} color={theme.colors.error} />
                  </TouchableOpacity>
                </View>
              </View>
              <Text style={[styles.notificationMessage, { color: theme.colors.textSecondary }]} numberOfLines={2}>
                {notification.body}
              </Text>
              <Text style={[styles.notificationTime, { color: theme.colors.textSecondary }]}>
                {formatRelativeTime(notification.createdAt)}
              </Text>
            </View>
          </TouchableOpacity>
        ))}

        {!isLoadingNotifications && notifications.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="notifications-off-outline" size={64} color={theme.colors.textSecondary} />
            <Text style={[styles.emptyText, { color: theme.colors.text }]}>No notifications</Text>
            <Text style={[styles.emptySubtext, { color: theme.colors.textSecondary }]}>
              You're all caught up!
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  markAllRead: {
    fontSize: 14,
    fontWeight: '600',
  },
  clearAllText: {
    fontSize: 14,
    fontWeight: '600',
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  loadingIndicator: {
    marginTop: 40,
  },
  notificationCard: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  notificationContent: {
    flex: 1,
  },
  notificationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  notificationActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 8,
  },
  deleteButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  notificationMessage: {
    fontSize: 14,
    marginBottom: 6,
    lineHeight: 20,
  },
  notificationTime: {
    fontSize: 12,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
  },
});
