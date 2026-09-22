import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { Image, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useJobRequests, type RequestItem } from '../context/JobRequestsContext';
import { useTheme } from '../context/ThemeContext';
import { formatCurrency } from '../utils/formatters';

const RIDER_AVATAR = require('../../assets/avatar.png');

const shouldSuppressForPath = (pathname: string) => {
  return pathname === '/home' || pathname === '/request/accept' || pathname === '/request/navigation' || pathname === '/request/call';
};

const buildRequestKey = (request: RequestItem) => `${request.source}:${request.id}`;

const getRequestTitle = (request: RequestItem) => {
  return request.source === 'rider_booking' ? 'New instant ride request' : 'New scheduled ride request';
};

const openRequest = (request: RequestItem) => {
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

export function GlobalRequestModal() {
  const { theme } = useTheme();
  const pathname = usePathname();
  const { requests, acceptRequest } = useJobRequests();
  const suppressedKeysRef = useRef<Set<string>>(new Set());
  const [activeRequest, setActiveRequest] = useState<RequestItem | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isAcceptingRequest, setIsAcceptingRequest] = useState(false);

  const newestActionableRequest = useMemo(() => {
    return requests.find((request) => request.actionable) ?? null;
  }, [requests]);

  useEffect(() => {
    const activeKeys = new Set(requests.map((request) => buildRequestKey(request)));

    suppressedKeysRef.current.forEach((key) => {
      if (!activeKeys.has(key)) {
        suppressedKeysRef.current.delete(key);
      }
    });
  }, [requests]);

  useEffect(() => {
    if (shouldSuppressForPath(pathname)) {
      setIsVisible(false);
      return;
    }

    if (!newestActionableRequest) {
      setActiveRequest(null);
      setIsVisible(false);
      return;
    }

    const requestKey = buildRequestKey(newestActionableRequest);

    if (suppressedKeysRef.current.has(requestKey)) {
      if (activeRequest && buildRequestKey(activeRequest) === requestKey) {
        setIsVisible(false);
      }
      return;
    }

    if (!activeRequest || buildRequestKey(activeRequest) !== requestKey) {
      setActiveRequest(newestActionableRequest);
    }

    setIsVisible(true);
  }, [activeRequest, newestActionableRequest, pathname]);

  const handleLater = () => {
    if (!activeRequest) {
      setIsVisible(false);
      return;
    }

    suppressedKeysRef.current.add(buildRequestKey(activeRequest));
    setIsVisible(false);
  };

  const handleViewRequest = async () => {
    if (!activeRequest) {
      return;
    }

    if (isAcceptingRequest) {
      return;
    }

    setIsAcceptingRequest(true);

    try {
      const wasAccepted = await acceptRequest(activeRequest);

      if (!wasAccepted) {
        Alert.alert('Unavailable request', 'This request has already been assigned.');
        setIsVisible(false);
        return;
      }

      setIsVisible(false);
      openRequest(activeRequest);
    } catch (error) {
      Alert.alert(
        'Unable to accept request',
        error instanceof Error ? error.message : 'Please try again.'
      );
    } finally {
      setIsAcceptingRequest(false);
    }
  };

  const handleOpenNotifications = () => {
    setIsVisible(false);
    router.push('/request/notifications');
  };

  if (!activeRequest) {
    return null;
  }

  const riderImageSource = activeRequest.riderProfileImg ? { uri: activeRequest.riderProfileImg } : RIDER_AVATAR;
  const surfaceColor = theme.mode === 'dark' ? '#111111' : '#FFFDFC';
  const mutedSurface = theme.mode === 'dark' ? '#181818' : '#F4EEE3';
  const secondaryButtonText = theme.mode === 'dark' ? theme.colors.text : '#1D1D1D';

  return (
    <Modal transparent visible={isVisible} animationType="fade" onRequestClose={handleLater}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: surfaceColor, borderColor: theme.colors.border }]}> 
          <View style={styles.headerRow}>
            <View style={[styles.badge, { backgroundColor: theme.colors.primary + '20' }]}> 
              <Ionicons name="notifications" size={16} color={theme.colors.primary} />
              <Text style={[styles.badgeText, { color: theme.colors.primary }]}>New request</Text>
            </View>
            <TouchableOpacity onPress={handleLater} hitSlop={10}>
              <Ionicons name="close" size={18} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.title, { color: theme.colors.text }]}>{getRequestTitle(activeRequest)}</Text>
          <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>You can open it now or review it later from notifications.</Text>

          <View style={[styles.requestCard, { backgroundColor: mutedSurface, borderColor: theme.colors.border }]}> 
            <Image source={riderImageSource} style={styles.avatar} />
            <View style={styles.requestCopy}>
              <Text style={[styles.riderName, { color: theme.colors.text }]} numberOfLines={1}>{activeRequest.riderName}</Text>
              <Text style={[styles.requestMeta, { color: theme.colors.textSecondary }]} numberOfLines={1}>{activeRequest.requestBadge}</Text>
              <Text style={[styles.requestAddress, { color: theme.colors.text }]} numberOfLines={1}>{activeRequest.pickupAddress}</Text>
              <Text style={[styles.requestAddress, { color: theme.colors.textSecondary }]} numberOfLines={1}>{activeRequest.dropOffAddress}</Text>
            </View>
          </View>

          <View style={styles.summaryRow}>
            <View>
              <Text style={[styles.summaryLabel, { color: theme.colors.textSecondary }]}>ETA</Text>
              <Text style={[styles.summaryValue, { color: theme.colors.text }]} numberOfLines={1}>{activeRequest.eta}</Text>
            </View>
            <View>
              <Text style={[styles.summaryLabel, { color: theme.colors.textSecondary }]}>Fare</Text>
              <Text style={[styles.summaryValue, { color: theme.colors.text }]}>{formatCurrency(activeRequest.amount)}</Text>
            </View>
          </View>

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.secondaryButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.background }]}
              onPress={handleOpenNotifications}
            >
              <Text style={[styles.secondaryButtonText, { color: secondaryButtonText }]}>Notifications</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: theme.colors.primary, opacity: isAcceptingRequest ? 0.7 : 1 }]}
              onPress={handleViewRequest}
              disabled={isAcceptingRequest}
            >
              <Text style={styles.primaryButtonText}>{isAcceptingRequest ? 'Accepting...' : 'Accept request'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.42)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 18,
    gap: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 6,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  requestCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    gap: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  requestCopy: {
    flex: 1,
    gap: 2,
  },
  riderName: {
    fontSize: 16,
    fontWeight: '700',
  },
  requestMeta: {
    fontSize: 12,
    fontWeight: '600',
  },
  requestAddress: {
    fontSize: 13,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  summaryLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: '700',
    maxWidth: 150,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  primaryButton: {
    flex: 1.2,
    minHeight: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});