import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { DriverChatNotificationBridge } from '../src/components/DriverChatNotificationBridge';
import { GlobalRequestModal } from '../src/components/GlobalRequestModal';
import { PushNotificationBootstrap } from '../src/components/PushNotificationBootstrap';
import { JobRequestsProvider } from '../src/context/JobRequestsContext';
import { NotificationsProvider } from '../src/context/NotificationsContext';
import { ThemeProvider } from '../src/context/ThemeContext';
import { useTheme } from '../src/context/ThemeContext';

function RootNavigator() {
  const { theme } = useTheme();

  return (
    <>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="intro" />
        <Stack.Screen name="auth/login" />
        <Stack.Screen name="auth/signup" />
        <Stack.Screen name="request/accept" />
        <Stack.Screen name="request/call" />
        <Stack.Screen name="request/navigation" options={{ headerShown: false }} />
        <Stack.Screen name="request/notifications" />
        <Stack.Screen name="payout" />
        <Stack.Screen name="(tabs)" />
      </Stack>
      <DriverChatNotificationBridge />
      <GlobalRequestModal />
    </>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <JobRequestsProvider>
        <NotificationsProvider>
          <PushNotificationBootstrap />
          <RootNavigator />
        </NotificationsProvider>
      </JobRequestsProvider>
    </ThemeProvider>
  );
}
