import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useJobRequests } from '../../src/context/JobRequestsContext';
import { useTheme } from '../../src/context/ThemeContext';
import { supabase } from '../../src/lib/supabase';
import { formatCurrency } from '../../src/utils/formatters';
import { Ride } from '../../src/types';

type FilterTab = 'all' | 'city_rides' | 'scheduled_ride' | 'delivery';
type RiderBookingHistoryStatus = 'accepted' | 'arrived' | 'in_progress' | 'completed' | 'cancelled';
type ScheduleBookingHistoryStatus = 'confirmed' | 'cancelled' | 'converted';
type ActiveRideStatus = 'accepted' | 'arrived' | 'in_progress';

type HistoryRide = Ride & {
  source: 'rider_booking' | 'schedule_booking';
  activeRequestId: string | null;
  activeRequestSource: 'rider_booking' | 'schedule_booking';
  rideTypeLabel: 'Instant Booking' | 'Scheduled Booking';
  statusLabel?: string;
  riderProfileImg: string | null;
  riderPhoneNumber: string;
  pickupAddress: string;
  dropOffAddress: string;
  pickupLat: number | null;
  pickupLng: number | null;
  dropoffLat: number | null;
  dropoffLng: number | null;
  eta: string;
  paymentMethod: 'Wallet' | 'Direct Transfer';
  scheduleDateLabel: string | null;
  pickupTimeLabel: string | null;
};

type RiderBookingHistoryRow = {
  id: string;
  rider_id: string;
  pick_up: string;
  pickup_lat: number | null;
  pickup_lng: number | null;
  drop_off: string;
  drop_lat: number | null;
  drop_lng: number | null;
  total_fare: number | null;
  total_km: number | null;
  total_time: number | null;
  payment_method: 'wallet' | 'transfer' | 'cash' | 'card' | null;
  ride_status: RiderBookingHistoryStatus;
  created_at: string;
};

type ScheduleBookingHistoryRow = {
  id: string;
  rider_id: string;
  pick_up: string;
  pickup_lat: number | null;
  pickup_lng: number | null;
  drop_off: string | null;
  drop_lat: number | null;
  drop_lng: number | null;
  total_fare: number | null;
  total_km: number | null;
  total_time: number | null;
  payment_method: 'wallet' | 'transfer' | 'cash' | 'card' | null;
  booking_status: ScheduleBookingHistoryStatus;
  created_at: string;
  schedule_date: string;
  pickup_time: string;
  converted_rider_booking_id: string | null;
};

type RiderProfileSummary = {
  uuid: string;
  first_name: string;
  last_name: string;
  phone_num: string | null;
  profile_img: string | null;
};

const HISTORY_CARD_IMAGE = require('../../assets/slide3.png');

const formatHistoryAddress = (address: string | null | undefined) => {
  const safeAddress = typeof address === 'string' ? address.trim() : '';

  if (!safeAddress) {
    return 'Location not set';
  }

  const parts = safeAddress
    .split(',')
    .map((part) => part.trim())
    .filter((part, index, values) => part.length > 0 && values.indexOf(part) === index)
    .slice(0, 3);

  return parts.length > 0 ? parts.join(', ') : safeAddress;
};

const formatRideDistance = (totalKm: number | null) => {
  return typeof totalKm === 'number' && totalKm > 0 ? `${totalKm.toFixed(1)} km` : '--';
};

const formatRideDuration = (totalTimeMinutes: number | null) => {
  return typeof totalTimeMinutes === 'number' && totalTimeMinutes > 0 ? `${totalTimeMinutes} min` : '--';
};

const toDisplayPaymentMethod = (paymentMethod: 'wallet' | 'transfer' | 'cash' | 'card' | null): 'Wallet' | 'Direct Transfer' => {
  return paymentMethod === 'transfer' ? 'Direct Transfer' : 'Wallet';
};

const formatTimeLabel = (dateString: string) => {
  return new Date(dateString).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
};

const getScheduledDateTime = (scheduleDate: string, pickupTime: string, fallbackCreatedAt: string) => {
  const safeDate = scheduleDate?.trim();
  const safeTime = pickupTime?.trim();

  if (!safeDate || !safeTime) {
    return fallbackCreatedAt;
  }

  const normalizedTime = safeTime.length === 5 ? `${safeTime}:00` : safeTime;
  const scheduledDate = new Date(`${safeDate}T${normalizedTime}`);

  return Number.isNaN(scheduledDate.getTime()) ? fallbackCreatedAt : scheduledDate.toISOString();
};

