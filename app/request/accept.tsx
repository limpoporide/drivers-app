import React, { useEffect, useRef, useState } from 'react';
import { Alert, Modal, View, Text, StyleSheet, TouchableOpacity, Image, ScrollView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import type { RealtimeChannel } from '@supabase/supabase-js';
import * as Clipboard from 'expo-clipboard';
import { Audio } from 'expo-av';
import { showIncomingNativeCall } from '../../src/lib/native-calling';
import { subscribeToChatMessages } from '../../src/lib/chat';
import { useTheme } from '../../src/context/ThemeContext';
import { formatCurrency } from '../../src/utils/formatters';
import { supabase } from '../../src/lib/supabase';

const RIDER_PROFILE = require('../../assets/avatar.png');
const REQUEST_BANNER = require('../../assets/banner2.jpeg');
const INCOMING_CALL_RINGTONE_URI = 'data:audio/wav;base64,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';

const getFirstName = (value: string) => {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return 'Rider';
  }

  return trimmedValue.split(/\s+/)[0] ?? trimmedValue;
};

const hasCoordinatePair = (latitude: string, longitude: string) => {
  const parsedLatitude = Number.parseFloat(latitude);
  const parsedLongitude = Number.parseFloat(longitude);

  return Number.isFinite(parsedLatitude) && Number.isFinite(parsedLongitude);
};

const hasLocationText = (value: string) => value.replace(/^(Pickup|Drop-off):\s*/, '').trim().length > 0;

