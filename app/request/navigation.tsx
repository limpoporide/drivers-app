import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { Audio } from 'expo-av';
import { router, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import { subscribeToChatMessages } from '../../src/lib/chat';
import { supabase } from '../../src/lib/supabase';
import { useTheme } from '../../src/context/ThemeContext';
import type { Database } from '../../src/types/supabase';

type NativeNavigationSdk = typeof import('@googlemaps/react-native-navigation-sdk');
type TripStage = 'toPickup' | 'awaitingRider' | 'toDropoff' | 'tripComplete';
type Waypoint = {
  title: string;
  position: {
    lat: number;
    lng: number;
  };
};
type Coordinate = {
  latitude: number;
  longitude: number;
};

type RiderBookingRideStatus = Database['public']['Tables']['rider_booking']['Row']['ride_status'];
type RiderBookingPaymentStatus = Database['public']['Tables']['rider_booking']['Row']['payment_status'];
type TripTimestampField = 'driver_arrived_at' | 'trip_started_at' | 'trip_completed_at';
type TripActionConfig = {
  buttonLabel: string;
  nextStage: TripStage | null;
  nextRideStatus: RiderBookingRideStatus | null;
  timestampField: TripTimestampField | null;
  nextStatusMessage: string;
  shouldStopGuidance: boolean;
};

type NavigationStepSnapshot = {
  instruction: string;
  distanceMeters: number | null;
  maneuver: string | null;
};

type DriverMarkerSnapshot = {
  latitude: number;
  longitude: number;
  bearing: number | null;
};

type TurnByTurnPayload = {
  currentStep?: {
    instruction?: string;
    distanceMeters?: number;
    maneuver?: string;
  };
  getRemainingSteps?: Array<{
    instruction?: string;
    distanceMeters?: number;
    maneuver?: string;
  }>;
  distanceToCurrentStepMeters?: number;
};

function getNavigationSdk(): NativeNavigationSdk | null {
  if (Constants.appOwnership === 'expo') {
    return null;
  }

  try {
    return require('@googlemaps/react-native-navigation-sdk') as NativeNavigationSdk;
  } catch {
    return null;
  }
}

function NavigationSdkProvider({
  sdk,
  theme,
  children,
}: {
  sdk: NativeNavigationSdk;
  theme: ReturnType<typeof useTheme>['theme'];
  children: React.ReactNode;
}) {
  const NavigationProvider = sdk.NavigationProvider;
  const taskRemovedBehavior = sdk.TaskRemovedBehavior;

  if (!NavigationProvider || !taskRemovedBehavior) {
    return <>{children}</>;
  }

  return (
    <NavigationProvider
      termsAndConditionsDialogOptions={{
        title: 'Navigation Terms',
        companyName: 'Limpopo Driver',
        showOnlyDisclaimer: false,
        uiParams: {
          backgroundColor: theme.colors.card,
          titleColor: theme.colors.text,
          mainTextColor: theme.colors.textSecondary,
          acceptButtonTextColor: theme.colors.primary,
          cancelButtonTextColor: theme.colors.text,
        },
      }}
      taskRemovedBehavior={taskRemovedBehavior.CONTINUE_SERVICE}
    >
      {children}
    </NavigationProvider>
  );
}

function getNavigationSessionMessage(status: string): string {
  switch (status) {
    case 'notAuthorized':
      return 'This Google Maps key is not authorized for the Navigation SDK.';
    case 'termsNotAccepted':
      return 'Navigation terms must be accepted before guidance can start.';
    case 'networkError':
      return 'Navigation could not connect to Google services.';
    case 'locationPermissionMissing':
      return 'Location permission is required to start navigation.';
    default:
      return 'Navigation failed to initialize.';
  }
}

function getRouteStatusMessage(status: string): string {
  switch (status) {
    case 'NO_ROUTE_FOUND':
      return 'No drivable route was found for this trip.';
    case 'NETWORK_ERROR':
      return 'Route calculation failed because the network is unavailable.';
    case 'QUOTA_CHECK_FAILED':
      return 'Google Maps quota check failed for this navigation request.';
    case 'LOCATION_DISABLED':
    case 'LOCATION_UNKNOWN':
      return 'Waiting for a stable GPS fix before route guidance can start.';
    case 'WAYPOINT_ERROR':
    case 'INVALID_PLACE_ID':
    case 'DUPLICATE_WAYPOINTS_ERROR':
      return 'The destination details could not be used to start guidance.';
    default:
      return 'Unable to calculate a navigation route right now.';
  }
}

type ScreenParams = {
  bookingId?: string;
  requestId?: string;
  source?: string;
  riderName?: string;
  riderProfileImg?: string;
  riderPhoneNumber?: string;
  pickupAddress?: string;
  dropOffAddress?: string;
  pickupLat?: string;
  pickupLng?: string;
  dropoffLat?: string;
  dropoffLng?: string;
  distance?: string;
  eta?: string;
  amount?: string;
  paymentMethod?: string;
  scheduleDateLabel?: string;
  pickupTimeLabel?: string;
};

const parseCoordinate = (value: string | undefined): number | null => {
  const parsed = Number.parseFloat(value ?? '');
  return Number.isFinite(parsed) ? parsed : null;
};

const isRiderBookingSource = (source: string) => source === 'rider_booking';
const DRIVER_ROUTE_MARKER_ID = 'driver-route-marker';
const DRIVER_ROUTE_MARKER_IMAGE = Platform.OS === 'ios' ? 'LimpopoCarIcon' : 'limpopo-car-icon.png';
const NAVIGATION_SHORTCUT_IMAGE = require('../../assets/Limpopo round.png');
const NAVIGATION_FOLLOW_ZOOM_LEVEL = 18;
const ROUTE_MAP_PADDING = {
  top: 184,
  right: 24,
  bottom: 316,
  left: 24,
} as const;
const AUTO_COMPLETE_DWELL_MS = 45000;
const AUTO_COMPLETE_PROXIMITY_METERS = 75;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

const calculateDistanceMeters = (from: Coordinate, to: Coordinate) => {
  const earthRadiusMeters = 6371000;
  const latitudeDelta = toRadians(to.latitude - from.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const fromLatitude = toRadians(from.latitude);
  const toLatitude = toRadians(to.latitude);
  const haversineDistance =
    Math.sin(latitudeDelta / 2) * Math.sin(latitudeDelta / 2) +
    Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) * Math.sin(longitudeDelta / 2);

  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(haversineDistance), Math.sqrt(1 - haversineDistance));
};

const formatDistanceKm = (meters: number | null, fallback: string) => {
  if (typeof meters === 'number' && Number.isFinite(meters)) {
    return `${(meters / 1000).toFixed(meters >= 10000 ? 0 : 1)} km`;
  }

  return fallback || '--';
};

const formatTimeLeft = (seconds: number | null, fallback: string) => {
  if (typeof seconds === 'number' && Number.isFinite(seconds)) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.max(1, Math.ceil((seconds % 3600) / 60));

    if (hours > 0) {
      return `${hours} hr ${minutes} min`;
    }

    return `${minutes} min`;
  }

  return fallback || '--';
};

const formatStepDistance = (meters: number | null) => {
  if (typeof meters !== 'number' || !Number.isFinite(meters)) {
    return 'Follow the current route';
  }

  if (meters >= 1000) {
    return `In ${(meters / 1000).toFixed(meters >= 10000 ? 0 : 1)} km`;
  }

  return `In ${Math.max(1, Math.round(meters))} m`;
};

const getManeuverIconName = (maneuver: string | null) => {
  const normalizedManeuver = maneuver?.toLowerCase() ?? '';

  if (normalizedManeuver.includes('left') || normalizedManeuver.includes('uturn_left')) {
    return 'arrow-undo';
  }

  if (normalizedManeuver.includes('right') || normalizedManeuver.includes('uturn_right')) {
    return 'arrow-redo';
  }

  if (normalizedManeuver.includes('destination') || normalizedManeuver.includes('arrive')) {
    return 'flag';
  }

  if (normalizedManeuver.includes('merge') || normalizedManeuver.includes('fork')) {
    return 'git-merge';
  }

  return 'navigate';
};

