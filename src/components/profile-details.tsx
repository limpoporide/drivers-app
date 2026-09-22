import React, { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  ImageSourcePropType,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { Theme } from '../types';
import { supabase } from '../lib/supabase';

export type DriverProfileData = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  nin: string;
  driverId: string;
  vehicleNum: string;
  rating: number;
  verified: boolean;
  startedDate: string;
  createdAt?: string;
};

type ProfileDetailsProps = {
  visible: boolean;
  theme: Theme;
  profile: DriverProfileData;
  imageSource: ImageSourcePropType;
  onClose: () => void;
  onSave: (profile: DriverProfileData) => void;
  onChangeImage: () => void;
};

export default function ProfileDetails({
  visible,
  theme,
  profile,
  imageSource,
  onClose,
  onSave,
  onChangeImage,
}: ProfileDetailsProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(profile);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState(false);

  useEffect(() => {
    setDraft(profile);
    setIsEditing(false);
  }, [profile, visible]);

  useEffect(() => {
    if (visible) {
      fetchProfileData();
    }
  }, [visible]);

  const fetchProfileData = async () => {
    try {
      // Try to load from cache first
      const cachedProfile = await AsyncStorage.getItem('profile_details_cache');
      if (cachedProfile) {
        const cached = JSON.parse(cachedProfile);
        if (cached.profileImg) setProfileImageUrl(cached.profileImg);
        if (cached.isVerified !== undefined) setIsVerified(cached.isVerified);
      }

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        console.log('ProfileDetails: Unable to get authenticated user');
        return;
      }

      const { data: profileData, error: profileError } = await supabase
        .from('driver_profile')
        .select('profile_img, admin_verify')
        .eq('uuid', user.id)
        .single();

      if (profileError) {
        console.log('ProfileDetails: Unable to fetch profile data:', profileError);
        return;
      }

      if (profileData?.profile_img) {
        setProfileImageUrl(profileData.profile_img);
      }

      if (profileData?.admin_verify !== undefined) {
        setIsVerified(profileData.admin_verify);
      }

      // Cache the profile data
      await AsyncStorage.setItem(
        'profile_details_cache',
        JSON.stringify({
          profileImg: profileData?.profile_img,
          isVerified: profileData?.admin_verify,
        })
      );
    } catch (error) {
      console.log('ProfileDetails: Error fetching profile data:', error);
    }
  };

  const uploadImageToCloudinary = async () => {
    try {
      setIsUploadingImage(true);

      const result = await DocumentPicker.getDocumentAsync({
        type: 'image/*',
      });

      if (result.canceled) {
        setIsUploadingImage(false);
        return;
      }

      const asset = result.assets[0];

      if (!asset.uri || !asset.name) {
        Alert.alert('Invalid file', 'Unable to read the selected file.');
        setIsUploadingImage(false);
        return;
      }

      const cloudName = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
      const uploadPreset = 'limpopo-asset';

      if (!cloudName) {
        Alert.alert('Configuration error', 'Cloudinary cloud name is not configured.');
        setIsUploadingImage(false);
        return;
      }

      const formData = new FormData();
      formData.append('file', {
        uri: asset.uri,
        type: 'image/jpeg',
        name: asset.name,
      } as any);
      formData.append('upload_preset', uploadPreset);
      formData.append('folder', 'limpopo_driver_profiles');

      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
        {
          method: 'POST',
          body: formData,
        }
      );

      const data = await response.json();

      if (!response.ok) {
        console.error('Cloudinary upload error:', data);
        Alert.alert('Upload failed', data.error?.message || 'Unable to upload image to Cloudinary.');
        setIsUploadingImage(false);
        return;
      }

      const imageUrl = data.secure_url;

      console.log('Image uploaded to Cloudinary:', imageUrl);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        console.log('ProfileDetails: Unable to get authenticated user');
        setIsUploadingImage(false);
        return;
      }

      const { error: updateError } = await supabase
        .from('driver_profile')
        .update({ profile_img: imageUrl })
        .eq('uuid', user.id);

      if (updateError) {
        Alert.alert('Database error', 'Unable to save image URL to profile.');
        console.error('Profile update error:', updateError);
        setIsUploadingImage(false);
        return;
      }

      Alert.alert('Success', 'Profile image updated successfully.');
      setIsUploadingImage(false);
    } catch (error) {
      console.error('Image upload error:', error);
      Alert.alert('Upload error', 'An error occurred while uploading the image.');
      setIsUploadingImage(false);
    }
  };

  const handleSave = () => {
    onSave(draft);
    setIsEditing(false);
  };

  const fullName = `${draft.firstName} ${draft.lastName}`.trim();

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconButton} onPress={onClose}>
            <Ionicons name="close" size={22} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.colors.text }]}>Profile</Text>
          <TouchableOpacity style={styles.editButton} onPress={() => setIsEditing((current) => !current)}>
            <Text style={[styles.editButtonText, { color: theme.colors.primary }]}>{isEditing ? 'Cancel' : 'Edit'}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          <View style={[styles.heroCard, { backgroundColor: theme.colors.primary }]}> 
            <TouchableOpacity style={styles.profilePhotoWrap} onPress={uploadImageToCloudinary} disabled={isUploadingImage}>
              <Image source={profileImageUrl ? { uri: profileImageUrl } : imageSource} style={styles.profilePhoto} />
              <View style={styles.cameraChip}> 
                <Ionicons name={isUploadingImage ? 'hourglass-outline' : 'camera-outline'} size={14} color="#FFFFFF" />
              </View>
            </TouchableOpacity>

            <View style={styles.heroInfo}>
              <View style={styles.nameRow}>
                <Text style={styles.profileName}>{fullName}</Text>
                <View style={[
                  styles.verifiedBadge,
                  { backgroundColor: isVerified ? theme.colors.success : '#000000' }
                ]}> 
                  <Ionicons name={isVerified ? 'checkmark-circle' : 'alert-circle'} size={14} color="#FFFFFF" />
                  <Text style={styles.verifiedText}>{isVerified ? 'Verified' : 'Unverified'}</Text>
                </View>
              </View>
              <Text style={styles.profileMeta}>LDI: {draft.driverId}</Text>
            </View>
          </View>

          <View style={[styles.formCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}> 
            <Field
              label="First Name"
              value={draft.firstName}
              editable={isEditing}
              theme={theme}
              onChangeText={(value) => setDraft((current) => ({ ...current, firstName: value }))}
            />
            <Field
              label="Last Name"
              value={draft.lastName}
              editable={isEditing}
              theme={theme}
              onChangeText={(value) => setDraft((current) => ({ ...current, lastName: value }))}
            />
            <Field
              label="Email"
              value={draft.email}
              editable={isEditing}
              theme={theme}
              keyboardType="email-address"
              onChangeText={(value) => setDraft((current) => ({ ...current, email: value }))}
            />
            <Field label="Number" value={draft.phone} editable={false} theme={theme} />
            <Field label="NIN" value={draft.nin} editable={false} theme={theme} />
            <Field label="Driver ID" value={draft.driverId} editable={false} theme={theme} />
            <Field label="Driver Rating" value={draft.rating.toFixed(1)} editable={false} theme={theme} />
          </View>

          {isEditing ? (
            <TouchableOpacity style={[styles.saveButton, { backgroundColor: theme.colors.primary }]} onPress={handleSave}>
              <Text style={styles.saveButtonText}>Save</Text>
            </TouchableOpacity>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

type FieldProps = {
  label: string;
  value: string;
  editable: boolean;
  theme: Theme;
  keyboardType?: 'default' | 'email-address';
  onChangeText?: (value: string) => void;
};

function Field({ label, value, editable, theme, keyboardType = 'default', onChangeText }: FieldProps) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={[styles.fieldLabel, { color: theme.colors.textSecondary }]}>{label}</Text>
      <TextInput
        value={value}
        editable={editable}
        keyboardType={keyboardType}
        onChangeText={onChangeText}
        placeholderTextColor={theme.colors.textSecondary}
        style={[
          styles.fieldInput,
          {
            color: theme.colors.text,
            backgroundColor: editable ? theme.colors.background : theme.colors.card,
            borderColor: theme.colors.border,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  iconButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  editButton: {
    minWidth: 48,
    alignItems: 'flex-end',
  },
  editButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    gap: 16,
  },
  heroCard: {
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 12,
  },
  profilePhotoWrap: {
    marginRight: 14,
  },
  profilePhoto: {
    width: 52,
    height: 52,
    borderRadius: 36,
  },
  cameraChip: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
  },
  heroInfo: {
    flex: 1,
    gap: 6,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  profileName: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '500',
  },
  profileMeta: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 14,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  verifiedText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  formCard: {
    borderWidth: 1,
    borderRadius: 10,
    width: '100%',
    alignSelf: 'center',
    padding: 18,
    gap: 14,
  },
  fieldWrap: {
    gap: 7,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  fieldInput: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 12,
    fontSize: 15,
  },
  saveButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    paddingVertical: 15,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});