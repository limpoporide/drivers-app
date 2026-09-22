import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  TouchableOpacity,
  View,
} from 'react-native';
import type { DimensionValue } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/context/ThemeContext';
import { supabase } from '../../src/lib/supabase';
import { getDriverOnboardingState, toLocalPhoneNumber } from '../../src/lib/onboarding';

const EXPERIENCE_OPTIONS = ['2', '3', '4', '5', '6', '7', '8', '9'] as const;
const HEALTH_OPTIONS = ['Yes', 'No'] as const;
const STEP_TITLES = ['Personal Info', 'Documents', 'Security'] as const;
const CITY_OPTIONS = [
  { city: 'Benin', state: 'Edo' },
  { city: 'Ikeja', state: 'Lagos' },
  { city: 'Lekki', state: 'Lagos' },
  { city: 'Victoria Island', state: 'Lagos' },
  { city: 'Ikoyi', state: 'Lagos' },
  { city: 'Surulere', state: 'Lagos' },
  { city: 'Yaba', state: 'Lagos' },
  { city: 'Agege', state: 'Lagos' },
  { city: 'Maryland', state: 'Lagos' },
  { city: 'Ajah', state: 'Lagos' },
  { city: 'Gwarinpa', state: 'FCT' },
  { city: 'Wuse', state: 'FCT' },
  { city: 'Port Harcourt', state: 'Rivers' },
] as const;
const ALLOWED_LICENSE_EXTENSIONS = ['jpeg', 'jpg', 'png', 'pdf'];
const MAX_LICENSE_SIZE_BYTES = 1024 * 1024;
const PASSWORD_LENGTH = 6;
const OTP_LENGTH = 6;
const MIN_NAME_LENGTH = 3;
const TERMII_BASE_URL = 'https://v4.api.termii.com';
const TERMII_API_KEY = process.env.EXPO_PUBLIC_TERMII_API_KEY ?? '';
const TERMII_SENDER_ID = process.env.EXPO_PUBLIC_TERMII_SENDER_ID ?? 'OE Alert';
const TERMII_OTP_CHANNEL = process.env.EXPO_PUBLIC_TERMII_CHANNEL ?? 'dnd';
const OTP_RESEND_SECONDS = 60;
const OTP_MAX_RETRIES = 3;

