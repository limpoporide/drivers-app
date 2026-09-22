// Theme types for Limpopo Driver App
export type ThemeMode = 'light' | 'dark';

export interface Theme {
  mode: ThemeMode;
  colors: {
    primary: string;
    background: string;
    card: string;
    text: string;
    textSecondary: string;
    border: string;
    success: string;
    error: string;
    warning: string;
  };
}

export interface Driver {
  id: string;
  name: string;
  email: string;
  phone: string;
  rating: number;
  totalRides: number;
  vehicleType: string;
  vehiclePlate: string;
}

export interface Ride {
  id: string;
  passengerId: string;
  passengerName: string;
  pickupLocation: string;
  dropoffLocation: string;
  status: 'pending' | 'accepted' | 'arrived' | 'in_progress' | 'completed' | 'cancelled';
  fare: number;
  distance: string;
  duration: string;
  pickupTime?: string;
  dropoffTime?: string;
  date: string;
}

export interface Wallet {
  balance: number;
  totalEarnings: number;
  weeklyEarnings: number;
  pendingWithdrawal: number;
}
