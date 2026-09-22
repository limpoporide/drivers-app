import React, { useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useJobRequests, type RequestItem } from '../../src/context/JobRequestsContext';
import { useTheme } from '../../src/context/ThemeContext';
import { formatCurrency } from '../../src/utils/formatters';

const ACTIVE_REQUEST_STATUSES: RequestItem['status'][] = ['accepted', 'arrived', 'in_progress'];

const getCardTitle = (request: RequestItem) =>
  request.source === 'rider_booking' ? 'Instant ride request' : `Scheduled ride for ${request.eta}`;

const getCardIcon = (request: RequestItem) => (request.source === 'rider_booking' ? 'flash' : 'calendar');

const getStatusLabel = (status: RequestItem['status']) => {
  switch (status) {
    case 'accepted':
      return 'Accepted';
    case 'arrived':
      return 'Arrived';
    case 'in_progress':
      return 'In Progress';
    case 'completed':
      return 'Completed';
    case 'cancelled':
      return 'Cancelled';
    case 'pending':
    default:
      return 'Pending';
  }
};

const canOpenAcceptScreen = (request: RequestItem) => ACTIVE_REQUEST_STATUSES.includes(request.status);
const isPendingRequest = (request: RequestItem) => request.status === 'pending';

export default function RequestNotifications() {
  const { theme } = useTheme();
  const { notificationRequests, isLoadingRequests, refreshRequests, removeRequest, clearRequests, acceptRequest } = useJobRequests();
  const [selectedPendingRequest, setSelectedPendingRequest] = useState<RequestItem | null>(null);
  const [isAcceptingRequest, setIsAcceptingRequest] = useState(false);

  const handleCardPress = (request: RequestItem) => {
    if (isPendingRequest(request)) {
      setSelectedPendingRequest(request);
      return;
    }

    if (!canOpenAcceptScreen(request)) {
      return;
    }

    handleOpenRequest(request);
  };

  const handleClosePendingModal = () => {
    if (isAcceptingRequest) {
      return;
    }

    setSelectedPendingRequest(null);
  };

  const handleIgnorePendingRequest = async () => {
    if (!selectedPendingRequest || isAcceptingRequest) {
      return;
    }

    const requestToDismiss = selectedPendingRequest;
    setSelectedPendingRequest(null);
    await removeRequest(requestToDismiss.id, requestToDismiss.source);
  };

  const handleAcceptPendingRequest = async () => {
    if (!selectedPendingRequest || isAcceptingRequest) {
      return;
    }

    setIsAcceptingRequest(true);

    try {
      const wasAccepted = await acceptRequest(selectedPendingRequest);

      if (!wasAccepted) {
        Alert.alert('Unavailable request', 'This request has already been assigned.');
        setSelectedPendingRequest(null);
        return;
      }

      const acceptedRequest = selectedPendingRequest;
      setSelectedPendingRequest(null);
      handleOpenRequest(acceptedRequest);
    } catch (error) {
      Alert.alert(
        'Unable to accept request',
        error instanceof Error ? error.message : 'Please try again.'
      );
    } finally {
      setIsAcceptingRequest(false);
    }
  };

  const getStatusColors = (status: RequestItem['status']) => {
    switch (status) {
      case 'completed':
        return {
          backgroundColor: theme.mode === 'dark' ? 'rgba(77, 182, 172, 0.22)' : 'rgba(46, 125, 50, 0.12)',
          textColor: theme.mode === 'dark' ? '#80CBC4' : '#2E7D32',
        };
      case 'cancelled':
        return {
          backgroundColor: theme.mode === 'dark' ? 'rgba(239, 83, 80, 0.18)' : 'rgba(198, 40, 40, 0.12)',
          textColor: theme.mode === 'dark' ? '#EF9A9A' : '#C62828',
        };
      case 'accepted':
      case 'arrived':
      case 'in_progress':
        return {
          backgroundColor: theme.mode === 'dark' ? 'rgba(255, 214, 10, 0.18)' : 'rgba(196, 139, 45, 0.14)',
          textColor: theme.mode === 'dark' ? '#FFD54F' : '#8C6A00',
        };
      case 'pending':
      default:
        return {
          backgroundColor: theme.mode === 'dark' ? 'rgba(66, 165, 245, 0.18)' : 'rgba(25, 118, 210, 0.12)',
          textColor: theme.mode === 'dark' ? '#90CAF9' : '#1976D2',
        };
    }
  };

  const handleOpenRequest = (request: RequestItem) => {
    router.push({
      pathname: '/request/accept',
      params: {
        requestId: request.id,
        source: request.source,
        riderName: request.riderName,
        riderProfileImg: request.riderProfileImg ?? '',
        riderPhoneNumber: request.riderPhoneNumber,
        pickupAddress: request.pickupAddress,
        dropOffAddress: request.dropOffAddress,
        pickupLat: request.pickupLat !== null ? String(request.pickupLat) : '',
        pickupLng: request.pickupLng !== null ? String(request.pickupLng) : '',
        dropoffLat: request.dropoffLat !== null ? String(request.dropoffLat) : '',
        dropoffLng: request.dropoffLng !== null ? String(request.dropoffLng) : '',
        distance: request.distance,
        eta: request.eta,
        amount: String(request.amount),
        paymentMethod: request.paymentMethod,
        scheduleDateLabel: request.scheduleDateLabel ?? '',
        pickupTimeLabel: request.pickupTimeLabel ?? '',
      },
    });
  };

  const handleDeleteRequest = (request: RequestItem) => {
    Alert.alert('Delete notification', 'This will remove the request from your notifications list.', [
      {
        text: 'Cancel',
        style: 'cancel',
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void removeRequest(request.id, request.source);
        },
      },
    ]);
  };

  const handleClearAll = () => {
    if (notificationRequests.length === 0) {
      return;
    }

    Alert.alert('Clear all notifications', 'This will remove all visible requests from your notifications list.', [
      {
        text: 'Cancel',
        style: 'cancel',
      },
      {
        text: 'Clear all',
        style: 'destructive',
        onPress: () => {
          void clearRequests();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          style={[styles.backButton, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={18} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>Notifications</Text>
        <View style={styles.headerActions}>
          {notificationRequests.length > 0 ? (
            <TouchableOpacity onPress={handleClearAll}>
              <Text style={[styles.clearAllText, { color: theme.colors.primary }]}>Clear all</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity onPress={() => refreshRequests()} style={styles.refreshButton}>
            <Ionicons name="refresh" size={20} color={theme.colors.primary} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {isLoadingRequests && notificationRequests.length === 0 ? (
          <ActivityIndicator color={theme.colors.primary} style={styles.loadingIndicator} />
        ) : null}

        {notificationRequests.map((request) => {
          const statusColors = getStatusColors(request.status);
          const canInteract = isPendingRequest(request) || canOpenAcceptScreen(request);

          return (
          <TouchableOpacity
            key={`${request.source}:${request.id}`}
            style={[
              styles.card,
              {
                backgroundColor: theme.colors.card,
                borderColor: theme.colors.border,
                opacity: canInteract ? 1 : 0.78,
              },
            ]}
            activeOpacity={canInteract ? 0.82 : 1}
            disabled={!canInteract}
            onPress={() => handleCardPress(request)}
          >
            <View style={[styles.iconContainer, { backgroundColor: theme.colors.primary + '20' }]}>
              <Ionicons name={getCardIcon(request) as any} size={22} color={theme.colors.primary} />
            </View>
            <View style={styles.cardContent}>
              <View style={styles.cardHeaderRow}>
                <View style={styles.cardTitleGroup}>
                  <Text style={[styles.cardTitle, { color: theme.colors.text }]}>{getCardTitle(request)}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: statusColors.backgroundColor }]}>
                    <Text style={[styles.statusBadgeText, { color: statusColors.textColor }]}>
                      {getStatusLabel(request.status)}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Delete notification"
                  hitSlop={10}
                  onPress={() => handleDeleteRequest(request)}
                  style={[styles.deleteButton, { backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}
                >
                  <Ionicons name="trash-outline" size={16} color={theme.colors.error} />
                </TouchableOpacity>
              </View>
              <Text style={[styles.cardSubtitle, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                {request.pickupAddress}
              </Text>
              <Text style={[styles.cardMeta, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                {request.dropOffAddress}
              </Text>
              <Text style={[styles.cardAmount, { color: theme.colors.primary }]}>{formatCurrency(request.amount)}</Text>
            </View>
          </TouchableOpacity>
        );
        })}

        {!isLoadingRequests && notificationRequests.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="notifications-off-outline" size={64} color={theme.colors.textSecondary} />
            <Text style={[styles.emptyText, { color: theme.colors.text }]}>No notifications</Text>
            <Text style={[styles.emptySubtext, { color: theme.colors.textSecondary }]}>
              Ride status updates and new requests will appear here.
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <Modal
        transparent
        visible={selectedPendingRequest !== null}
        animationType="fade"
        onRequestClose={handleClosePendingModal}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
            ]}
          >
            <View style={styles.modalHeader}>
              <View style={[styles.modalBadge, { backgroundColor: theme.colors.primary + '20' }]}>
                <Ionicons name="notifications" size={16} color={theme.colors.primary} />
                <Text style={[styles.modalBadgeText, { color: theme.colors.primary }]}>Pending request</Text>
              </View>
              <TouchableOpacity onPress={handleClosePendingModal} disabled={isAcceptingRequest}>
                <Ionicons name="close" size={18} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Review this ride request</Text>
            <Text style={[styles.modalSubtitle, { color: theme.colors.textSecondary }]}>Accept to assign yourself and continue to the request screen, or ignore to dismiss this notification.</Text>

            {selectedPendingRequest ? (
              <View style={[styles.modalSummary, { backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}>
                <Text style={[styles.modalRequestTitle, { color: theme.colors.text }]}>
                  {getCardTitle(selectedPendingRequest)}
                </Text>
                <Text style={[styles.modalRequestMeta, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                  {selectedPendingRequest.pickupAddress}
                </Text>
                <Text style={[styles.modalRequestMeta, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                  {selectedPendingRequest.dropOffAddress}
                </Text>
                <View style={styles.modalSummaryRow}>
                  <Text style={[styles.modalSummaryValue, { color: theme.colors.text }]}>{selectedPendingRequest.eta}</Text>
                  <Text style={[styles.modalSummaryValue, { color: theme.colors.primary }]}>{formatCurrency(selectedPendingRequest.amount)}</Text>
                </View>
              </View>
            ) : null}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalSecondaryButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.background }]}
                onPress={() => {
                  void handleIgnorePendingRequest();
                }}
                disabled={isAcceptingRequest}
              >
                <Text style={[styles.modalSecondaryButtonText, { color: theme.colors.text }]}>Ignore</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalPrimaryButton, { backgroundColor: theme.colors.primary, opacity: isAcceptingRequest ? 0.7 : 1 }]}
                onPress={() => {
                  void handleAcceptPendingRequest();
                }}
                disabled={isAcceptingRequest}
              >
                <Text style={styles.modalPrimaryButtonText}>{isAcceptingRequest ? 'Accepting...' : 'Accept'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  backButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  clearAllText: {
    fontSize: 13,
    fontWeight: '600',
  },
  refreshButton: {
    marginLeft: 12,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  loadingIndicator: {
    marginTop: 40,
  },
  card: {
    flexDirection: 'row',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cardContent: {
    flex: 1,
    minWidth: 0,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  cardTitleGroup: {
    flex: 1,
    minWidth: 0,
    marginRight: 10,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  statusBadge: {
    alignSelf: 'flex-start',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 8,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
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
  cardSubtitle: {
    fontSize: 12,
    marginTop: 4,
  },
  cardMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  cardAmount: {
    fontSize: 15,
    fontWeight: '700',
    marginTop: 6,
  },
  emptyState: {
    alignItems: 'center',
    marginTop: 80,
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.42)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 18,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  modalBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 6,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 16,
  },
  modalSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  modalSummary: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginTop: 18,
  },
  modalRequestTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  modalRequestMeta: {
    fontSize: 13,
    marginTop: 6,
  },
  modalSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  modalSummaryValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  modalActions: {
    flexDirection: 'row',
    marginTop: 18,
  },
  modalSecondaryButton: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    marginRight: 10,
  },
  modalSecondaryButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  modalPrimaryButton: {
    flex: 1,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  modalPrimaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
