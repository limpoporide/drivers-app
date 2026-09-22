import React, { useState, useCallback } from 'react';
import { Alert, Image, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTheme } from '../../src/context/ThemeContext';
import DocumentDetails from '../../src/components/document-details';
import ProfileDetails, { DriverProfileData } from '../../src/components/profile-details';
import VehicleDetails from '../../src/components/vehicle-details';
import { supabase } from '../../src/lib/supabase';
import { clearCachedDriverPushToken } from '../../src/lib/push-notifications';

const PROFILE_IMAGES = {
  driver: require('../../assets/driver-profile.png'),
  avatar: require('../../assets/avatar.png'),
} as const;

const VEHICLE_IMAGE = require('../../assets/wuling.png');
const VEHICLE_BANNER = require('../../assets/banner2.jpeg');
const DRIVER_LOGOUT_CACHE_KEYS = [
  'driver_profile_cache',
  'settings_profile_cache',
  'profile_details_cache',
  'driver_wallet_profile_cache',
  'driver_transactions_cache',
  'driver_dismissed_job_requests',
  'driver_expo_push_token',
] as const;

export default function Settings() {
  const router = useRouter();
  const { theme, isDark, toggleTheme } = useTheme();
  const [isProfileVisible, setIsProfileVisible] = useState(false);
  const [isVehicleVisible, setIsVehicleVisible] = useState(false);
  const [isDocumentVisible, setIsDocumentVisible] = useState(false);
  const [profileImageKey, setProfileImageKey] = useState<keyof typeof PROFILE_IMAGES>('driver');
  const [profile, setProfile] = useState<DriverProfileData>({
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com',
    phone: '080 000 0000',
    nin: '12345678901',
    driverId: '-----',
    vehicleNum: '---',
    rating: 4.9,
    verified: true,
    startedDate: '2026-08-01T08:00:00',
  });
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useFocusEffect(
    useCallback(() => {
      fetchDriverProfile();
    }, [])
  );

  const fetchDriverProfile = async () => {
    try {
      // Try to load from cache first
      const cachedProfile = await AsyncStorage.getItem('settings_profile_cache');
      if (cachedProfile) {
        const cached = JSON.parse(cachedProfile);
        setProfile((prevProfile) => ({
          ...prevProfile,
          firstName: cached.firstName || 'Driver',
          lastName: cached.lastName || '',
          email: cached.email || '',
          phone: cached.phone || '',
          nin: cached.nin || '',
          driverId: cached.driverId || '-----',
          vehicleNum: cached.vehicleNum || '---',
          createdAt: cached.createdAt,
        }));
        if (cached.profileImg) {
          setProfileImageUrl(cached.profileImg);
        }
      }

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        console.log('Settings: Unable to get authenticated user');
        return;
      }

      const driverId = user.id.slice(-5).toUpperCase();

      const { data: profileData, error: profileError } = await supabase
        .from('driver_profile')
        .select('first_name, last_name, email, phone_num, nin, profile_img, created_at')
        .eq('uuid', user.id)
        .single();

      const { data: vehicleData, error: vehicleError } = await (supabase as any)
        .from('vehicle_management')
        .select('vehicle_num')
        .eq('assigned', user.id)
        .maybeSingle();

      if (profileError) {
        console.log('Settings: Unable to fetch driver profile:', profileError);
        return;
      }

      if (vehicleError) {
        console.log('Settings: Unable to fetch vehicle number:', vehicleError);
      }

      if (profileData) {
        setProfile((prevProfile) => ({
          ...prevProfile,
          firstName: profileData.first_name || 'Driver',
          lastName: profileData.last_name || '',
          email: profileData.email || '',
          phone: profileData.phone_num || '',
          nin: profileData.nin || '',
          driverId: driverId,
          vehicleNum: typeof vehicleData?.vehicle_num === 'string' && vehicleData.vehicle_num.trim() ? vehicleData.vehicle_num.trim() : '---',
          createdAt: profileData.created_at,
        }));

        if (profileData.profile_img) {
          setProfileImageUrl(profileData.profile_img);
        }

        // Cache the profile data
        await AsyncStorage.setItem(
          'settings_profile_cache',
          JSON.stringify({
            firstName: profileData.first_name,
            lastName: profileData.last_name,
            email: profileData.email,
            phone: profileData.phone_num,
            nin: profileData.nin,
            profileImg: profileData.profile_img,
            driverId: driverId,
            vehicleNum: typeof vehicleData?.vehicle_num === 'string' ? vehicleData.vehicle_num.trim() : '---',
            createdAt: profileData.created_at,
          })
        );
      }
    } catch (error) {
      console.log('Settings: Error fetching driver profile:', error);
    }
  };

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        console.log('Logout getUser error:', userError);
      }

      if (user) {
        const { error: profileCleanupError } = await supabase
          .from('driver_profile')
          .update({
            is_online: false,
            location_lat: null,
            location_lng: null,
            expo_push_token: null,
            push_token_updated_at: null,
          })
          .eq('uuid', user.id);

        if (profileCleanupError) {
          console.log('Logout profile cleanup error:', profileCleanupError);
          Alert.alert('Logout Failed', 'Unable to clear your active session on the server. Please try again.');
          setIsLoggingOut(false);
          return;
        }
      }

      const { error } = await supabase.auth.signOut({ scope: 'global' });

      if (error) {
        console.log('Logout error:', error);
        Alert.alert('Logout Failed', error.message || 'Unable to log out. Please try again.');
        setIsLoggingOut(false);
        return;
      }

      await clearCachedDriverPushToken();
      await AsyncStorage.multiRemove([...DRIVER_LOGOUT_CACHE_KEYS]);

      console.log('Successfully logged out');
      setIsLoggingOut(false);
      router.replace('/auth/login');
    } catch (error) {
      console.log('Logout exception:', error);
      Alert.alert('Error', 'An error occurred while logging out.');
      setIsLoggingOut(false);
    }
  };

  const profileImageSource = profileImageUrl ? { uri: profileImageUrl } : PROFILE_IMAGES[profileImageKey];

  const handleChangeProfileImage = () => {
    Alert.alert('Update Profile Image', 'Choose a driver profile image.', [
      {
        text: 'Driver Photo',
        onPress: () => setProfileImageKey('driver'),
      },
      {
        text: 'Avatar Photo',
        onPress: () => setProfileImageKey('avatar'),
      },
      {
        text: 'Cancel',
        style: 'cancel',
      },
    ]);
  };

  const settingsSections = [
    {
      title: 'Account',
      items: [
        { label: 'Profile', icon: 'person-outline', onPress: () => setIsProfileVisible(true) },
        { label: 'Vehicle Information', icon: 'car-outline', onPress: () => setIsVehicleVisible(true) },
        { label: 'Documents', icon: 'document-text-outline', onPress: () => setIsDocumentVisible(true) },
      ],
    },
    {
      title: 'Preferences',
      items: [
        { label: 'Dark Mode', icon: 'moon-outline', toggle: true, value: isDark, onToggle: toggleTheme },
        { label: 'Notifications', icon: 'notifications-outline', onPress: () => Alert.alert('Notifications', 'Notification controls will be connected soon.') },
      ],
    },
    {
      title: 'Support',
      items: [
        { label: 'Emergency', icon: 'medkit-outline', onPress: () => Alert.alert('Emergency', 'Emergency assistance is not connected yet.') },
        { label: 'Contact Support', icon: 'chatbubble-outline', onPress: () => Alert.alert('Support', 'Support chat is not connected yet.') },
        { label: 'Report Issue', icon: 'alert-circle-outline', onPress: () => Alert.alert('Report Issue', 'Issue reporting will be connected soon.') },
      ],
    },
    {
      title: 'Legal',
      items: [
        { label: 'Terms & Conditions', icon: 'document-outline', onPress: () => Alert.alert('Terms & Conditions', 'Terms screen is not connected yet.') },
        { label: 'Privacy Policy', icon: 'shield-outline', onPress: () => Alert.alert('Privacy Policy', 'Privacy screen is not connected yet.') },
      ],
    },
  ];

  const fullName = `${profile.firstName} ${profile.lastName}`;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>Settings</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        <TouchableOpacity
          style={[styles.profileCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
          onPress={() => setIsProfileVisible(true)}
        >
          <Image source={profileImageSource} style={styles.profileAvatar} />
          <View style={styles.profileInfo}>
            <Text style={[styles.profileName, { color: theme.colors.text }]}>{fullName}</Text>
            <Text style={[styles.profileMeta, { color: theme.colors.textSecondary }]}>LDI: {profile.driverId}</Text>
            <Text style={[styles.profileEmail, { color: theme.colors.textSecondary }]}>
              {profile.email}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
        </TouchableOpacity>

        {settingsSections.map((section, sectionIndex) => (
          <View key={sectionIndex} style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>
              {section.title}
            </Text>
            {section.items.map((item, itemIndex) => (
              <TouchableOpacity
                key={itemIndex}
                style={[
                  styles.settingItem,
                  { backgroundColor: theme.colors.card, borderColor: theme.colors.border }
                ]}
                onPress={item.onPress}
                disabled={item.toggle}
              >
                <Ionicons name={item.icon as any} size={22} color={theme.colors.text} />
                <Text style={[styles.settingLabel, { color: theme.colors.text }]}>
                  {item.label}
                </Text>
                {item.toggle ? (
                  <Switch
                    value={item.value}
                    onValueChange={item.onToggle}
                    trackColor={{ false: theme.colors.border, true: theme.colors.success }}
                    thumbColor="#fff"
                  />
                ) : item.value ? (
                  <Text style={[styles.settingValue, { color: theme.colors.textSecondary }]}>
                    {item.value}
                  </Text>
                ) : (
                  <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        ))}

        {/* Logout Button */}
        <TouchableOpacity
          style={[styles.logoutButton, { backgroundColor: theme.colors.error + '15', borderColor: theme.colors.error }]}
          onPress={handleLogout}
          disabled={isLoggingOut}
          activeOpacity={isLoggingOut ? 1 : 0.7}
        >
          <Ionicons name={isLoggingOut ? 'hourglass-outline' : 'log-out-outline'} size={20} color={theme.colors.error} />
          <Text style={[styles.logoutText, { color: theme.colors.error }]}>
            {isLoggingOut ? 'Logging out...' : 'Log Out'}
          </Text>
        </TouchableOpacity>

        <Text style={[styles.version, { color: theme.colors.textSecondary }]}>
          Version 1.0.0
        </Text>
      </ScrollView>

      <ProfileDetails
        visible={isProfileVisible}
        theme={theme}
        profile={profile}
        imageSource={profileImageSource}
        onClose={() => {
          setIsProfileVisible(false);
          fetchDriverProfile(); // Refresh profile after closing modal
        }}
        onSave={setProfile}
        onChangeImage={handleChangeProfileImage}
      />

      <VehicleDetails
        visible={isVehicleVisible}
        theme={theme}
        vehicleImage={VEHICLE_IMAGE}
        bannerImage={VEHICLE_BANNER}
        onClose={() => setIsVehicleVisible(false)}
      />

      <DocumentDetails
        visible={isDocumentVisible}
        theme={theme}
        profile={profile}
        imageSource={profileImageSource}
        onClose={() => setIsDocumentVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderRadius: 0,
    borderWidth: 1,
    marginBottom: 24,
  },
  profileAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    marginRight: 12,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 2,
  },
  profileMeta: {
    fontSize: 13,
    marginBottom: 4,
  },
  profileEmail: {
    fontSize: 14,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
  },
  settingLabel: {
    fontSize: 16,
    marginLeft: 16,
    flex: 1,
  },
  settingValue: {
    fontSize: 14,
    marginRight: 8,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 8,
    marginBottom: 24,
    gap: 8,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '600',
  },
  version: {
    textAlign: 'center',
    fontSize: 12,
    marginBottom: 40,
  },
});
