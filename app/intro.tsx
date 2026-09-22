import React, { useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  ImageBackground,
  ImageSourcePropType,
  Text,
  TouchableOpacity,
  View,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../src/context/ThemeContext';

const { width } = Dimensions.get('window');

const HAS_SEEN_INTRO_KEY = 'has_seen_intro';

interface SlideItem {
  id: string;
  title: string;
  description: string;
  image: ImageSourcePropType;
}

const slides: SlideItem[] = [
  {
    id: '1',
    title: 'Drive The Pride of Africa',
    description: 'Accept rides, stay visible to nearby passengers, and keep your day moving with confidence.',
    image: require('../assets/slide1.png'),
  },
  {
    id: '2',
    title: 'Earn Smarter Every Trip',
    description: 'Track requests, complete rides faster, and monitor your earnings from one clean dashboard.',
    image: require('../assets/slide2.png'),
  },
  {
    id: '3',
    title: 'Manage Work In Real Time',
    description: 'View notifications, ride history, and wallet activity without leaving the app flow.',
    image: require('../assets/slide3.png'),
  },
];

export default function Intro() {
  const router = useRouter();
  const { theme } = useTheme();
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList<SlideItem>>(null);

  const handleNext = async () => {
    await AsyncStorage.setItem(HAS_SEEN_INTRO_KEY, 'true');
    router.replace('/auth/login');
  };

  const handleSkip = async () => {
    await AsyncStorage.setItem(HAS_SEEN_INTRO_KEY, 'true');
    router.replace('/auth/login');
  };

  const renderItem = ({ item }: { item: SlideItem }) => (
    <View style={[styles.slide, { width }]}> 
      <Image source={item.image} style={styles.slideImage} resizeMode="contain" />
      <Text style={[styles.title, { color: theme.colors.text }]}>{item.title}</Text>
      <Text style={[styles.description, { color: theme.colors.textSecondary }]}>
        {item.description}
      </Text>
    </View>
  );

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={['top', 'bottom']}
    >
      <ImageBackground
        source={require('../assets/logo2-limpopo.png')}
        style={styles.backgroundImage}
        imageStyle={styles.backgroundImageStyle}
        resizeMode="cover"
      />

      <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
        <Text style={[styles.skipText, { color: theme.colors.primary }]}>Skip</Text>
      </TouchableOpacity>

      <FlatList
        ref={flatListRef}
        data={slides}
        renderItem={renderItem}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        onMomentumScrollEnd={(event) => {
          const index = Math.round(event.nativeEvent.contentOffset.x / width);
          setCurrentIndex(index);
        }}
      />

      <View style={styles.pagination}>
        {slides.map((_, index) => (
          <View
            key={index}
            style={[
              styles.dot,
              {
                backgroundColor:
                  index === currentIndex ? theme.colors.primary : theme.colors.border,
              },
            ]}
          />
        ))}
      </View>

      <TouchableOpacity
        style={[styles.nextButton, { backgroundColor: theme.colors.primary }]}
        onPress={handleNext}
      >
        <Text style={styles.nextButtonText}>Get Started</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backgroundImage: {
    ...StyleSheet.absoluteFillObject,
  },
  backgroundImageStyle: {
    opacity: 0.08,
  },
  skipButton: {
    position: 'absolute',
    top: 56,
    right: 20,
    zIndex: 10,
    padding: 10,
  },
  skipText: {
    fontSize: 16,
    fontWeight: '600',
  },
  slide: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  slideImage: {
    width: width * 0.86,
    height: width * 0.86,
    marginBottom: 24,
  },
  title: {
    fontSize: 19,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
  },
  description: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 320,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 28,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginHorizontal: 5,
  },
  nextButton: {
    marginHorizontal: 20,
    marginBottom: 14,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  nextButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'medium',
  },
});