const getRideStatusLabel = (status: Ride['status']) => {
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

const ACTIVE_CARD_STATUSES: ActiveRideStatus[] = ['accepted', 'arrived', 'in_progress'];

const canOpenAcceptScreen = (
  ride: HistoryRide
): ride is HistoryRide & { status: ActiveRideStatus; activeRequestId: string } => {
  return Boolean(ride.activeRequestId) && ACTIVE_CARD_STATUSES.includes(ride.status as ActiveRideStatus);
};

export default function Rides() {
  const { theme } = useTheme();
  const { notificationRequests } = useJobRequests();
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [historyItems, setHistoryItems] = useState<HistoryRide[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  const lightCard = theme.mode === 'dark' ? theme.colors.card : '#FCFBF7';

  const getStatusColors = (status: Ride['status']) => {
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

  const getRideCategory = (ride: HistoryRide): Exclude<FilterTab, 'all'> => {
    if (ride.source === 'schedule_booking') {
      return 'scheduled_ride';
    }

    return 'city_rides';
  };

  const openActiveRide = (ride: HistoryRide & { status: ActiveRideStatus; activeRequestId: string }) => {
    router.push({
      pathname: '/request/accept',
      params: {
        requestId: ride.activeRequestId,
        source: ride.activeRequestSource,
        riderName: ride.passengerName,
        riderProfileImg: ride.riderProfileImg ?? '',
        riderPhoneNumber: ride.riderPhoneNumber,
        pickupAddress: ride.pickupAddress,
        dropOffAddress: ride.dropOffAddress,
        pickupLat: ride.pickupLat !== null ? String(ride.pickupLat) : '',
        pickupLng: ride.pickupLng !== null ? String(ride.pickupLng) : '',
        dropoffLat: ride.dropoffLat !== null ? String(ride.dropoffLat) : '',
        dropoffLng: ride.dropoffLng !== null ? String(ride.dropoffLng) : '',
        distance: ride.distance,
        eta: ride.eta,
        amount: String(ride.fare),
        paymentMethod: ride.paymentMethod,
        scheduleDateLabel: ride.scheduleDateLabel ?? '',
        pickupTimeLabel: ride.pickupTimeLabel ?? '',
      },
    });
  };

  const getDateHeading = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'short',
    });
  };

  const getTimeLabel = (ride: Ride) => {
    if (ride.pickupTime) {
      return ride.pickupTime;
    }

    return new Date(ride.date).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const loadRideHistory = useCallback(async () => {
    setIsLoadingHistory(true);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setHistoryItems([]);
        return;
      }

      const { data: bookings, error: bookingsError } = await supabase
        .from('rider_booking')
        .select('id, rider_id, pick_up, pickup_lat, pickup_lng, drop_off, drop_lat, drop_lng, total_fare, total_km, total_time, payment_method, ride_status, created_at')
        .eq('assigned_driver', user.id)
        .in('ride_status', ['accepted', 'arrived', 'in_progress', 'completed', 'cancelled'])
        .order('created_at', { ascending: false })
        .returns<RiderBookingHistoryRow[]>();

      if (bookingsError || !bookings) {
        setHistoryItems([]);
        return;
      }

      const { data: scheduledBookingsData, error: scheduleError } = await supabase
        .from('schedule_booking')
        .select('id, rider_id, pick_up, pickup_lat, pickup_lng, drop_off, drop_lat, drop_lng, total_fare, total_km, total_time, payment_method, booking_status, created_at, schedule_date, pickup_time, converted_rider_booking_id')
        .eq('assigned_driver', user.id)
        .in('booking_status', ['confirmed', 'cancelled', 'converted'])
        .order('created_at', { ascending: false })
        .returns<ScheduleBookingHistoryRow[]>();

      if (scheduleError) {
        setHistoryItems([]);
        return;
      }

      const scheduledBookings = scheduledBookingsData ?? [];

      const convertedRiderBookingIds = new Set(
        scheduledBookings
          .map((booking) => booking.converted_rider_booking_id)
          .filter((value): value is string => Boolean(value))
      );

      const riderBookingById = bookings.reduce<Record<string, RiderBookingHistoryRow>>((lookup, booking) => {
        lookup[booking.id] = booking;
        return lookup;
      }, {});

      const instantBookings = bookings.filter((booking) => !convertedRiderBookingIds.has(booking.id));

      const riderIds = Array.from(
        new Set(
          [...instantBookings, ...scheduledBookings]
            .map((booking) => booking.rider_id)
            .filter(Boolean)
        )
      );

      let riderById: Record<string, RiderProfileSummary> = {};

      if (riderIds.length > 0) {
        const { data: riders } = await supabase
          .from('rider_profile')
          .select('uuid, first_name, last_name, phone_num, profile_img')
          .in('uuid', riderIds)
          .returns<RiderProfileSummary[]>();

        riderById = (riders ?? []).reduce<Record<string, RiderProfileSummary>>((lookup, rider) => {
          lookup[rider.uuid] = rider;
          return lookup;
        }, {});
      }

      const instantHistoryItems: HistoryRide[] = instantBookings.map((booking) => {
        const rider = riderById[booking.rider_id];
        const riderName = `${rider?.first_name ?? 'Rider'} ${rider?.last_name ?? ''}`.trim();
        const distance = formatRideDistance(booking.total_km);
        const duration = formatRideDuration(booking.total_time);

        return {
          id: booking.id,
          passengerId: booking.rider_id,
          passengerName: riderName,
          source: 'rider_booking',
          activeRequestId: ACTIVE_CARD_STATUSES.includes(booking.ride_status as ActiveRideStatus) ? booking.id : null,
          activeRequestSource: 'rider_booking',
          rideTypeLabel: 'Instant Booking',
          statusLabel: getRideStatusLabel(booking.ride_status),
          riderProfileImg: rider?.profile_img ?? null,
          riderPhoneNumber: rider?.phone_num ?? '+234 0000000000',
          pickupLocation: formatHistoryAddress(booking.pick_up),
          dropoffLocation: formatHistoryAddress(booking.drop_off),
          pickupAddress: `Pickup: ${booking.pick_up}`,
          dropOffAddress: `Drop-off: ${booking.drop_off}`,
          pickupLat: booking.pickup_lat,
          pickupLng: booking.pickup_lng,
          dropoffLat: booking.drop_lat,
          dropoffLng: booking.drop_lng,
          status: booking.ride_status,
          fare: booking.total_fare ?? 0,
          distance,
          duration,
          eta: duration,
          paymentMethod: toDisplayPaymentMethod(booking.payment_method),
          scheduleDateLabel: null,
          pickupTimeLabel: null,
          pickupTime: formatTimeLabel(booking.created_at),
          date: booking.created_at,
        };
      });

      const scheduledHistoryItems: HistoryRide[] = scheduledBookings.map((booking) => {
        const rider = riderById[booking.rider_id];
        const riderName = `${rider?.first_name ?? 'Rider'} ${rider?.last_name ?? ''}`.trim();
        const scheduledDateTime = getScheduledDateTime(booking.schedule_date, booking.pickup_time, booking.created_at);
        const linkedBooking = booking.converted_rider_booking_id
          ? riderBookingById[booking.converted_rider_booking_id] ?? null
          : null;
        const distance = formatRideDistance(linkedBooking?.total_km ?? booking.total_km);
        const eta = `${formatTimeLabel(scheduledDateTime)} pickup`;
        const linkedRideIsActive = linkedBooking
          ? ACTIVE_CARD_STATUSES.includes(linkedBooking.ride_status as ActiveRideStatus)
          : false;
        const resolvedStatus = linkedBooking
          ? linkedBooking.ride_status
          : booking.booking_status === 'cancelled'
            ? 'cancelled'
            : booking.booking_status === 'converted'
              ? 'completed'
              : 'accepted';
        const resolvedStatusLabel = linkedBooking
          ? getRideStatusLabel(linkedBooking.ride_status)
          : booking.booking_status === 'cancelled'
            ? 'Cancelled'
            : booking.booking_status === 'converted'
              ? 'Completed'
              : 'Confirmed';

        return {
          id: booking.id,
          passengerId: booking.rider_id,
          passengerName: riderName,
          source: 'schedule_booking',
          activeRequestId: linkedRideIsActive && linkedBooking ? linkedBooking.id : null,
          activeRequestSource: linkedRideIsActive ? 'rider_booking' : 'schedule_booking',
          rideTypeLabel: 'Scheduled Booking',
          statusLabel: resolvedStatusLabel,
          riderProfileImg: rider?.profile_img ?? null,
          riderPhoneNumber: rider?.phone_num ?? '+234 0000000000',
          pickupLocation: formatHistoryAddress(booking.pick_up),
          dropoffLocation: formatHistoryAddress(booking.drop_off),
          pickupAddress: `Pickup: ${booking.pick_up}`,
          dropOffAddress: `Drop-off: ${booking.drop_off ?? 'Not set'}`,
          pickupLat: linkedBooking?.pickup_lat ?? booking.pickup_lat,
          pickupLng: linkedBooking?.pickup_lng ?? booking.pickup_lng,
          dropoffLat: linkedBooking?.drop_lat ?? booking.drop_lat,
          dropoffLng: linkedBooking?.drop_lng ?? booking.drop_lng,
          status: resolvedStatus,
          fare: linkedBooking?.total_fare ?? booking.total_fare ?? 0,
          distance,
          duration: formatRideDuration(linkedBooking?.total_time ?? booking.total_time),
          eta,
          paymentMethod: toDisplayPaymentMethod(linkedBooking?.payment_method ?? booking.payment_method),
          scheduleDateLabel: new Date(scheduledDateTime).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          }),
          pickupTimeLabel: formatTimeLabel(scheduledDateTime),
          pickupTime: formatTimeLabel(scheduledDateTime),
          date: scheduledDateTime,
        };
      });

      setHistoryItems([...scheduledHistoryItems, ...instantHistoryItems]);
    } catch (error) {
      if (__DEV__) {
        console.warn('[Rides] Failed to load ride history', error);
      }

      setHistoryItems([]);
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadRideHistory();
    }, [loadRideHistory])
  );

  const filteredRides = useMemo(() => {
    const sortedRides = [...historyItems].sort((firstRide, secondRide) => new Date(secondRide.date).getTime() - new Date(firstRide.date).getTime());

    if (activeTab === 'all') {
      return sortedRides;
    }

    if (activeTab === 'delivery') {
      return [];
    }

    return sortedRides.filter((ride) => getRideCategory(ride) === activeTab);
  }, [activeTab, historyItems]);

  const scheduledRideNotificationCount = useMemo(
    () => notificationRequests.filter((request) => request.source === 'schedule_booking' && request.actionable).length,
    [notificationRequests]
  );

  const groupedRides = useMemo(() => {
    return filteredRides.reduce<Record<string, HistoryRide[]>>((groups, ride) => {
      const dateKey = getDateHeading(ride.date);

      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }

      groups[dateKey].push(ride);
      return groups;
    }, {});
  }, [filteredRides]);

  const filterTabs: { id: FilterTab; label: string; hasIcon?: boolean; badgeCount?: number }[] = [
    { id: 'all', label: 'All', hasIcon: true },
    { id: 'city_rides', label: 'City rides' },
    { id: 'scheduled_ride', label: 'Scheduled ride', badgeCount: scheduledRideNotificationCount },
    { id: 'delivery', label: 'Limpopo Delivery' },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>Ride history</Text>
      </View>

      <View style={styles.tabsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {filterTabs.map((tab) => {
            const isActive = activeTab === tab.id;

            return (
              <TouchableOpacity
                key={tab.id}
                style={[
                  styles.tab,
                  {
                    backgroundColor: isActive ? '#C48B2D' : theme.colors.card,
                    borderColor: isActive ? '#C48B2D' : theme.colors.border,
                  },
                ]}
                onPress={() => setActiveTab(tab.id)}
              >
                {tab.hasIcon ? (
                  <Text style={[styles.listIcon, { color: isActive ? '#FFFFFF' : theme.colors.textSecondary }]}>≡</Text>
                ) : null}
                <Text style={[styles.tabText, { color: isActive ? '#FFFFFF' : theme.colors.text }]}>{tab.label}</Text>
                {typeof tab.badgeCount === 'number' && tab.badgeCount > 0 ? (
                  <View
                    style={[
                      styles.tabBadge,
                      { backgroundColor: isActive ? 'rgba(255,255,255,0.24)' : theme.colors.primary },
                    ]}
                  >
                    <Text style={[styles.tabBadgeText, { color: '#FFFFFF' }]}>
                      {tab.badgeCount > 9 ? '9+' : tab.badgeCount}
                    </Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {isLoadingHistory && historyItems.length === 0 ? (
          <ActivityIndicator color={theme.colors.primary} style={styles.loadingIndicator} />
        ) : Object.keys(groupedRides).length > 0 ? (
          <View style={styles.bookingsList}>
            {Object.entries(groupedRides).map(([date, items]) => (
              <View key={date} style={styles.dateGroup}>
                <Text style={[styles.dateHeader, { color: theme.colors.text }]}>{date}</Text>
                {items.map((ride) => {
                  const isCancelled = ride.status === 'cancelled';
                  const imageBackgroundColor = theme.mode === 'dark' ? '#000000' : '#F3F4F6';
                  const statusColors = getStatusColors(ride.status);
                  const isActiveRide = canOpenAcceptScreen(ride);

                  return (
                    <TouchableOpacity
                      key={ride.id}
                      activeOpacity={isActiveRide ? 0.85 : 1}
                      disabled={!isActiveRide}
                      onPress={() => {
                        if (isActiveRide) {
                          openActiveRide(ride);
                        }
                      }}
                      style={[
                        styles.bookingCard,
                        {
                          backgroundColor: lightCard,
                          borderColor: theme.colors.border,
                          opacity: isActiveRide ? 1 : 0.82,
                        },
                      ]}
                    >
                      <View style={[styles.imageContainer, { backgroundColor: imageBackgroundColor }]}> 
                        <Image source={HISTORY_CARD_IMAGE} style={styles.vehicleImage} resizeMode="cover" />
                      </View>

                      <View style={styles.cardContent}>
                        <View style={styles.cardHeaderRow}>
                          <View
                            style={[
                              styles.rideTypeBadge,
                              { backgroundColor: ride.source === 'schedule_booking' ? '#E7F0D8' : '#F3EEE2' },
                            ]}
                          >
                            <Text
                              style={[
                                styles.rideTypeBadgeText,
                                { color: ride.source === 'schedule_booking' ? '#48632C' : '#8C6A00' },
                              ]}
                            >
                              {ride.rideTypeLabel}
                            </Text>
                          </View>
                          <View style={[styles.statusBadge, { backgroundColor: statusColors.backgroundColor }]}>
                            <Text style={[styles.statusBadgeText, { color: statusColors.textColor }]}>
                              {ride.statusLabel ?? getRideStatusLabel(ride.status)}
                            </Text>
                          </View>
                        </View>
                        <Text
                          style={[
                            styles.subLocation,
                            isCancelled ? { color: '#E57373' } : { color: theme.colors.textSecondary },
                          ]}
                          numberOfLines={1}
                        >
                          {isCancelled ? 'You cancelled' : ride.pickupLocation}
                        </Text>
                        <Text style={[styles.mainLocation, { color: theme.colors.text }]} numberOfLines={1}>
                          {ride.dropoffLocation}
                        </Text>

                        <View style={styles.bottomRow}>
                          <Text style={[styles.timeText, { color: theme.colors.textSecondary }]}>{getTimeLabel(ride)}</Text>
                          <Text style={[styles.priceText, { color: theme.colors.text }]}>
                            {formatCurrency(isCancelled ? 0 : ride.fare)}
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>
              {activeTab === 'delivery'
                ? 'No Delivery at the Moment'
                : activeTab === 'scheduled_ride'
                  ? 'No scheduled rides found'
                  : 'No history found'}
            </Text>
            {activeTab === 'delivery' ? (
              <Text style={[styles.emptySubtitle, { color: theme.colors.textSecondary }]}>We are yet to launch it.</Text>
            ) : activeTab === 'scheduled_ride' ? (
              <Text style={[styles.emptySubtitle, { color: theme.colors.textSecondary }]}>Accepted scheduled bookings will appear here as cards.</Text>
            ) : null}
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
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  tabsContainer: {
    paddingVertical: 12,
  },
  tabs: {
    paddingHorizontal: 20,
    gap: 8,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1,
  },
  listIcon: {
    marginRight: 6,
    fontSize: 14,
    fontWeight: 'bold',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
  },
  tabBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    marginLeft: 8,
  },
  tabBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  scrollView: {
    flex: 1,
  },
  loadingIndicator: {
    marginTop: 40,
  },
  bookingsList: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  dateGroup: {
    marginTop: 10,
  },
  dateHeader: {
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  bookingCard: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 6,
    alignItems: 'center',
  },
  imageContainer: {
    width: 60,
    height: 60,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  vehicleImage: {
    width: '100%',
    height: '100%',
    borderRadius: 10,
  },
  cardContent: {
    flex: 1,
    marginLeft: 12,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 8,
  },
  rideTypeBadge: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  rideTypeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statusBadge: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  subLocation: {
    fontSize: 13,
    marginBottom: 2,
  },
  mainLocation: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timeText: {
    fontSize: 13,
  },
  priceText: {
    fontSize: 14,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  emptySubtitle: {
    fontSize: 13,
    marginTop: 6,
  },
});
