import { Platform } from 'react-native';

type NativeCallState = 'ringing' | 'answered' | 'ending';

export type NativeManagedCall = {
  callUUID: string;
  bookingId: string;
  participantName: string;
  direction: 'incoming' | 'outgoing';
  state: NativeCallState;
};

type NativeCallingHandlers = {
  onAnswer?: (call: NativeManagedCall | null) => void;
  onEnd?: (call: NativeManagedCall | null) => void;
};

const managedCalls = new Map<string, NativeManagedCall>();
const answerListeners = new Set<NonNullable<NativeCallingHandlers['onAnswer']>>();
const endListeners = new Set<NonNullable<NativeCallingHandlers['onEnd']>>();

let setupPromise: Promise<boolean> | null = null;
let listenersRegistered = false;
let androidEventsRegistered = false;

type RNCallKeepModule = typeof import('react-native-callkeep').default;

const CALLKEEP_OPTIONS = {
  ios: {
    appName: 'Limpopo Driver',
    supportsVideo: false,
  },
  android: {
    alertTitle: 'Phone account permission required',
    alertDescription: 'Limpopo Driver needs Android call permissions so drivers can answer rider calls from the native incoming call screen.',
    cancelButton: 'Cancel',
    okButton: 'Continue',
    additionalPermissions: [],
    foregroundService: {
      channelId: 'com.limpopo.driver.calling',
      channelName: 'Limpopo Driver Calls',
      notificationTitle: 'Limpopo Driver call in progress',
      notificationIcon: 'ic_launcher',
    },
  },
};

const createCallUuid = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const randomValue = Math.floor(Math.random() * 16);
    const mappedValue = character === 'x' ? randomValue : (randomValue & 0x3) | 0x8;
    return mappedValue.toString(16);
  });

const getCallKeepModule = (): RNCallKeepModule | null => {
  try {
    const module = require('react-native-callkeep') as { default?: RNCallKeepModule } & RNCallKeepModule;
    return module.default ?? module;
  } catch (error) {
    console.log('[NativeCalling] CallKeep unavailable', error);
    return null;
  }
};

const configureAndroidCallKeep = async (RNCallKeep: RNCallKeepModule) => {
  if (androidEventsRegistered) {
    return;
  }

  RNCallKeep.setSettings(CALLKEEP_OPTIONS);
  RNCallKeep.registerAndroidEvents();
  RNCallKeep.setAvailable(true);
  androidEventsRegistered = true;
};

const checkAndroidPhoneAccountEnabled = async (RNCallKeep: RNCallKeepModule) => {
  try {
    return Boolean(await RNCallKeep.checkPhoneAccountEnabled());
  } catch (error) {
    console.log('[NativeCalling] Failed to check phone account status', error);
    return false;
  }
};

const requestAndroidPhoneAccount = async (RNCallKeep: RNCallKeepModule) => {
  try {
    RNCallKeep.registerPhoneAccount(CALLKEEP_OPTIONS);
  } catch (error) {
    console.log('[NativeCalling] Failed to request phone account permission', error);
    return false;
  }

  return checkAndroidPhoneAccountEnabled(RNCallKeep);
};

const registerNativeEventRelay = () => {
  if (listenersRegistered || Platform.OS !== 'android') {
    return;
  }

  const RNCallKeep = getCallKeepModule();

  if (!RNCallKeep) {
    return;
  }

  listenersRegistered = true;

  RNCallKeep.addEventListener('answerCall', ({ callUUID }) => {
    const resolvedCallUUID = typeof callUUID === 'string' ? callUUID : '';
    const call = managedCalls.get(resolvedCallUUID) ?? null;

    if (call) {
      managedCalls.set(resolvedCallUUID, {
        ...call,
        state: 'answered',
      });
    }

    answerListeners.forEach((listener) => {
      listener(call);
    });
  });

  RNCallKeep.addEventListener('endCall', ({ callUUID }) => {
    const resolvedCallUUID = typeof callUUID === 'string' ? callUUID : '';
    const call = managedCalls.get(resolvedCallUUID) ?? null;

    if (call) {
      managedCalls.delete(resolvedCallUUID);
    }

    endListeners.forEach((listener) => {
      listener(call);
    });
  });
};