export default function Signup() {
  const router = useRouter();
  const { theme } = useTheme();
  const [step, setStep] = useState(1);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [nin, setNin] = useState('');
  const [licenseUploaded, setLicenseUploaded] = useState(false);
  const [licenseError, setLicenseError] = useState('');
  const [drivingExperience, setDrivingExperience] = useState('');
  const [showExperienceOptions, setShowExperienceOptions] = useState(false);
  const [hasHealthCondition, setHasHealthCondition] = useState<'Yes' | 'No'>('No');
  const [healthConditionDetails, setHealthConditionDetails] = useState('');
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [stateName, setStateName] = useState('');
  const [showCityOptions, setShowCityOptions] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showProcessingModal, setShowProcessingModal] = useState(false);
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);
  const [showVerificationToast, setShowVerificationToast] = useState(false);
  const [licenseUploadUri, setLicenseUploadUri] = useState('');
  const [showOtpVerification, setShowOtpVerification] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [termiiPinId, setTermiiPinId] = useState('');
  const [otpCountdown, setOtpCountdown] = useState(0);
  const [otpRetryCount, setOtpRetryCount] = useState(0);
  const [isSavingStepOne, setIsSavingStepOne] = useState(false);
  const [isSavingStepTwo, setIsSavingStepTwo] = useState(false);
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [isHydratingSignup, setIsHydratingSignup] = useState(true);

  const progressPercent = useMemo<DimensionValue>(() => `${(step / 3) * 100}%`, [step]);
  const passwordsMatch = password.length === PASSWORD_LENGTH && password === confirmPassword;
  const canContinueStepTwo =
    licenseUploaded &&
    Boolean(nin.trim()) &&
    Boolean(drivingExperience) &&
    Boolean(street.trim()) &&
    Boolean(city) &&
    Boolean(stateName.trim()) &&
    (hasHealthCondition !== 'Yes' || Boolean(healthConditionDetails.trim()));

  const normalizePhoneNumber = (value: string) => {
    const digitsOnly = value.replace(/\D/g, '');

    if (digitsOnly.length === 11 && digitsOnly.startsWith('0')) {
      return `+234${digitsOnly.slice(1)}`;
    }

    if (digitsOnly.length === 10) {
      return `+234${digitsOnly}`;
    }

    if (digitsOnly.length === 13 && digitsOnly.startsWith('234')) {
      return `+${digitsOnly}`;
    }

    if (value.startsWith('+') && digitsOnly.length >= 10) {
      return `+${digitsOnly}`;
    }

    return null;
  };

  const validateName = (value: string) => value.trim().length >= MIN_NAME_LENGTH;

  const validateEmail = (value: string) => /^\S+@\S+\.\S+$/.test(value.trim());

  const validatePhone = (value: string) => /^[0-9]{11}$/.test(value);

  const getTermiiPhoneNumber = (normalizedPhone: string) => normalizedPhone.replace(/^\+/, '');

  const getErrorMessage = (error: unknown, fallbackMessage: string) => {
    if (typeof error === 'string' && error.trim().length > 0) {
      return error;
    }

    if (error && typeof error === 'object') {
      const errorRecord = error as Record<string, unknown>;

      if (typeof errorRecord.message === 'string' && errorRecord.message.trim().length > 0) {
        return errorRecord.message;
      }

      if (typeof errorRecord.smsStatus === 'string' && errorRecord.smsStatus.trim().length > 0) {
        return errorRecord.smsStatus;
      }

      if (typeof errorRecord.details === 'string' && errorRecord.details.trim().length > 0) {
        return errorRecord.details;
      }
    }

    return fallbackMessage;
  };

  const createTemporaryPassword = () => `drv${Math.random().toString(36).slice(2, 14)}A1!`;

  useEffect(() => {
    let isMounted = true;

    const hydrateSignup = async () => {
      const onboardingState = await getDriverOnboardingState();

      if (!isMounted) {
        return;
      }

      if (!onboardingState.isAuthenticated) {
        setIsHydratingSignup(false);
        return;
      }

      if (onboardingState.isSignupComplete) {
        router.replace('/(tabs)/home');
        return;
      }

      const profile = onboardingState.profile;

      setPhone(toLocalPhoneNumber(profile?.phone_num ?? onboardingState.user?.phone ?? ''));
      setIsPhoneVerified(Boolean(profile?.phone_verified ?? onboardingState.user?.phone));
      setFirstName(profile?.first_name ?? '');
      setLastName(profile?.last_name ?? '');
      setEmail(profile?.email ?? onboardingState.user?.email ?? '');
      setNin(profile?.nin ?? '');
      setLicenseUploadUri(profile?.license_upload ?? '');
      setLicenseUploaded(Boolean(profile?.license_upload));
      setDrivingExperience(profile?.experience ?? '');
      setHasHealthCondition(profile?.health_status === 'yes' ? 'Yes' : 'No');
      setHealthConditionDetails(profile?.health_yes ?? '');
      setStreet(profile?.address ?? '');
      setCity(profile?.city ?? '');
      setStateName(profile?.state ?? '');
      setShowOtpVerification(false);
      setOtp('');
      setStep(onboardingState.nextStep);
      setIsHydratingSignup(false);
    };

    hydrateSignup();

    return () => {
      isMounted = false;
    };
  }, [router]);

  useEffect(() => {
    if (!showProcessingModal) {
      return;
    }

    const timeout = setTimeout(() => {
      setShowProcessingModal(false);
      router.replace('/auth/login');
    }, 1800);

    return () => clearTimeout(timeout);
  }, [router, showProcessingModal]);

  useEffect(() => {
    if (!showVerificationToast) {
      return;
    }

    const timeout = setTimeout(() => {
      setShowVerificationToast(false);
    }, 1800);

    return () => clearTimeout(timeout);
  }, [showVerificationToast]);

  useEffect(() => {
    if (otpCountdown <= 0) {
      return;
    }

    const timer = setTimeout(() => {
      setOtpCountdown((current) => Math.max(0, current - 1));
    }, 1000);

    return () => clearTimeout(timer);
  }, [otpCountdown]);

  const handlePhoneChange = (value: string) => {
    if (isPhoneVerified) {
      setIsPhoneVerified(false);
    }

    setOtp('');
    setTermiiPinId('');
    setOtpCountdown(0);
    setOtpRetryCount(0);
    setShowOtpVerification(false);
    setPhone(value.replace(/\D/g, '').slice(0, 11));
  };

  const handleOtpChange = (value: string) => {
    const digitsOnly = value.replace(/\D/g, '').slice(0, OTP_LENGTH);
    setOtp(digitsOnly);

    if (digitsOnly.length < OTP_LENGTH && isPhoneVerified) {
      setIsPhoneVerified(false);
    }
  };

  const handleNinChange = (value: string) => {
    setNin(value.replace(/\D/g, '').slice(0, 11));
  };

  const handleUploadLicense = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        multiple: false,
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        return;
      }

      const asset = result.assets[0];
      const extension = asset.name.split('.').pop()?.toLowerCase() || '';
      const isAllowedType = ALLOWED_LICENSE_EXTENSIONS.includes(extension);
      const isAllowedSize = typeof asset.size === 'number' ? asset.size <= MAX_LICENSE_SIZE_BYTES : false;

      if (!isAllowedType || !isAllowedSize) {
        setLicenseUploaded(false);
        setLicenseError('Please upload a valid driver license file under 1MB.');
        return;
      }

      setLicenseError('');
      setLicenseUploaded(true);
      setLicenseUploadUri(asset.uri);
    } catch (error) {
      setLicenseUploaded(false);
      setLicenseUploadUri('');
      setLicenseError('Unable to upload the file right now. Please try again.');
    }
  };

  const handleSelectCity = (selectedCity: (typeof CITY_OPTIONS)[number]) => {
    setCity(selectedCity.city);
    setStateName(selectedCity.state);
    setShowCityOptions(false);
  };

  const handleHealthConditionChange = (value: string) => {
    const trimmed = value.slice(0, 60);
    setHealthConditionDetails(trimmed);
  };

  const handlePasswordChange = (value: string) => {
    setPassword(value.replace(/\D/g, '').slice(0, PASSWORD_LENGTH));
  };

  const handleConfirmPasswordChange = (value: string) => {
    setConfirmPassword(value.replace(/\D/g, '').slice(0, PASSWORD_LENGTH));
  };

  const handleSendOtp = async () => {
    await handleSendOtpWithTermii(false);
  };

  const handleSendOtpWithTermii = async (isRetry: boolean) => {
    const normalizedPhone = normalizePhoneNumber(phone);

    if (!normalizedPhone) {
      Alert.alert('Invalid phone number', 'Enter a valid phone number before requesting an OTP.');
      return;
    }

    if (!validateName(firstName) || !validateName(lastName) || !validateEmail(email) || !validatePhone(phone)) {
      Alert.alert('Complete your details', 'Enter your first name, last name, email, and phone number before requesting an OTP.');
      return;
    }

    if (!TERMII_API_KEY) {
      Alert.alert('OTP setup missing', 'Add EXPO_PUBLIC_TERMII_API_KEY to continue.');
      return;
    }

    if (isRetry && otpRetryCount >= OTP_MAX_RETRIES) {
      Alert.alert('Retry limit reached', 'You have used all OTP retries. Please contact admin for assistance.');
      return;
    }

    setIsSendingOtp(true);

    try {
      const requestPayload = {
        api_key: TERMII_API_KEY,
        message_type: 'NUMERIC',
        to: getTermiiPhoneNumber(normalizedPhone),
        from: TERMII_SENDER_ID,
        channel: TERMII_OTP_CHANNEL,
        pin_attempts: 3,
        pin_time_to_live: 5,
        pin_length: OTP_LENGTH,
        pin_placeholder: '< 123456 >',
        message_text: 'Your Limpopo verification code is < 123456 >',
        pin_type: 'NUMERIC',
      };

      const response = await fetch(`${TERMII_BASE_URL}/api/sms/otp/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestPayload),
      });

      const payload = await response.json();

      if (!response.ok) {
        Alert.alert('OTP request failed', getErrorMessage(payload, 'Unable to send OTP right now.'));
        return;
      }

      const nextPinId = typeof payload?.pinId === 'string'
        ? payload.pinId
        : typeof payload?.pin_id === 'string'
          ? payload.pin_id
          : '';

      if (!nextPinId) {
        Alert.alert('OTP request failed', 'We could not start verification right now. Please try again.');
        return;
      }

      setTermiiPinId(nextPinId);
      setOtp('');
      setShowOtpVerification(true);
      setOtpCountdown(OTP_RESEND_SECONDS);
      setOtpRetryCount((current) => (isRetry ? current + 1 : current));
      Alert.alert('OTP sent', 'A verification code has been sent to your phone number.');
    } catch (error) {
      Alert.alert('OTP request failed', getErrorMessage(error, 'Unable to send OTP right now.'));
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleVerifyPhone = async () => {
    const normalizedPhone = normalizePhoneNumber(phone);

    if (!normalizedPhone) {
      Alert.alert('Invalid phone number', 'Enter a valid phone number before verifying it.');
      return;
    }

    if (otp.length !== OTP_LENGTH) {
      Alert.alert('Invalid OTP', 'Enter the 6-digit code sent to your phone.');
      return;
    }

    if (!termiiPinId) {
      Alert.alert('OTP expired', 'Send a new OTP code before verifying your phone number.');
      return;
    }

    if (!TERMII_API_KEY) {
      Alert.alert('OTP setup missing', 'Add EXPO_PUBLIC_TERMII_API_KEY to continue.');
      return;
    }

    setIsVerifyingOtp(true);

    try {
      const response = await fetch(`${TERMII_BASE_URL}/api/sms/otp/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_key: TERMII_API_KEY,
          pin_id: termiiPinId,
          pin: otp,
        }),
      });

      const payload = await response.json();
      const isVerified = String(payload?.verified).toLowerCase() === 'true';

      if (!response.ok || !isVerified) {
        setIsPhoneVerified(false);
        Alert.alert('Verification failed', getErrorMessage(payload, 'The OTP code is invalid or has expired.'));
        return;
      }

      const {
        data: { user: existingUser },
      } = await supabase.auth.getUser();

      if (!existingUser) {
        const temporaryPassword = createTemporaryPassword();
        const trimmedEmail = email.trim().toLowerCase();

        const { data: createAuthUserData, error: createAuthUserError } = await supabase.functions.invoke('create-driver-auth-user', {
          method: 'POST',
          body: {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            email: trimmedEmail,
            phone,
            password: temporaryPassword,
          },
        });

        if (createAuthUserError) {
          Alert.alert('Verification failed', createAuthUserError.message);
          return;
        }

        if (!createAuthUserData?.userId) {
          Alert.alert('Verification failed', 'We could not prepare your driver account right now.');
          return;
        }

        const { error: signInError } = await supabase.auth.signInWithPassword({
          phone: normalizedPhone,
          password: temporaryPassword,
        });

        if (signInError) {
          Alert.alert('Verification failed', signInError.message);
          return;
        }
      }

      setIsPhoneVerified(true);
      setTermiiPinId('');
      setOtp('');
      setOtpCountdown(0);
      setShowOtpVerification(false);

      if (Platform.OS === 'android') {
        ToastAndroid.show('Phone number verified', ToastAndroid.SHORT);
      }

      setShowVerificationToast(true);
    } catch (error) {
      setIsPhoneVerified(false);
      Alert.alert('Verification failed', getErrorMessage(error, 'Unable to verify OTP right now.'));
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const handleContinueStepOne = async () => {
    const trimmedFirstName = firstName.trim();
    const trimmedLastName = lastName.trim();
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedFirstName || !trimmedLastName || !trimmedEmail || phone.length < 10) {
      Alert.alert('Missing information', 'Complete your personal details before continuing.');
      return;
    }

    if (!validateName(trimmedFirstName) || !validateName(trimmedLastName)) {
      Alert.alert('Invalid name', `First name and last name must be at least ${MIN_NAME_LENGTH} characters.`);
      return;
    }

    if (!validateEmail(trimmedEmail)) {
      Alert.alert('Invalid email', 'Enter a valid email address.');
      return;
    }

    if (!validatePhone(phone)) {
      Alert.alert('Invalid phone number', 'Enter a valid 11-digit phone number.');
      return;
    }

    if (!isPhoneVerified) {
      Alert.alert('Phone not verified', 'Send and verify the OTP before continuing.');
      return;
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      Alert.alert('Verification required', 'Verify your phone number again to continue signup.');
      return;
    }

    setIsSavingStepOne(true);

    const { error } = await supabase.from('driver_profile').upsert(
      {
        uuid: user.id,
        first_name: trimmedFirstName,
        last_name: trimmedLastName,
        email: trimmedEmail,
        phone_num: phone,
        phone_verified: true,
        check1: true,
      },
      { onConflict: 'uuid' }
    );

    setIsSavingStepOne(false);

    if (error) {
      Alert.alert('Unable to save step 1', error.message);
      return;
    }

    setStep(2);
  };

  const handleContinueStepTwo = async () => {
    if (!licenseUploaded) {
      setLicenseError('Please upload a valid driver license file under 1MB.');
      return;
    }

    if (!nin || !drivingExperience || !street.trim() || !city || !stateName.trim()) {
      Alert.alert('Missing information', 'Complete the required profile details before continuing.');
      return;
    }

    if (hasHealthCondition === 'Yes' && !healthConditionDetails.trim()) {
      Alert.alert('Health details required', 'Describe the health condition before continuing.');
      return;
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      Alert.alert('Session expired', 'Verify your phone number again before continuing.');
      setStep(1);
      return;
    }

    setIsSavingStepTwo(true);

    const { error } = await supabase.from('driver_profile').upsert(
      {
        uuid: user.id,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim().toLowerCase(),
        phone_num: phone,
        phone_verified: isPhoneVerified,
        nin,
        license_upload: licenseUploadUri || null,
        experience: drivingExperience,
        health_status: hasHealthCondition.toLowerCase() as 'yes' | 'no',
        health_yes: hasHealthCondition === 'Yes' ? healthConditionDetails.trim() : null,
        address: street.trim(),
        city,
        state: stateName.trim(),
        check1: true,
        check2: true,
      },
      { onConflict: 'uuid' }
    );

    setIsSavingStepTwo(false);

    if (error) {
      Alert.alert('Unable to save step 2', error.message);
      return;
    }

    setStep(3);
  };

  const handleSignup = async () => {
    if (password.length !== PASSWORD_LENGTH || confirmPassword.length !== PASSWORD_LENGTH) {
      Alert.alert('Invalid password', 'Create a 6-digit numeric password before continuing.');
      return;
    }

    if (!passwordsMatch) {
      Alert.alert('Password mismatch', 'Your password confirmation does not match.');
      return;
    }

    const trimmedEmail = email.trim().toLowerCase();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      Alert.alert('Session expired', 'Start again from phone verification so we can finish creating the account.');
      setStep(1);
      return;
    }

    setIsCreatingAccount(true);

    const { error: authError } = await supabase.auth.updateUser({
      email: trimmedEmail,
      password,
      data: {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone_num: phone,
        phone_verified: isPhoneVerified,
        signup_complete: true,
      },
    });

    if (authError) {
      setIsCreatingAccount(false);
      Alert.alert('Unable to create account', authError.message);
      return;
    }

    const { error: profileError } = await supabase
      .from('driver_profile')
      .update({
        email: trimmedEmail,
        phone_verified: isPhoneVerified,
      })
      .eq('uuid', user.id);

    if (profileError) {
      setIsCreatingAccount(false);
      Alert.alert('Profile update failed', profileError.message);
      return;
    }

    // Provision the driver's dedicated payout virtual account; non-fatal if it fails.
    const { error: virtualAccountError } = await supabase.functions.invoke('create-driver-virtual-account', {
      method: 'POST',
    });

    if (virtualAccountError) {
      console.log('Virtual account creation failed:', virtualAccountError.message);
    }

    setIsCreatingAccount(false);

    setShowProcessingModal(true);
  };

  const handleBack = () => {
    if (step === 1) {
      router.back();
      return;
    }

    setShowExperienceOptions(false);
    setShowCityOptions(false);
    setStep((currentStep) => currentStep - 1);
  };

  if (isHydratingSignup) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top', 'bottom']}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
          <Text style={[styles.loadingText, { color: theme.colors.textSecondary }]}>Loading your signup progress...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const renderProgress = () => (
    <View style={styles.progressSection}>
      <View style={styles.progressHeader}>
        <Text style={[styles.progressLabel, { color: theme.colors.textSecondary }]}>Step {step} of 3</Text>
        <Text style={[styles.progressLabel, { color: theme.colors.primary }]}>{STEP_TITLES[step - 1]}</Text>
      </View>
      <View style={[styles.progressTrack, { backgroundColor: theme.colors.border }]}> 
        <View style={[styles.progressFill, { backgroundColor: theme.colors.primary, width: progressPercent }]} />
      </View>
    </View>
  );

  const renderInput = (
    label: string,
    value: string,
    onChangeText: (text: string) => void,
    placeholder: string,
    options?: {
      keyboardType?: 'default' | 'email-address' | 'number-pad' | 'phone-pad';
      inputMode?: 'text' | 'email' | 'numeric';
      maxLength?: number;
      autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
      secureTextEntry?: boolean;
      trailing?: React.ReactNode;
      multiline?: boolean;
      containerStyle?: object;
    }
  ) => (
    <View style={[styles.inputContainer, options?.containerStyle]}>
      <Text style={[styles.label, { color: theme.colors.text }]}>{label}</Text>
      <View style={styles.inputShell}>
        <TextInput
          style={[
            styles.input,
            options?.multiline && styles.multilineInput,
            {
              backgroundColor: theme.colors.card,
              color: theme.colors.text,
              borderColor: theme.colors.border,
              flex: 1,
            },
          ]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.textSecondary}
          keyboardType={options?.keyboardType}
          inputMode={options?.inputMode}
          maxLength={options?.maxLength}
          autoCapitalize={options?.autoCapitalize}
          secureTextEntry={options?.secureTextEntry}
          multiline={options?.multiline}
          textAlignVertical={options?.multiline ? 'top' : 'center'}
        />
        {options?.trailing ? <View style={styles.inputTrailing}>{options.trailing}</View> : null}
      </View>
    </View>
  );

  const renderStepOne = () => (
    <View style={styles.form}>
      {renderInput('First Name', firstName, setFirstName, 'Enter first name', {
        autoCapitalize: 'words',
      })}

      {!validateName(firstName) && firstName.trim().length > 0 ? (
        <Text style={[styles.errorText, { color: theme.colors.error }]}>First name must be at least {MIN_NAME_LENGTH} characters.</Text>
      ) : null}

      {renderInput('Last Name', lastName, setLastName, 'Enter last name', {
        autoCapitalize: 'words',
      })}

      {!validateName(lastName) && lastName.trim().length > 0 ? (
        <Text style={[styles.errorText, { color: theme.colors.error }]}>Last name must be at least {MIN_NAME_LENGTH} characters.</Text>
      ) : null}

      {renderInput('Email', email, setEmail, 'Enter your email', {
        keyboardType: 'email-address',
        inputMode: 'email',
        autoCapitalize: 'none',
      })}

      {renderInput('Phone Number', phone, handlePhoneChange, 'Enter your 11-digit phone number', {
        keyboardType: 'number-pad',
        inputMode: 'numeric',
        maxLength: 11,
        trailing: isPhoneVerified ? (
          <Ionicons name="checkmark-circle" size={20} color={theme.colors.success} />
        ) : undefined,
      })}

      {!isPhoneVerified ? (
        <>
          {!showOtpVerification && validateName(firstName) && validateName(lastName) && validateEmail(email) && validatePhone(phone) ? (
            <TouchableOpacity
              style={[styles.inlineAction, { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary }]}
              onPress={handleSendOtp}
              disabled={isSendingOtp}
            >
              {isSendingOtp ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={[styles.inlineActionText, { color: '#FFFFFF' }]}>Send OTP</Text>
              )}
            </TouchableOpacity>
          ) : null}

          {showOtpVerification && otpCountdown > 0 ? (
            <View style={styles.otpCountdownContainer}>
              <Text style={[styles.otpCountdownText, { color: theme.colors.textSecondary }]}>Resend available in 00:{String(otpCountdown).padStart(2, '0')}</Text>
            </View>
          ) : null}

          {showOtpVerification ? (
            <>
              {renderInput('OTP', otp, handleOtpChange, 'Enter 6-digit OTP', {
                keyboardType: 'number-pad',
                inputMode: 'numeric',
                maxLength: OTP_LENGTH,
              })}

              <TouchableOpacity
                style={[styles.inlineAction, { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary }]}
                onPress={handleVerifyPhone}
                disabled={isVerifyingOtp}
              >
                {isVerifyingOtp ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={[styles.inlineActionText, { color: '#FFFFFF' }]}>Verify Phone</Text>
                )}
              </TouchableOpacity>

              {otpCountdown === 0 && otpRetryCount < OTP_MAX_RETRIES ? (
                <TouchableOpacity
                  onPress={() => handleSendOtpWithTermii(true)}
                  activeOpacity={0.75}
                  disabled={isSendingOtp}
                >
                  <Text style={[styles.retryText, { color: theme.colors.primary }]}>I didn't get the code</Text>
                </TouchableOpacity>
              ) : null}

              {otpCountdown === 0 && otpRetryCount >= OTP_MAX_RETRIES ? (
                <Text style={[styles.retryLimitText, { color: theme.colors.error }]}>Retry limit reached. Please contact admin for assistance.</Text>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}

      <TouchableOpacity
        style={[styles.button, { backgroundColor: isPhoneVerified ? theme.colors.primary : theme.colors.border }]}
        onPress={handleContinueStepOne}
        disabled={!isPhoneVerified || isSavingStepOne}
      >
        <Text style={styles.buttonText}>{isSavingStepOne ? 'Saving...' : 'Continue'}</Text>
      </TouchableOpacity>
    </View>
  );

  const renderStepTwo = () => (
    <View style={styles.form}>
      {renderInput('NIN', nin, handleNinChange, 'Enter your NIN', {
        keyboardType: 'number-pad',
        inputMode: 'numeric',
        maxLength: 11,
      })}

      <View style={styles.inputContainer}>
        <Text style={[styles.label, { color: theme.colors.text }]}>Driver License</Text>
        <TouchableOpacity
          style={[styles.uploadCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
          onPress={handleUploadLicense}
        >
          <View style={styles.uploadTextWrap}>
            <Text style={[styles.uploadTitle, { color: theme.colors.text }]}>
              {licenseUploaded ? 'Driver license uploaded' : 'Upload driver license'}
            </Text>
            <Text style={[styles.uploadSubtitle, { color: theme.colors.textSecondary }]}>
              {licenseUploaded ? 'Document ready for review' : 'Tap to attach your license document'}
            </Text>
          </View>
          <Ionicons
            name={licenseUploaded ? 'checkmark-circle' : 'cloud-upload-outline'}
            size={24}
            color={licenseUploaded ? theme.colors.success : theme.colors.primary}
          />
        </TouchableOpacity>
        {licenseError ? (
          <Text style={[styles.errorText, { color: theme.colors.error }]}>{licenseError}</Text>
        ) : null}
      </View>

      <View style={styles.inputContainer}>
        <Text style={[styles.label, { color: theme.colors.text }]}>Driving Experience</Text>
        <TouchableOpacity
          style={[styles.selectButton, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
          onPress={() => setShowExperienceOptions((current) => !current)}
        >
          <Text
            style={[
              styles.selectButtonText,
              { color: drivingExperience ? theme.colors.text : theme.colors.textSecondary },
            ]}
          >
            {drivingExperience ? `${drivingExperience} years` : 'Select experience'}
          </Text>
          <Ionicons
            name={showExperienceOptions ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={theme.colors.textSecondary}
          />
        </TouchableOpacity>

        {showExperienceOptions ? (
          <View style={[styles.optionsCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}> 
            {EXPERIENCE_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option}
                style={styles.optionRow}
                onPress={() => {
                  setDrivingExperience(option);
                  setShowExperienceOptions(false);
                }}
              >
                <Text style={[styles.optionText, { color: theme.colors.text }]}>{option} years</Text>
                {drivingExperience === option ? (
                  <Ionicons name="checkmark" size={18} color={theme.colors.primary} />
                ) : null}
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
      </View>

      <View style={styles.inputContainer}>
        <Text style={[styles.label, { color: theme.colors.text }]}>Any Health Condition</Text>
        <View style={styles.segmentRow}>
          {HEALTH_OPTIONS.map((option) => {
            const isSelected = hasHealthCondition === option;
            return (
              <TouchableOpacity
                key={option}
                style={[
                  styles.segmentButton,
                  {
                    backgroundColor: isSelected ? theme.colors.primary : theme.colors.card,
                    borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                  },
                ]}
                onPress={() => setHasHealthCondition(option)}
              >
                <Text style={[styles.segmentText, { color: isSelected ? '#FFFFFF' : theme.colors.text }]}>
                  {option}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {hasHealthCondition === 'Yes'
        ? renderInput(
            'Health Condition Details',
            healthConditionDetails,
            handleHealthConditionChange,
            'Enter condition details',
            { maxLength: 60, multiline: true }
          )
        : null}

      {hasHealthCondition === 'Yes' ? (
        <Text style={[styles.characterCount, { color: theme.colors.textSecondary }]}>
          {healthConditionDetails.length}/60
        </Text>
      ) : null}

      {renderInput('Residential Address', street, setStreet, 'Enter residential address', {
        autoCapitalize: 'words',
      })}

      <View style={styles.row}>
        <View style={styles.rowItem}>
          <View style={styles.inputContainer}>
            <Text style={[styles.label, { color: theme.colors.text }]}>City</Text>
            <TouchableOpacity
              style={[styles.selectButton, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
              onPress={() => setShowCityOptions((current) => !current)}
            >
              <Text
                style={[
                  styles.selectButtonText,
                  { color: city ? theme.colors.text : theme.colors.textSecondary },
                ]}
              >
                {city || 'Select city'}
              </Text>
              <Ionicons
                name={showCityOptions ? 'chevron-up' : 'chevron-down'}
                size={20}
                color={theme.colors.textSecondary}
              />
            </TouchableOpacity>

            {showCityOptions ? (
              <View style={[styles.optionsCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}> 
                {CITY_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option.city}
                    style={styles.optionRow}
                    onPress={() => handleSelectCity(option)}
                  >
                    <Text style={[styles.optionText, { color: theme.colors.text }]}>{option.city}</Text>
                    {city === option.city ? (
                      <Ionicons name="checkmark" size={18} color={theme.colors.primary} />
                    ) : null}
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
          </View>
        </View>
        <View style={styles.rowItem}>
          {renderInput('State', stateName, setStateName, 'Enter state', {
            autoCapitalize: 'words',
          })}
        </View>
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[styles.secondaryButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}
          onPress={() => setStep(1)}
        >
          <Text style={[styles.secondaryButtonText, { color: theme.colors.text }]}>Back</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.primaryAction,
            { backgroundColor: canContinueStepTwo ? theme.colors.primary : theme.colors.border },
          ]}
          onPress={handleContinueStepTwo}
          disabled={!canContinueStepTwo || isSavingStepTwo}
        >
          <Text style={styles.buttonText}>{isSavingStepTwo ? 'Saving...' : 'Continue'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderPasswordInput = (
    label: string,
    value: string,
    onChangeText: (text: string) => void,
    visible: boolean,
    toggleVisible: () => void,
    placeholder: string
  ) =>
    renderInput(label, value, onChangeText, placeholder, {
      secureTextEntry: !visible,
      keyboardType: 'number-pad',
      inputMode: 'numeric',
      maxLength: PASSWORD_LENGTH,
      trailing: (
        <TouchableOpacity onPress={toggleVisible} style={styles.eyeButton}>
          <Ionicons
            name={visible ? 'eye-outline' : 'eye-off-outline'}
            size={20}
            color={theme.colors.textSecondary}
          />
        </TouchableOpacity>
      ),
    });

  const renderStepThree = () => (
    <View style={styles.form}>
      {renderPasswordInput(
        'Create 6-Digit Password',
        password,
        handlePasswordChange,
        showPassword,
        () => setShowPassword((current) => !current),
        'Create a 6-digit password'
      )}

      {renderPasswordInput(
        'Confirm 6-Digit Password',
        confirmPassword,
        handleConfirmPasswordChange,
        showConfirmPassword,
        () => setShowConfirmPassword((current) => !current),
        'Confirm your 6-digit password'
      )}

      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[styles.secondaryButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}
          onPress={() => setStep(2)}
        >
          <Text style={[styles.secondaryButtonText, { color: theme.colors.text }]}>Back</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.primaryAction,
            { backgroundColor: passwordsMatch ? theme.colors.primary : theme.colors.border },
          ]}
          onPress={handleSignup}
          disabled={!passwordsMatch || isCreatingAccount}
        >
          <Text style={styles.buttonText}>{isCreatingAccount ? 'Creating...' : 'Create Account'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoider}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {showVerificationToast && Platform.OS !== 'android' ? (
            <View style={[styles.toast, { backgroundColor: theme.colors.success }]}> 
              <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
              <Text style={styles.toastText}>Phone number verified</Text>
            </View>
          ) : null}

          <View style={styles.headerRow}>
            <TouchableOpacity onPress={handleBack} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
            </TouchableOpacity>

            <Text style={[styles.title, { color: theme.colors.text }]}>Create Account</Text>
          </View>
          <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}> 
            Sign up to start driving with Limpopo Ride
          </Text>

          {renderProgress()}

          {step === 1 ? renderStepOne() : null}
          {step === 2 ? renderStepTwo() : null}
          {step === 3 ? renderStepThree() : null}

          <TouchableOpacity onPress={() => router.push('/auth/login')}>
            <Text style={[styles.linkText, { color: theme.colors.text }]}> 
              Already have an account? <Text style={{ color: theme.colors.primary }}>Log In</Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={showProcessingModal} transparent animationType="fade" onRequestClose={() => setShowProcessingModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}> 
            <View style={[styles.modalIconWrap, { backgroundColor: theme.colors.primary + '15' }]}> 
              <Ionicons name="time-outline" size={28} color={theme.colors.primary} />
            </View>
            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Your account is been processed</Text>
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
  keyboardAvoider: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 32,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
  },
  loadingText: {
    fontSize: 15,
    textAlign: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 10,
    marginBottom: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  title: {
    fontSize: 25,
    fontWeight: 'bold',
    flex: 1,
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 24,
  },
  progressSection: {
    marginBottom: 24,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  progressLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  form: {
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  rowItem: {
    flex: 1,
  },
  inputContainer: {
    marginBottom: 2,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
  },
  inputShell: {
    position: 'relative',
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
  },
  multilineInput: {
    minHeight: 96,
  },
  inputTrailing: {
    position: 'absolute',
    right: 14,
    top: 12,
  },
  eyeButton: {
    padding: 4,
  },
  inlineAction: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 6,
  },
  inlineActionText: {
    fontSize: 14,
    fontWeight: '600',
  },
  otpCountdownContainer: {
    marginTop: 2,
    marginBottom: 4,
  },
  otpCountdownText: {
    fontSize: 13,
    textAlign: 'center',
  },
  retryText: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 4,
  },
  retryLimitText: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 4,
  },
  button: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  uploadCard: {
    minHeight: 58,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  errorText: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 8,
  },
  uploadTextWrap: {
    flex: 1,
    paddingRight: 12,
  },
  uploadTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  uploadSubtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  selectButton: {
    minHeight: 54,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectButtonText: {
    fontSize: 16,
  },
  optionsCard: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  optionRow: {
    minHeight: 48,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  optionText: {
    fontSize: 15,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 12,
  },
  segmentButton: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  segmentText: {
    fontSize: 15,
    fontWeight: '600',
  },
  characterCount: {
    fontSize: 12,
    textAlign: 'right',
    marginTop: -10,
    marginBottom: 4,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 18,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 54,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  primaryAction: {
    flex: 1,
    minHeight: 54,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  linkText: {
    textAlign: 'center',
    fontSize: 14,
    marginTop: 20,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
    marginBottom: 12,
  },
  toastText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    width: '100%',
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 24,
    paddingVertical: 28,
    alignItems: 'center',
  },
  modalIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 28,
  },
});
