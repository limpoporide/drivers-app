import React, { useState } from 'react';
import { Alert, View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/context/ThemeContext';
import { supabase } from '../../src/lib/supabase';
import { getDriverOnboardingState } from '../../src/lib/onboarding';

const LOGIN_LOGO = require('../../assets/Limpopo round 2.png');
const PASSWORD_LENGTH = 6;

export default function Login() {
  const router = useRouter();
  const { theme } = useTheme();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

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

  const handlePhoneChange = (value: string) => {
    const digitsOnly = value.replace(/\D/g, '').slice(0, 11);
    setPhoneNumber(digitsOnly);
  };

  const handlePasswordChange = (value: string) => {
    setPassword(value.replace(/\D/g, '').slice(0, PASSWORD_LENGTH));
  };

  const handleLogin = async () => {
    const normalizedPhone = normalizePhoneNumber(phoneNumber);

    if (!normalizedPhone) {
      Alert.alert('Invalid phone number', 'Enter a valid phone number to continue.');
      return;
    }

    if (password.length !== PASSWORD_LENGTH) {
      Alert.alert('Invalid password', 'Enter your 6-digit numeric password to continue.');
      return;
    }

    setIsLoggingIn(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      phone: normalizedPhone,
      password,
    });

    setIsLoggingIn(false);

    if (error) {
      Alert.alert('Login failed', error.message);
      return;
    }

    const onboardingState = await getDriverOnboardingState(data.user);

    if (onboardingState.isSignupComplete) {
      router.replace('/(tabs)/home');
      return;
    }

    router.replace('/auth/signup');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Image source={LOGIN_LOGO} style={styles.logo} resizeMode="contain" />
        <Text style={[styles.title, { color: theme.colors.text }]}>Welcome Back</Text>
        <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
          Log in to start earning
        </Text>

        <View style={styles.form}>
          <View style={styles.inputContainer}>
            <Text style={[styles.label, { color: theme.colors.text }]}>Phone Number</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.colors.card, color: theme.colors.text, borderColor: theme.colors.border }]}
              value={phoneNumber}
              onChangeText={handlePhoneChange}
              placeholder="Enter your 11-digit phone number"
              placeholderTextColor={theme.colors.textSecondary}
              keyboardType="number-pad"
              inputMode="numeric"
              maxLength={11}
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={[styles.label, { color: theme.colors.text }]}>6-Digit Password</Text>
            <View style={styles.passwordContainer}>
              <TextInput
                style={[styles.input, { backgroundColor: theme.colors.card, color: theme.colors.text, borderColor: theme.colors.border, flex: 1 }]}
                value={password}
                onChangeText={handlePasswordChange}
                placeholder="Enter your 6-digit password"
                placeholderTextColor={theme.colors.textSecondary}
                secureTextEntry={!showPassword}
                keyboardType="number-pad"
                inputMode="numeric"
                maxLength={PASSWORD_LENGTH}
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={styles.eyeIcon}
              >
                <Ionicons
                  name={showPassword ? 'eye-outline' : 'eye-off-outline'}
                  size={20}
                  color={theme.colors.textSecondary}
                />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity onPress={() => router.push('/auth/forgot-password')}>
            <Text style={[styles.forgotPassword, { color: theme.colors.primary }]}>
              Forgot Password?
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, { backgroundColor: isLoggingIn ? theme.colors.border : theme.colors.primary }]}
            onPress={handleLogin}
            disabled={isLoggingIn}
          >
            <Text style={styles.buttonText}>{isLoggingIn ? 'Logging In...' : 'Log In'}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push('/auth/signup')}>
            <Text style={[styles.linkText, { color: theme.colors.text }]}>
              Don't have an account? <Text style={{ color: theme.colors.primary }}>Sign Up</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  logo: {
    width: 100,
    height: 100,
    alignSelf: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 25,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 36,
    textAlign: 'center',
  },
  form: {
    gap: 16,
  },
  inputContainer: {
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  passwordContainer: {
    position: 'relative',
  },
  eyeIcon: {
    position: 'absolute',
    right: 16,
    top: 14,
  },
  forgotPassword: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'right',
    marginTop: -8,
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
  linkText: {
    textAlign: 'center',
    fontSize: 14,
    marginTop: 8,
  },
});
