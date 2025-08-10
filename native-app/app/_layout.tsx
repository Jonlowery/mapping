// native-app/app/_layout.tsx

import React, { useState, useEffect } from 'react';
import { View, Text, Button, StyleSheet, ActivityIndicator } from 'react-native';
// The path is now '../components' because we are one level deeper in the 'app' folder.
import LoginScreen from '../components/LoginScreen'; 
import AsyncStorage from '@react-native-async-storage/async-storage';
import MapScreen from '../components/MapScreen'; // This imports the real map screen

// This is now the root layout of your entire application.
export default function RootLayout() {
  // This state tracks if the user is logged in.
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  // This state shows a loading spinner while we check for a saved login token.
  const [isLoading, setIsLoading] = useState(true);

  // This `useEffect` hook runs once when the app starts.
  // It checks for a token in the phone's storage to see if the user is already logged in.
  useEffect(() => {
    const checkToken = async () => {
      const token = await AsyncStorage.getItem('token');
      if (token) {
        setIsAuthenticated(true);
      }
      setIsLoading(false); // Stop showing the loading spinner
    };
    checkToken();
  }, []);

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
  };

  const handleLogout = async () => {
    await AsyncStorage.removeItem('token');
    setIsAuthenticated(false);
  };

  // While checking for the token, show a loading spinner.
  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // This is the main logic:
  // If the user is authenticated, show the MapScreen.
  // Otherwise, show the LoginScreen.
  return (
    <>
      {isAuthenticated ? (
        <MapScreen onLogout={handleLogout} />
      ) : (
        <LoginScreen onLoginSuccess={handleLoginSuccess} />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
});
