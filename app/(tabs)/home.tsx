import React, { useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  Image,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useJobRequests, type RequestItem } from '../../src/context/JobRequestsContext';
import { useNotifications } from '../../src/context/NotificationsContext';
import { useTheme } from '../../src/context/ThemeContext';
import { formatCurrency } from '../../src/utils/formatters';
import { supabase } from '../../src/lib/supabase';

// Assets path reference
const SLIDE_1 = require('../../assets/wuling.png');
const SLIDE_2 = require('../../assets/avatar.png');

export default function Home() {
  const { theme } = useTheme();
  const [isOnline, setIsOnline] = useState(true);
  const [isResolvingLocation, setIsResolvingLocation] = useState(false);
  const [driverFirstName, setDriverFirstName] = useState('Driver');
  const [driverUuidSuffix, setDriverUuidSuffix] = useState('-----');
  const [vehicleNum, setVehicleNum] = useState('---');
  const [profileImg, setProfileImg] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState(false);
  const [walletBalance, setWalletBalance] = useState(0);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [acceptingRequestId, setAcceptingRequestId] = useState<string | null>(null);
  const { requests, isLoadingRequests, refreshRequests, acceptRequest, removeRequest } = useJobRequests();
  const { unreadCount } = useNotifications();
  const accentTint = theme.mode === 'dark' ? 'rgba(206, 160, 7, 0.18)' : 'rgba(140, 106, 0, 0.12)';

  useFocusEffect(
    useCallback(() => {
      fetchDriverProfile();
      refreshRequests();
    }, [])
  );

  const fetchDriverProfile = async () => {
    try {
      // Try to load from cache first
      const cachedProfile = await AsyncStorage.getItem('driver_profile_cache');
      if (cachedProfile) {
        const cached = JSON.parse(cachedProfile);
        if (cached.firstName) setDriverFirstName(cached.firstName);
        if (cached.profileImg) setProfileImg(cached.profileImg);
        if (cached.uuidSuffix) setDriverUuidSuffix(cached.uuidSuffix);
        if (cached.vehicleNum) setVehicleNum(cached.vehicleNum);
        if (typeof cached.walletBalance === 'number') setWalletBalance(cached.walletBalance);
        setIsLoadingProfile(false);
      }

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        console.log('Home: Unable to get authenticated user');
        setIsLoadingProfile(false);
        return;
      }

      setDriverUuidSuffix(user.id.slice(-5).toUpperCase());

      const { data: profile, error: profileError } = await supabase
        .from('driver_profile')
        .select('first_name, is_online, profile_img, admin_verify, wallet_balance')
        .eq('uuid', user.id)
        .single();

      if (profileError) {
        console.log('Home: Unable to fetch driver profile:', profileError);
        setIsLoadingProfile(false);
        return;
      }

      if (profile?.first_name) {
        setDriverFirstName(profile.first_name);
      }

      if (profile?.is_online !== undefined) {
        setIsOnline(profile.is_online);
      }

      if (profile?.profile_img) {
        setProfileImg(profile.profile_img);
      }

      if (profile?.admin_verify !== undefined) {
        setIsVerified(profile.admin_verify);
      }

      if (profile?.wallet_balance !== undefined && profile?.wallet_balance !== null) {
        setWalletBalance(Number(profile.wallet_balance));
      }

      const { data: vehicleData, error: vehicleError } = await (supabase as any)
        .from('vehicle_management')
        .select('vehicle_num')
        .eq('assigned', user.id)
        .maybeSingle();

      if (vehicleError) {
        console.log('Home: Unable to fetch vehicle number:', vehicleError);
      } else if (typeof vehicleData?.vehicle_num === 'string' && vehicleData.vehicle_num.trim()) {
        setVehicleNum(vehicleData.vehicle_num.trim());
      }

      // Cache the profile data
      await AsyncStorage.setItem(
        'driver_profile_cache',
        JSON.stringify({
          firstName: profile?.first_name,
          profileImg: profile?.profile_img,
          uuidSuffix: user.id.slice(-5).toUpperCase(),
          vehicleNum: typeof vehicleData?.vehicle_num === 'string' ? vehicleData.vehicle_num.trim() : vehicleNum,
          walletBalance: Number(profile?.wallet_balance || 0),
        })
      );
    } catch (error) {
      console.log('Home: Error fetching driver profile:', error);
    } finally {
      setIsLoadingProfile(false);
    }
  };
  const softSurface = theme.mode === 'dark' ? '#111111' : '#000000';
  const mutedSurface = theme.mode === 'dark' ? '#0F0F10' : '#F1ECE0';
  const inverseText = theme.mode === 'dark' ? '#000000' : '#FFFFFF';
  const heroBackground = theme.mode === 'dark' ? theme.colors.card : theme.colors.primary;
  const heroBorderColor = theme.mode === 'dark' ? accentTint : theme.colors.primary;
  const heroTextColor = theme.mode === 'dark' ? theme.colors.text : '#FFF8E1';
  const heroMutedTextColor = theme.mode === 'dark' ? theme.colors.textSecondary : 'rgba(255, 248, 225, 0.78)';
  const listTextColor = theme.mode === 'dark' ? theme.colors.text : '#FFFFFF';
  const listMutedTextColor = theme.mode === 'dark' ? theme.colors.textSecondary : 'rgba(255, 255, 255, 0.72)';
  const handleOnlineToggle = async (nextValue: boolean) => {
    if (!nextValue) {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (!userError && user) {
        await supabase.from('driver_profile').update({ is_online: false }).eq('uuid', user.id);
      }

      setIsOnline(false);
      return;
    }

    if (isResolvingLocation) {
      return;
    }

    setIsResolvingLocation(true);

    try {
      const currentPermission = await Location.getForegroundPermissionsAsync();
      let permissionStatus = currentPermission.status;

      if (permissionStatus !== 'granted') {
        const requestedPermission = await Location.requestForegroundPermissionsAsync();
        permissionStatus = requestedPermission.status;
      }

      if (permissionStatus !== 'granted') {
        console.log('Location permission was not granted. Driver stays offline.');
        setIsOnline(false);
        return;
      }

      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      console.log('Driver current location:', {
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude,
        accuracy: currentLocation.coords.accuracy,
      });

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        console.log('Home: Unable to get authenticated user for location update');
        setIsOnline(false);
        return;
      }

      const { error: updateError } = await supabase
        .from('driver_profile')
        .update({
          is_online: true,
          location_lat: currentLocation.coords.latitude,
          location_lng: currentLocation.coords.longitude,
        })
        .eq('uuid', user.id);

      if (updateError) {
        console.log('Home: Error updating driver location:', updateError);
        setIsOnline(false);
        return;
      }

      setIsOnline(true);
    } catch (error) {
      console.log('Unable to get driver location:', error);
      setIsOnline(false);
    } finally {
      setIsResolvingLocation(false);
    }
  };

  const closeRequest = (requestId: string, source: RequestItem['source']) => {
    removeRequest(requestId, source);
  };
  const handleAcceptRequest = async (request: RequestItem) => {
    if (acceptingRequestId) {
      return;
    }

    setAcceptingRequestId(request.id);

    try {
      const wasAccepted = await acceptRequest(request);

      if (!wasAccepted) {
        Alert.alert('Unavailable request', 'This request has already been assigned.');
        return;
      }

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
    } catch (error) {
      Alert.alert(
        'Unable to accept request',
        error instanceof Error ? error.message : 'Please try again.'
      );
    } finally {
      setAcceptingRequestId(null);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      
      {/* ========================================== */}
      {/* SECTION: HEADER & TOP NAVIGATION          */}
      {/* ========================================== */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerIdentityBlock} onPress={() => router.push('/settings')}>
          <Image
            source={profileImg ? { uri: profileImg } : { uri: 'https://via.placeholder.com/40' }}
            style={[styles.avatar, { borderColor: theme.colors.primary }]}
          />
          <View>
            <Text style={[styles.headerName, { color: theme.colors.text }]}>
              {isLoadingProfile ? 'Driver' : `Hi ${driverFirstName}`}
            </Text>
            <Text style={[styles.headerUuidSuffix, { color: theme.colors.textSecondary }]}>
              {driverUuidSuffix}
            </Text>
          </View>
        </TouchableOpacity>
        <View style={styles.headerRightActions}>
          <TouchableOpacity
            style={[styles.headerIconButton, { backgroundColor: accentTint }]}
            onPress={() => Alert.alert('No active rider')}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={18} color={theme.colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.headerIconButton, { backgroundColor: accentTint }]}
            onPress={() => router.push('/(tabs)/notifications')}
          >
            <Ionicons name="notifications-outline" size={18} color={theme.colors.primary} />
            {unreadCount > 0 ? (
              <View style={styles.headerNotificationBadge}>
                <Text style={styles.headerNotificationBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={[styles.headerDivider, { backgroundColor: theme.colors.border }]} />

        {/* ========================================== */}
        {/* SECTION: HERO CARD & STATUS TOGGLE        */}
        {/* ========================================== */}
        <View style={[styles.heroCard, { backgroundColor: heroBackground, borderColor: heroBorderColor }]}> 
          <View style={styles.heroLeft}>
            <View style={styles.statusRow}>
              <View
                style={[
                  styles.statusIndicator,
                  { backgroundColor: isOnline ? theme.colors.success : theme.colors.error },
                ]}
              />
              <Text style={[styles.statusSubtext, { color: heroMutedTextColor }]}> 
                {isOnline ? 'You are online' : 'You are offline'}
              </Text>
            </View>
            <Text style={[styles.statusTitle, { color: heroTextColor }]}>Ride Status</Text>

            <View style={styles.earningsContainer}>
              <Text style={[styles.earningsLabel, { color: heroMutedTextColor }]}>Today's Earning</Text>
              <Text
                style={[styles.earningsAmount, { color: heroTextColor }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
              >
                {formatCurrency(walletBalance)}
              </Text>
            </View>
          </View>

          <View style={styles.heroRight}>
            <Switch
              value={isOnline}
              onValueChange={handleOnlineToggle}
              trackColor={{ false: theme.mode === 'dark' ? theme.colors.border : '#FFFFFF', true: theme.mode === 'dark' ? theme.colors.primary : '#FFFFFF' }}
              thumbColor={isOnline ? theme.colors.success : theme.colors.error}
              ios_backgroundColor={theme.mode === 'dark' ? theme.colors.border : '#FFFFFF'}
              style={[styles.statusSwitch, theme.mode === 'light' && styles.statusSwitchLight]}
            />
            {/* Delivery Courier Illustration */}
            <Image
              source={SLIDE_1}
              style={styles.heroIllustration}
              resizeMode="contain"
            />
            <Text
              style={[styles.vehicleNumber, { color: heroMutedTextColor }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
            >
              {vehicleNum}
            </Text>
          </View>
        </View>

        {/* ========================================== */}
        {/* SECTION: NEW JOBS LIST                    */}
        {/* ========================================== */}
        <View style={styles.jobsSectionContainer}>
          <View style={styles.jobsHeader}>
            <Text style={[styles.jobsTitle, { color: theme.colors.text }]}>Available Pick-up</Text>
            <TouchableOpacity>
              <Text style={[styles.seeMoreText, { color: theme.colors.primary }]}>See more</Text>
            </TouchableOpacity>
          </View>

          {isLoadingRequests ? (
            <View style={[styles.emptyStateCard, { backgroundColor: softSurface, borderColor: theme.colors.border }]}> 
              <ActivityIndicator size="small" color={theme.colors.primary} />
              <Text style={[styles.emptyStateText, { color: listMutedTextColor, marginTop: 12 }]}>Loading new job requests...</Text>
            </View>
          ) : requests.length === 0 ? (
            <View style={[styles.emptyStateCard, { backgroundColor: softSurface, borderColor: theme.colors.border }]}>
              <Text style={[styles.emptyStateText, { color: listMutedTextColor }]}>No available request at the moment!</Text>
            </View>
          ) : (
            requests.map((request) => (
              <View key={request.id} style={[styles.jobCard, { backgroundColor: softSurface, borderColor: theme.colors.border }]}> 
                <View style={styles.jobTopRow}>
                  <Image source={request.riderProfileImg ? { uri: request.riderProfileImg } : SLIDE_2} style={styles.restaurantImage} />
                  <View style={styles.restaurantInfo}>
                    <View style={[styles.requestTypeBadge, { backgroundColor: theme.colors.primary }]}>
                      <Text style={[styles.requestTypeBadgeText, { color: inverseText }]}>{request.requestBadge}</Text>
                    </View>
                  </View>
                  <View style={styles.requestMetaColumn}>
                    <TouchableOpacity
                      style={[styles.closeCardButton, { borderColor: theme.colors.border }]}
                      onPress={() => closeRequest(request.id, request.source)}
                    >
                      <Ionicons name="close" size={14} color={listTextColor} />
                    </TouchableOpacity>
                  </View>
                </View>

                {request.actionable ? (
                  <>
                    <View style={[styles.dashedDivider, { borderColor: theme.colors.border }]} />

                    <View style={styles.addressRow}>
                      <Ionicons name="location-outline" size={14} color={theme.colors.primary} />
                      <Text style={[styles.dropAddressText, { color: listMutedTextColor }]}>
                        {request.pickupAddress}
                      </Text>
                    </View>

                    <View style={styles.rideAmountRow}>
                      <Text style={[styles.rideAmountLabel, { color: listMutedTextColor }]}>Ride Amount</Text>
                      <View style={styles.rideAmountValueContainer}>
                        <Text
                          style={[styles.rideAmountValue, { color: theme.colors.primary }]}
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          minimumFontScale={0.75}
                        >
                          {formatCurrency(request.amount)}
                        </Text>
                      </View>
                    </View>

                    {request.source === 'schedule_booking' ? (
                      <View style={styles.scheduleMetaRow}>
                        <View style={styles.scheduleMetaItem}>
                          <Ionicons name="calendar-outline" size={14} color={theme.colors.primary} />
                          <Text style={[styles.scheduleMetaText, { color: listMutedTextColor }]}>
                            {request.scheduleDateLabel}
                          </Text>
                        </View>

                        <View style={styles.scheduleMetaItem}>
                          <Ionicons name="time-outline" size={14} color={theme.colors.primary} />
                          <Text style={[styles.scheduleMetaText, { color: listMutedTextColor }]}>
                            {request.pickupTimeLabel}
                          </Text>
                        </View>
                      </View>
                    ) : (
                      <View style={styles.scheduleMetaRow}>
                        <Ionicons name="flash-outline" size={14} color={theme.colors.primary} />
                        <Text style={[styles.scheduleMetaText, { color: listMutedTextColor }]}>Instant booking • {request.eta}</Text>
                      </View>
                    )}

                    <View style={styles.actionRow}>
                      <TouchableOpacity
                        style={[styles.acceptBtn, { backgroundColor: theme.colors.primary }]}
                        disabled={acceptingRequestId === request.id}
                        onPress={() => handleAcceptRequest(request)}
                      > 
                        <Text style={[styles.acceptBtnText, { color: inverseText }]}>
                          {acceptingRequestId === request.id ? 'Accepting...' : 'Accept'}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.rejectBtn, styles.compactActionBtn, { backgroundColor: theme.colors.error }]}
                        onPress={() => closeRequest(request.id, request.source)}
                      > 
                        <Text style={styles.rejectBtnText}>Rejects</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                ) : null}
              </View>
            ))
          )}

        </View>
      </ScrollView>

    </SafeAreaView>
  );
}

// ==========================================
// SECTION: STYLESHEET
// ==========================================
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
  },

  /* Header Styles */
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 15,
  },
  headerIdentityBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerName: {
    fontSize: 18,
    fontWeight: '600',
  },
  headerUuidSuffix: {
    fontSize: 12,
    fontWeight: '400',
    marginTop: 2,
  },
  locationLabel: {
    color: '#888888',
    fontSize: 12,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  locationText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 12,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
  },
  headerIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerNotificationBadge: {
    position: 'absolute',
    top: -2,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  headerNotificationBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
  },
  headerDivider: {
    height: 1,
    marginHorizontal: 20,
    marginBottom: 18,
  },

  /* Hero Card Styles */
  heroCard: {
    marginHorizontal: 12,
    borderRadius: 24,
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 1,
  },
  heroLeft: {
    flex: 1,
  },
  statusSubtext: {
    color: '#888888',
    fontSize: 12,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  earningsContainer: {
    marginTop: 12,
    marginBottom: 16,
  },
  earningsLabel: {
    color: '#AAAAAA',
    fontSize: 12,
  },
  earningsAmount: {
    color: '#C0ED35',
    fontSize: 24,
    fontWeight: 'bold',
  },
  vehicleNumber: {
    fontSize: 13,
    marginTop: -2,
    maxWidth: 150,
    textAlign: 'center',
  },
  heroRight: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  statusSwitch: {
    transform: [{ scaleX: 0.9 }, { scaleY: 0.9 }],
  },
  statusSwitchLight: {
    transform: [{ scaleX: 1.08 }, { scaleY: 0.9 }],
  },
  heroIllustration: {
    width: 150,
    height: 80,
    marginTop: 6,
    marginRight: -30,
  },

  /* Jobs Section Styles */
  jobsSectionContainer: {
    marginTop: 24,
  },
  jobsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  jobsTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  seeMoreText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
  },

  /* Job Card Styles */
  jobCard: {
    marginHorizontal: 12,
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  jobTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  restaurantImage: {
    width: 38,
    height: 38,
    borderRadius: 10,
  },
  restaurantInfo: {
    flex: 1,
    marginLeft: 12,
    paddingRight: 8,
    justifyContent: 'center',
  },
  requestMetaColumn: {
    alignItems: 'flex-end',
    gap: 8,
  },
  requestTypeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
  },
  requestTypeBadgeText: {
    fontWeight: '700',
    fontSize: 12,
  },
  restaurantName: {
    color: '#000000',
    fontSize: 15,
    fontWeight: 'bold',
  },
  restaurantAddress: {
    color: '#777777',
    fontSize: 11,
    marginTop: 2,
  },
  distanceBadge: {
    backgroundColor: '#C0ED35',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  distanceText: {
    color: '#000000',
    fontWeight: 'bold',
    fontSize: 12,
  },
  closeCardButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dashedDivider: {
    borderWidth: 0.8,
    borderColor: '#E0E0E0',
    borderStyle: 'dashed',
    marginVertical: 12,
  },
  timeBadgeRow: {
    alignItems: 'flex-end',
    marginBottom: 10,
  },
  deliverTimeBadge: {
    backgroundColor: '#121212',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  deliverTimeText: {
    color: '#C0ED35',
    fontSize: 10,
    fontWeight: '600',
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  customerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  customerDetails: {
    marginLeft: 10,
  },
  customerName: {
    color: '#000000',
    fontWeight: 'bold',
    fontSize: 13,
  },
  orderId: {
    color: '#777777',
    fontSize: 11,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
    gap: 6,
  },
  dropAddressText: {
    color: '#555555',
    fontSize: 11,
    flex: 1,
  },
  rideAmountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  rideAmountLabel: {
    fontSize: 12,
    fontWeight: '500',
    flexShrink: 1,
  },
  rideAmountValueContainer: {
    marginLeft: 'auto',
    minWidth: 0,
    maxWidth: '100%',
  },
  rideAmountValue: {
    fontSize: 15,
    fontWeight: '700',
    flexShrink: 1,
    textAlign: 'right',
  },
  scheduleMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 10,
  },
  scheduleMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  scheduleMetaText: {
    fontSize: 12,
    fontWeight: '500',
  },
  emptyStateCard: {
    marginHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },

  /* Card Action Buttons */
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
  },
  acceptBtn: {
    flex: 1,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  acceptBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  compactActionBtn: {
    flex: 1,
    paddingHorizontal: 0,
  },
  swipeAcceptBtn: {
    flex: 1,
    backgroundColor: '#1E1E1E',
    height: 44,
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  swipeIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#C0ED35',
    justifyContent: 'center',
    alignItems: 'center',
  },
  swipeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 12,
  },
  rejectBtn: {
    backgroundColor: '#FF3B30',
    height: 36,
    paddingHorizontal: 20,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rejectBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 13,
  },

});