const mapRideStatusToTripStage = (rideStatus: RiderBookingRideStatus | null | undefined): TripStage => {
  switch (rideStatus) {
    case 'arrived':
      return 'awaitingRider';
    case 'in_progress':
      return 'toDropoff';
    case 'completed':
      return 'tripComplete';
    default:
      return 'toPickup';
  }
};

const getGuidedStageForTripStage = (tripStage: TripStage): TripStage | null => {
  if (tripStage === 'awaitingRider' || tripStage === 'tripComplete') {
    return tripStage;
  }

  return null;
};

const getTripStageLabel = (tripStage: TripStage): string => {
  switch (tripStage) {
    case 'awaitingRider':
      return 'Waiting for rider';
    case 'toDropoff':
      return 'Trip in progress';
    case 'tripComplete':
      return 'Trip complete';
    default:
      return 'Heading to pickup';
  }
};

const getTripStageStatusMessage = (tripStage: TripStage): string => {
  switch (tripStage) {
    case 'awaitingRider':
      return 'Pickup confirmed. Start the trip when the rider is onboard.';
    case 'toDropoff':
      return 'Trip in progress. Continue to the rider destination.';
    case 'tripComplete':
      return 'Trip completed.';
    default:
      return 'Head to the rider pickup and confirm when you arrive.';
  }
};

const getTripActionConfig = (tripStage: TripStage): TripActionConfig => {
  switch (tripStage) {
    case 'awaitingRider':
      return {
        buttonLabel: 'Start Trip',
        nextStage: 'toDropoff',
        nextRideStatus: 'in_progress',
        timestampField: 'trip_started_at',
        nextStatusMessage: 'Starting trip to drop-off...',
        shouldStopGuidance: false,
      };
    case 'toDropoff':
      return {
        buttonLabel: 'End Trip',
        nextStage: 'tripComplete',
        nextRideStatus: 'completed',
        timestampField: 'trip_completed_at',
        nextStatusMessage: 'Trip completed.',
        shouldStopGuidance: true,
      };
    case 'tripComplete':
      return {
        buttonLabel: 'Trip Completed',
        nextStage: null,
        nextRideStatus: null,
        timestampField: null,
        nextStatusMessage: 'Trip completed.',
        shouldStopGuidance: false,
      };
    default:
      return {
        buttonLabel: 'Arrived',
        nextStage: 'awaitingRider',
        nextRideStatus: 'arrived',
        timestampField: 'driver_arrived_at',
        nextStatusMessage: 'Pickup confirmed. Start the trip when the rider is onboard.',
        shouldStopGuidance: true,
      };
  }
};

const getCurrentDestinationForTripStage = (tripStage: TripStage, pickupAddress: string, dropOffAddress: string) =>
  tripStage === 'toDropoff' || tripStage === 'tripComplete' ? dropOffAddress : pickupAddress;

const getCurrentCoordinateForTripStage = (
  tripStage: TripStage,
  pickupCoordinate: Coordinate | null,
  dropoffCoordinate: Coordinate | null
) => (tripStage === 'toDropoff' || tripStage === 'tripComplete' ? dropoffCoordinate : pickupCoordinate);

const showDriverCancellationAlertAndReturnHome = (message: string) => {
  Alert.alert('Booking cancelled', message);

  return setTimeout(() => {
    router.replace('/(tabs)/home');
  }, 1200);
};

