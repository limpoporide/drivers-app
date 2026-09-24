import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

export type RequestItem = {
  id: string;
  source: 'schedule_booking' | 'rider_booking';
  riderId: string;
  status: 'pending' | 'accepted' | 'arrived' | 'in_progress' | 'completed' | 'cancelled';
  riderName: string;
  riderProfileImg: string | null;
  requestBadge: string;
  riderPhoneNumber: string;
  pickupAddress: string;
  dropOffAddress: string;
  pickupLat: number | null;
  pickupLng: number | null;
  dropoffLat: number | null;
  dropoffLng: number | null;
  distance: string;
  eta: string;
  scheduleDateLabel: string | null;
  pickupTimeLabel: string | null;
  amount: number;
  paymentMethod: 'Wallet' | 'Direct Transfer';
  actionable: boolean;
  createdAt: string;
};

type ScheduleBookingRow = {
  id: string;
  rider_id: string;
  pick_up: string;
  pickup_lat: number | null;
  pickup_lng: number | null;
  drop_off: string | null;
  drop_lat: number | null;
  drop_lng: number | null;
  total_fare: number;
  payment_method: 'wallet' | 'transfer' | 'cash' | 'card' | null;
  schedule_date: string;
  pickup_time: string;
  assigned_driver: string | null;
  booking_status: 'pending' | 'confirmed' | 'cancelled' | 'expired' | 'converted';
  converted_rider_booking_id: string | null;
  created_at: string;
};

type RiderBookingRow = {
  id: string;
  rider_id: string;
  pick_up: string;
  pickup_lat: number;
  pickup_lng: number;
  drop_off: string;
  drop_lat: number;
  drop_lng: number;
  total_fare: number;
  payment_method: 'wallet' | 'transfer' | 'cash' | 'card';
  total_km: number | null;
  total_time: number | null;
  assigned_driver: string | null;
  ride_status: 'open' | 'accepted' | 'arrived' | 'in_progress' | 'completed' | 'cancelled' | 'expired';
  created_at: string;
};

type RiderProfileSummary = {
  uuid: string;
  first_name: string;
  last_name: string;
  phone_num: string;
  profile_img: string | null;
};

type BookingNotificationSource = RequestItem['source'];

type BookingRequestNotificationRow = {
  type?: string;
  created_at?: string;
  data?: {
    bookingId?: unknown;
    source?: unknown;
  } | null;
};

type JobRequestsContextValue = {
  requests: RequestItem[];
  notificationRequests: RequestItem[];
  isLoadingRequests: boolean;
  refreshRequests: () => Promise<void>;
  acceptRequest: (request: RequestItem) => Promise<boolean>;
  removeRequest: (requestId: string, source?: RequestItem['source']) => Promise<void>;
  clearRequests: () => Promise<void>;
};

const JobRequestsContext = createContext<JobRequestsContextValue | null>(null);

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const DISMISSED_REQUESTS_STORAGE_KEY = 'driver_dismissed_job_requests';
const NEW_REQUEST_SOUND = require('../../assets/ping-ping.wav');

let requestAlertSound: Audio.Sound | null = null;
let isRequestAlertPlaying = false;
let previousActionableRequestKeys: string[] = [];

const buildRequestStorageKey = (requestId: string, source: RequestItem['source']) => `${source}:${requestId}`;

const isBookingNotificationSource = (value: unknown): value is BookingNotificationSource => {
  return value === 'rider_booking' || value === 'schedule_booking';
};

const readDismissedRequestKeys = async () => {
  const storedValue = await AsyncStorage.getItem(DISMISSED_REQUESTS_STORAGE_KEY);

  if (!storedValue) {
    return [] as string[];
  }

  try {
    const parsedValue = JSON.parse(storedValue);
    return Array.isArray(parsedValue) ? parsedValue.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [] as string[];
  }
};

const writeDismissedRequestKeys = async (keys: string[]) => {
  await AsyncStorage.setItem(DISMISSED_REQUESTS_STORAGE_KEY, JSON.stringify(keys));
};

