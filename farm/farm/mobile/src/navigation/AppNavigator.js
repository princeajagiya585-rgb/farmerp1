import React, { useEffect } from 'react';
import { Text, BackHandler, Alert, Platform } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { useAuth } from '../context/AuthContext';
import { theme } from '../components/ui';

import LoginScreen from '../screens/LoginScreen';
import DashboardScreen from '../screens/DashboardScreen';
import AttendanceScreen from '../screens/AttendanceScreen';
import TasksScreen from '../screens/TasksScreen';
import ReportBreakdownScreen from '../screens/ReportBreakdownScreen';
import ProfileScreen from '../screens/ProfileScreen';
import LocationScreen from '../screens/LocationScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// Simple emoji tab icons (no icon library required).
const TAB_ICONS = {
  Dashboard: '📊',
  Location: '🗺️',
  Attendance: '📍',
  Tasks: '✅',
  Breakdown: '🚨',
  Profile: '👤',
};

function tabIcon(routeName) {
  return ({ focused }) => (
    <Text style={{ fontSize: focused ? 22 : 18 }}>{TAB_ICONS[routeName]}</Text>
  );
}

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
    </Stack.Navigator>
  );
}

function AppTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.muted,
        tabBarIcon: tabIcon(route.name),
        tabBarStyle: { paddingBottom: 4, height: 58 },
        tabBarLabelStyle: { fontSize: 11 },
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Location" component={LocationScreen} />
      <Tab.Screen name="Attendance" component={AttendanceScreen} />
      <Tab.Screen name="Tasks" component={TasksScreen} />
      <Tab.Screen
        name="Breakdown"
        component={ReportBreakdownScreen}
        options={{ tabBarLabel: 'Report' }}
      />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

export default function RootNavigator() {
  const { user } = useAuth();

  // Android: intercept the hardware back button so it doesn't close the app
  // or log the user out. Show an exit confirmation instead.
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const onBackPress = () => {
      Alert.alert('Exit Application?', 'Are you sure you want to exit the app?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Exit',
          style: 'destructive',
          onPress: () => BackHandler.exitApp(),
        },
      ]);
      return true; // Prevent default back behavior
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, []);

  return user ? <AppTabs /> : <AuthStack />;
}
