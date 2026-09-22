import React, { useMemo } from 'react';
import {
  Alert,
  Image,
  ImageBackground,
  ImageSourcePropType,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
// import QRCode from 'react-native-qrcode-svg';
import { Theme } from '../types';
import { DriverProfileData } from './profile-details';

const DOCUMENT_BACKGROUND = require('../../assets/city-bg.jpg');

type DocumentDetailsProps = {
  visible: boolean;
  theme: Theme;
  profile: DriverProfileData;
  imageSource: ImageSourcePropType;
  onClose: () => void;
};

export default function DocumentDetails({ visible, theme, profile, imageSource, onClose }: DocumentDetailsProps) {
  const dates = useMemo(() => {
    const issuedDate = new Date(profile.createdAt || profile.startedDate);
    const expiryDate = new Date(issuedDate);
    expiryDate.setMonth(expiryDate.getMonth() + 3);

    return {
      issued: issuedDate.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      expiry: expiryDate.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    };
  }, [profile.createdAt, profile.startedDate]);

  // const qrValue = useMemo(
  //   () =>
  //     JSON.stringify({
  //       driverId: profile.driverId,
  //       firstName: profile.firstName,
  //       lastName: profile.lastName,
  //       issued: dates.issued,
  //       expiry: dates.expiry,
  //       status: 'Active Driver',
  //     }),
  //   [dates.issued, dates.expiry, profile.driverId, profile.firstName, profile.lastName],
  // );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <ImageBackground source={DOCUMENT_BACKGROUND} resizeMode="cover" style={styles.backgroundImage}>
        <View style={styles.backgroundOverlay}>
          <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
            {/* Modal Header */}
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Document Details</Text>
              <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                <Ionicons name="close" size={22} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
              {/* Landscape Real-Issued ID Card */}
              <View style={styles.cardContainer}>
                <View style={[styles.idCard, { backgroundColor: '#E0F2FE', borderColor: '#BAE6FD' }]}> 
              {/* Header Banner */}
              <View style={[styles.cardHeader, { backgroundColor: theme.colors.primary || '#0284C7' }]}>
                <Text style={styles.cardHeaderTitle}>LIMPOPO DRIVER LICENSE</Text>
                <View style={styles.hologramBadge}>
                  <Ionicons name="star" size={14} color="#38BDF8" />
                </View>
              </View>

              {/* Decorative Holographic Divider Strip */}
              <View style={styles.guillocheBar} />

              {/* Main ID Content Body */}
              <View style={styles.cardBody}>
                {/* Photo Section with Border Frame */}
                <View style={styles.photoFrame}>
                  <Image source={imageSource} style={styles.driverPhoto} resizeMode="cover" />
                </View>

                {/* Main License Details */}
                <View style={styles.detailsContainer}>
                  {/* License ID */}
                  <Text style={styles.idNumberText}>
                    <Text style={styles.idNumberLabel}>ID: </Text>
                    {profile.vehicleNum || '---'}
                  </Text>

                  {/* Name Section */}
                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Name</Text>
                    <Text style={styles.fieldValueBold}>
                      {profile.firstName?.toUpperCase()} {profile.lastName?.toUpperCase()}
                    </Text>
                  </View>

                  {/* Two-Column Grid for Dates & Status */}
                  <View style={styles.gridRow}>
                    <View style={styles.gridColumn}>
                      <Text style={styles.fieldLabel}>ISSUED</Text>
                      <Text style={styles.fieldValue}>{dates.issued}</Text>
                    </View>

                    <View style={styles.gridColumn}>
                      <Text style={styles.fieldLabel}>EXPIRES</Text>
                      <Text style={styles.fieldValue}>{dates.expiry}</Text>
                    </View>
                  </View>

                  {/* Status & Verification */}
                  <View style={styles.gridRow}>
                    <View style={styles.gridColumn}>
                      <Text style={styles.fieldLabel}>STATUS</Text>
                      <Text style={[styles.fieldValue, { color: '#0369A1', fontWeight: '700' }]}>
                        Active Driver
                      </Text>
                    </View>

                    <View style={styles.gridColumn}>
                      <Text style={styles.fieldLabel}>CLASS</Text>
                      <Text style={styles.fieldValueBold}>CLASS C</Text>
                    </View>
                  </View>
                </View>
              </View>

              {/* Watermark / Seal Accent */}
              <View style={styles.sealWatermark}>
                <Ionicons name="shield-checkmark-outline" size={90} color="rgba(2, 132, 199, 0.08)" />
              </View>
                </View>
              </View>

              {/* Action Button */}
              <TouchableOpacity
                style={[styles.downloadButton, { backgroundColor: theme.colors.primary || '#0284C7' }]}
                onPress={() => Alert.alert('Download ID', 'Mock download prepared for the driver ID card.')}
              >
                <Ionicons name="download-outline" size={18} color="#FFFFFF" />
                <Text style={styles.downloadButtonText}>Download ID</Text>
              </TouchableOpacity>

              {/*
              <View style={[styles.qrSection, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}> 
                <Text style={[styles.qrTitle, { color: theme.colors.text }]}>Scan Driver ID</Text>
                <Text style={[styles.qrSubtitle, { color: theme.colors.textSecondary }]}>Use another device to verify this driver record.</Text>
                <View style={styles.qrWrap}>
                  <QRCode value={qrValue} size={164} color="#0F172A" backgroundColor="#FFFFFF" />
                </View>
              </View>
              */}
            </ScrollView>
          </SafeAreaView>
        </View>
      </ImageBackground>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backgroundImage: {
    flex: 1,
  },
  backgroundOverlay: {
    flex: 1,
    backgroundColor: 'rgba(3, 7, 18, 0.52)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingBottom: 28,
    justifyContent: 'center',
  },
  cardContainer: {
    width: '100%',
    aspectRatio: 1.58, // Standard ID Card landscape aspect ratio
    marginVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
  },
  idCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  cardHeader: {
    height: 42,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardHeaderTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  hologramBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  guillocheBar: {
    height: 3,
    backgroundColor: '#38BDF8',
    opacity: 0.8,
  },
  cardBody: {
    flex: 1,
    flexDirection: 'row',
    padding: 12,
    gap: 12,
    zIndex: 2,
  },
  photoFrame: {
    width: '32%',
    height: '100%',
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#94A3B8',
    backgroundColor: '#F1F5F9',
    overflow: 'hidden',
  },
  driverPhoto: {
    width: '100%',
    height: '100%',
  },
  detailsContainer: {
    flex: 1,
    justifyContent: 'space-between',
  },
  idNumberText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 0.5,
  },
  idNumberLabel: {
    fontWeight: '600',
    color: '#0284C7',
  },
  fieldGroup: {
    marginVertical: 2,
  },
  fieldLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  fieldValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E293B',
  },
  fieldValueBold: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 0.3,
  },
  gridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  gridColumn: {
    flex: 1,
  },
  sealWatermark: {
    position: 'absolute',
    right: -10,
    bottom: -10,
    zIndex: 1,
  },
  downloadButton: {
    marginTop: 20,
    alignSelf: 'center',
    width: '100%',
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  downloadButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  qrSection: {
    marginTop: 16,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 20,
    alignItems: 'center',
  },
  qrTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  qrSubtitle: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 16,
  },
  qrWrap: {
    padding: 12,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
  },
});