const stopRequestAlertSound = async () => {
  const activeSound = requestAlertSound;

  console.log('[JobRequests] stopRequestAlertSound called', {
    hadActiveSound: Boolean(activeSound),
    wasPlaying: isRequestAlertPlaying,
  });

  requestAlertSound = null;
  isRequestAlertPlaying = false;

  if (!activeSound) {
    return;
  }

  try {
    await activeSound.stopAsync();
  } catch {
    // Ignore stop failures during teardown.
  }

  try {
    await activeSound.unloadAsync();
  } catch {
    // Ignore unload failures during teardown.
  }
};

const startRequestAlertSound = async () => {
  if (isRequestAlertPlaying) {
    console.log('[JobRequests] startRequestAlertSound skipped because sound is already playing');
    return;
  }

  isRequestAlertPlaying = true;

  console.log('[JobRequests] startRequestAlertSound called');

  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });

    const { sound } = await Audio.Sound.createAsync(NEW_REQUEST_SOUND, {
      shouldPlay: true,
      isLooping: true,
    });

    requestAlertSound = sound;
    console.log('[JobRequests] ping-ping.wav playback started successfully');
  } catch (error) {
    isRequestAlertPlaying = false;
    console.log('[JobRequests] Failed to start request alert sound', error);
  }
};

const removeDismissedRequestKey = async (requestId: string, source: RequestItem['source']) => {
  const storageKey = buildRequestStorageKey(requestId, source);
  const currentKeys = await readDismissedRequestKeys();

  if (!currentKeys.includes(storageKey)) {
    return;
  }

  await writeDismissedRequestKeys(currentKeys.filter((key) => key !== storageKey));
};