export default function AcceptRequestScreen() {
  const { theme } = useTheme();
  const ringtoneRef = useRef<Audio.Sound | null>(null);
  const rideCallChannelRef = useRef<RealtimeChannel | null>(null);
  const hasHandledCancellationRef = useRef(false);
  const cancellationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [incomingCall, setIncomingCall] = useState<{ bookingId: string; participantName: string } | null>(null);
  const [myUid, setMyUid] = useState<string | null>(null);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const params = useLocalSearchParams<{
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
  }>();

  const requestId = params.requestId ?? params.bookingId ?? '';
  // Chat only supports rider_booking rows (ride_chat_message.booking_id FK).
  const chatBookingId = params.source === 'schedule_booking' ? '' : requestId;
  const riderName = params.riderName ?? 'Gordon';
  const riderProfileImg = params.riderProfileImg?.trim() ?? '';
  const riderFirstName = getFirstName(riderName);
  const riderPhoneNumber = params.riderPhoneNumber ?? '+234 8100000000';
  const pickupAddress = params.pickupAddress ?? 'Pickup: 11c, Kudirat Abiola Way, Ikeja, Lagos';
  const dropOffAddress = params.dropOffAddress ?? 'Drop-off: Eko Hotel, Victoria Island, Lagos';
  const pickupLat = params.pickupLat ?? '';
  const pickupLng = params.pickupLng ?? '';
  const dropoffLat = params.dropoffLat ?? '';
  const dropoffLng = params.dropoffLng ?? '';
  const distance = params.distance ?? '3.6 KM';
  const eta = params.eta ?? '12 min';
  const amount = Number(params.amount ?? 5800);
  const paymentMethod = params.paymentMethod ?? 'Wallet';
  const scheduleDateLabel = params.scheduleDateLabel?.trim() ?? '';
  const pickupTimeLabel = params.pickupTimeLabel?.trim() ?? '';
  const isScheduledRide = params.source === 'schedule_booking';
  const lightCard = theme.mode === 'dark' ? theme.colors.card : '#FCFBF7';
  const infoSurface = theme.mode === 'dark' ? '#111111' : '#F3EEE2';
  const accentText = theme.mode === 'dark' ? theme.colors.primary : '#8C6A00';
  const riderProfileSource = riderProfileImg ? { uri: riderProfileImg } : RIDER_PROFILE;
  const ringingSurface = theme.mode === 'dark' ? '#0E1510' : '#F7FBF7';
  const handleBookingCancelled = (message: string) => {
    if (hasHandledCancellationRef.current) {
      return;
    }

    hasHandledCancellationRef.current = true;
    setIncomingCall(null);
    void stopIncomingRingtone();

    if (cancellationTimeoutRef.current) {
      clearTimeout(cancellationTimeoutRef.current);
    }

    Alert.alert('Booking cancelled', message);
    cancellationTimeoutRef.current = setTimeout(() => {
      cancellationTimeoutRef.current = null;
      router.replace('/(tabs)/home');
    }, 1200);
  };

  const stopIncomingRingtone = async () => {
    const sound = ringtoneRef.current;

    if (!sound) {
      return;
    }

    try {
      await sound.stopAsync();
    } catch {
      // Ignore stop failures during teardown.
    }

    try {
      await sound.unloadAsync();
    } catch {
      // Ignore unload failures during teardown.
    }

    ringtoneRef.current = null;
  };

  const startIncomingRingtone = async () => {
    if (ringtoneRef.current) {
      return;
    }

    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri: INCOMING_CALL_RINGTONE_URI },
        {
          shouldPlay: true,
          isLooping: true,
          volume: 1,
        }
      );

      ringtoneRef.current = sound;
    } catch (error) {
      console.log('[Driver Accept] Failed to start incoming ringtone', error);
    }
  };

  const handleCopyPhoneNumber = async () => {
    await Clipboard.setStringAsync(riderPhoneNumber);
    console.log('Copied rider phone number:', riderPhoneNumber);
  };

  const handleOpenChat = () => {
    setChatUnreadCount(0);
    router.push({
      pathname: '/request/chat',
      params: {
        bookingId: chatBookingId,
        riderName,
      },
    });
  };

  const handleUseNavigation = () => {
    const hasPickupCoordinates = hasCoordinatePair(pickupLat, pickupLng);
    const hasDropoffCoordinates = hasCoordinatePair(dropoffLat, dropoffLng);
    const hasPickupAddress = hasLocationText(pickupAddress);
    const hasDropoffAddress = hasLocationText(dropOffAddress);
    const navigationPayload = {
      bookingId: chatBookingId,
      requestId,
      source: params.source ?? '',
      riderName,
      riderProfileImg,
      riderPhoneNumber,
      pickupAddress,
      dropOffAddress,
      pickupLat,
      pickupLng,
      dropoffLat,
      dropoffLng,
      distance,
      eta,
      amount: String(amount),
      paymentMethod,
      scheduleDateLabel,
      pickupTimeLabel,
    };

    console.log('[Driver Accept] Opening navigation', {
      requestId,
      source: params.source ?? null,
      hasPickupCoordinates,
      hasDropoffCoordinates,
      hasPickupAddress,
      hasDropoffAddress,
    });

    console.log('[Driver Accept] Navigation payload', navigationPayload);

    if (!hasPickupCoordinates && !hasPickupAddress) {
      Alert.alert('Navigation unavailable', 'This ride is missing pickup coordinates and pickup address.');
      return;
    }

    if (!hasDropoffCoordinates && !hasDropoffAddress) {
      Alert.alert('Navigation unavailable', 'This ride is missing drop-off coordinates and drop-off address.');
      return;
    }

    router.push({
      pathname: '/request/navigation',
      params: navigationPayload,
    });
  };

  const emitCallSignal = async (event: 'call_declined') => {
    if (!chatBookingId) {
      return;
    }

    const channel = supabase
      .channel(`ride_call:${chatBookingId}:response`)
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
        throw new Error('Driver call response channel did not become ready.');
      }

      await channel.send({
        type: 'broadcast',
        event,
        payload: {
          bookingId: chatBookingId,
          participantName: riderFirstName,
          respondedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.log('[Driver Accept] Failed to send call signal', { event, error });
    } finally {
      supabase.removeChannel(channel);
    }
  };

  const sendOutgoingCallSignal = async () => {
    if (!chatBookingId || !rideCallChannelRef.current) {
      console.warn('[Driver Accept] Outgoing call signal unavailable', {
        bookingId: chatBookingId,
        hasChannel: Boolean(rideCallChannelRef.current),
      });
      return false;
    }

    try {
      await rideCallChannelRef.current.send({
        type: 'broadcast',
        event: 'incoming_call',
        payload: {
          bookingId: chatBookingId,
          participantName: riderFirstName,
          callerRole: 'driver',
          initiatedAt: new Date().toISOString(),
        },
      });

      console.log('[Driver Accept] Outgoing call signal sent', {
        bookingId: chatBookingId,
        participantName: riderFirstName,
      });
      return true;
    } catch (error) {
      console.log('[Driver Accept] Failed to send outgoing call signal', {
        bookingId: chatBookingId,
        error,
      });
      return false;
    }
  };

  const handleCall = async () => {
    const callPayload = {
      bookingId: chatBookingId,
      participantName: riderFirstName,
    };

    console.warn(`[Driver Accept] Call button pressed: ${JSON.stringify(callPayload)}`);

    if (!chatBookingId) {
      console.warn(`[Driver Accept] Call blocked: ${JSON.stringify(callPayload)}`);
      Alert.alert('Call unavailable', 'In-app calling is only available for active rider bookings right now.');
      return;
    }

    const signalSent = await sendOutgoingCallSignal();

    // Agora in-app call entrypoint for drivers.
    // Keeping this launch path isolated makes call debugging easier.
    console.warn(
      `[Driver Accept] Navigating to call screen: ${JSON.stringify({
        pathname: '/request/call',
        params: {
          ...callPayload,
          signalSent: signalSent ? '1' : '0',
        },
      })}`
    );

    router.push({
      pathname: '/request/call',
      params: {
        bookingId: chatBookingId,
        participantName: riderFirstName,
        signalSent: signalSent ? '1' : '0',
      },
    });
  };

  const handleAnswerIncomingCall = () => {
    if (!incomingCall?.bookingId) {
      return;
    }

    console.log('[Driver Accept] Answering incoming call', incomingCall);
    void stopIncomingRingtone();
    setIncomingCall(null);
    router.push({
      pathname: '/request/call',
      params: {
        bookingId: incomingCall.bookingId,
        participantName: incomingCall.participantName,
        incoming: '1',
      },
    });
  };

  const handleDeclineIncomingCall = async () => {
    console.log('[Driver Accept] Declining incoming call', incomingCall);
    await stopIncomingRingtone();
    await emitCallSignal('call_declined');
    setIncomingCall(null);
  };

  useEffect(() => {
    Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    }).catch((error) => {
      console.log('[Driver Accept] Failed to prepare audio mode', error);
    });
  }, []);

  useEffect(() => () => {
    if (cancellationTimeoutRef.current) {
      clearTimeout(cancellationTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    if (incomingCall) {
      void startIncomingRingtone();
      return;
    }

    void stopIncomingRingtone();
  }, [incomingCall]);

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
    if (!chatBookingId) {
      setChatUnreadCount(0);
      return;
    }

    const unsubscribe = subscribeToChatMessages(chatBookingId, (message) => {
      const isIncomingFromRider = myUid ? message.sender_uuid !== myUid : message.sender_role === 'rider';

      if (!isIncomingFromRider) {
        return;
      }

      setChatUnreadCount((currentCount) => currentCount + 1);
    });

    return () => {
      unsubscribe();
    };
  }, [chatBookingId, myUid]);

  useEffect(() => {
    if (!chatBookingId) {
      return;
    }

    const channel = supabase
      .channel(`ride_call:${chatBookingId}`)
      .on('broadcast', { event: 'incoming_call' }, async ({ payload }) => {
        const payloadBookingId = typeof payload?.bookingId === 'string' ? payload.bookingId : '';
        const payloadCallerRole = typeof payload?.callerRole === 'string' ? payload.callerRole : '';
        const payloadParticipantName =
          typeof payload?.participantName === 'string' && payload.participantName.trim()
            ? payload.participantName.trim()
            : riderFirstName;

        if (payloadBookingId !== chatBookingId) {
          return;
        }

        if (payloadCallerRole === 'driver') {
          return;
        }

        console.log('[Driver Accept] Incoming call signal received', {
          bookingId: payloadBookingId,
          participantName: payloadParticipantName,
          callerRole: payloadCallerRole || null,
          initiatedAt: payload?.initiatedAt ?? null,
        });

        if (Platform.OS === 'android') {
          const callUUID = await showIncomingNativeCall({
            bookingId: payloadBookingId,
            participantName: payloadParticipantName,
          });

          if (callUUID) {
            return;
          }
        }

        setIncomingCall({
          bookingId: payloadBookingId,
          participantName: payloadParticipantName,
        });
      })
      .subscribe((status) => {
        console.log('[Driver Accept] Incoming call channel status', {
          bookingId: chatBookingId,
          status,
        });
      });

    rideCallChannelRef.current = channel;

    return () => {
      void stopIncomingRingtone();
      if (rideCallChannelRef.current === channel) {
        rideCallChannelRef.current = null;
      }
      supabase.removeChannel(channel);
      setIncomingCall(null);
    };
  }, [chatBookingId, riderFirstName]);

  useEffect(() => {
    if (isScheduledRide || !requestId) {
      hasHandledCancellationRef.current = false;
      return;
    }

    hasHandledCancellationRef.current = false;
    let isActive = true;

    const loadRideStatus = async () => {
      const { data, error } = await supabase
        .from('rider_booking')
        .select('ride_status')
        .eq('id', requestId)
        .maybeSingle();

      if (!isActive || error) {
        return;
      }

      if (data?.ride_status === 'cancelled') {
        handleBookingCancelled('Rider has cancelled booking.');
      }
    };

    void loadRideStatus();

    const channelName = `rider_booking_status:${requestId}:${Date.now()}`;
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
          const nextRideStatus = typeof payload.new?.ride_status === 'string' ? payload.new.ride_status : '';

          console.log('[Driver Accept] rider booking status update', {
            requestId,
            nextRideStatus,
          });

          if (nextRideStatus === 'cancelled') {
            handleBookingCancelled('Rider has cancelled booking.');
          }
        }
      )
      .subscribe((status) => {
        console.log('[Driver Accept] rider booking status channel', {
          channelName,
          requestId,
          status,
        });
      });

    return () => {
      isActive = false;
      supabase.removeChannel(channel);
    };
  }, [isScheduledRide, requestId]);

  useEffect(() => {
    if (!isScheduledRide || !requestId) {
      hasHandledCancellationRef.current = false;
      return;
    }

    hasHandledCancellationRef.current = false;

    const channelName = `schedule_booking_status:${requestId}:${Date.now()}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'schedule_booking',
          filter: `id=eq.${requestId}`,
        },
        (payload) => {
          const nextBookingStatus = typeof payload.new?.booking_status === 'string' ? payload.new.booking_status : '';

          console.log('[Driver Accept] schedule booking status update', {
            requestId,
            nextBookingStatus,
          });

          if (nextBookingStatus === 'cancelled') {
            handleBookingCancelled('Ride has been cancelled.');
          }
        }
      )
      .subscribe((status) => {
        console.log('[Driver Accept] schedule booking status channel', {
          channelName,
          requestId,
          status,
        });
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isScheduledRide, requestId]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity
          style={[styles.backButton, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={18} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>Accepted Request</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={[styles.card, { backgroundColor: lightCard }]}> 
          <View style={styles.riderHeaderRow}>
            <Image source={riderProfileSource} style={styles.riderImage} />
            <View style={styles.riderIdentityBlock}>
              <Text style={[styles.riderName, { color: theme.colors.text }]}>{riderFirstName}</Text>
              <View style={styles.phoneRow}>
                <Text style={[styles.phoneText, { color: theme.colors.textSecondary }]}>{riderPhoneNumber}</Text>
                <TouchableOpacity style={styles.copyButton} onPress={handleCopyPhoneNumber}>
                  <Ionicons name="copy-outline" size={16} color={accentText} />
                </TouchableOpacity>
              </View>
              <View style={[styles.premiumBadge, { backgroundColor: infoSurface }]}> 
                <Text style={[styles.premiumBadgeText, { color: accentText }]}>Premium customer</Text>
              </View>
            </View>
          </View>

          <View style={styles.contactActionsRow}>
            <TouchableOpacity style={styles.contactActionButton} onPress={handleCall}>
              <Ionicons name="call-outline" size={20} color={accentText} />
              <Text style={[styles.contactActionText, { color: theme.colors.text }]}>Call</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.contactActionButton}
              onPress={handleOpenChat}
            >
              <View style={styles.chatIconWrap}>
                <Ionicons name="chatbubble-ellipses-outline" size={20} color={accentText} />
                {chatUnreadCount > 0 ? (
                  <View style={[styles.chatUnreadBadge, { backgroundColor: theme.colors.error }]}> 
                    <Text style={styles.chatUnreadBadgeText}>{chatUnreadCount > 9 ? '9+' : chatUnreadCount}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.contactActionText, { color: theme.colors.text }]}>Chat</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.infoBlock, { backgroundColor: infoSurface }]}> 
            <Text style={[styles.infoLabel, { color: accentText }]}>Pick-up</Text>
            <Text style={[styles.infoValue, { color: theme.colors.text }]}>{pickupAddress.replace(/^Pickup:\s*/, '')}</Text>
          </View>

          <View style={[styles.infoBlock, { backgroundColor: infoSurface }]}> 
            <Text style={[styles.infoLabel, { color: accentText }]}>Rider Drop-off</Text>
            <Text style={[styles.infoValue, { color: theme.colors.text }]}>{dropOffAddress.replace(/^Drop-off:\s*/, '')}</Text>
          </View>

          {isScheduledRide ? (
            <View style={styles.metricsRow}>
              <View style={[styles.metricCard, { backgroundColor: infoSurface }]}> 
                <Text style={[styles.metricLabel, { color: theme.colors.textSecondary }]}>Pickup Date</Text>
                <Text style={[styles.metricValue, { color: theme.colors.text }]}>{scheduleDateLabel || '--'}</Text>
              </View>
              <View style={[styles.metricCard, { backgroundColor: infoSurface }]}> 
                <Text style={[styles.metricLabel, { color: theme.colors.textSecondary }]}>Pickup Time</Text>
                <Text style={[styles.metricValue, { color: theme.colors.text }]}>{pickupTimeLabel || '--'}</Text>
              </View>
            </View>
          ) : null}

          <View style={styles.metricsRow}>
            <View style={[styles.metricCard, { backgroundColor: infoSurface }]}> 
              <Text style={[styles.metricLabel, { color: theme.colors.textSecondary }]}>KM</Text>
              <Text style={[styles.metricValue, { color: theme.colors.text }]}>{distance}</Text>
            </View>
            <View style={[styles.metricCard, { backgroundColor: infoSurface }]}> 
              <Text style={[styles.metricLabel, { color: theme.colors.textSecondary }]}>ETA</Text>
              <Text style={[styles.metricValue, { color: theme.colors.text }]}>{eta}</Text>
            </View>
          </View>

          <View style={[styles.summaryRow, { borderTopColor: theme.colors.border }]}> 
            <View>
              <Text style={[styles.summaryLabel, { color: theme.colors.textSecondary }]}>Rider Amount</Text>
              <Text style={[styles.summaryValue, { color: accentText }]}>{formatCurrency(amount)}</Text>
            </View>
            <View style={styles.paymentWrap}>
              <Text style={[styles.summaryLabel, { color: theme.colors.textSecondary }]}>Payment Method</Text>
              <Text style={[styles.summaryValue, { color: theme.colors.text }]}>{paymentMethod}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.navigationButton, { backgroundColor: theme.colors.primary }]}
            onPress={handleUseNavigation}
          >
            <Ionicons name="navigate-outline" size={18} color={theme.mode === 'dark' ? '#000000' : '#FFFFFF'} />
            <Text style={[styles.navigationButtonText, { color: theme.mode === 'dark' ? '#000000' : '#FFFFFF' }]}>Use Navigation</Text>
          </TouchableOpacity>
        </View>

        <Image source={REQUEST_BANNER} style={styles.bannerImage} resizeMode="cover" />
      </ScrollView>

      <Modal
        transparent
        animationType="fade"
        visible={Boolean(incomingCall)}
        onRequestClose={handleDeclineIncomingCall}
      >
        <View style={styles.ringingBackdrop}>
          <View style={[styles.ringingCard, { backgroundColor: ringingSurface, borderColor: theme.colors.border }]}> 
            <View style={[styles.ringingAvatarShell, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}> 
              <Image source={riderProfileSource} style={styles.ringingAvatar} />
            </View>
            <Text style={[styles.ringingTitle, { color: theme.colors.text }]}>Incoming call</Text>
            <Text style={[styles.ringingName, { color: theme.colors.text }]}>{incomingCall?.participantName ?? riderFirstName}</Text>
            <Text style={[styles.ringingSubtitle, { color: theme.colors.textSecondary }]}>Ringing...</Text>
            <View style={styles.ringingActionsRow}>
              <TouchableOpacity
                style={[styles.ringingActionButton, styles.declineButton, { backgroundColor: theme.colors.error }]}
                onPress={handleDeclineIncomingCall}
              >
                <Ionicons name="call" size={20} color="#FFFFFF" style={styles.declineIcon} />
                <Text style={styles.ringingActionText}>End</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.ringingActionButton, styles.answerButton, { backgroundColor: theme.colors.primary }]}
                onPress={handleAnswerIncomingCall}
              >
                <Ionicons name="call" size={20} color={theme.mode === 'dark' ? '#000000' : '#FFFFFF'} />
                <Text style={[styles.answerActionText, { color: theme.mode === 'dark' ? '#000000' : '#FFFFFF' }]}>Answer</Text>
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
  scrollContent: {
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
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
  headerSpacer: {
    width: 40,
  },
  card: {
    marginHorizontal: 0,
    marginTop: 20,
    borderRadius: 0,
    paddingHorizontal: 20,
    paddingVertical: 24,
    alignItems: 'stretch',
  },
  riderHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  riderImage: {
    width: 88,
    height: 88,
    borderRadius: 44,
  },
  riderIdentityBlock: {
    flex: 1,
    marginLeft: 14,
  },
  riderName: {
    fontSize: 22,
    fontWeight: '700',
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  phoneText: {
    fontSize: 14,
  },
  copyButton: {
    paddingLeft: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  premiumBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 10,
  },
  premiumBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  contactActionsRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    marginTop: 18,
    marginBottom: 22,
    justifyContent: 'flex-end',
  },
  contactActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chatIconWrap: {
    position: 'relative',
    width: 22,
    height: 22,
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
  contactActionText: {
    fontSize: 14,
    fontWeight: '600',
  },
  infoBlock: {
    width: '100%',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  infoValue: {
    fontSize: 13,
    lineHeight: 19,
  },
  metricsRow: {
    width: '100%',
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  metricCard: {
    flex: 1,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 6,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  summaryRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 22,
    paddingTop: 18,
    borderTopWidth: 1,
  },
  paymentWrap: {
    alignItems: 'flex-end',
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 6,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  navigationButton: {
    width: '100%',
    marginTop: 24,
    height: 54,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  navigationButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
  bannerImage: {
    width: undefined,
    alignSelf: 'stretch',
    marginHorizontal: 0,
    marginTop: 14,
    height: 170,
    borderRadius: 0,
  },
  ringingBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.48)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  ringingCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 28,
    borderWidth: 1,
    paddingHorizontal: 24,
    paddingVertical: 28,
    alignItems: 'center',
  },
  ringingAvatarShell: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  ringingAvatar: {
    width: 96,
    height: 96,
  },
  ringingTitle: {
    marginTop: 18,
    fontSize: 15,
    fontWeight: '600',
  },
  ringingName: {
    marginTop: 8,
    fontSize: 30,
    fontWeight: '800',
  },
  ringingSubtitle: {
    marginTop: 6,
    fontSize: 15,
  },
  ringingActionsRow: {
    width: '100%',
    flexDirection: 'row',
    gap: 14,
    marginTop: 24,
  },
  ringingActionButton: {
    flex: 1,
    minHeight: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  declineButton: {
    opacity: 0.96,
  },
  answerButton: {
    opacity: 0.96,
  },
  ringingActionText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  answerActionText: {
    fontSize: 15,
    fontWeight: '700',
  },
  declineIcon: {
    transform: [{ rotate: '135deg' }],
  },
});