const loadRiderBookingState = async (requestId: string): Promise<{
  tripStage: TripStage;
  paymentStatus: RiderBookingPaymentStatus | null;
  rideStatus: RiderBookingRideStatus | null;
}> => {
  const { data, error } = await supabase
    .from('rider_booking')
    .select('ride_status, payment_status')
    .eq('id', requestId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return {
    tripStage: mapRideStatusToTripStage(data?.ride_status ?? 'accepted'),
    paymentStatus: data?.payment_status ?? null,
    rideStatus: data?.ride_status ?? null,
  };
};

const updateRiderBookingTripStage = async (requestId: string, tripStage: TripStage) => {
  const actionConfig = getTripActionConfig(tripStage);

  if (!actionConfig.nextRideStatus || !actionConfig.timestampField) {
    return actionConfig;
  }

  const timestamp = new Date().toISOString();
  const updates: Database['public']['Tables']['rider_booking']['Update'] = {
    ride_status: actionConfig.nextRideStatus,
  };

  if (actionConfig.timestampField === 'driver_arrived_at') {
    updates.driver_arrived_at = timestamp;
  }

  if (actionConfig.timestampField === 'trip_started_at') {
    updates.trip_started_at = timestamp;
  }

  if (actionConfig.timestampField === 'trip_completed_at') {
    updates.trip_completed_at = timestamp;
  }

  const { error } = await supabase.from('rider_booking').update(updates).eq('id', requestId);

  if (error) {
    throw error;
  }

  return actionConfig;
};

type TripCompletionReason = 'auto_dropoff_arrival' | 'manual_end_trip';
type TripCompletionMutationResult = {
  status?: 'completed' | 'already_completed';
  rideStatus?: RiderBookingRideStatus | null;
  tripCompletedAt?: string | null;
};

const completeRiderBookingTrip = async (requestId: string, reason: TripCompletionReason) => {
  const { data, error } = await supabase.functions.invoke('complete-rider-trip', {
    method: 'POST',
    body: {
      bookingId: requestId,
      reason,
    },
  });

  if (error) {
    let message = error.message || 'Unable to complete this trip right now.';
    const context = (error as unknown as { context?: Response }).context;

    if (context && typeof context.json === 'function') {
      try {
        const parsed = await context.json();
        if (parsed?.error) {
          message = parsed.error as string;
        }
      } catch {
        // Ignore parse failures and keep the generic error message.
      }
    }

    throw new Error(message);
  }

  return (data ?? {}) as TripCompletionMutationResult;
};

function NavigationFallback({
  bookingId,
  requestId,
  source,
  chatUnreadCount,
  riderPhoneNumber,
  riderName,
  riderProfileImg,
  pickupAddress,
  dropOffAddress,
  pickupCoordinate,
  dropoffCoordinate,
  theme,
}: {
  bookingId: string;
  requestId: string;
  source: string;
  chatUnreadCount: number;
  riderPhoneNumber: string;
  riderName: string;
  riderProfileImg: string;
  pickupAddress: string;
  dropOffAddress: string;
  pickupCoordinate: Coordinate | null;
  dropoffCoordinate: Coordinate | null;
  theme: ReturnType<typeof useTheme>['theme'];
}) {
  const [tripStage, setTripStage] = useState<TripStage>('toPickup');
  const [isOpeningExternal, setIsOpeningExternal] = useState(false);
  const isUpdatingTripStageRef = useRef(false);
  const hasHandledCancellationRef = useRef(false);
  const cancellationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canManageRideStatus = isRiderBookingSource(source) && requestId.length > 0;
  const currentDestination = getCurrentDestinationForTripStage(tripStage, pickupAddress, dropOffAddress);
  const currentCoordinate = getCurrentCoordinateForTripStage(tripStage, pickupCoordinate, dropoffCoordinate);
  const primaryActionTextColor = theme.mode === 'dark' ? '#000000' : '#FFFFFF';

  useEffect(() => () => {
    if (cancellationTimeoutRef.current) {
      clearTimeout(cancellationTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    if (!canManageRideStatus) {
      return;
    }

    let isActive = true;
    let hasHandledPaymentConfirmed = false;

    const handleBookingCancelled = () => {
      if (!isActive || hasHandledCancellationRef.current) {
        return;
      }

      hasHandledCancellationRef.current = true;

      if (cancellationTimeoutRef.current) {
        clearTimeout(cancellationTimeoutRef.current);
      }

      cancellationTimeoutRef.current = showDriverCancellationAlertAndReturnHome('Rider has cancelled booking.');
    };

    const handlePaymentConfirmed = () => {
      if (!isActive || hasHandledPaymentConfirmed || hasHandledCancellationRef.current) {
        return;
      }

      hasHandledPaymentConfirmed = true;
      Alert.alert('Payment confirmed', 'The rider has confirmed payment for this trip.', [
        {
          text: 'OK',
          onPress: () => {
            router.replace('/(tabs)/rides');
          },
        },
      ]);
    };

    const loadTripStage = async () => {
      try {
        const { tripStage: nextTripStage, paymentStatus, rideStatus } = await loadRiderBookingState(requestId);

        if (!isActive) {
          if (nextTripStage === 'tripComplete' && paymentStatus === 'paid') {
            handlePaymentConfirmed();
            return;
          }

          return;
        }

        if (rideStatus === 'cancelled') {
          handleBookingCancelled();
          return;
        }

        if (nextTripStage === 'tripComplete') {
          handlePaymentConfirmed();
          return;
        }

        setTripStage(nextTripStage);
      } catch (error) {
        if (isActive) {
          console.log('[Driver Navigation Fallback] Unable to load rider booking trip stage', error);
        }
      }
    };

    void loadTripStage();

    const channelName = `driver-ride-payment:${requestId}:${Date.now()}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rider_booking',
          filter: `id=eq.${requestId}`,
        },
        (payload) => {
          const nextRow = payload.new as Record<string, unknown>;

          if (nextRow.ride_status === 'cancelled') {
            handleBookingCancelled();
            return;
          }

          if (nextRow.ride_status === 'completed' && nextRow.payment_status === 'paid') {
            handlePaymentConfirmed();
          }
        }
      )
      .subscribe();

    return () => {
      isActive = false;
      supabase.removeChannel(channel);
    };
  }, [canManageRideStatus, requestId]);

  const openExternalNavigation = async () => {
    setIsOpeningExternal(true);

    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const destination = currentCoordinate
        ? `${currentCoordinate.latitude},${currentCoordinate.longitude}`
        : encodeURIComponent(currentDestination.replace(/^(Pickup|Drop-off):\s*/, ''));

      const url = `https://www.google.com/maps/dir/?api=1&origin=${location.coords.latitude},${location.coords.longitude}&destination=${destination}&travelmode=driving`;

      await Linking.openURL(url);
    } finally {
      setIsOpeningExternal(false);
    }
  };

  const handleCallRider = async () => {
    if (!riderPhoneNumber) {
      Alert.alert('Call unavailable', 'No phone number is available for this rider.');
      return;
    }

    await Linking.openURL(`tel:${riderPhoneNumber.replace(/\s+/g, '')}`);
  };

  const handleOpenChat = () => {
    if (!bookingId) {
      Alert.alert('Chat unavailable', 'In-app rider chat is only available for active rider bookings.');
      return;
    }

    router.push({
      pathname: '/request/chat',
      params: {
        bookingId,
        riderName,
      },
    });
  };

  const stageLabel = canManageRideStatus ? getTripStageLabel(tripStage) : 'External navigation only';

  const handlePrimaryAction = async () => {
    const actionConfig = getTripActionConfig(tripStage);

    if (!canManageRideStatus || !actionConfig.nextStage || isUpdatingTripStageRef.current) {
      return;
    }

    isUpdatingTripStageRef.current = true;

    try {
      if (tripStage === 'toDropoff') {
        await completeRiderBookingTrip(requestId, 'manual_end_trip');
      } else {
        await updateRiderBookingTripStage(requestId, tripStage);
      }

      setTripStage(actionConfig.nextStage);
    } catch (error) {
      console.log('[Driver Navigation Fallback] Unable to update rider booking trip stage', error);
      Alert.alert(
        tripStage === 'toDropoff' ? 'Unable to complete trip' : 'Unable to update trip status',
        error instanceof Error ? error.message : 'Please try again.'
      );
    } finally {
      isUpdatingTripStageRef.current = false;
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top', 'bottom']}>
      <View style={styles.mapHeader}>
        <TouchableOpacity
          style={[styles.backButton, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={18} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>Navigation</Text>
        <TouchableOpacity style={[styles.routeButton, { backgroundColor: theme.colors.primary }]} onPress={openExternalNavigation}>
          <Ionicons name="navigate-outline" size={16} color={primaryActionTextColor} />
        </TouchableOpacity>
      </View>

      <View style={[styles.fallbackMap, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
        <Ionicons name="phone-portrait-outline" size={28} color={theme.colors.primary} />
        <Text style={[styles.statusTitle, { color: theme.colors.text }]}>{riderName}</Text>
        <Text style={[styles.statusEyebrow, { color: theme.colors.primary }]}>{stageLabel}</Text>
        <Text style={[styles.statusMessage, { color: theme.colors.textSecondary }]}>Expo Go cannot load the native Google Navigation SDK module. Open Google Maps from this screen, or launch a development build after rebuilding Android or iOS.</Text>
        <Text style={[styles.statusDestination, { color: theme.colors.text }]} numberOfLines={2}>
          {currentDestination}
        </Text>
        <TouchableOpacity style={[styles.externalNavButton, { backgroundColor: theme.colors.primary }]} onPress={openExternalNavigation}>
          <Text style={[styles.arrivalButtonText, { color: primaryActionTextColor }]}>
            {isOpeningExternal ? 'Opening Google Maps...' : 'Open in Google Maps'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.actionBar, { backgroundColor: theme.colors.background, borderTopColor: theme.colors.border }]}> 
        {canManageRideStatus ? (
          <TouchableOpacity
            style={[
              styles.primaryTripActionButton,
              { backgroundColor: theme.colors.primary },
              tripStage === 'tripComplete' ? styles.disabledTripActionButton : null,
            ]}
            disabled={tripStage === 'tripComplete'}
            onPress={handlePrimaryAction}
          >
            <Text style={[styles.arrivalButtonText, { color: primaryActionTextColor }]}>
              {getTripActionConfig(tripStage).buttonLabel}
            </Text>
          </TouchableOpacity>
        ) : null}

        <View style={styles.secondaryActionsRow}>
          <TouchableOpacity style={[styles.secondaryActionButton, { borderColor: theme.colors.border }]} onPress={handleCallRider}>
            <Ionicons name="call-outline" size={18} color={theme.colors.text} />
            <Text style={[styles.secondaryActionText, { color: theme.colors.text }]}>Call</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryActionButton, { borderColor: theme.colors.border }]}
            onPress={handleOpenChat}
          >
            <View style={styles.chatIconWrap}>
              <Ionicons name="chatbubble-ellipses-outline" size={18} color={theme.colors.text} />
              {chatUnreadCount > 0 ? (
                <View style={[styles.chatUnreadBadge, { backgroundColor: theme.colors.error }]}> 
                  <Text style={styles.chatUnreadBadgeText}>{chatUnreadCount > 9 ? '9+' : chatUnreadCount}</Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.secondaryActionText, { color: theme.colors.text }]}>Chat</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

function NativeNavigationScreen({
  bookingId,
  chatUnreadCount,
  requestId,
  source,
  sdk,
  riderPhoneNumber,
  riderName,
  riderProfileImg,
  pickupAddress,
  dropOffAddress,
  distance,
  eta,
  amount,
  paymentMethod,
  scheduleDateLabel,
  pickupTimeLabel,
  pickupCoordinate,
  dropoffCoordinate,
  theme,
  googleMapsApiKey,
}: {
  bookingId: string;
  chatUnreadCount: number;
  requestId: string;
  source: string;
  sdk: NativeNavigationSdk;
  riderPhoneNumber: string;
  riderName: string;
  riderProfileImg: string;
  pickupAddress: string;
  dropOffAddress: string;
  distance: string;
  eta: string;
  amount: string;
  paymentMethod: string;
  scheduleDateLabel: string;
  pickupTimeLabel: string;
  pickupCoordinate: Coordinate | null;
  dropoffCoordinate: Coordinate | null;
  theme: ReturnType<typeof useTheme>['theme'];
  googleMapsApiKey: string;
}) {
  const {
    AudioGuidance,
    CameraPerspective,
    MapColorScheme,
    NavigationNightMode,
    NavigationSessionStatus,
    NavigationUIEnabledPreference,
    NavigationView,
    RouteStatus,
    TravelMode,
    useNavigation,
  } = sdk;
  const {
    navigationController,
    removeAllListeners,
    setOnArrival,
    setOnLocationChanged,
    setOnStartGuidance,
    setOnNavigationReady,
    setOnRawLocationChanged,
    setOnRemainingTimeOrDistanceChanged,
    setOnRouteChanged,
    setOnTurnByTurn,
  } = useNavigation();
  const [isLoading, setIsLoading] = useState(true);
  const [isRouting, setIsRouting] = useState(false);
  const [isSessionReady, setIsSessionReady] = useState(false);
  const [areNavigationListenersReady, setAreNavigationListenersReady] = useState(false);
  const [hasLocationFix, setHasLocationFix] = useState(false);
  const [hasLocationPermission, setHasLocationPermission] = useState(false);
  const [isMapReady, setIsMapReady] = useState(false);
  const [isNavigatorReady, setIsNavigatorReady] = useState(false);
  const [tripStage, setTripStage] = useState<TripStage>('toPickup');
  const [guidedStage, setGuidedStage] = useState<TripStage | null>(null);
  const [isGuidanceActive, setIsGuidanceActive] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Preparing native navigation...');
  const [navigationError, setNavigationError] = useState<string | null>(null);
  const [isVoiceMuted, setIsVoiceMuted] = useState(false);
  const [tripMetrics, setTripMetrics] = useState<{ meters: number; seconds: number } | null>(null);
  const [nextStep, setNextStep] = useState<NavigationStepSnapshot | null>(null);
  const [driverMarker, setDriverMarker] = useState<DriverMarkerSnapshot | null>(null);
  const [navigationViewController, setNavigationViewController] = useState<InstanceType<any> | null>(null);
  const [mapViewController, setMapViewController] = useState<InstanceType<any> | null>(null);
  const tripStageRef = useRef<TripStage>('toPickup');
  const isGuidanceActiveRef = useRef(false);
  const isVoiceMutedRef = useRef(false);
  const lastDriverLocationRef = useRef<Coordinate | null>(null);
  const didStartLocationUpdatesRef = useRef(false);
  const isUpdatingTripStageRef = useRef(false);
  const hasHandledCancellationRef = useRef(false);
  const autoCompleteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancellationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldUseRoadSnappedLocationUpdates = Platform.OS !== 'android';
  const canManageRideStatus = isRiderBookingSource(source) && requestId.length > 0;
  const primaryActionTextColor = theme.mode === 'dark' ? '#000000' : '#FFFFFF';
  const currentDestination = getCurrentDestinationForTripStage(tripStage, pickupAddress, dropOffAddress);
  const currentCoordinate = getCurrentCoordinateForTripStage(tripStage, pickupCoordinate, dropoffCoordinate);
  const currentWaypoint: Waypoint | null = currentCoordinate
    ? {
        title: tripStage === 'toDropoff' ? 'Drop-off' : 'Pickup',
        position: {
          lat: currentCoordinate.latitude,
          lng: currentCoordinate.longitude,
        },
      }
    : null;

  useEffect(() => {
    Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    }).catch((error) => {
      console.log('[Driver Navigation] Failed to prepare audio mode', error);
    });
  }, []);

  useEffect(() => {
    tripStageRef.current = tripStage;
  }, [tripStage]);

  useEffect(() => {
    isGuidanceActiveRef.current = isGuidanceActive;
  }, [isGuidanceActive]);

  useEffect(() => {
    isVoiceMutedRef.current = isVoiceMuted;
  }, [isVoiceMuted]);

  useEffect(() => {
    if (tripStage !== 'toPickup' && tripStage !== 'toDropoff') {
      setIsGuidanceActive(false);
    }
  }, [tripStage]);

  useEffect(() => () => {
    if (autoCompleteTimeoutRef.current) {
      clearTimeout(autoCompleteTimeoutRef.current);
    }

    if (cancellationTimeoutRef.current) {
      clearTimeout(cancellationTimeoutRef.current);
    }
  }, []);

  const clearAutoCompleteTimeout = useCallback(() => {
    if (autoCompleteTimeoutRef.current) {
      clearTimeout(autoCompleteTimeoutRef.current);
      autoCompleteTimeoutRef.current = null;
    }
  }, []);

  const markTripCompletedLocally = useCallback((message: string) => {
    clearAutoCompleteTimeout();
    setIsGuidanceActive(false);
    setTripStage('tripComplete');
    setGuidedStage('tripComplete');
    setStatusMessage(message);
  }, [clearAutoCompleteTimeout]);

  const persistTripCompletion = useCallback(
    async (reason: TripCompletionReason, options?: { showFailureAlert?: boolean }) => {
      clearAutoCompleteTimeout();

      try {
        const result = await completeRiderBookingTrip(requestId, reason);

        if (result.status === 'completed' || result.status === 'already_completed') {
          markTripCompletedLocally('Trip completed.');
          return true;
        }

        throw new Error('Trip completion did not succeed.');
      } catch (error) {
        console.log('[Driver Navigation] Unable to complete trip', {
          requestId,
          reason,
          error,
        });

        if (options?.showFailureAlert) {
          Alert.alert('Unable to complete trip', error instanceof Error ? error.message : 'Please try again.');
        }

        return false;
      }
    },
    [clearAutoCompleteTimeout, markTripCompletedLocally, requestId]
  );

  const scheduleAutomaticTripCompletion = useCallback(() => {
    if (!canManageRideStatus || !dropoffCoordinate) {
      return;
    }

    clearAutoCompleteTimeout();
    setStatusMessage('Drop-off reached. Confirming stop before ending the trip automatically.');

    autoCompleteTimeoutRef.current = setTimeout(() => {
      void (async () => {
        if (tripStageRef.current !== 'toDropoff') {
          return;
        }

        const lastDriverLocation = lastDriverLocationRef.current;

        if (!lastDriverLocation) {
          setStatusMessage('Automatic trip end is waiting for driver location. You can also tap End Trip.');
          return;
        }

        const distanceFromDropoff = calculateDistanceMeters(lastDriverLocation, dropoffCoordinate);

        if (distanceFromDropoff > AUTO_COMPLETE_PROXIMITY_METERS) {
          setStatusMessage('Driver moved away from the drop-off. Tap End Trip when the ride is finished.');
          return;
        }

        setStatusMessage('Drop-off confirmed. Ending trip automatically...');

        const didComplete = await persistTripCompletion('auto_dropoff_arrival');

        if (!didComplete) {
          setStatusMessage('Automatic trip end failed. Please tap End Trip to finish.');
        }
      })();
    }, AUTO_COMPLETE_DWELL_MS);
  }, [canManageRideStatus, clearAutoCompleteTimeout, dropoffCoordinate, persistTripCompletion]);

  useEffect(() => {
    if (tripStage !== 'toDropoff') {
      clearAutoCompleteTimeout();
    }
  }, [clearAutoCompleteTimeout, tripStage]);

  const applyAudioGuidanceMode = useCallback(
    (muted: boolean) => {
      if (!isNavigatorReady) {
        return;
      }

      const audioGuidanceMode = muted
        ? AudioGuidance.SILENT
        : AudioGuidance.VOICE_ALERTS_AND_GUIDANCE;

      void Promise.resolve(navigationController.setAudioGuidanceType(audioGuidanceMode)).catch((error) => {
        console.log('[Driver Navigation] Failed to apply audio guidance mode', error);
      });
    },
    [AudioGuidance.SILENT, AudioGuidance.VOICE_ALERTS_AND_GUIDANCE, isNavigatorReady, navigationController]
  );

  useEffect(() => {
    if (!isSessionReady || !isNavigatorReady) {
      return;
    }

    void applyAudioGuidanceMode(isVoiceMuted);
  }, [applyAudioGuidanceMode, isNavigatorReady, isSessionReady, isVoiceMuted]);

  useEffect(() => {
    if (!isSessionReady || (guidedStage !== 'toPickup' && guidedStage !== 'toDropoff')) {
      setTripMetrics(null);
      setNextStep(null);
      return;
    }

    let isActive = true;

    const refreshTripMetrics = async () => {
      try {
        const metrics = await navigationController.getCurrentTimeAndDistance();

        if (!isActive || !metrics) {
          return;
        }

        setTripMetrics({
          meters: metrics.meters,
          seconds: metrics.seconds,
        });
      } catch {
        if (isActive) {
          setTripMetrics(null);
        }
      }
    };

    setOnRemainingTimeOrDistanceChanged((timeAndDistance) => {
      if (!isActive) {
        return;
      }

      setTripMetrics({
        meters: timeAndDistance.meters,
        seconds: timeAndDistance.seconds,
      });
    });

    setOnTurnByTurn((turnByTurnEvents) => {
      if (!isActive) {
        return;
      }

      const activeEvent = (turnByTurnEvents as unknown as TurnByTurnPayload[])[0];
      const currentStepSnapshot = activeEvent?.currentStep ?? activeEvent?.getRemainingSteps?.[0];

      if (!currentStepSnapshot?.instruction) {
        setNextStep(null);
        return;
      }

      setNextStep({
        instruction: currentStepSnapshot.instruction,
        distanceMeters:
          typeof activeEvent?.distanceToCurrentStepMeters === 'number'
            ? activeEvent.distanceToCurrentStepMeters
            : typeof currentStepSnapshot.distanceMeters === 'number'
              ? currentStepSnapshot.distanceMeters
              : null,
        maneuver: currentStepSnapshot.maneuver ?? null,
      });
    });

    void refreshTripMetrics();

    return () => {
      isActive = false;
      setOnRemainingTimeOrDistanceChanged(null);
      setOnTurnByTurn(null);
    };
  }, [guidedStage, isSessionReady, navigationController, setOnRemainingTimeOrDistanceChanged, setOnTurnByTurn]);

  useEffect(() => {
    if (!canManageRideStatus) {
      return;
    }

    let isActive = true;
    let hasHandledPaymentConfirmed = false;

    const handleBookingCancelled = () => {
      if (!isActive || hasHandledCancellationRef.current) {
        return;
      }

      hasHandledCancellationRef.current = true;
      clearAutoCompleteTimeout();
      setStatusMessage('Rider cancelled the booking. Closing request...');
      void navigationController.stopGuidance().catch(() => undefined);
      void navigationController.clearDestinations().catch(() => undefined);

      if (cancellationTimeoutRef.current) {
        clearTimeout(cancellationTimeoutRef.current);
      }

      cancellationTimeoutRef.current = showDriverCancellationAlertAndReturnHome('Rider has cancelled booking.');
    };

    const handlePaymentConfirmed = () => {
      if (!isActive || hasHandledPaymentConfirmed || hasHandledCancellationRef.current) {
        return;
      }

      hasHandledPaymentConfirmed = true;
      clearAutoCompleteTimeout();
      setStatusMessage('Payment confirmed. Closing trip...');
      void navigationController.stopGuidance().catch(() => undefined);
      void navigationController.clearDestinations().catch(() => undefined);

      Alert.alert('Payment confirmed', 'The rider has confirmed payment for this trip.', [
        {
          text: 'OK',
          onPress: () => {
            router.replace('/(tabs)/rides');
          },
        },
      ]);
    };

    const loadTripStage = async () => {
      try {
        const { tripStage: nextTripStage, paymentStatus, rideStatus } = await loadRiderBookingState(requestId);

        if (!isActive) {
          return;
        }

        if (rideStatus === 'cancelled') {
          handleBookingCancelled();
          return;
        }

        if (nextTripStage === 'tripComplete' && paymentStatus === 'paid') {
          handlePaymentConfirmed();
          return;
        }

        setTripStage(nextTripStage);
        setGuidedStage(getGuidedStageForTripStage(nextTripStage));
        setStatusMessage(getTripStageStatusMessage(nextTripStage));
      } catch (error) {
        if (isActive) {
          console.log('[Driver Navigation] Unable to load rider booking trip stage', error);
        }
      }
    };

    void loadTripStage();

    const channelName = `driver-ride-payment:${requestId}:${Date.now()}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rider_booking',
          filter: `id=eq.${requestId}`,
        },
        (payload) => {
          const nextRow = payload.new as Record<string, unknown>;

          if (nextRow.ride_status === 'cancelled') {
            handleBookingCancelled();
            return;
          }

          if (nextRow.ride_status === 'completed' && nextRow.payment_status === 'paid') {
            handlePaymentConfirmed();
          }
        }
      )
      .subscribe();

    return () => {
      isActive = false;
      supabase.removeChannel(channel);
    };
  }, [canManageRideStatus, navigationController, requestId]);

  useEffect(() => {
    let isActive = true;

    async function prepareNavigation() {
      setIsLoading(true);
      setNavigationError(null);
      setIsNavigatorReady(false);
      setIsSessionReady(false);
      setAreNavigationListenersReady(false);
      setHasLocationFix(false);
      setIsGuidanceActive(false);
      didStartLocationUpdatesRef.current = false;

      if (!googleMapsApiKey || googleMapsApiKey === 'YOUR_GOOGLE_MAPS_API_KEY') {
        setNavigationError('Add a valid EXPO_PUBLIC_GOOGLE_MAPS_API_KEY before using native navigation.');
        setStatusMessage('Navigation is waiting for a valid Google Maps key.');
        setIsLoading(false);
        return;
      }

      try {
        const handleDriverLocation = (location: { lat: number; lng: number; bearing?: number }) => {
          if (!isActive) {
            return;
          }

          lastDriverLocationRef.current = {
            latitude: location.lat,
            longitude: location.lng,
          };

          setDriverMarker({
            latitude: location.lat,
            longitude: location.lng,
            bearing: typeof location.bearing === 'number' ? location.bearing : null,
          });
          setHasLocationFix(true);

          if (!isGuidanceActiveRef.current && tripStageRef.current === 'toPickup') {
            setStatusMessage('Driver location locked. Routing to pickup.');
          }

          if (!isGuidanceActiveRef.current && tripStageRef.current === 'toDropoff') {
            setStatusMessage('Driver location locked. Routing to drop-off.');
          }
        };

        const foregroundPermission = await Location.getForegroundPermissionsAsync();
        let permissionStatus = foregroundPermission.status;

        if (permissionStatus !== 'granted') {
          const requestedPermission = await Location.requestForegroundPermissionsAsync();
          permissionStatus = requestedPermission.status;
        }

        if (permissionStatus !== 'granted') {
          throw new Error('Location permission is required to start navigation.');
        }

        setHasLocationPermission(true);

        if (Platform.OS === 'ios') {
          const backgroundPermission = await Location.getBackgroundPermissionsAsync();

          if (backgroundPermission.status !== 'granted') {
            await Location.requestBackgroundPermissionsAsync();
          }
        }

          const hasAcceptedTerms = await navigationController.areTermsAccepted();
          const termsAccepted = hasAcceptedTerms
            ? true
            : await navigationController.showTermsAndConditionsDialog();

        if (!termsAccepted) {
          setNavigationError('Navigation terms were declined.');
          setStatusMessage('Accept the Google navigation terms to continue.');
          return;
        }

        const sessionStatus = await navigationController.init();

        if (!isActive) {
          return;
        }

        if (sessionStatus !== NavigationSessionStatus.OK) {
          setNavigationError(getNavigationSessionMessage(sessionStatus));
          setStatusMessage('Navigation session could not start.');
          return;
        }

        applyAudioGuidanceMode(isVoiceMuted);

        if (shouldUseRoadSnappedLocationUpdates) {
          setOnLocationChanged(handleDriverLocation);
        } else {
          setHasLocationFix(true);
          setStatusMessage('Navigation initialized. Waiting for route guidance.');
        }

        setOnRawLocationChanged(handleDriverLocation);

        setOnNavigationReady(() => {
          if (isActive) {
            setIsNavigatorReady(true);
            applyAudioGuidanceMode(isVoiceMutedRef.current);
            setStatusMessage('Navigation ready.');
          }
        });

        setOnStartGuidance(() => {
          if (!isActive) {
            return;
          }

          console.log('[Driver Navigation] onStartGuidance fired', {
            tripStage: tripStageRef.current,
            isVoiceMuted: isVoiceMutedRef.current,
          });

          setIsRouting(false);
          setIsGuidanceActive(true);
          applyAudioGuidanceMode(isVoiceMutedRef.current);
          setStatusMessage(
            tripStageRef.current === 'toDropoff'
              ? 'Guiding to the rider destination.'
              : 'Guiding to the rider pickup.'
          );
        });

        setOnRouteChanged(() => {
          if (!isActive) {
            return;
          }

          if (!isGuidanceActiveRef.current && tripStageRef.current === 'toPickup') {
            setStatusMessage('Pickup route updated.');
          }

          if (!isGuidanceActiveRef.current && tripStageRef.current === 'toDropoff') {
            setStatusMessage('Drop-off route updated.');
          }
        });

        setOnArrival(({ isFinalDestination }) => {
          if (!isActive) {
            return;
          }

          if (tripStageRef.current === 'toPickup') {
            setIsGuidanceActive(false);
            setTripStage('awaitingRider');
            setGuidedStage('awaitingRider');
            setStatusMessage('Pickup reached. Confirm the rider is onboard to continue.');
            void navigationController.stopGuidance();
            return;
          }

          if (tripStageRef.current === 'toDropoff' && isFinalDestination) {
            setIsGuidanceActive(false);
            setGuidedStage(null);
            setStatusMessage('Drop-off reached. Confirming stop before ending the trip automatically.');
            void navigationController.stopGuidance();
            scheduleAutomaticTripCompletion();
          }
        });

        setIsSessionReady(true);
        setAreNavigationListenersReady(true);
        setStatusMessage('Waiting for GPS lock...');
      } catch (error) {
        if (isActive) {
          setNavigationError(error instanceof Error ? error.message : 'Unable to start native navigation.');
          setStatusMessage('Navigation setup failed.');
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void prepareNavigation();

    return () => {
      isActive = false;
      setIsNavigatorReady(false);
      setIsSessionReady(false);
      setAreNavigationListenersReady(false);
      setDriverMarker(null);
      didStartLocationUpdatesRef.current = false;

      // Stop native location updates before detaching listeners, otherwise a
      // location event can still fire after teardown and invoke a released
      // JS callback, crashing the app with a native NullPointerException.
      Promise.resolve(didStartLocationUpdatesRef.current ? navigationController.stopUpdatingLocation() : undefined)
        .catch(() => undefined)
        .finally(() => {
          removeAllListeners();
        });

      void navigationController.stopGuidance().catch(() => undefined);
      void navigationController.clearDestinations().catch(() => undefined);
      void navigationController.cleanup().catch(() => undefined);
    };
  }, [applyAudioGuidanceMode, googleMapsApiKey, navigationController, removeAllListeners, scheduleAutomaticTripCompletion, setOnArrival, setOnLocationChanged, setOnNavigationReady, setOnRawLocationChanged, setOnRemainingTimeOrDistanceChanged, setOnRouteChanged, setOnStartGuidance, setOnTurnByTurn, shouldUseRoadSnappedLocationUpdates]);

  useEffect(() => {
    if (!shouldUseRoadSnappedLocationUpdates) {
      return;
    }

    if (!isSessionReady || !areNavigationListenersReady || didStartLocationUpdatesRef.current) {
      return;
    }

    let isCancelled = false;

    async function beginLocationUpdates() {
      try {
        setStatusMessage('Starting location updates...');
        await navigationController.startUpdatingLocation();

        if (isCancelled) {
          try {
            await Promise.resolve(navigationController.stopUpdatingLocation());
          } catch {
            // Ignore teardown races while cancelling location startup.
          }
          return;
        }

        didStartLocationUpdatesRef.current = true;
        setStatusMessage('Waiting for GPS lock...');
      } catch (error) {
        if (!isCancelled) {
          setNavigationError(error instanceof Error ? error.message : 'Unable to start driver location updates.');
          setStatusMessage('Navigation location updates failed to start.');
        }
      }
    }

    void beginLocationUpdates();

    return () => {
      isCancelled = true;
    };
  }, [areNavigationListenersReady, isSessionReady, navigationController, shouldUseRoadSnappedLocationUpdates]);

  useEffect(() => {
    if (!mapViewController || !isMapReady) {
      return;
    }

    mapViewController.setPadding(ROUTE_MAP_PADDING);

    if (!driverMarker) {
      mapViewController.removeMarker(DRIVER_ROUTE_MARKER_ID);
    } else {
      const driverMarkerOptions = {
        id: DRIVER_ROUTE_MARKER_ID,
        position: {
          lat: driverMarker.latitude,
          lng: driverMarker.longitude,
        },
        imgPath: DRIVER_ROUTE_MARKER_IMAGE,
        title: 'Driver',
        anchor: { u: 0.5, v: 0.85 },
        flat: true,
        rotation: driverMarker.bearing ?? 0,
        visible: true,
        alpha: 1,
        zIndex: 9999,
      };

      void mapViewController
        .addMarker(driverMarkerOptions as never)
        .catch((error: unknown) => {
          console.warn('Failed to render custom route marker:', error);
        });
    }

    if (!isNavigatorReady) {
      return;
    }

    if (!navigationViewController) {
      return;
    }

    void navigationViewController.setFollowingPerspective(CameraPerspective.TILTED, {
      zoomLevel: NAVIGATION_FOLLOW_ZOOM_LEVEL,
    }).catch((error: unknown) => {
      console.warn('Failed to set camera perspective:', error);
    });
  }, [CameraPerspective, driverMarker, isMapReady, isNavigatorReady, mapViewController, navigationViewController]);

  useEffect(() => {
    if (!isSessionReady || !hasLocationFix) {
      return;
    }

    if (tripStage !== 'toPickup' && tripStage !== 'toDropoff') {
      return;
    }

    if (guidedStage === tripStage) {
      return;
    }

    let isCancelled = false;

    async function startGuidance() {
      if (!currentWaypoint) {
        setNavigationError('This booking is missing pickup or drop-off location data.');
        setStatusMessage('Waiting for valid location data before guidance can start.');
        return;
      }

      setIsRouting(true);
      setNavigationError(null);
      setStatusMessage(tripStage === 'toPickup' ? 'Calculating pickup route...' : 'Calculating drop-off route...');

      try {
        await navigationController.clearDestinations();

        let routeStatus = RouteStatus.LOCATION_UNKNOWN;
        const maxLocationAttempts = shouldUseRoadSnappedLocationUpdates ? 1 : 8;

        for (let attempt = 0; attempt < maxLocationAttempts; attempt += 1) {
          routeStatus = await navigationController.setDestinations([currentWaypoint], {
            routingOptions: {
              travelMode: TravelMode.DRIVING,
              avoidFerries: false,
              avoidTolls: false,
            },
            displayOptions: {
              showDestinationMarkers: true,
            },
          });

          if (isCancelled) {
            return;
          }

          if (routeStatus === RouteStatus.OK) {
            break;
          }

          const isWaitingForLocation =
            routeStatus === RouteStatus.LOCATION_DISABLED || routeStatus === RouteStatus.LOCATION_UNKNOWN;

          if (!isWaitingForLocation || shouldUseRoadSnappedLocationUpdates || attempt === maxLocationAttempts - 1) {
            break;
          }

          setStatusMessage('Waiting for navigation location before calculating route...');

          await new Promise((resolve) => {
            setTimeout(resolve, 1200);
          });
        }

        if (isCancelled) {
          return;
        }

        if (routeStatus !== RouteStatus.OK) {
          setNavigationError(getRouteStatusMessage(routeStatus));
          setStatusMessage('Route calculation is waiting on better navigation data.');
          return;
        }

        await navigationController.startGuidance();
        console.log('[Driver Navigation] startGuidance resolved', {
          tripStage,
          isVoiceMuted,
        });
        applyAudioGuidanceMode(isVoiceMuted);

        if (isCancelled) {
          return;
        }

        setIsRouting(false);
        setIsGuidanceActive(true);
        setGuidedStage(tripStage);
        setStatusMessage(tripStage === 'toPickup' ? 'Guiding to the rider pickup.' : 'Guiding to the rider destination.');

        if (navigationViewController && isMapReady && isNavigatorReady) {
          await navigationViewController
            .setNavigationUIEnabled(true)
            .catch((error: unknown) => console.warn('Failed to enable nav UI:', error));
          await navigationViewController
            .setFollowingPerspective(CameraPerspective.TILTED, { zoomLevel: NAVIGATION_FOLLOW_ZOOM_LEVEL })
            .catch((error: unknown) => console.warn('Failed to set camera:', error));
        }
      } catch (error) {
        if (!isCancelled) {
          setNavigationError(error instanceof Error ? error.message : 'Unable to start route guidance.');
          setStatusMessage('Navigation could not start route guidance.');
        }
      } finally {
        if (!isCancelled) {
          setIsRouting(false);
        }
      }
    }

    void startGuidance();

    return () => {
      isCancelled = true;
    };
  }, [CameraPerspective, RouteStatus.LOCATION_DISABLED, RouteStatus.LOCATION_UNKNOWN, RouteStatus.OK, TravelMode.DRIVING, applyAudioGuidanceMode, currentWaypoint, guidedStage, hasLocationFix, isNavigatorReady, isMapReady, isSessionReady, isVoiceMuted, navigationController, navigationViewController, shouldUseRoadSnappedLocationUpdates, tripStage]);

  const openExternalNavigation = async () => {
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });

    const destination = currentCoordinate
      ? `${currentCoordinate.latitude},${currentCoordinate.longitude}`
      : encodeURIComponent(currentDestination.replace(/^(Pickup|Drop-off):\s*/, ''));

    const url = `https://www.google.com/maps/dir/?api=1&origin=${location.coords.latitude},${location.coords.longitude}&destination=${destination}&travelmode=driving`;

    await Linking.openURL(url);
  };

  const handleCallRider = async () => {
    if (!riderPhoneNumber) {
      Alert.alert('Call unavailable', 'No phone number is available for this rider.');
      return;
    }

    await Linking.openURL(`tel:${riderPhoneNumber.replace(/\s+/g, '')}`);
  };

  const handleOpenChat = () => {
    if (!bookingId) {
      Alert.alert('Chat unavailable', 'In-app rider chat is only available for active rider bookings.');
      return;
    }

    router.push({
      pathname: '/request/chat',
      params: {
        bookingId,
        riderName,
      },
    });
  };

  const handleBackToAccept = () => {
    router.replace({
      pathname: '/request/accept',
      params: {
        bookingId,
        requestId,
        source,
        riderName,
        riderProfileImg,
        riderPhoneNumber,
        pickupAddress,
        dropOffAddress,
        pickupLat: pickupCoordinate ? String(pickupCoordinate.latitude) : '',
        pickupLng: pickupCoordinate ? String(pickupCoordinate.longitude) : '',
        dropoffLat: dropoffCoordinate ? String(dropoffCoordinate.latitude) : '',
        dropoffLng: dropoffCoordinate ? String(dropoffCoordinate.longitude) : '',
        distance,
        eta,
        amount,
        paymentMethod,
        scheduleDateLabel,
        pickupTimeLabel,
      },
    });
  };

  const handleShowRouteOverview = () => {
    navigationViewController?.showRouteOverview();
  };

  const handleRecenterNavigation = () => {
    if (!navigationViewController) {
      return;
    }

    void navigationViewController.setFollowingPerspective(CameraPerspective.TILTED, {
      zoomLevel: NAVIGATION_FOLLOW_ZOOM_LEVEL,
    }).catch((error: unknown) => {
      console.warn('Failed to recenter camera:', error);
    });
  };

  const tripStageLabel = getTripStageLabel(tripStage);
  const tripStageStatusMessage = getTripStageStatusMessage(tripStage);
  const bannerMessage =
    navigationError ??
    nextStep?.instruction ??
    (isGuidanceActive
      ? tripStage === 'toDropoff'
        ? 'Drop-off route active'
        : 'Pickup route active'
      : statusMessage === tripStageStatusMessage
        ? tripStageLabel
        : statusMessage);
  const bannerDetail = nextStep
    ? formatStepDistance(nextStep.distanceMeters)
    : tripStageStatusMessage;
  const bannerIconName = getManeuverIconName(nextStep?.maneuver ?? null);
  const shouldShowBannerTitle = bannerMessage !== tripStageLabel;

  const handlePrimaryAction = async () => {
    const actionConfig = getTripActionConfig(tripStage);

    if (!actionConfig.nextStage) {
      router.replace('/(tabs)/rides');
      return;
    }

    if (isUpdatingTripStageRef.current) {
      return;
    }

    isUpdatingTripStageRef.current = true;

    try {
      if (tripStage === 'toDropoff' && canManageRideStatus) {
        const didComplete = await persistTripCompletion('manual_end_trip', { showFailureAlert: true });

        if (!didComplete) {
          return;
        }
      } else if (canManageRideStatus) {
        await updateRiderBookingTripStage(requestId, tripStage);
      }

      if (actionConfig.shouldStopGuidance) {
        clearAutoCompleteTimeout();
        await navigationController.stopGuidance();
        setIsGuidanceActive(false);
      }

      if (tripStage !== 'toDropoff') {
        setTripStage(actionConfig.nextStage);
        setGuidedStage(getGuidedStageForTripStage(actionConfig.nextStage));
        setStatusMessage(actionConfig.nextStatusMessage);
      }
    } catch (error) {
      console.log('[Driver Navigation] Unable to update rider booking trip stage', error);
      Alert.alert('Unable to update trip status', 'Please try again.');
      return;
    } finally {
      isUpdatingTripStageRef.current = false;
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['bottom']}>
      <View style={styles.mapContainer}>
        <NavigationView
          style={styles.map}
          mapColorScheme={theme.mode === 'dark' ? MapColorScheme.DARK : MapColorScheme.LIGHT}
          navigationNightMode={theme.mode === 'dark' ? NavigationNightMode.FORCE_NIGHT : NavigationNightMode.FORCE_DAY}
          navigationUIEnabledPreference={NavigationUIEnabledPreference.AUTOMATIC}
          headerEnabled={false}
          footerEnabled={false}
          myLocationEnabled={false}
          recenterButtonEnabled
          reportIncidentButtonEnabled
          speedometerEnabled
          speedLimitIconEnabled
          trafficEnabled
          trafficPromptsEnabled
          trafficIncidentCardsEnabled
          tripProgressBarEnabled={false}
          onMapViewControllerCreated={(mapController) => {
            setMapViewController(mapController);
          }}
          onNavigationViewControllerCreated={(navigationControllerInstance) => {
            setNavigationViewController(navigationControllerInstance);
          }}
          onMapReady={() => {
            setIsMapReady(true);
            setStatusMessage('Map ready. Waiting for navigation session...');
          }}
          onRecenterButtonClick={() => setStatusMessage('Camera recentered on the active route.')}
        />

        <View style={styles.floatingRightControls}>
          <TouchableOpacity
            style={[styles.rightControlButton, styles.shortcutControlButton, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
            onPress={handleBackToAccept}
          >
            <Image source={NAVIGATION_SHORTCUT_IMAGE} style={styles.floatingShortcutImage} resizeMode="cover" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.rightControlButton, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
            onPress={() => setIsVoiceMuted((currentValue) => !currentValue)}
          >
            <Ionicons
              name={isVoiceMuted ? 'volume-mute' : 'volume-high'}
              size={18}
              color={theme.colors.text}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.rightControlButton, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
            onPress={handleShowRouteOverview}
          >
            <Ionicons name="map-outline" size={18} color={theme.colors.text} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.rightControlButton, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
            onPress={handleRecenterNavigation}
          >
            <Ionicons name="locate-outline" size={18} color={theme.colors.text} />
          </TouchableOpacity>
        </View>

        <View style={[styles.statusCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}> 
          <View style={styles.statusCardHeader}>
            <View style={[styles.statusCardIconWrap, { backgroundColor: theme.colors.primary }]}>
              <Ionicons name={bannerIconName as any} size={16} color={primaryActionTextColor} />
            </View>
            <View style={styles.statusCardHeaderText}>
              <Text style={[styles.statusEyebrow, { color: theme.colors.primary }]}>{tripStageLabel}</Text>
              {shouldShowBannerTitle ? (
                <Text style={[styles.statusTitle, { color: theme.colors.text }]} numberOfLines={2}>{bannerMessage}</Text>
              ) : null}
            </View>
          </View>
          <Text style={[styles.statusMessage, { color: theme.colors.textSecondary }]}>
            {bannerDetail}
          </Text>
          <Text style={[styles.statusMessage, { color: theme.colors.textSecondary }]}>
            {riderName}
          </Text>
          <Text style={[styles.statusDestination, { color: theme.colors.text }]} numberOfLines={2}>
            {currentDestination}
          </Text>
        </View>

        <View style={[styles.tripStatsCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}> 
          <View style={styles.tripStatItem}>
            <Text style={[styles.tripStatLabel, { color: theme.colors.textSecondary }]}>Time left</Text>
            <Text style={[styles.tripStatValue, { color: theme.colors.text }]}>
              {formatTimeLeft(tripMetrics?.seconds ?? null, eta)}
            </Text>
          </View>
          <View style={styles.tripStatDivider} />
          <View style={styles.tripStatItem}>
            <Text style={[styles.tripStatLabel, { color: theme.colors.textSecondary }]}>Distance</Text>
            <Text style={[styles.tripStatValue, { color: theme.colors.text }]}>
              {formatDistanceKm(tripMetrics?.meters ?? null, distance)}
            </Text>
          </View>
        </View>

        {isLoading || (isRouting && !isGuidanceActive) ? (
          <View style={[styles.loadingOverlay, { backgroundColor: 'rgba(0, 0, 0, 0.2)' }]}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={styles.loadingText}>{isLoading ? 'Preparing navigation...' : 'Starting guidance...'}</Text>
          </View>
        ) : null}
      </View>

      <View style={[styles.actionBar, { backgroundColor: theme.colors.background, borderTopColor: theme.colors.border }]}> 
        {canManageRideStatus ? (
          <TouchableOpacity
            style={[
              styles.primaryTripActionButton,
              { backgroundColor: theme.colors.primary },
              tripStage === 'tripComplete' ? styles.disabledTripActionButton : null,
            ]}
            disabled={tripStage === 'tripComplete'}
            onPress={handlePrimaryAction}
          >
            <Text style={[styles.arrivalButtonText, { color: primaryActionTextColor }]}>
              {getTripActionConfig(tripStage).buttonLabel}
            </Text>
          </TouchableOpacity>
        ) : null}

        <View style={styles.secondaryActionsRow}>
          <TouchableOpacity style={[styles.secondaryActionButton, { borderColor: theme.colors.border }]} onPress={handleCallRider}>
            <Ionicons name="call-outline" size={18} color={theme.colors.text} />
            <Text style={[styles.secondaryActionText, { color: theme.colors.text }]}>Call</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.secondaryActionButton, { borderColor: theme.colors.border }]} onPress={handleOpenChat}>
            <View style={styles.chatIconWrap}>
              <Ionicons name="chatbubble-ellipses-outline" size={18} color={theme.colors.text} />
              {chatUnreadCount > 0 ? (
                <View style={[styles.chatUnreadBadge, { backgroundColor: theme.colors.error }]}> 
                  <Text style={styles.chatUnreadBadgeText}>{chatUnreadCount > 9 ? '9+' : chatUnreadCount}</Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.secondaryActionText, { color: theme.colors.text }]}>Chat</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

export default function NavigationScreen() {
  const { theme } = useTheme();
  const params = useLocalSearchParams<ScreenParams>();
  const bookingId = params.bookingId ?? '';
  const requestId = params.requestId ?? bookingId;
  const source = params.source ?? '';
  const riderPhoneNumber = params.riderPhoneNumber ?? '';
  const riderName = params.riderName ?? 'Rider';
  const riderProfileImg = params.riderProfileImg ?? '';
  const pickupAddress = params.pickupAddress ?? 'Pickup location';
  const dropOffAddress = params.dropOffAddress ?? 'Drop-off location';
  const distance = params.distance ?? '';
  const eta = params.eta ?? '';
  const amount = params.amount ?? '';
  const paymentMethod = params.paymentMethod ?? '';
  const scheduleDateLabel = params.scheduleDateLabel ?? '';
  const pickupTimeLabel = params.pickupTimeLabel ?? '';
  const pickupLat = parseCoordinate(params.pickupLat);
  const pickupLng = parseCoordinate(params.pickupLng);
  const dropoffLat = parseCoordinate(params.dropoffLat);
  const dropoffLng = parseCoordinate(params.dropoffLng);
  const pickupCoordinate: Coordinate | null =
    pickupLat !== null && pickupLng !== null ? { latitude: pickupLat, longitude: pickupLng } : null;
  const dropoffCoordinate: Coordinate | null =
    dropoffLat !== null && dropoffLng !== null ? { latitude: dropoffLat, longitude: dropoffLng } : null;
  const googleMapsApiKey =
    (Constants.expoConfig?.extra?.googleMapsApiKey as string | undefined) ?? process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
  const sdk = getNavigationSdk();
  const [myUid, setMyUid] = useState<string | null>(null);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (isMounted) {
        setMyUid(data.user?.id ?? null);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!bookingId) {
      setChatUnreadCount(0);
      return;
    }

    const unsubscribe = subscribeToChatMessages(bookingId, (message) => {
      const isIncomingFromRider = myUid ? message.sender_uuid !== myUid : message.sender_role === 'rider';

      if (!isIncomingFromRider) {
        return;
      }

      setChatUnreadCount((currentCount) => currentCount + 1);
    });

    return () => {
      unsubscribe();
    };
  }, [bookingId, myUid]);

  if (!sdk) {
    return (
      <NavigationFallback
        bookingId={bookingId}
        requestId={requestId}
        source={source}
        chatUnreadCount={chatUnreadCount}
        riderPhoneNumber={riderPhoneNumber}
        riderName={riderName}
        riderProfileImg={riderProfileImg}
        pickupAddress={pickupAddress}
        dropOffAddress={dropOffAddress}
        pickupCoordinate={pickupCoordinate}
        dropoffCoordinate={dropoffCoordinate}
        theme={theme}
      />
    );
  }

  return (
    <NavigationSdkProvider sdk={sdk} theme={theme}>
      <NativeNavigationScreen
        bookingId={bookingId}
        chatUnreadCount={chatUnreadCount}
        requestId={requestId}
        source={source}
        sdk={sdk}
        riderPhoneNumber={riderPhoneNumber}
        riderName={riderName}
        riderProfileImg={riderProfileImg}
        pickupAddress={pickupAddress}
        dropOffAddress={dropOffAddress}
        distance={distance}
        eta={eta}
        amount={amount}
        paymentMethod={paymentMethod}
        scheduleDateLabel={scheduleDateLabel}
        pickupTimeLabel={pickupTimeLabel}
        pickupCoordinate={pickupCoordinate}
        dropoffCoordinate={dropoffCoordinate}
        theme={theme}
        googleMapsApiKey={googleMapsApiKey}
      />
    </NavigationSdkProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  mapHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  routeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapContainer: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  fallbackMap: {
    flex: 1,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 10,
  },
  externalNavButton: {
    marginTop: 10,
    minWidth: 220,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  arrivalButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  statusCard: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 4,
  },
  statusCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  statusCardIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  statusCardHeaderText: {
    flex: 1,
    gap: 1,
  },
  statusEyebrow: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  statusMessage: {
    fontSize: 12,
    lineHeight: 16,
  },
  statusDestination: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  errorText: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  actionBar: {
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
  },
  primaryTripActionButton: {
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  disabledTripActionButton: {
    opacity: 0.65,
  },
  secondaryActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryActionButton: {
    flex: 1,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  chatIconWrap: {
    position: 'relative',
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatUnreadBadge: {
    position: 'absolute',
    top: -7,
    right: -10,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  chatUnreadBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  secondaryActionText: {
    fontSize: 13,
    fontWeight: '600',
  },
  floatingShortcutImage: {
    width: '100%',
    height: '100%',
    borderRadius: 21,
  },
  floatingRightControls: {
    position: 'absolute',
    bottom: 96,
    right: 14,
    gap: 10,
    zIndex: 2,
  },
  rightControlButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortcutControlButton: {
    overflow: 'hidden',
    padding: 0,
  },
  tripStatsCard: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 22,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  tripStatItem: {
    flex: 1,
    gap: 4,
  },
  tripStatLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  tripStatValue: {
    fontSize: 15,
    fontWeight: '700',
  },
  tripStatDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(127, 127, 127, 0.25)',
  },
});