const formatPickupTimeLabel = (pickupTime: string) => {
  const safeTime = pickupTime?.trim();

  if (!safeTime) {
    return 'Time not set';
  }

  const [hoursText, minutesText] = safeTime.split(':');
  const hours = Number.parseInt(hoursText ?? '', 10);
  const minutes = Number.parseInt(minutesText ?? '', 10);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return safeTime;
  }

  const suffix = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(minutes).padStart(2, '0')} ${suffix}`;
};

const formatScheduleDateLabel = (scheduleDate: string) => {
  const safeDate = scheduleDate?.trim();

  if (!safeDate) {
    return 'Date not set';
  }

  const today = new Date();
  const todayDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  let scheduleDateLabel = safeDate;

  if (safeDate === todayDate) {
    scheduleDateLabel = 'Today';
  } else {
    const [yearText, monthText, dayText] = safeDate.split('-');
    const year = Number.parseInt(yearText ?? '', 10);
    const month = Number.parseInt(monthText ?? '', 10);
    const day = Number.parseInt(dayText ?? '', 10);

    if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day) && month >= 1 && month <= 12) {
      scheduleDateLabel = `${MONTH_NAMES[month - 1]} ${day}, ${year}`;
    }
  }

  return scheduleDateLabel;
};

const formatScheduleLabel = (scheduleDate: string, pickupTime: string) => {
  return `${formatScheduleDateLabel(scheduleDate)}, Pickup: ${formatPickupTimeLabel(pickupTime)}`;
};

const mapScheduleBookingStatus = (
  bookingStatus: ScheduleBookingRow['booking_status']
): RequestItem['status'] | null => {
  if (bookingStatus === 'pending') {
    return 'pending';
  }

  if (bookingStatus === 'confirmed') {
    return 'accepted';
  }

  if (bookingStatus === 'converted') {
    return 'completed';
  }

  if (bookingStatus === 'cancelled') {
    return 'cancelled';
  }

  return null;
};

const mapRiderBookingStatus = (rideStatus: RiderBookingRow['ride_status']): RequestItem['status'] | null => {
  if (rideStatus === 'open') {
    return 'pending';
  }

  if (rideStatus === 'expired') {
    return null;
  }

  return rideStatus;
};

const formatRideDistance = (distanceKm: number | null) => {
  if (!distanceKm || distanceKm <= 0) {
    return 'Live';
  }

  return `${distanceKm.toFixed(1)} KM`;
};

const formatRideEta = (totalTimeMinutes: number | null) => {
  if (!totalTimeMinutes || totalTimeMinutes <= 0) {
    return 'Instant ride';
  }

  if (totalTimeMinutes >= 60) {
    const hours = Math.floor(totalTimeMinutes / 60);
    const minutes = totalTimeMinutes % 60;
    return minutes ? `${hours} hr ${minutes} min` : `${hours} hr`;
  }

  return `${totalTimeMinutes} min`;
};

const toDisplayPaymentMethod = (paymentMethod: 'wallet' | 'transfer' | 'cash' | 'card' | null): 'Wallet' | 'Direct Transfer' => {
  return paymentMethod === 'transfer' ? 'Direct Transfer' : 'Wallet';
};

export function JobRequestsProvider({ children }: React.PropsWithChildren) {
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [notificationRequests, setNotificationRequests] = useState<RequestItem[]>([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(true);
  const retriedRequestTimestampsRef = useRef<Record<string, string>>({});
  const refreshRequests = useCallback(async () => {
    setIsLoadingRequests(true);

    try {
      const dismissedRequestKeys = new Set(await readDismissedRequestKeys());
      const {
        data: {
          user,
        },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setRequests([]);
        setNotificationRequests([]);
        return;
      }

      try {
        await supabase.functions.invoke('promote-scheduled-bookings', {
          method: 'POST',
        });
      } catch (promotionError) {
        console.log('[JobRequests] Scheduled promotion trigger failed', promotionError);
      }

      const { data: riderBookings, error: riderBookingError } = await supabase
        .from('rider_booking')
        .select('id, rider_id, pick_up, pickup_lat, pickup_lng, drop_off, drop_lat, drop_lng, total_fare, payment_method, total_km, total_time, assigned_driver, ride_status, created_at')
        .in('ride_status', ['open', 'accepted', 'arrived', 'in_progress', 'completed', 'cancelled'])
        .order('created_at', { ascending: false })
        .returns<RiderBookingRow[]>();

      if (riderBookingError) {
        throw riderBookingError;
      }

      const relevantRiderBookings = (riderBookings ?? []).filter(
        (booking) =>
          (booking.ride_status === 'open' && booking.assigned_driver === null) || booking.assigned_driver === user.id
      );

      const riderIds = Array.from(
        new Set(
          relevantRiderBookings
            .map((booking) => booking.rider_id)
            .filter(Boolean)
        )
      );

      let riderProfiles: RiderProfileSummary[] = [];

      if (riderIds.length > 0) {
        const { data: riders, error: riderError } = await supabase
          .from('rider_profile')
          .select('uuid, first_name, last_name, phone_num, profile_img')
          .in('uuid', riderIds)
          .returns<RiderProfileSummary[]>();

        if (riderError) {
          throw riderError;
        }

        riderProfiles = riders ?? [];
      }

      const riderById = riderProfiles.reduce<Record<string, RiderProfileSummary>>((lookup, rider) => {
        lookup[rider.uuid] = rider;
        return lookup;
      }, {});

      const riderRequestItems = relevantRiderBookings.reduce<RequestItem[]>((items, booking) => {
          const status = mapRiderBookingStatus(booking.ride_status);

          if (!status) {
            return items;
          }

          const rider = riderById[booking.rider_id];
          const riderName = `${rider?.first_name ?? 'Rider'} ${rider?.last_name ?? ''}`.trim();

          items.push({
            id: booking.id,
            source: 'rider_booking' as const,
            riderId: booking.rider_id,
            status,
            riderName,
            riderProfileImg: rider?.profile_img ?? null,
            requestBadge: 'Instant Booking',
            riderPhoneNumber: rider?.phone_num ?? '+234 0000000000',
            pickupAddress: `Pickup: ${booking.pick_up}`,
            dropOffAddress: `Drop-off: ${booking.drop_off ?? 'Not set'}`,
            pickupLat: booking.pickup_lat,
            pickupLng: booking.pickup_lng,
            dropoffLat: booking.drop_lat,
            dropoffLng: booking.drop_lng,
            distance: formatRideDistance(booking.total_km),
            eta: formatRideEta(booking.total_time),
            scheduleDateLabel: null,
            pickupTimeLabel: null,
            amount: Number(booking.total_fare ?? 0),
            paymentMethod: toDisplayPaymentMethod(booking.payment_method),
            actionable: status === 'pending',
            createdAt: booking.created_at,
          });

          return items;
        }, []);

      const allRequests: RequestItem[] = riderRequestItems
        .filter((request) => !dismissedRequestKeys.has(buildRequestStorageKey(request.id, request.source)))
        .sort((left, right) => {
          const leftSortTimestamp = retriedRequestTimestampsRef.current[buildRequestStorageKey(left.id, left.source)] ?? left.createdAt;
          const rightSortTimestamp = retriedRequestTimestampsRef.current[buildRequestStorageKey(right.id, right.source)] ?? right.createdAt;

          return new Date(rightSortTimestamp).getTime() - new Date(leftSortTimestamp).getTime();
        });

      const nextRequests = allRequests.filter((request) => request.actionable).slice(0, 3);

      console.log('[JobRequests] fetched job requests', {
        scheduledCount: 0,
        riderCount: relevantRiderBookings.length,
        renderedCount: nextRequests.length,
        notificationCount: allRequests.length,
      });

      setRequests(nextRequests);
      setNotificationRequests(allRequests);
    } catch (error) {
      console.log('[JobRequests] Error fetching new job requests:', error);
      setRequests([]);
      setNotificationRequests([]);
    } finally {
      setIsLoadingRequests(false);
    }
  }, []);

  const removeRequest = useCallback(async (requestId: string, source?: RequestItem['source']) => {
    let storageKey: string | null = null;

    setRequests((currentRequests) => {
      const matchedRequest = currentRequests.find(
        (request) => request.id === requestId && (!source || request.source === source)
      );

      storageKey = matchedRequest
        ? buildRequestStorageKey(matchedRequest.id, matchedRequest.source)
        : source
          ? buildRequestStorageKey(requestId, source)
          : null;

      return currentRequests.filter(
        (request) => !(request.id === requestId && (!source || request.source === source))
      );
    });

    setNotificationRequests((currentRequests) =>
      currentRequests.filter((request) => !(request.id === requestId && (!source || request.source === source)))
    );

    if (!storageKey) {
      return;
    }

    const currentKeys = await readDismissedRequestKeys();

    if (!currentKeys.includes(storageKey)) {
      await writeDismissedRequestKeys([...currentKeys, storageKey]);
    }
  }, []);

  const acceptRequest = useCallback(async (request: RequestItem) => {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new Error('Please sign in again before accepting a request.');
    }

    const updateQuery =
      request.source === 'schedule_booking'
        ? supabase
            .from('schedule_booking')
            .update({
              assigned_driver: user.id,
              booking_status: 'confirmed',
            })
            .eq('id', request.id)
            .is('assigned_driver', null)
            .eq('booking_status', 'pending')
        : supabase
            .from('rider_booking')
            .update({
              assigned_driver: user.id,
              ride_status: 'accepted',
            })
            .eq('id', request.id)
            .is('assigned_driver', null)
            .eq('ride_status', 'open');

    const { data, error } = await updateQuery.select('id').maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      await refreshRequests();
      return false;
    }

    if (request.source === 'schedule_booking') {
      const { error: notifyError } = await supabase.functions.invoke('notify-rider-booking-status', {
        method: 'POST',
        body: {
          type: 'UPDATE',
          table: 'schedule_booking',
          schema: 'public',
          record: {
            id: request.id,
            rider_id: request.riderId,
            assigned_driver: user.id,
            pick_up: request.pickupAddress.replace(/^Pickup:\s*/i, ''),
            drop_off: request.dropOffAddress.replace(/^Drop-off:\s*/i, ''),
            booking_status: 'confirmed',
          },
          old_record: {
            booking_status: 'pending',
          },
        },
      });

      if (notifyError) {
        console.log('[JobRequests] schedule booking rider notification failed', {
          requestId: request.id,
          notifyError,
        });
      }
    }

    await removeRequest(request.id, request.source);
    return true;
  }, [refreshRequests, removeRequest]);

  const clearRequests = async () => {
    let nextDismissedKeys: string[] = [];

    setNotificationRequests((currentRequests) => {
      nextDismissedKeys = currentRequests.map((request) => buildRequestStorageKey(request.id, request.source));
      return [];
    });

    setRequests([]);

    if (nextDismissedKeys.length === 0) {
      return;
    }

    const currentKeys = await readDismissedRequestKeys();
    const mergedKeys = Array.from(new Set([...currentKeys, ...nextDismissedKeys]));
    await writeDismissedRequestKeys(mergedKeys);
  };

  useEffect(() => {
    let isActive = true;
    const channelName = `driver-new-jobs-${Date.now()}`;

    console.log('[JobRequests] setting up realtime channel', { channelName });
    refreshRequests();

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'schedule_booking',
        },
        (payload) => {
          const nextRow = payload.new as Partial<ScheduleBookingRow>;
          const previousRow = payload.old as Partial<ScheduleBookingRow>;

          console.log('[JobRequests] schedule_booking realtime event', {
            eventType: payload.eventType,
            table: payload.table,
            id: nextRow.id ?? previousRow.id ?? null,
            bookingStatus: nextRow.booking_status ?? previousRow.booking_status ?? null,
            assignedDriver: nextRow.assigned_driver ?? previousRow.assigned_driver ?? null,
          });

          if (isActive) {
            refreshRequests();
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rider_booking',
        },
        (payload) => {
          const nextRow = payload.new as Partial<RiderBookingRow>;
          const previousRow = payload.old as Partial<RiderBookingRow>;

          console.log('[JobRequests] rider_booking realtime event', {
            eventType: payload.eventType,
            table: payload.table,
            id: nextRow.id ?? previousRow.id ?? null,
            rideStatus: nextRow.ride_status ?? previousRow.ride_status ?? null,
            assignedDriver: nextRow.assigned_driver ?? previousRow.assigned_driver ?? null,
          });

          if (isActive) {
            refreshRequests();
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
        },
        async (payload) => {
          const notification = payload.new as BookingRequestNotificationRow;
          const source = notification.data?.source;
          const bookingId = notification.data?.bookingId;

          if (notification.type !== 'booking_request' || !isBookingNotificationSource(source) || typeof bookingId !== 'string' || !bookingId.trim()) {
            return;
          }

          const requestId = bookingId.trim();
          const requestKey = buildRequestStorageKey(requestId, source);
          retriedRequestTimestampsRef.current[requestKey] = notification.created_at ?? new Date().toISOString();

          await removeDismissedRequestKey(requestId, source);

          if (isActive) {
            refreshRequests();
          }
        }
      )
      .subscribe((status) => {
        console.log('[JobRequests] realtime channel status', {
          channelName,
          status,
        });
      });

    return () => {
      isActive = false;
      console.log('[JobRequests] removing realtime channel', { channelName });
      supabase.removeChannel(channel);
    };
  }, [refreshRequests]);

  useEffect(() => {
    const actionableRequestKeys = requests
      .filter((request) => request.actionable)
      .map((request) => buildRequestStorageKey(request.id, request.source));
    const hasNewActionableRequest = actionableRequestKeys.some(
      (requestKey) => !previousActionableRequestKeys.includes(requestKey)
    );

    console.log('[JobRequests] request sound evaluation', {
      actionableRequestKeys,
      previousActionableRequestKeys,
      hasNewActionableRequest,
      actionableRequestCount: actionableRequestKeys.length,
    });

    previousActionableRequestKeys = actionableRequestKeys;

    if (actionableRequestKeys.length === 0) {
      void stopRequestAlertSound();
      return;
    }

    if (hasNewActionableRequest) {
      console.log('[JobRequests] new actionable request detected, triggering ping-ping.wav');
      void startRequestAlertSound();
    }
  }, [requests]);

  useEffect(() => {
    return () => {
      previousActionableRequestKeys = [];
      void stopRequestAlertSound();
    };
  }, []);

  const value = useMemo<JobRequestsContextValue>(
    () => ({
      requests,
      notificationRequests,
      isLoadingRequests,
      refreshRequests,
      acceptRequest,
      removeRequest,
      clearRequests,
    }),
    [requests, notificationRequests, isLoadingRequests, refreshRequests, acceptRequest, removeRequest]
  );

  return <JobRequestsContext.Provider value={value}>{children}</JobRequestsContext.Provider>;
}

export function useJobRequests() {
  const context = useContext(JobRequestsContext);

  if (!context) {
    throw new Error('useJobRequests must be used within a JobRequestsProvider');
  }

  return context;
}