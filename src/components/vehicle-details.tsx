import React, { useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Image,
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
import { Theme } from '../types';

type VehicleDetailsProps = {
  visible: boolean;
  theme: Theme;
  vehicleImage: ImageSourcePropType;
  bannerImage: ImageSourcePropType;
  onClose: () => void;
};

const vehicleSpecs = [
  { label: 'Vehicle Name', value: 'Wuling x70', icon: 'car-sport-outline' },
  { label: 'Vehicle Type', value: 'Electric', icon: 'flash-outline' },
  { label: 'Vehicle Number', value: 'GER234LA', icon: 'pricetag-outline' },
  { label: 'Battery Capacity', value: '2000mah', icon: 'battery-charging-outline' },
  { label: 'Recharge Count', value: 'Every 5 hours', icon: 'time-outline' },
] as const;

const slideBanners = [
  require('../../assets/slide1.png'),
  require('../../assets/slide2.png'),
  require('../../assets/slide3.png'),
] as const;

const SCREEN_WIDTH = Dimensions.get('window').width;
const SLIDE_BANNER_GAP = 24;
const SLIDE_BANNER_WIDTH = SCREEN_WIDTH * 0.94;
const SLIDE_SIDE_MARGIN = (SCREEN_WIDTH - SLIDE_BANNER_WIDTH) / 2;

export default function VehicleDetails({ visible, theme, vehicleImage, bannerImage, onClose }: VehicleDetailsProps) {
  const slideScrollRef = useRef<ScrollView>(null);
  const [activeSlide, setActiveSlide] = useState(0);

  useEffect(() => {
    if (!visible) {
      setActiveSlide(0);
      slideScrollRef.current?.scrollTo({ x: 0, animated: false });
      return;
    }

    const interval = setInterval(() => {
      setActiveSlide((currentSlide) => {
        const nextSlide = (currentSlide + 1) % slideBanners.length;
        slideScrollRef.current?.scrollTo({
          x: nextSlide * (SLIDE_BANNER_WIDTH + SLIDE_BANNER_GAP),
          animated: true,
        });
        return nextSlide;
      });
    }, 4500);

    return () => clearInterval(interval);
  }, [visible]);

  const handleSlideScrollEnd = (event: any) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const nextSlide = Math.round(offsetX / (SLIDE_BANNER_WIDTH + SLIDE_BANNER_GAP));
    setActiveSlide(Math.max(0, Math.min(nextSlide, slideBanners.length - 1)));
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top', 'bottom']}>
        {/* Modal header */}
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: theme.colors.text }]}>Vehicle Details</Text>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={22} color={theme.colors.text} />
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          {/* Hero image section */}
          <View style={[styles.hero, { backgroundColor: theme.colors.card }]}> 
            <Image source={vehicleImage} style={styles.heroImage} resizeMode="contain" />
          </View>

          {/* Visual divider between image and specs */}
          <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />

          {/* Vehicle specifications list */}
          <View style={styles.specsCard}>
            {/* Row 1: Vehicle Name and Type */}
            <View style={styles.specRow}>
              <View style={styles.specItem}>
                <View style={[styles.specIconWrap, { backgroundColor: theme.colors.background }]}>
                  <Ionicons name="car-sport-outline" size={16} color={theme.colors.primary} />
                </View>
                <View style={styles.specTextWrap}>
                  <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.specLabel, { color: theme.colors.textSecondary }]}>Vehicle Name</Text>
                  <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.specValue, { color: theme.colors.text }]}>Wuling x70</Text>
                </View>
              </View>

              <View style={styles.specItem}>
                <View style={[styles.specIconWrap, { backgroundColor: theme.colors.background }]}>
                  <Ionicons name="flash-outline" size={16} color={theme.colors.primary} />
                </View>
                <View style={styles.specTextWrap}>
                  <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.specLabel, { color: theme.colors.textSecondary }]}>Vehicle Type</Text>
                  <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.specValue, { color: theme.colors.text }]}>Electric</Text>
                </View>
              </View>
            </View>

            {/* Row 2: Vehicle Number, Battery Capacity, Recharge Count */}
            <View style={styles.specRow}>
              <View style={styles.specItem}>
                <View style={[styles.specIconWrap, { backgroundColor: theme.colors.background }]}>
                  <Ionicons name="pricetag-outline" size={16} color={theme.colors.primary} />
                </View>
                <View style={styles.specTextWrap}>
                  <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.specLabel, { color: theme.colors.textSecondary }]}>Number</Text>
                  <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.specValue, { color: theme.colors.text }]}>GER234LA</Text>
                </View>
              </View>

              <View style={styles.specItem}>
                <View style={[styles.specIconWrap, { backgroundColor: theme.colors.background }]}>
                  <Ionicons name="battery-charging-outline" size={16} color={theme.colors.primary} />
                </View>
                <View style={styles.specTextWrap}>
                  <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.specLabel, { color: theme.colors.textSecondary }]}>Battery</Text>
                  <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.specValue, { color: theme.colors.text }]}>2000mah</Text>
                </View>
              </View>

              <View style={styles.specItem}>
                <View style={[styles.specIconWrap, { backgroundColor: theme.colors.background }]}>
                  <Ionicons name="time-outline" size={16} color={theme.colors.primary} />
                </View>
                <View style={styles.specTextWrap}>
                  <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.specLabel, { color: theme.colors.textSecondary }]}>Recharge</Text>
                  <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.specValue, { color: theme.colors.text }]}>Every 5hrs</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Full-width promotional banner */}
          <View style={styles.bannerWrap}>
            <Image source={bannerImage} style={styles.bannerImage} resizeMode="cover" />
            <View style={styles.bannerOverlay}>
              <Text style={styles.bannerEyebrow}>Driver Advantage</Text>
              <Text style={styles.bannerTitle}>Keep your Wuling x70 charged and route-ready for every trip.</Text>
            </View>
          </View>

          {/* Slide banner section */}
          <View style={styles.sliderContainer}>
            <ScrollView
              horizontal
              ref={slideScrollRef}
              showsHorizontalScrollIndicator={false}
              snapToInterval={SLIDE_BANNER_WIDTH + SLIDE_BANNER_GAP}
              decelerationRate="fast"
              disableIntervalMomentum
              onMomentumScrollEnd={handleSlideScrollEnd}
              contentContainerStyle={styles.slideBannerContent}
              style={styles.slideBannerScroll}
            >
              {slideBanners.map((slideImage, index) => (
                <View
                  key={index}
                  style={[
                    styles.slideBannerCard,
                    { backgroundColor: theme.mode === 'dark' ? '#D4AF37' : '#000000' },
                  ]}
                >
                  <Image source={slideImage} style={styles.slideBannerImage} resizeMode="cover" />
                </View>
              ))}
            </ScrollView>
            
            {/* Page indicators */}
            <View style={styles.pageIndicators}>
              {slideBanners.map((_, index) => (
                <View
                  key={index}
                  style={[
                    styles.pageIndicatorDot,
                    index === activeSlide && styles.pageIndicatorDotActive,
                    { backgroundColor: index === activeSlide ? theme.colors.primary : theme.colors.border },
                  ]}
                />
              ))}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
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
    paddingBottom: 14,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingBottom: 28,
  },
  hero: {
    width: '100%',
    minHeight: 260,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 24,
  },
  heroImage: {
    width: '86%',
    height: 220,
  },
  divider: {
    height: 1,
    marginHorizontal: 20,
    marginVertical: 18,
  },
  specsCard: {
    marginHorizontal: 20,
    gap: 14,
  },
  specRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  specItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  specIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  specTextWrap: {
    flex: 1,
    gap: 2,
  },
  specLabel: {
    fontSize: 9,
    fontWeight: '400',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  specValue: {
    fontSize: 11,
    fontWeight: '400',
  },
  bannerWrap: {
    marginTop: 22,
    marginHorizontal: '3%',
    height: 210,
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 18,
  },
  bannerImage: {
    width: '100%',
    height: '100%',
  },
  bannerOverlay: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 20,
    gap: 8,
  },
  bannerEyebrow: {
    color: '#F5E7B2',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  bannerTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 28,
  },
  sliderContainer: {
    marginTop: 18,
  },
  slideBannerScroll: {
  },
  slideBannerContent: {
    paddingHorizontal: SLIDE_SIDE_MARGIN,
    gap: SLIDE_BANNER_GAP,
    paddingVertical: 8,
  },
  slideBannerCard: {
    width: SLIDE_BANNER_WIDTH,
    height: 190,
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  slideBannerImage: {
    width: '100%',
    height: '100%',
  },
  pageIndicators: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    paddingBottom: 4,
  },
  pageIndicatorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    opacity: 0.5,
  },
  pageIndicatorDotActive: {
    width: 24,
    opacity: 1,
  },
});