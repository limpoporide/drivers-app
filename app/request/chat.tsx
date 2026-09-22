import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Audio } from 'expo-av';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/context/ThemeContext';
import { supabase } from '../../src/lib/supabase';
import {
  ChatMessageRow,
  fetchChatMessages,
  sendChatMessage,
  subscribeToChatMessages,
} from '../../src/lib/chat';

const RIDER_AVATAR = require('../../assets/avatar.png');
const DRIVER_AVATAR = require('../../assets/avatar.png');

const QUICK_REPLIES = ['I am outside', 'On my way', 'Please call me', 'Almost there'];

const normalizeRouteParam = (value?: string | string[]) => {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }

  return value ?? '';
};

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const getDateLabel = (isoDate: string) => {
  const date = new Date(isoDate);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (isSameDay(date, today)) {
    return 'Today';
  }

  if (isSameDay(date, yesterday)) {
    return 'Yesterday';
  }

  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
};

const getTimeLabel = (isoDate: string) =>
  new Date(isoDate).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export default function DriverChatScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { bookingId, riderName } = useLocalSearchParams<{ bookingId?: string; riderName?: string }>();
  const resolvedBookingId = normalizeRouteParam(bookingId).trim();
  const resolvedRiderName = normalizeRouteParam(riderName) || 'Rider';
  const [draftMessage, setDraftMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessageRow[]>([]);
  const [myUid, setMyUid] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [riderAvatarUri, setRiderAvatarUri] = useState<string | null>(null);
  const [driverAvatarUri, setDriverAvatarUri] = useState<string | null>(null);

  useEffect(() => {
    Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    }).catch((error) => {
      console.log('[Driver Chat] Failed to prepare incoming message ping', error);
    });
  }, []);

  const playIncomingMessagePing = useCallback(async () => {
    try {
      const { sound } = await Audio.Sound.createAsync(require('../../assets/chat-message-ping.wav'), {
        shouldPlay: false,
        volume: 1,
      });

      sound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded) {
          return;
        }

        if (status.didJustFinish) {
          sound.unloadAsync().catch(() => undefined);
        }
      });

      await sound.playAsync();
    } catch (error) {
      console.log('[Driver Chat] Failed to play incoming message ping', error);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      const untypedSupabase = supabase as unknown as {
        from: (table: string) => {
          select: (columns: string) => {
            eq: (column: string, value: string) => {
              maybeSingle: () => Promise<{ data: unknown; error: Error | null }>;
            };
          };
        };
      };

      const loadParticipantProfiles = async () => {
        if (!resolvedBookingId) {
          if (isMounted) {
            setRiderAvatarUri(null);
            setDriverAvatarUri(null);
          }
          return;
        }

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user || !isMounted) {
          if (isMounted) {
            setDriverAvatarUri(null);
          }
        } else {
          const driverProfileResult = await untypedSupabase
            .from('driver_profile')
            .select('profile_img')
            .eq('uuid', user.id)
            .maybeSingle();

          const driverProfile = driverProfileResult.data;

          if (isMounted && driverProfile && typeof driverProfile === 'object') {
            const driverProfileRecord = driverProfile as Record<string, unknown>;
            setDriverAvatarUri(
              typeof driverProfileRecord['profile_img'] === 'string' ? driverProfileRecord['profile_img'] : null
            );
          } else if (isMounted) {
            setDriverAvatarUri(null);
          }
        }

        const { data: booking, error: bookingError } = await supabase
          .from('rider_booking')
          .select('rider_id')
          .eq('id', resolvedBookingId)
          .maybeSingle();

        if (bookingError || !booking?.rider_id || !isMounted) {
          if (isMounted) {
            setRiderAvatarUri(null);
          }
          return;
        }

        const riderProfileResult = await untypedSupabase
          .from('rider_profile')
          .select('profile_img')
          .eq('uuid', booking.rider_id)
          .maybeSingle();

        const riderProfile = riderProfileResult.data;

        if (isMounted && riderProfile && typeof riderProfile === 'object') {
          const riderProfileRecord = riderProfile as Record<string, unknown>;
          setRiderAvatarUri(
            typeof riderProfileRecord['profile_img'] === 'string' ? riderProfileRecord['profile_img'] : null
          );
          return;
        }

        if (isMounted) {
          setRiderAvatarUri(null);
        }
      };

      void loadParticipantProfiles();

      return () => {
        isMounted = false;
      };
    }, [resolvedBookingId])
  );

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;

      supabase.auth.getUser().then(({ data }) => {
        if (isMounted) {
          setMyUid(data.user?.id ?? null);
        }
      });

      if (!resolvedBookingId) {
        setMessages([]);
        return () => {
          isMounted = false;
        };
      }

      fetchChatMessages(resolvedBookingId)
        .then((history) => {
          if (isMounted) {
            setMessages(history);
          }
        })
        .catch(() => {
          // History failed to load; realtime inserts can still populate the thread.
        });

      const unsubscribe = subscribeToChatMessages(resolvedBookingId, (message) => {
        if (!isMounted) {
          return;
        }

        const isIncomingFromRider = myUid ? message.sender_uuid !== myUid : message.sender_role === 'rider';

        setMessages((currentMessages) => {
          if (currentMessages.some((existing) => existing.id === message.id)) {
            return currentMessages;
          }

          return [...currentMessages, message];
        });

        if (isIncomingFromRider) {
          void playIncomingMessagePing();
        }
      });

      return () => {
        isMounted = false;
        unsubscribe();
      };
    }, [myUid, playIncomingMessagePing, resolvedBookingId])
  );

  const groupedMessages = useMemo(() => {
    return messages.reduce<Array<{ dateLabel: string; items: ChatMessageRow[] }>>((groups, message) => {
      const dateLabel = getDateLabel(message.created_at);
      const lastGroup = groups[groups.length - 1];

      if (!lastGroup || lastGroup.dateLabel !== dateLabel) {
        groups.push({ dateLabel, items: [message] });
        return groups;
      }

      lastGroup.items.push(message);
      return groups;
    }, []);
  }, [messages]);

  const sendMessage = async (text: string) => {
    const trimmedMessage = text.trim();

    if (!trimmedMessage || !resolvedBookingId || isSending) {
      return;
    }

    setIsSending(true);
    setDraftMessage('');

    try {
      const sentMessage = await sendChatMessage(resolvedBookingId, trimmedMessage);

      setMessages((currentMessages) => {
        if (currentMessages.some((existing) => existing.id === sentMessage.id)) {
          return currentMessages;
        }

        return [...currentMessages, sentMessage];
      });
    } catch {
      setDraftMessage(trimmedMessage);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
        >
          <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
            <TouchableOpacity onPress={() => router.back()} style={styles.headerIcon}>
              <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
            </TouchableOpacity>
            <View style={styles.headerCenter}>
              <Text style={[styles.headerTitle, { color: theme.colors.text }]}>Chat with Rider</Text>
              <Text style={[styles.headerSubtitle, { color: theme.colors.textSecondary }]}>{resolvedRiderName}</Text>
            </View>
            <View style={styles.headerIcon} />
          </View>

          {!resolvedBookingId ? (
            <View style={styles.unavailableBanner}>
              <Text style={[styles.unavailableBannerText, { color: theme.colors.textSecondary }]}>
                In-app chat isn't available for this booking.
              </Text>
            </View>
          ) : null}

          <ScrollView
            style={styles.messagesScroll}
            contentContainerStyle={[styles.messagesContent, { paddingBottom: 18 }]}
            showsVerticalScrollIndicator={false}
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            keyboardShouldPersistTaps="handled"
          >
            {groupedMessages.map((group) => (
              <View key={group.dateLabel}>
                <View style={styles.dateDividerWrap}>
                  <View style={[styles.dateDivider, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
                    <Text style={[styles.dateDividerText, { color: theme.colors.textSecondary }]}>{group.dateLabel}</Text>
                  </View>
                </View>

                {group.items.map((message) => {
                  const isDriverMessage = message.sender_uuid === myUid;

                  return (
                    <View
                      key={message.id}
                      style={[styles.messageRow, isDriverMessage ? styles.messageRowRight : styles.messageRowLeft]}
                    >
                      {!isDriverMessage ? (
                        <Image source={riderAvatarUri ? { uri: riderAvatarUri } : RIDER_AVATAR} style={styles.chatAvatar} />
                      ) : null}
                      <View
                        style={[
                          styles.messageBubble,
                          isDriverMessage
                            ? { backgroundColor: theme.colors.primary, borderTopRightRadius: 8 }
                            : {
                                backgroundColor: theme.colors.card,
                                borderColor: theme.colors.border,
                                borderWidth: 1,
                                borderTopLeftRadius: 8,
                              },
                        ]}
                      >
                        <View style={styles.messageContentRow}>
                          <Text
                            style={[
                              styles.messageText,
                              { color: isDriverMessage ? '#FFFFFF' : theme.colors.text },
                            ]}
                          >
                            {message.message}
                          </Text>
                          <Text
                            style={[
                              styles.messageTime,
                              { color: isDriverMessage ? 'rgba(255,255,255,0.76)' : theme.colors.textSecondary },
                            ]}
                          >
                            {getTimeLabel(message.created_at)}
                          </Text>
                        </View>
                      </View>
                      {isDriverMessage ? (
                        <Image source={driverAvatarUri ? { uri: driverAvatarUri } : DRIVER_AVATAR} style={styles.chatAvatar} />
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ))}
          </ScrollView>

          <View style={[styles.quickRepliesSection, { borderTopColor: theme.colors.border }]}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.quickRepliesContent}
              keyboardShouldPersistTaps="handled"
            >
              {QUICK_REPLIES.map((reply) => (
                <TouchableOpacity
                  key={reply}
                  style={[styles.quickReplyChip, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
                  onPress={() => sendMessage(reply)}
                >
                  <Text style={[styles.quickReplyText, { color: theme.colors.text }]}>{reply}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <View
            style={[
              styles.inputBar,
              {
                backgroundColor: theme.colors.background,
                borderTopColor: theme.colors.border,
                paddingBottom: insets.bottom + 10,
              },
            ]}
          >
            <View style={[styles.inputWrap, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
              <Ionicons name="chatbubble-ellipses-outline" size={18} color={theme.colors.textSecondary} />
              <TextInput
                value={draftMessage}
                onChangeText={setDraftMessage}
                placeholder="Type a message"
                placeholderTextColor={theme.colors.textSecondary}
                style={[styles.textInput, { color: theme.colors.text }]}
                multiline
                editable={!!resolvedBookingId}
              />
            </View>

            <TouchableOpacity
              style={[
                styles.sendButton,
                { backgroundColor: draftMessage.trim() ? theme.colors.primary : theme.colors.card },
              ]}
              onPress={() => sendMessage(draftMessage)}
              disabled={!resolvedBookingId || isSending}
            >
              <Ionicons name="send" size={18} color={draftMessage.trim() ? '#FFFFFF' : theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  unavailableBanner: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  unavailableBannerText: {
    fontSize: 13,
    textAlign: 'center',
  },
  messagesScroll: {
    flex: 1,
  },
  messagesContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  dateDividerWrap: {
    alignItems: 'center',
    marginVertical: 14,
  },
  dateDivider: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  dateDividerText: {
    fontSize: 12,
    fontWeight: '600',
  },
  messageRow: {
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  messageRowLeft: {
    justifyContent: 'flex-start',
  },
  messageRowRight: {
    justifyContent: 'flex-end',
  },
  chatAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  messageBubble: {
    maxWidth: '88%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  messageContentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
    flexShrink: 1,
  },
  messageTime: {
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 8,
    marginTop: 4,
  },
  quickRepliesSection: {
    borderTopWidth: 1,
    paddingTop: 12,
  },
  quickRepliesContent: {
    paddingHorizontal: 16,
    gap: 10,
  },
  quickReplyChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  quickReplyText: {
    fontSize: 13,
    fontWeight: '600',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  inputWrap: {
    flex: 1,
    minHeight: 52,
    maxHeight: 120,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    maxHeight: 96,
    paddingTop: 0,
    paddingBottom: 0,
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
});
