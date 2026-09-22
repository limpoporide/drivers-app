import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { supabase } from './supabase';

const DRIVER_PUSH_TOKEN_CACHE_KEY = 'driver_expo_push_token';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const getProjectId = () => {
  const easProjectId = Constants.expoConfig?.extra?.eas?.projectId;
  const runtimeProjectId = Constants.easConfig?.projectId;
  return typeof easProjectId === 'string' ? easProjectId : runtimeProjectId;
};

export const registerDriverPushToken = async () => {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return;
  }

  const existingPermissions = await Notifications.getPermissionsAsync();
  let finalStatus = existingPermissions.status;

  if (finalStatus !== 'granted') {
    const requestedPermissions = await Notifications.requestPermissionsAsync();
    finalStatus = requestedPermissions.status;
  }

  if (finalStatus !== 'granted') {
    console.log('[PushNotifications] permission not granted');
    return;
  }

  await Notifications.setNotificationChannelAsync('ride-requests', {
    name: 'Ride requests',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#C58B00',
  });

  await Notifications.setNotificationChannelAsync('chat-messages', {
    name: 'Chat messages',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 180, 120, 180],
    lightColor: '#C58B00',
  });

  const projectId = getProjectId();

  if (!projectId) {
    console.log('[PushNotifications] missing EAS project id');
    return;
  }

  const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
  const expoPushToken = tokenResponse.data?.trim();

  if (!expoPushToken) {
    console.log('[PushNotifications] no expo push token returned');
    return;
  }

  const cachedToken = await AsyncStorage.getItem(DRIVER_PUSH_TOKEN_CACHE_KEY);

  if (cachedToken === expoPushToken) {
    return;
  }

  const { error: updateError } = await supabase
    .from('driver_profile')
    .update({
      expo_push_token: expoPushToken,
      push_token_updated_at: new Date().toISOString(),
    })
    .eq('uuid', user.id);

  if (updateError) {
    console.log('[PushNotifications] unable to save push token', updateError);
    return;
  }

  await AsyncStorage.setItem(DRIVER_PUSH_TOKEN_CACHE_KEY, expoPushToken);
  console.log('[PushNotifications] registered driver push token');
};

export const clearCachedDriverPushToken = async () => {
  await AsyncStorage.removeItem(DRIVER_PUSH_TOKEN_CACHE_KEY);
};