export const initializeNativeCalling = async ({
  promptForPermission = false,
}: {
  promptForPermission?: boolean;
} = {}) => {
  if (Platform.OS !== 'android') {
    return false;
  }

  const RNCallKeep = getCallKeepModule();

  if (!RNCallKeep) {
    return false;
  }

  registerNativeEventRelay();

  if (!setupPromise) {
    setupPromise = (async () => {
      try {
        await configureAndroidCallKeep(RNCallKeep);
        return true;
      } catch (error) {
        console.log('[NativeCalling] Failed to initialize CallKeep', error);
        setupPromise = null;
        return false;
      }
    })();
  }

  const isInitialized = await setupPromise;

  if (!isInitialized) {
    return false;
  }

  const isPhoneAccountEnabled = await checkAndroidPhoneAccountEnabled(RNCallKeep);

  if (isPhoneAccountEnabled) {
    return true;
  }

  if (!promptForPermission) {
    return false;
  }

  return requestAndroidPhoneAccount(RNCallKeep);
};

export const registerNativeCallingHandlers = ({ onAnswer, onEnd }: NativeCallingHandlers) => {
  if (onAnswer) {
    answerListeners.add(onAnswer);
  }

  if (onEnd) {
    endListeners.add(onEnd);
  }

  return () => {
    if (onAnswer) {
      answerListeners.delete(onAnswer);
    }

    if (onEnd) {
      endListeners.delete(onEnd);
    }
  };
};

export const showIncomingNativeCall = async ({
  bookingId,
  participantName,
}: {
  bookingId: string;
  participantName: string;
}) => {
  const isReady = await initializeNativeCalling({ promptForPermission: true });

  if (!isReady) {
    return null;
  }

  const callUUID = createCallUuid();

  managedCalls.set(callUUID, {
    callUUID,
    bookingId,
    participantName,
    direction: 'incoming',
    state: 'ringing',
  });

  try {
    await RNCallKeep.displayIncomingCall(callUUID, 'Limpopo Ride', participantName, 'generic', false);
    return callUUID;
  } catch (error) {
    managedCalls.delete(callUUID);
    console.log('[NativeCalling] Failed to display incoming call', error);
    return null;
  }
};

export const bringNativeCallAppToForeground = async () => {
  if (Platform.OS !== 'android') {
    return;
  }

  const RNCallKeep = getCallKeepModule();

  if (!RNCallKeep) {
    return;
  }

  try {
    await RNCallKeep.backToForeground();
  } catch (error) {
    console.log('[NativeCalling] Failed to bring app to foreground', error);
  }
};

export const markNativeCallActive = async (callUUID: string) => {
  if (Platform.OS !== 'android' || !callUUID) {
    return;
  }

  const RNCallKeep = getCallKeepModule();

  if (!RNCallKeep) {
    return;
  }

  try {
    await RNCallKeep.setCurrentCallActive(callUUID);
  } catch (error) {
    console.log('[NativeCalling] Failed to mark call active', { callUUID, error });
  }
};

export const endNativeCall = async (callUUID: string) => {
  if (Platform.OS !== 'android' || !callUUID) {
    return;
  }

  const RNCallKeep = getCallKeepModule();

  if (!RNCallKeep) {
    return;
  }

  const call = managedCalls.get(callUUID);

  if (call) {
    managedCalls.set(callUUID, {
      ...call,
      state: 'ending',
    });
  }

  try {
    await RNCallKeep.endCall(callUUID);
  } catch (error) {
    console.log('[NativeCalling] Failed to end call', { callUUID, error });
  }
};